'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, type BalanceResponse } from '@/lib/api';

interface BalanceState {
  tier: 'free' | 'paid';
  balance: number;
  displayName: string | null;
  email: string | null;
  loading: boolean;
  /** Re-fetch from the backend (source of truth). */
  refresh: () => Promise<void>;
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
  }, [refresh]);

  return (
    <Ctx.Provider value={{ tier, balance, displayName, email, loading, refresh, applyScanResult }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBalance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBalance must be used within BalanceProvider');
  return ctx;
}
