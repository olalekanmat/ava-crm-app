import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from './ids';
import { buildSeed } from './seed';
import { clearSnapshot, loadSnapshot, saveSnapshot, type Snapshot } from './storage';
import type { Account, Call } from './types';

export type AccountInput = Omit<Account, 'id' | 'createdAt'>;
export type CallInput = Omit<Call, 'id' | 'createdAt' | 'updatedAt' | 'submittedAt'>;

interface Store {
  ready: boolean;
  accounts: Account[];
  calls: Call[];
  getAccount(id: string): Account | undefined;
  getCall(id: string): Call | undefined;
  callsForAccount(accountId: string): Call[];
  lastCallFor(accountId: string): Call | undefined;
  addAccount(input: AccountInput): Account;
  saveCall(input: CallInput, id?: string): Call;
  deleteCall(id: string): void;
  resetDemoData(): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

const byDateDesc = (x: Call, y: Call) => y.datetime.localeCompare(x.datetime);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>({ accounts: [], calls: [] });
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    loadSnapshot()
      .then((s) => setSnap(s ?? buildSeed()))
      .catch(() => setSnap(buildSeed()))
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (loaded.current) saveSnapshot(snap).catch((e) => console.warn('Failed to save', e));
  }, [snap]);

  const addAccount = useCallback((input: AccountInput) => {
    const account: Account = { ...input, id: newId('acc'), createdAt: new Date().toISOString() };
    setSnap((s) => ({ ...s, accounts: [...s.accounts, account] }));
    return account;
  }, []);

  const saveCall = useCallback(
    (input: CallInput, id?: string) => {
      const now = new Date().toISOString();
      const existing = id ? snap.calls.find((c) => c.id === id) : undefined;
      if (existing?.status === 'Submitted') {
        throw new Error('Submitted calls are locked and cannot be edited.');
      }
      const call: Call = {
        ...input,
        id: existing?.id ?? newId('call'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        submittedAt: input.status === 'Submitted' ? now : undefined,
      };
      setSnap((s) => ({
        ...s,
        calls: existing ? s.calls.map((c) => (c.id === call.id ? call : c)) : [...s.calls, call],
      }));
      return call;
    },
    [snap.calls],
  );

  const deleteCall = useCallback((id: string) => {
    setSnap((s) => ({ ...s, calls: s.calls.filter((c) => c.id !== id || c.status === 'Submitted') }));
  }, []);

  const resetDemoData = useCallback(async () => {
    await clearSnapshot();
    setSnap(buildSeed());
  }, []);

  const value = useMemo<Store>(() => {
    const accounts = [...snap.accounts].sort((x, y) => x.name.localeCompare(y.name));
    const calls = [...snap.calls].sort(byDateDesc);
    return {
      ready,
      accounts,
      calls,
      getAccount: (id) => snap.accounts.find((a) => a.id === id),
      getCall: (id) => snap.calls.find((c) => c.id === id),
      callsForAccount: (accountId) => calls.filter((c) => c.accountId === accountId),
      lastCallFor: (accountId) => calls.find((c) => c.accountId === accountId && c.status === 'Submitted'),
      addAccount,
      saveCall,
      deleteCall,
      resetDemoData,
    };
  }, [snap, ready, addAccount, saveCall, deleteCall, resetDemoData]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
