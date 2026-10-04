import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { AuthExpired, loadAuthConfig, restoreAuth, signOutAuth } from '@/cloud/auth';
import { registerBackgroundSync, setForegroundSync, unregisterBackgroundSync } from '@/cloud/background';
import { adapterFor } from '@/cloud/connect';
import type { FolderRef } from '@/cloud/drive';
import type { ReplayLogEntry } from '@/cloud/journal';
import { licenseState, refreshLicense, type LicenseFile, type LicenseState } from '@/cloud/license';
import { pendingCount, rebuild, syncOnce, writeLicense, type CloudCache } from '@/cloud/sync';
import { scopeSnapshot } from './access';
import { removeBig, loadBig, saveBig } from './bigStorage';
import { currentCycle } from './metrics';
import { applyMutation, RuleError, type Mutation } from './mutations';
import { buildSeed } from './seed';
import { KEYS, loadJson, removeKeys, saveJson } from './storage';
import { emptySnapshot, type Account, type Call, type Company, type Cycle, type Product, type Snapshot, type User } from './types';

/** Demo mode keeps a fictional company on the device. Cloud mode keeps a real company in its own drive. */
export type Session =
  | { mode: 'demo'; userId: string }
  | { mode: 'cloud'; userId: string; email: string; companyId: string; folder: FolderRef; deviceId: string };

export type CloudSession = Extract<Session, { mode: 'cloud' }>;

export interface SyncState {
  syncing: boolean;
  /** Changes made on this device that are not in the drive yet. */
  pending: number;
  lastSync?: string;
  error?: string;
  /** The provider sign-in has lapsed; sync needs the person to sign in again. */
  needsSignIn?: boolean;
  /** This device's changes that broke a rule once merged with everyone else's. */
  rejected: string[];
  /** Files in the drive that were ignored (admin only). */
  warnings: string[];
}

/** Changes allowed while a company waits for approval: the admin setting things up. */
const SETUP_TYPES = new Set<Mutation['type']>(['company.update', 'user.upsert', 'import.users', 'import.accounts', 'import.products', 'product.upsert', 'cycle.upsert', 'settings.update', 'tiers.update', 'account.upsert', 'account.pin']);

interface Store {
  ready: boolean;
  session: Session | null;
  me: User | undefined;
  /** What the signed-in user may see. */
  data: Snapshot;
  company: Company;
  /** Demo mode only: everyone in the demo organisation, for the role switcher. */
  demoUsers: User[];
  accounts: Account[];
  calls: Call[];
  products: Product[];
  cycle: Cycle | undefined;
  sync: SyncState;
  license: LicenseState | { state: 'demo' };
  licenseFile?: LicenseFile;
  /** False when the licence does not allow changes (read-only). */
  canEdit: boolean;
  /** Everything replayed from the journals, newest first (cloud mode). */
  activity: ReplayLogEntry[];
  getAccount(id: string): Account | undefined;
  getCall(id: string): Call | undefined;
  getUser(id?: string): User | undefined;
  callsForAccount(accountId: string): Call[];
  lastCallFor(accountId: string): Call | undefined;
  /** Applies a change. Throws RuleError with a readable message when it is not allowed. */
  run(m: Mutation): void;
  signInDemo(userId: string): Promise<void>;
  enterCloud(session: CloudSession, cache: CloudCache): Promise<void>;
  signOut(): Promise<void>;
  /** `manual`: the person pressed Sync (admins then also refresh the CSV copies in the drive). */
  syncNow(manual?: boolean): Promise<void>;
  saveLicense(file: LicenseFile): Promise<void>;
  resetDemoData(): Promise<void>;
  clearRejected(): void;
}

const EMPTY = emptySnapshot();
const NO_SYNC: SyncState = { syncing: false, pending: 0, rejected: [], warnings: [] };
const StoreContext = createContext<Store | null>(null);
const byDateDesc = (x: Call, y: Call) => y.datetime.localeCompare(x.datetime);
const HOUR = 60 * 60 * 1000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [full, setFullState] = useState<Snapshot>(EMPTY);
  const [sync, setSync] = useState<SyncState>(NO_SYNC);
  const [cache, setCacheState] = useState<CloudCache | null>(null);
  const [activity, setActivity] = useState<ReplayLogEntry[]>([]);
  const fullRef = useRef(full);
  const sessionRef = useRef(session);
  const cacheRef = useRef(cache);
  const syncing = useRef(false);
  sessionRef.current = session;

  const setFull = useCallback((s: Snapshot) => {
    fullRef.current = s;
    setFullState(s);
  }, []);

  const setCache = useCallback(async (c: CloudCache | null, persist = true) => {
    cacheRef.current = c;
    setCacheState(c);
    if (c && persist) await saveBig(KEYS.cache, c);
  }, []);

  /** Shows the result of replaying every journal. */
  const applyReplay = useCallback(
    (c: CloudCache) => {
      const r = rebuild(c);
      if (!r) return;
      setFull(r.snapshot);
      setActivity([...r.log].reverse());
      const mine = r.log.filter((l) => l.userId === c.own.userId && l.deviceId === c.own.deviceId && l.error);
      setSync((x) => ({ ...x, pending: pendingCount(c), rejected: mine.map((l) => `${l.what}: ${l.error}`), warnings: r.warnings }));
    },
    [setFull],
  );

  // Restore the last session.
  useEffect(() => {
    (async () => {
      const s = await loadJson<Session>(KEYS.session);
      if (s?.mode === 'demo') {
        const demo = await loadJson<Snapshot>(KEYS.demo);
        setFull(demo?.company ? demo : buildSeed());
        setSession(s);
      } else if (s?.mode === 'cloud') {
        await Promise.all([restoreAuth(), loadAuthConfig()]);
        const c = await loadBig<CloudCache>(KEYS.cache);
        if (c && c.companyId === s.companyId) {
          await setCache(c, false);
          applyReplay(c);
          setSession(s);
        }
      }
    })()
      .catch((e) => console.warn('Failed to restore session', e))
      .finally(() => setReady(true));
  }, [setFull, setCache, applyReplay]);

  // Demo data is saved on the device as it changes.
  useEffect(() => {
    if (ready && session?.mode === 'demo') saveJson(KEYS.demo, full).catch((e) => console.warn('Failed to save', e));
  }, [full, session, ready]);

  const syncNow = useCallback(async (manual = false) => {
    const s = sessionRef.current;
    const c0 = cacheRef.current;
    if (!s || s.mode !== 'cloud' || !c0 || syncing.current) return;
    syncing.current = true;
    setSync((x) => ({ ...x, syncing: true }));
    try {
      const net = await Network.getNetworkStateAsync().catch(() => null);
      if (net && net.isInternetReachable === false) throw new Error('No internet connection. Your changes are saved on this device and will upload when you are back online.');
      const drive = adapterFor(s.folder);
      const me = fullRef.current.users.find((u) => u.id === s.userId);
      let { cache: c } = await syncOnce(drive, c0, { writeExports: me?.role === 'Admin', forceExports: manual });
      // Keep any changes made while the sync was running.
      const latest = cacheRef.current;
      if (latest && latest.own.entries.length > c.own.entries.length) c = { ...c, own: latest.own };

      // Renew the licence from the approval server every few hours (any device can).
      if (c.license && (Date.now() - Date.parse(c.license.updatedAt) > 6 * HOUR || licenseState(c.license, c.companyId).state !== 'active')) {
        try {
          const next = await refreshLicense(c.license);
          if (next.status !== c.license.status || next.token !== c.license.token) c = await writeLicense(drive, c, next);
        } catch (e) {
          console.warn('Licence check failed', e);
        }
      }
      await setCache(c);
      applyReplay(c);
      const stillMember = rebuild(c)?.snapshot.users.find((u) => u.id === s.userId && u.active);
      setSync((x) => ({
        ...x,
        syncing: false,
        lastSync: c.lastSync,
        needsSignIn: false,
        error: stillMember ? undefined : 'Your account has been removed from this company by an administrator.',
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSync((x) => ({ ...x, syncing: false, error: msg, needsSignIn: e instanceof AuthExpired || (e as { status?: number }).status === 401 }));
    } finally {
      syncing.current = false;
    }
  }, [setCache, applyReplay]);

  // Cloud mode: sync when the app opens, every hour while it is open, and when it comes back
  // to the foreground after a while. The phone may also sync in the background (best effort).
  useEffect(() => {
    if (session?.mode !== 'cloud') return;
    syncNow();
    const timer = setInterval(() => syncNow(), HOUR);
    const sub = AppState.addEventListener('change', (st) => {
      const last = cacheRef.current?.lastSync;
      if (st === 'active' && (!last || Date.now() - Date.parse(last) > 15 * 60 * 1000)) syncNow();
    });
    setForegroundSync(syncNow);
    registerBackgroundSync().catch((e) => console.warn('Background sync unavailable', e));
    return () => {
      clearInterval(timer);
      sub.remove();
      setForegroundSync(null);
    };
  }, [session, syncNow]);

  const me = useMemo(() => full.users.find((u) => u.id === session?.userId), [full.users, session]);
  const license = useMemo<Store['license']>(
    () => (session?.mode === 'cloud' ? licenseState(cache?.license, session.companyId) : { state: 'demo' }),
    [session, cache?.license],
  );
  const licensed = license.state === 'active' || license.state === 'demo';

  const run = useCallback(
    (m: Mutation) => {
      const s = sessionRef.current;
      const actor = fullRef.current.users.find((u) => u.id === s?.userId);
      if (!s || !actor) throw new Error('Not signed in.');
      if (s.mode === 'cloud' && !licensed && !(actor.role === 'Admin' && SETUP_TYPES.has(m.type))) {
        throw new RuleError(
          license.state === 'pending' || license.state === 'none'
            ? 'Your company is waiting for approval. You can view data, but changes are off until it is approved.'
            : 'Your company’s Ava CRM licence is not active, so data is read-only. Your administrator can renew it.',
        );
      }
      const now = new Date();
      const next = applyMutation(fullRef.current, m, actor, now);
      setFull(next);
      if (s.mode === 'cloud' && cacheRef.current) {
        const c = cacheRef.current;
        const own = { ...c.own, entries: [...c.own.entries, { seq: (c.own.entries.at(-1)?.seq ?? 0) + 1, at: now.toISOString(), m }] };
        const updated = { ...c, own };
        setCache(updated).catch((e) => console.warn('Failed to save change', e));
        setSync((x) => ({ ...x, pending: pendingCount(updated) }));
      }
    },
    [setFull, setCache, licensed, license.state],
  );

  const signInDemo = useCallback(
    async (userId: string) => {
      const saved = sessionRef.current?.mode === 'demo' ? fullRef.current : await loadJson<Snapshot>(KEYS.demo);
      const current = saved?.company ? saved : buildSeed();
      const next: Session = { mode: 'demo', userId };
      await saveJson(KEYS.session, next);
      setFull(current);
      setSession(next);
    },
    [setFull],
  );

  const enterCloud = useCallback(
    async (s: CloudSession, c: CloudCache) => {
      await setCache(c);
      await saveJson(KEYS.session, s);
      applyReplay(c);
      setSession(s);
    },
    [setCache, applyReplay],
  );

  const signOut = useCallback(async () => {
    const s = sessionRef.current;
    if (s?.mode === 'cloud') {
      await unregisterBackgroundSync().catch(() => {});
      await signOutAuth();
      await removeBig(KEYS.cache);
    }
    await removeKeys(KEYS.session);
    await setCache(null, false);
    setSession(null);
    setFull(EMPTY);
    setActivity([]);
    setSync(NO_SYNC);
  }, [setFull, setCache]);

  const saveLicense = useCallback(
    async (file: LicenseFile) => {
      const s = sessionRef.current;
      const c = cacheRef.current;
      if (s?.mode !== 'cloud' || !c) return;
      await setCache(await writeLicense(adapterFor(s.folder), c, file));
    },
    [setCache],
  );

  const resetDemoData = useCallback(async () => {
    const seed = buildSeed();
    await saveJson(KEYS.demo, seed);
    setFull(seed);
  }, [setFull]);

  const value = useMemo<Store>(() => {
    const data = me ? scopeSnapshot(full, me) : EMPTY;
    const accounts = [...data.accounts].sort((x, y) => x.name.localeCompare(y.name));
    const calls = [...data.calls].sort(byDateDesc);
    const accountById = new Map(data.accounts.map((a) => [a.id, a]));
    const callById = new Map(data.calls.map((c) => [c.id, c]));
    const userById = new Map(data.users.map((u) => [u.id, u]));
    return {
      ready,
      session,
      me,
      data,
      company: full.company,
      demoUsers: session?.mode === 'demo' ? full.users : [],
      accounts,
      calls,
      products: data.products.filter((p) => p.active),
      cycle: currentCycle(data.cycles),
      sync,
      license,
      licenseFile: cache?.license,
      canEdit: licensed,
      activity,
      getAccount: (id) => accountById.get(id),
      getCall: (id) => callById.get(id),
      getUser: (id) => (id ? userById.get(id) : undefined),
      callsForAccount: (accountId) => calls.filter((c) => c.accountId === accountId),
      lastCallFor: (accountId) => calls.find((c) => c.accountId === accountId && c.status === 'Submitted'),
      run,
      signInDemo,
      enterCloud,
      signOut,
      syncNow,
      saveLicense,
      resetDemoData,
      clearRejected: () => setSync((x) => ({ ...x, rejected: [] })),
    };
  }, [full, me, ready, session, sync, license, licensed, cache?.license, activity, run, signInDemo, enterCloud, signOut, syncNow, saveLicense, resetDemoData]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

/** For screens that only render when signed in. */
export function useMe(): User {
  const { me } = useStore();
  if (!me) throw new Error('Not signed in');
  return me;
}
