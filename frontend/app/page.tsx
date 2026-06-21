import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SignInButton } from '@/components/SignInButton';
import { createClient } from '@/lib/supabase/server';

export default async function LandingPage() {
  // Already signed in → straight to the scanner.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  const muted = { color: 'var(--color-muted)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
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
            padding: '16px 30px',
            maxWidth: 1180,
            margin: '0 auto',
          }}
        >
          <Logo />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <a href="#features" style={{ fontSize: 14, textDecoration: 'none', ...muted }}>
              Features
            </a>
            <a href="#privacy" style={{ fontSize: 14, textDecoration: 'none', ...muted }}>
              Privacy
            </a>
            <a href="#pricing" style={{ fontSize: 14, textDecoration: 'none', ...muted }}>
              Pricing
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* hero */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '80px 24px',
        }}
      >
        <div style={{ maxWidth: 760, animation: 'riseIn .7s ease both' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 16px',
              borderRadius: 999,
              background: 'var(--color-card)',
              border: '1px solid #2ee06a',
              fontSize: 12,
              lineHeight: 1,
              ...muted,
            }}
          >
            On-Device · You&apos;re in control of your Data
          </div>

          <h1
            className="font-display"
            style={{
              fontWeight: 400,
              fontSize: 'clamp(44px,6.2vw,74px)',
              lineHeight: 1.0,
              letterSpacing: '-.015em',
              margin: '22px 0 0',
            }}
          >
            Share the moment.
            <br />
            Not <span className="grad-text" style={{ fontStyle: 'italic' }}>your identity.</span>
          </h1>

          <p style={{ maxWidth: 560, margin: '20px auto 0', fontSize: 16, lineHeight: 1.55, ...muted }}>
            AI can now find your home from a single photo. XenLens finds what leaks — the hidden GPS
            and device data <em>and</em> the visible clues in the picture itself — then strips it
            before you post.
          </p>

          <div style={{ marginTop: 34, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <SignInButton label="Sign in with Google" />
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, ...muted }}>
            Free forever for metadata removal. No card required to start.
          </p>
        </div>
      </main>

      {/* features */}
      <section id="features" style={{ borderTop: '1px solid var(--color-border)', padding: '90px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <SectionKicker>Features</SectionKicker>
          <h2 className="font-display" style={sectionH2}>
            Everything that leaks, found and removed.
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(232px,1fr))',
              gap: 16,
              marginTop: 42,
            }}
          >
            {[
              ['01', 'Reads the hidden layer', 'Parses real EXIF — GPS, camera make & model, timestamps and software tags — entirely on your device.'],
              ['02', 'Sees the visible clues', 'An AI vision scan flags street signs, plates, reflections and landmarks that reveal where you are.'],
              ['03', 'One-tap redaction', 'Click any flagged region to blur it. Download a clean, fully redacted copy.'],
              ['04', 'Private by architecture', 'Metadata never leaves your browser. The visual scan runs on an API that does not train on your image.'],
            ].map(([n, title, body]) => (
              <div key={n} className="card" style={{ borderRadius: 16, padding: 24 }}>
                <div className="font-display" style={{ fontSize: 13, color: 'var(--gold)', letterSpacing: '.1em' }}>
                  {n}
                </div>
                <div className="font-display" style={{ marginTop: 12, fontSize: 23 }}>
                  {title}
                </div>
                <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, ...muted }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* privacy */}
      <section id="privacy" style={{ borderTop: '1px solid var(--color-border)', padding: '90px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <SectionKicker>Privacy</SectionKicker>
          <h2 className="font-display" style={sectionH2}>
            Trustworthy by architecture. Honest about limits.
          </h2>
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.65, ...muted }}>
            The sensitive half — your metadata — is processed entirely on your device and never
            uploaded. The visual scan uses an API that does not train on or store your image, with
            metadata already stripped before it is sent. We store no images. And no tool catches
            everything, so we show you our reasoning instead of asking for blind faith.
          </p>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" style={{ borderTop: '1px solid var(--color-border)', padding: '90px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <SectionKicker center>Pricing</SectionKicker>
          <h2 className="font-display" style={{ ...sectionH2, textAlign: 'center' }}>
            Free to start. Pay only for AI scans.
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 20,
              marginTop: 44,
              textAlign: 'left',
            }}
          >
            <div className="card" style={{ borderRadius: 20, padding: 30 }}>
              <Tier name="Free" price="$0" unit="/ forever" />
              <Bullets items={['Unlimited metadata removal', 'On-device processing', 'AI exposure report', 'Red highlight boxes', 'No card required']} />
            </div>
            <div className="card" style={{ borderRadius: 20, padding: 30 }}>
              <Tier name="Credits" price="$7" unit="for $5 credits" />
              <Bullets
                items={[
                  'Everything in Free',
                  'Download fully redacted images',
                  'Choose from 5 vision models',
                  'Saved scan history',
                  'No subscription — buy when you need it',
                ]}
              />
            </div>
          </div>
          <div style={{ marginTop: 34 }}>
            <SignInButton label="Get started with Google" />
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--color-border)', padding: '40px 24px', textAlign: 'center', fontSize: 13, ...muted }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Logo size={26} />
        </div>
        Questions? {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'aegiswheil@gmail.com'} ·{' '}
        <Link href="/dashboard" style={{ color: 'var(--gold)' }}>
          Open the app
        </Link>
      </footer>
    </div>
  );
}

const sectionH2: React.CSSProperties = {
  fontWeight: 400,
  fontSize: 'clamp(30px,4vw,46px)',
  letterSpacing: '-.01em',
  margin: '10px 0 0',
};

function SectionKicker({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: '.18em',
        textTransform: 'uppercase',
        color: 'var(--gold)',
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </div>
  );
}

function Tier({ name, price, unit }: { name: string; price: string; unit: string }) {
  return (
    <>
      <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
        {name}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="font-display" style={{ fontSize: 48, lineHeight: 1 }}>
          {price}
        </span>
        <span style={{ fontSize: 14, color: 'var(--color-muted)' }}>{unit}</span>
      </div>
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14, color: 'var(--color-muted)' }}>
      {items.map((it) => (
        <div key={it} style={{ display: 'flex', gap: 9 }}>
          <span style={{ color: 'var(--gold)' }}>✓</span> {it}
        </div>
      ))}
    </div>
  );
}
