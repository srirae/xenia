import type { Config } from 'tailwindcss';

/**
 * Tailwind is used for layout primitives only. All colours come from the Veil
 * design tokens (CSS variables in globals.css) so light/dark theming stays in
 * one place and matches the pre-built design exactly.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        teal: 'var(--teal)',
        violet: 'var(--violet)',
        pink: 'var(--pink)',
        gold: 'var(--gold)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        serif: ['var(--font-newsreader)', 'Georgia', 'serif'],
        display: ['var(--font-instrument)', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
