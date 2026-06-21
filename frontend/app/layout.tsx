import type { Metadata } from 'next';
import { Instrument_Serif, Newsreader } from 'next/font/google';
import './globals.css';
import { ThemeScript } from '@/components/ThemeScript';

const instrument = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

const newsreader = Newsreader({
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Veil — Share the moment. Not your identity.',
  description:
    'Veil detects and removes the hidden metadata and visible clues that leak your location and identity from photos — before you post.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${instrument.variable} ${newsreader.variable}`}>{children}</body>
    </html>
  );
}
