export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 9,
          background: 'var(--grad)',
          position: 'relative',
          boxShadow: '0 6px 18px rgba(139,92,246,.45)',
        }}
      >
        <div style={{ position: 'absolute', inset: 7, borderRadius: '50%', background: '#000' }} />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#fff',
            transform: 'translate(-50%,-50%)',
            boxShadow: '0 0 8px #fff',
          }}
        />
      </div>
      <span
        className="font-display"
        style={{ fontWeight: 400, fontSize: 24, letterSpacing: '.01em' }}
      >
        <span style={{ color: 'var(--gold)' }}>Xen</span>
        <span style={{ color: 'var(--color-ink)' }}>Lens</span>
      </span>
    </div>
  );
}
