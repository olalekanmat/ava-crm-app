import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { registerBackgroundSync, setForegroundSync, unregisterBackgroundSync } from '@/cloud/background';
import { adapterFor } from '@/cloud/connect';
import type { FolderRef } from '@/cloud/drive';
import type { ReplayLogEntry } from '@/cloud/journal';
import { licenseState, refreshLicense, type LicenseFile, type LicenseState } from '@/cloud/license';
import { saveToken } from '@/cloud/relay';
import { pendingCount, rebuild, ROSTER_FILE, rosterKey, syncOnce, writeLicense, type CloudCache } from '@/cloud/sync';
import { isAdmin, scopeSnapshot, withoutDeleted } from './access';
import { sanitizeMutation } from './sanitize';
import { removeBig, loadBig, saveBig } from './bigStorage';
import { currentCycle } from './metrics';
import { applyMutation, RuleError, type Mutation } from './mutations';
import { KEYS, loadJson, removeKeys, saveJson } from './storage';
import { emptySnapshot, type Account, type Call, type Company, type Cycle, type Product, type Snapshot, type User } from './types';

/** A signed-in person in a company whose data lives in its administrator's OneDrive folder. */
export type Session = { mode: 'cloud'; userId: string; email: string; companyId: string; companyCode?: string; folder: FolderRef; deviceId: string };

export type CloudSession = Session;

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
const SETUP_TYPES = new Set<Mutation['type']>([
  'company.update', 'user.upsert', 'user.delete', 'user.photo', 'import.users', 'import.accounts', 'import.products', 'product.upsert', 'product.delete',
  'cycle.upsert', 'settings.update', 'tiers.update', 'account.upsert', 'account.pin', 'account.delete',
]);

interface Store {
  ready: boolean;
  session: Session | null;
  me: User | undefined;
  /** The signed-in person has administrator rights (Admin, or a manager who is also an administrator). */
  admin: boolean;
  /** What the signed-in user may see. Deleted people and accounts are left out. */
  data: Snapshot;
  /** The same, with deleted people and accounts still in (CSV import and the calls export need them). */
  withDeleted: Snapshot;
  company: Company;
  accounts: Account[];
  calls: Call[];
  products: Product[];
  cycle: Cycle | undefined;
  sync: SyncState;
  license: LicenseState;
  licenseFile?: LicenseFile;
  /** False when the licence does not allow changes (read-only). */
  canEdit: boolean;
  /** Everything replayed from the journals, newest first (cloud mode). */
  activity: ReplayLogEntry[];
  /** Also finds deleted accounts, so call history keeps their names. */
  getAccount(id: string): Account | undefined;
  getCall(id: string): Call | undefined;
  /** Also finds deleted people, so call history keeps their names. */
  getUser(id?: string): User | undefined;
  callsForAccount(accountId: string): Call[];
  lastCallFor(accountId: string): Call | undefined;
  /** Applies a change. Throws RuleError with a readable message when it is not allowed. */
  run(m: Mutation): void;
  enterCloud(session: CloudSession, cache: CloudCache): Promise<void>;
  signOut(): Promise<void>;
  /** `manual`: the person pressed Sync (admins then also refresh the CSV copies in the drive). */
  syncNow(manual?: boolean): Promise<void>;
  saveLicense(file: LicenseFile): Promise<void>;
  clearRejected(): void;
}

const EMPTY = emptySnapshot();
const NO_SYNC: SyncState = { syncing: false, pending: 0, rejected: [], warnings: [] };
const StoreContext = createContext<Store | null>(null);
const byDateDesc = (x: Call, y: Call) => y.datetime.localeCompare(x.datetime);
const HOUR = 60 * 60 * 1000;
/** While the app is open and online, fetch the team's changes this often. */
const POLL_MS = 5 * 60 * 1000;
/** Changes upload automatically this long after the last edit. */
const AUTOSAVE_MS = 1500;

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
      if (s?.mode === 'cloud') {
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
      let { cache: c } = await syncOnce(drive, c0, { writeExports: isAdmin(me), forceExports: manual, readRoster: isAdmin(me) });
      // Keep any changes made while the sync was running.
      const latest = cacheRef.current;
      const extra = latest ? latest.own.entries.slice(c0.own.entries.length) : [];
      if (extra.length) {
        let seq = c.own.entries.at(-1)?.seq ?? 0;
        c = { ...c, own: { ...c.own, entries: [...c.own.entries, ...extra.map((e) => ({ ...e, seq: ++seq }))] } };
      }

      // Renew the licence from the approval server every few hours (any device can).
      if (c.license && (Date.now() - Date.parse(c.license.updatedAt) > 6 * HOUR || licenseState(c.license, c.companyId).state !== 'active')) {
        try {
          const next = await refreshLicense(c.license);
          if (next.status !== c.license.status || next.token !== c.license.token) {
            // Only administrators write the shared licence file; everyone keeps the renewed copy.
            c = isAdmin(me) ? await writeLicense(drive, c, next).catch(() => ({ ...c, license: next })) : { ...c, license: next };
          }
        } catch (e) {
          console.warn('Licence check failed', e);
        }
      }
      // Administrators keep the sign-in list (ava-roster.json) in step with Users & roles.
      // Deleted people are left out, so they cannot sign in. The server only knows the role
      // "Admin" as administrator, so a manager who is also an administrator is listed as Admin.
      if (isAdmin(me)) {
        const users = (rebuild(c)?.snapshot.users ?? []).filter((u) => !u.deletedAt);
        const roster = users.map((u) => ({ id: u.id, name: u.name, email: u.email.toLowerCase(), role: isAdmin(u) ? 'Admin' : u.role, active: u.active })).sort((x, y) => x.id.localeCompare(y.id));
        const key = rosterKey(roster);
        // Compare with the list actually in the drive, not just what this device wrote last: an
        // older app version may have written its own list (bringing back deleted people, say).
        // Two up-to-date administrators compute the same list, so they do not keep rewriting it.
        const inDrive = c.remoteRosterVersion ? c.remoteRoster : undefined;
        if (key !== inDrive && roster.some((u) => u.id === s.userId && u.role === 'Admin' && u.active)) {
          try {
            const f = await drive.write(ROSTER_FILE, JSON.stringify({ format: 'ava-roster/1', updatedAt: new Date().toISOString(), users: roster }, null, 2));
            c = { ...c, rosterSent: key, remoteRoster: key, remoteRosterVersion: f.version };
          } catch (e) {
            console.warn('Could not update the sign-in list', e);
          }
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
      setSync((x) => ({ ...x, syncing: false, error: msg, needsSignIn: (e as { status?: number }).status === 401 }));
    } finally {
      syncing.current = false;
    }
  }, [setCache, applyReplay]);

  // Sync when the app opens, a moment after every change (auto-save), every few minutes while
  // it is open, and when it comes back to the foreground. Offline changes wait on the device and
  // upload on the next successful sync, or from the Sync button. The phone may also sync in the
  // background (best effort).
  useEffect(() => {
    if (session?.mode !== 'cloud') return;
    syncNow();
    const timer = setInterval(() => syncNow(), POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      const last = cacheRef.current?.lastSync;
      if (st === 'active' && (!last || Date.now() - Date.parse(last) > 60 * 1000)) syncNow();
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
  const license = useMemo<Store['license']>(() => licenseState(cache?.license, session?.companyId ?? ''), [session, cache?.license]);
  const licensed = license.state === 'active';
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    (m: Mutation) => {
      const s = sessionRef.current;
      const actor = fullRef.current.users.find((u) => u.id === s?.userId);
      if (!s || !actor) throw new Error('Not signed in.');
      if (s.mode === 'cloud' && !licensed && !(isAdmin(actor) && SETUP_TYPES.has(m.type))) {
        throw new RuleError(
          license.state === 'pending' || license.state === 'none'
            ? 'Your company is waiting for approval. You can view data, but changes are off until it is approved.'
            : 'Your company’s Ava CRM licence is not active, so data is read-only. Your administrator can renew it.',
        );
      }
      const now = new Date();
      // Check the change exactly as every device will when it replays the journal, so anything
      // replay would drop fails here, visibly, instead of vanishing after the next sync.
      const clean = sanitizeMutation(JSON.parse(JSON.stringify(m)), now);
      const next = applyMutation(fullRef.current, clean, actor, now);
      setFull(next);
      if (s.mode === 'cloud' && cacheRef.current) {
        const c = cacheRef.current;
        const own = { ...c.own, entries: [...c.own.entries, { seq: (c.own.entries.at(-1)?.seq ?? 0) + 1, at: now.toISOString(), m }] };
        const updated = { ...c, own };
        setCache(updated).catch((e) => console.warn('Failed to save change', e));
        setSync((x) => ({ ...x, pending: pendingCount(updated) }));
        // Auto-save: upload shortly after the change when online.
        if (autosave.current) clearTimeout(autosave.current);
        autosave.current = setTimeout(() => {
          autosave.current = null;
          if (syncing.current) setTimeout(() => syncNow(), AUTOSAVE_MS * 2);
          else syncNow();
        }, AUTOSAVE_MS);
      }
    },
    [setFull, setCache, licensed, license.state, syncNow],
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
      await saveToken(null);
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

  const value = useMemo<Store>(() => {
    const scoped = me ? scopeSnapshot(full, me) : EMPTY;
    const data = withoutDeleted(scoped);
    const accounts = [...data.accounts].sort((x, y) => x.name.localeCompare(y.name));
    const calls = [...data.calls].sort(byDateDesc);
    const accountById = new Map(scoped.accounts.map((a) => [a.id, a]));
    const callById = new Map(data.calls.map((c) => [c.id, c]));
    const userById = new Map(scoped.users.map((u) => [u.id, u]));
    return {
      ready,
      session,
      me,
      admin: isAdmin(me),
      data,
      withDeleted: scoped,
      company: full.company,
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
      enterCloud,
      signOut,
      syncNow,
      saveLicense,
      clearRejected: () => setSync((x) => ({ ...x, rejected: [] })),
    };
  }, [full, me, ready, session, sync, license, licensed, cache?.license, activity, run, enterCloud, signOut, syncNow, saveLicense]);

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
