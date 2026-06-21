'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MODEL_COST_HINTS } from '@/lib/models';
import { useBalance } from '@/components/dashboard/BalanceContext';

function BillingInner() {
  const { tier, balance, refresh } = useBalance();
  const searchParams = useSearchParams();
  const status = searchParams.get('status');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Post-checkout return handling — poll once for the webhook to land.
  useEffect(() => {
    if (status === 'success') {
      setToast('Credits added! Your AI scanning is now active.');
      const t = setTimeout(() => void refresh(), 2000);
      return () => clearTimeout(t);
    }
    if (status === 'cancelled') {
      setToast('Checkout cancelled — no charge was made.');
    }
  }, [status, refresh]);

  async function addCredits() {
    setLoading(true);
    setError('');
    try {
      const { url } = await apiFetch<{ url: string }>('/api/stripe/checkout', { method: 'POST' });
      if (url) window.location.href = url;
      else setError('Could not start checkout. Please try again.');
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'aegiswheil@gmail.com';
  const lowBalance = tier === 'paid' && balance < 0.5;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="font-display" style={{ fontSize: 34, margin: 0 }}>
        Your plan
      </h1>

      {toast && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 14,
            borderColor: 'var(--teal)',
          }}
        >
          {toast}
        </div>
      )}

      <div className="card" style={{ marginTop: 20, borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              Current tier
            </div>
            <div className="font-display" style={{ fontSize: 28 }}>
              {tier === 'paid' ? 'Paid' : 'Free'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              Scanning credits
            </div>
            <div
              className="font-display"
              style={{ fontSize: 28, color: lowBalance ? '#fbbf24' : 'var(--color-ink)' }}
            >
              ${balance.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ borderRadius: 16, padding: 24 }}>
          <div className="font-display" style={{ fontSize: 20 }}>
            Free tier
          </div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-muted)' }}>
            <li>Removes hidden metadata (GPS, device info)</li>
            <li>Runs entirely on your device</li>
            <li>AI exposure report + red highlights</li>
            <li>Unlimited, always free</li>
          </ul>
        </div>

        <div className="card" style={{ borderRadius: 16, padding: 24 }}>
          <div className="font-display" style={{ fontSize: 20 }}>
            Paid — $7.00 for $5.00 credits
          </div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-muted)' }}>
            <li>Download fully redacted images</li>
            <li>Choose from 5 vision models</li>
            <li>Saved scan history</li>
            <li>Credits last until spent (no expiry)</li>
            <li>No subscription — buy when you need it</li>
          </ul>
          {error && <p style={{ marginTop: 10, color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
          <button
            onClick={addCredits}
            disabled={loading}
            style={{
              marginTop: 16,
              width: '100%',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              padding: 14,
              borderRadius: 12,
              background: 'var(--grad)',
              color: '#0a0a12',
              fontFamily: 'var(--font-newsreader), serif',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {loading ? 'Starting checkout…' : 'Add Credits — $7.00'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
          Model pricing reference
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODEL_COST_HINTS.map((m) => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
              <span>{m.label}</span>
              <span style={{ color: 'var(--color-muted)' }}>{m.perScan}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--color-muted-2)' }}>
          Questions? {support}
        </p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--color-muted)' }}>Loading…</p>}>
      <BillingInner />
    </Suspense>
  );
}
