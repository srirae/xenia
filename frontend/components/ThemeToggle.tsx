'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const t = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('veil-theme', next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light or dark mode"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-ink)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1.6px solid currentColor',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -1,
            bottom: -1,
            left: '50%',
            right: -1,
            background: 'currentColor',
          }}
        />
      </span>
    </button>
  );
}
