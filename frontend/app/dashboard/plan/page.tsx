'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getByokKey, setByokKey, clearByokKey, looksLikeOpenRouterKey } from '@/lib/byok';
import { useBalance } from '@/components/dashboard/BalanceContext';

interface Tier {
  key: 'free' | 'credits' | 'byok';
  name: string;
  price: string;
  unit: string;
  blurb: string;
  badge?: string;
  benefits: string[];
}

const TIERS: Tier[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    unit: 'forever',
    blurb: 'Everything you need to clean a photo, on your device.',
    benefits: [
      'Unlimited on-device metadata removal',
      'GPS, camera, timestamp & software stripping',
      'AI exposure report with red highlight boxes',
      'Click-to-blur redaction in the canvas',
      'Download the metadata-stripped image',
      'No card required',
    ],
  },
  {
    key: 'credits',
    name: 'Usage by credit',
    price: '$7',
    unit: 'for $5.00 in credits',
    blurb: 'Pay-as-you-go AI scanning. Buy a pool, burn it down, top up when empty.',
    badge: 'Most popular',
    benefits: [
      'Everything in Free',
      'Download fully redacted images',
      'Choose from 5 vision models',
      'Saved scan history',
      'Credits never expire — no subscription',
      'We handle the API keys for you',
    ],
  },
  {
    key: 'byok',
    name: 'Bring your own key',
    price: '$0',
    unit: 'you pay your provider',
    blurb: 'Use your own OpenRouter key. We never bill you and never store the key.',
    benefits: [
      'Everything in Credits — no credit cost',
      'Unlock all paid vision models instantly',
      'Download fully redacted images',
      'Saved scan history',
      'Key stays in your browser, sent per scan',
      'You control spend at your provider',
    ],
  },
];

export default function PlanPage() {
  const router = useRouter();
  const { byok, refreshByok } = useBalance();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyInput, setKeyInput] = useState(() => getByokKey());
  const [savedNote, setSavedNote] = useState('');

  async function startCheckout() {
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

  function saveKey() {
    setError('');
    const v = keyInput.trim();
    if (v && !looksLikeOpenRouterKey(v)) {
      setError('That does not look like an OpenRouter key (it should start with "sk-or-").');
      return;
    }
    setByokKey(v);
    refreshByok();
    setSavedNote(v ? 'Key saved in this browser. Paid models are unlocked.' : 'Key removed.');
  }

  function removeKey() {
    clearByokKey();
    setKeyInput('');
    refreshByok();
    setSavedNote('Key removed.');
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', animation: 'riseIn .5s ease both' }}>
      <div style={{ textAlign: 'center', maxWidth: 620, margin: '6px auto 0' }}>
        <div style={kicker}>Choose your plan</div>
        <h1 className="font-display" style={{ fontSize: 'clamp(30px,4vw,44px)', margin: '10px 0 0' }}>
          How do you want to scan?
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: 'var(--color-muted)' }}>
          Metadata removal is always free and always on-device. The AI visual scan can run on our
          credits, or on your own API key. Pick one — you can change it anytime.
        </p>
      </div>

      {error && (
        <p style={{ marginTop: 16, textAlign: 'center', color: 'var(--color-danger)', fontSize: 13 }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: 18,
          marginTop: 34,
          alignItems: 'start',
        }}
      >
        {TIERS.map((t) => {
          const active = t.key === 'byok' && byok;
          return (
            <div
              key={t.key}
              className="card"
              style={{
                position: 'relative',
                borderRadius: 20,
                padding: 28,
                border: active ? '1px solid var(--gold)' : '1px solid var(--color-border)',
                boxShadow: active ? '0 0 0 1px var(--gold)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              {t.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 20,
                    right: 22,
                    fontSize: 11,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--gold)',
                    border: '1px solid var(--gold)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}
                >
                  {t.badge}
                </span>
              )}

              <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                {t.name}
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="font-display" style={{ fontSize: 44, lineHeight: 1 }}>
                  {t.price}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{t.unit}</span>
              </div>
              <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--color-muted)', minHeight: 38 }}>
                {t.blurb}
              </p>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {t.benefits.map((b) => (
                  <div key={b} style={{ display: 'flex', gap: 9, fontSize: 13.5, lineHeight: 1.45 }}>
                    <span style={{ color: 'var(--gold)', flex: 'none' }}>✓</span>
                    <span style={{ color: 'var(--color-ink)' }}>{b}</span>
                  </div>
                ))}
              </div>

              {/* per-tier action */}
              <div style={{ marginTop: 22 }}>
                {t.key === 'free' && (
                  <button onClick={() => router.push('/dashboard')} style={ghostCta}>
                    Continue free →
                  </button>
                )}

                {t.key === 'credits' && (
                  <button onClick={startCheckout} disabled={loading} style={primaryCta}>
                    {loading ? 'Starting checkout…' : 'Add Credits — $7.00'}
                  </button>
                )}

                {t.key === 'byok' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="password"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="sk-or-v1-…"
                      autoComplete="off"
                      spellCheck={false}
                      style={{
                        background: 'var(--color-surface)',
                        color: 'var(--color-ink)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        fontSize: 13,
                        fontFamily: 'var(--font-newsreader), serif',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveKey} style={{ ...primaryCta, flex: 1 }}>
                        {byok ? 'Update key' : 'Save key'}
                      </button>
                      {byok && (
                        <button onClick={removeKey} style={{ ...ghostCta, flex: 'none', padding: '12px 14px' }}>
                          Remove
                        </button>
                      )}
                    </div>
                    {savedNote && (
                      <div style={{ fontSize: 11.5, color: active ? 'var(--gold)' : 'var(--color-muted-2)' }}>
                        {savedNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 28, textAlign: 'center', fontSize: 12.5, color: 'var(--color-muted-2)' }}>
        Your photos are never stored. Metadata is stripped in your browser before any scan.{' '}
        Questions? {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'aegiswheil@gmail.com'}
      </p>
    </div>
  );
}

const kicker: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: '.18em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
};

const primaryCta: React.CSSProperties = {
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  padding: 13,
  borderRadius: 12,
  background: 'var(--grad)',
  color: '#0a0a12',
  fontFamily: 'var(--font-newsreader), serif',
  fontWeight: 600,
  fontSize: 14.5,
};

const ghostCta: React.CSSProperties = {
  width: '100%',
  cursor: 'pointer',
  padding: 13,
  borderRadius: 12,
  background: 'transparent',
  border: '1px solid var(--color-border-strong)',
  color: 'var(--color-ink)',
  fontFamily: 'var(--font-newsreader), serif',
  fontWeight: 600,
  fontSize: 14.5,
};
