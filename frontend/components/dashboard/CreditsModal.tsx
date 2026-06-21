'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export function CreditsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{
          maxWidth: 440,
          width: '100%',
          borderRadius: 18,
          border: '1px solid var(--color-border-strong)',
          padding: 30,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 30 }}>⚠️</div>
        <h3 className="font-display" style={{ fontSize: 26, margin: '10px 0 0' }}>
          You&apos;ve used all your scanning credits.
        </h3>
        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55, color: 'var(--color-muted)' }}>
          Your free plan is still active — you can still remove hidden metadata from your photos for
          free. To scan for visible vulnerabilities again, top up your credits.
        </p>
        {error && <p style={{ marginTop: 10, color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={addCredits}
            disabled={loading}
            style={{
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
          <button
            onClick={onClose}
            style={{
              cursor: 'pointer',
              padding: 13,
              borderRadius: 12,
              background: 'var(--color-card)',
              border: '1px solid var(--color-border-strong)',
              color: 'var(--color-ink)',
              fontFamily: 'var(--font-newsreader), serif',
              fontSize: 15,
            }}
          >
            Continue with Free Plan
          </button>
        </div>
      </div>
    </div>
  );
}
