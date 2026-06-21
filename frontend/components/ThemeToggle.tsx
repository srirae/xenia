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
    const apply = () => {
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('veil-theme', next);
      } catch {
        /* ignore */
      }
    };
    // Smooth face-flip transition where supported (matches the XenLens design).
    const startVT = (document as unknown as {
      startViewTransition?: (cb: () => void) => void;
    }).startViewTransition;
    if (typeof startVT === 'function') startVT.call(document, apply);
    else apply();
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light or dark mode"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        height: 38,
        padding: '0 15px',
        borderRadius: 999,
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-ink)',
        cursor: 'pointer',
        fontFamily: 'var(--font-newsreader), Georgia, serif',
        fontSize: 14,
        viewTransitionName: 'theme-toggle',
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '1.6px solid currentColor',
          overflow: 'hidden',
          flex: 'none',
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
      <span>{theme === 'light' ? 'Lumen' : 'Umbra'}</span>
    </button>
  );
}
