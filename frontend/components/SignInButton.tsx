'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignInButton({
  label = 'Sign in with Google',
  variant = 'primary',
}: {
  label?: string;
  variant?: 'primary' | 'ghost';
}) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/plan`,
      },
    });
    if (error) setLoading(false);
  }

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    cursor: loading ? 'wait' : 'pointer',
    padding: '13px 22px',
    borderRadius: 13,
    fontFamily: 'var(--font-newsreader), Georgia, serif',
    fontWeight: 600,
    fontSize: 15,
    border: 'none',
    transition: 'transform .2s, box-shadow .2s',
  };
  const style: React.CSSProperties =
    variant === 'primary'
      ? {
          ...base,
          background: 'var(--grad)',
          color: '#0a0a12',
          boxShadow: '0 14px 34px rgba(139,92,246,.4)',
        }
      : {
          ...base,
          background: 'var(--color-card)',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-ink)',
        };

  return (
    <button onClick={signIn} disabled={loading} style={style}>
      <GoogleMark />
      {loading ? 'Redirecting…' : label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.7 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.7 29 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.3 26.7 35 24 35c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.6 38.6 16.2 43 24 43z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C39.7 35.9 43 30.5 43 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
