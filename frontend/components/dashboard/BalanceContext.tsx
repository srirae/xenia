'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, type BalanceResponse } from '@/lib/api';
import { getByokKey } from '@/lib/byok';

interface BalanceState {
  tier: 'free' | 'paid';
  balance: number;
  displayName: string | null;
  email: string | null;
  loading: boolean;
  /** True when the user has saved their own API key in this browser. */
  byok: boolean;
  /** Paid features are unlocked by credits OR a personal key. */
  hasPaidAccess: boolean;
  /** Re-fetch from the backend (source of truth). */
  refresh: () => Promise<void>;
  /** Re-read the BYOK flag from localStorage (after the plan page saves). */
  refreshByok: () => void;
  /** Optimistically set after a scan response without a round-trip. */
  applyScanResult: (tier: 'free' | 'paid', remaining: number | null) => void;
}

const Ctx = createContext<BalanceState | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<'free' | 'paid'>('free');
  const [balance, setBalance] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [byok, setByok] = useState(false);

  const refreshByok = useCallback(() => setByok(Boolean(getByokKey())), []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<BalanceResponse>('/api/user/balance');
      setTier(data.tier);
      setBalance(data.balance);
      setDisplayName(data.display_name);
      setEmail(data.email);
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  const applyScanResult = useCallback((newTier: 'free' | 'paid', remaining: number | null) => {
    setTier(newTier);
    if (remaining !== null) setBalance(remaining);
  }, []);

  useEffect(() => {
    void refresh();
    refreshByok();
  }, [refresh, refreshByok]);

  return (
    <Ctx.Provider
      value={{
        tier,
        balance,
        displayName,
        email,
        loading,
        byok,
        hasPaidAccess: tier === 'paid' || byok,
        refresh,
        refreshByok,
        applyScanResult,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useBalance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBalance must be used within BalanceProvider');
  return ctx;
}
