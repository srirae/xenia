'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/client';
import { useBalance } from './BalanceContext';

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { tier, balance, loading } = useBalance();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const links = [
    { href: '/dashboard', label: 'Scanner' },
    { href: '/dashboard/history', label: 'History' },
    { href: '/dashboard/billing', label: 'Billing' },
  ];

  const lowBalance = tier === 'paid' && balance < 0.5;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backdropFilter: 'blur(16px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
        background: 'var(--header-bg-scrolled)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 24px',
          maxWidth: 1180,
          margin: '0 auto',
          flexWrap: 'wrap',
        }}
      >
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <Logo size={28} />
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 14,
                  textDecoration: 'none',
                  color: active ? 'var(--color-ink)' : 'var(--color-muted)',
                  borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
                  paddingBottom: 2,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!loading && tier === 'paid' && (
            <Link
              href="/dashboard/billing"
              style={{
                fontSize: 13,
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${lowBalance ? '#fbbf24' : 'var(--color-border-strong)'}`,
                color: lowBalance ? '#fbbf24' : 'var(--color-ink)',
                background: 'var(--color-chip)',
              }}
            >
              Credits: ${balance.toFixed(2)} <span style={{ opacity: 0.6 }}>+ Add</span>
            </Link>
          )}
          <ThemeToggle />
          <button
            onClick={signOut}
            style={{
              fontSize: 13,
              cursor: 'pointer',
              padding: '7px 14px',
              borderRadius: 10,
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-ink)',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
