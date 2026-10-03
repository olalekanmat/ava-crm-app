import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { scopeSnapshot } from './access';
import { api, ApiError } from './api';
import { currentCycle } from './metrics';
import { applyMutation, type Mutation } from './mutations';
import { buildSeed } from './seed';
import { KEYS, loadJson, removeKeys, saveJson } from './storage';
import type { Account, Call, Cycle, Product, Snapshot, User } from './types';

/** Demo mode keeps everything on the device. Server mode syncs with an Ava server. */
export type Session =
  | { mode: 'demo'; userId: string }
  | { mode: 'server'; userId: string; serverUrl: string; token: string };

export interface SyncState {
  syncing: boolean;
  pending: number;
  lastSync?: string;
  error?: string;
  /** Changes the server refused, with its reason. */
  rejected: string[];
}

interface Store {
  ready: boolean;
  session: Session | null;
  me: User | undefined;
  /** What the signed-in user may see. */
  data: Snapshot;
  /** Demo mode only: everyone in the demo organisation, for the role switcher. */
  demoUsers: User[];
  accounts: Account[];
  calls: Call[];
  products: Product[];
  cycle: Cycle | undefined;
  sync: SyncState;
  getAccount(id: string): Account | undefined;
  getCall(id: string): Call | undefined;
  getUser(id?: string): User | undefined;
  callsForAccount(accountId: string): Call[];
  lastCallFor(accountId: string): Call | undefined;
  /** Applies a change. Throws RuleError with a readable message when it is not allowed. */
  run(m: Mutation): void;
  signInDemo(userId: string): Promise<void>;
  signIn(serverUrl: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
  resetDemoData(): Promise<void>;
  clearRejected(): void;
}

const EMPTY: Snapshot = {
  users: [],
  accounts: [],
  calls: [],
  plans: [],
  cycles: [],
  products: [],
  settings: { companyName: '', geofenceM: 300, requireCheckIn: false, tierFrequency: { A: 6, B: 4, C: 2 } },
};

const StoreContext = createContext<Store | null>(null);
const byDateDesc = (x: Call, y: Call) => y.datetime.localeCompare(x.datetime);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [full, setFullState] = useState<Snapshot>(EMPTY);
  const [sync, setSync] = useState<SyncState>({ syncing: false, pending: 0, rejected: [] });
  const fullRef = useRef(full);
  const sessionRef = useRef(session);
  const outbox = useRef<Mutation[]>([]);
  const syncing = useRef(false);

  const setFull = useCallback((s: Snapshot) => {
    fullRef.current = s;
    setFullState(s);
  }, []);
  sessionRef.current = session;

  // Restore the last session.
  useEffect(() => {
    (async () => {
      const s = await loadJson<Session>(KEYS.session);
      if (s?.mode === 'demo') {
        setFull((await loadJson<Snapshot>(KEYS.demo)) ?? buildSeed());
        setSession(s);
      } else if (s?.mode === 'server') {
        setFull((await loadJson<Snapshot>(KEYS.cache)) ?? EMPTY);
        outbox.current = (await loadJson<Mutation[]>(KEYS.outbox)) ?? [];
        setSync((x) => ({ ...x, pending: outbox.current.length }));
        setSession(s);
      }
    })()
      .catch((e) => console.warn('Failed to restore session', e))
      .finally(() => setReady(true));
  }, [setFull]);

  // Persist data whenever it changes.
  useEffect(() => {
    if (!ready || !session) return;
    saveJson(session.mode === 'demo' ? KEYS.demo : KEYS.cache, full).catch((e) => console.warn('Failed to save', e));
  }, [full, session, ready]);

  const signOutLocal = useCallback(async () => {
    outbox.current = [];
    await removeKeys(KEYS.session, KEYS.cache, KEYS.outbox);
    setSession(null);
    setFull(EMPTY);
    setSync({ syncing: false, pending: 0, rejected: [] });
  }, [setFull]);

  const syncNow = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.mode !== 'server' || syncing.current) return;
    syncing.current = true;
    setSync((x) => ({ ...x, syncing: true }));
    const rejected: string[] = [];
    try {
      while (outbox.current.length) {
        const batch = outbox.current.slice(0, 50);
        const { results } = await api.mutate(s.serverUrl, s.token, batch);
        results.forEach((r) => {
          if (!r.ok) rejected.push(r.error);
        });
        outbox.current = outbox.current.slice(batch.length);
        await saveJson(KEYS.outbox, outbox.current);
      }
      const { snapshot } = await api.snapshot(s.serverUrl, s.token);
      // Changes made while the snapshot was loading stay visible until the next round sends them.
      let merged = snapshot;
      const actor = snapshot.users.find((u) => u.id === s.userId);
      for (const m of outbox.current) {
        try {
          if (actor) merged = applyMutation(merged, m, actor);
        } catch {
          // The server will report it when the change is sent.
        }
      }
      setFull(merged);
      if (outbox.current.length) setTimeout(() => syncNowRef.current(), 0);
      setSync((x) => ({ syncing: false, pending: outbox.current.length, lastSync: new Date().toISOString(), error: undefined, rejected: [...x.rejected, ...rejected] }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutLocal();
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setSync((x) => ({ ...x, syncing: false, pending: outbox.current.length, error: msg, rejected: [...x.rejected, ...rejected] }));
    } finally {
      syncing.current = false;
    }
  }, [setFull, signOutLocal]);
  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;

  // Server mode: sync on start, every minute, and when the app comes back to the foreground.
  useEffect(() => {
    if (session?.mode !== 'server') return;
    syncNow();
    const timer = setInterval(syncNow, 60000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && syncNow());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [session, syncNow]);

  const me = useMemo(() => full.users.find((u) => u.id === session?.userId), [full.users, session]);

  const run = useCallback(
    (m: Mutation) => {
      const s = sessionRef.current;
      const actor = fullRef.current.users.find((u) => u.id === s?.userId);
      if (!s || !actor) throw new Error('Not signed in.');
      const next = applyMutation(fullRef.current, m, actor);
      setFull(next);
      if (s.mode === 'server') {
        outbox.current = [...outbox.current, m];
        setSync((x) => ({ ...x, pending: outbox.current.length }));
        saveJson(KEYS.outbox, outbox.current).then(syncNow);
      }
    },
    [setFull, syncNow],
  );

  const signInDemo = useCallback(
    async (userId: string) => {
      const current = sessionRef.current?.mode === 'demo' ? fullRef.current : (await loadJson<Snapshot>(KEYS.demo)) ?? buildSeed();
      const next: Session = { mode: 'demo', userId };
      await saveJson(KEYS.session, next);
      setFull(current);
      setSession(next);
    },
    [setFull],
  );

  const signIn = useCallback(
    async (serverUrl: string, email: string, password: string) => {
      const base = serverUrl.trim().replace(/\/+$/, '');
      const { token, user } = await api.login(base, email.trim(), password);
      const { snapshot } = await api.snapshot(base, token);
      const next: Session = { mode: 'server', userId: user.id, serverUrl: base, token };
      outbox.current = [];
      await saveJson(KEYS.outbox, []);
      await saveJson(KEYS.session, next);
      setFull(snapshot);
      setSession(next);
      setSync({ syncing: false, pending: 0, lastSync: new Date().toISOString(), rejected: [] });
    },
    [setFull],
  );

  const signOut = useCallback(async () => {
    const s = sessionRef.current;
    if (s?.mode === 'server') api.logout(s.serverUrl, s.token).catch(() => {});
    await signOutLocal();
  }, [signOutLocal]);

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
      demoUsers: session?.mode === 'demo' ? full.users : [],
      accounts,
      calls,
      products: data.products.filter((p) => p.active),
      cycle: currentCycle(data.cycles),
      sync,
      getAccount: (id) => accountById.get(id),
      getCall: (id) => callById.get(id),
      getUser: (id) => (id ? userById.get(id) : undefined),
      callsForAccount: (accountId) => calls.filter((c) => c.accountId === accountId),
      lastCallFor: (accountId) => calls.find((c) => c.accountId === accountId && c.status === 'Submitted'),
      run,
      signInDemo,
      signIn,
      signOut,
      syncNow,
      resetDemoData,
      clearRejected: () => setSync((x) => ({ ...x, rejected: [] })),
    };
  }, [full, me, ready, session, sync, run, signInDemo, signIn, signOut, syncNow, resetDemoData]);

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
