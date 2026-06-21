'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type AnalyzeResponse, type Finding, type ScanReport, type ApiError } from '@/lib/api';
import { extractLeaks, parseJpegExif, stripMetadata, stripAndEncode, type Leak } from '@/lib/exif';
import { locationToRect, redactRegion, SEVERITY_COLOR } from '@/lib/redact';
import { CLIENT_MODELS, DEFAULT_MODEL_ID } from '@/lib/models';
import { useBalance } from './BalanceContext';
import { CreditsModal } from './CreditsModal';

type Stage = 'idle' | 'reading' | 'scanning' | 'results' | 'error';

interface UIFinding extends Finding {
  redacted: boolean;
}

const SEV_LABEL: Record<string, [string, string]> = {
  high: ['HIGH RISK', '#fb7185'],
  medium: ['MEDIUM', '#fbbf24'],
  low: ['LOW', '#34d399'],
};

export function Scanner() {
  const router = useRouter();
  const { tier, refresh, applyScanResult } = useBalance();

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  const [metaLeaks, setMetaLeaks] = useState<Leak[]>([]);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [findings, setFindings] = useState<UIFinding[]>([]);
  const [cleanUrl, setCleanUrl] = useState<string | null>(null);
  const [chosenModel, setChosenModel] = useState<string>(DEFAULT_MODEL_ID);
  const [showCredits, setShowCredits] = useState(false);
  const [gateDownload, setGateDownload] = useState(true); // redacted download locked?

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const cleanBlobRef = useRef<Blob | null>(null);
  const cleanUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
    cleanUrlRef.current = null;
    cleanBlobRef.current = null;
    baseImageRef.current = null;
    setStage('idle');
    setError('');
    setMetaLeaks([]);
    setReport(null);
    setFindings([]);
    setCleanUrl(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file || !/^image\//.test(file.type)) {
        setError('Please choose an image file (JPEG or PNG).');
        return;
      }
      setError('');
      setFileName(file.name);
      setReport(null);
      setFindings([]);
      setStage('reading');

      // 1. Read EXIF metadata (browser-only).
      let leaks: Leak[] = [];
      try {
        const buf = await file.arrayBuffer();
        leaks = extractLeaks(parseJpegExif(buf).tags);
      } catch {
        leaks = [];
      }
      setMetaLeaks(leaks);

      // 2. Strip metadata client-side → clean blob + base image for the canvas.
      let base64: string;
      try {
        const stripped = await stripMetadata(file);
        if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
        cleanUrlRef.current = stripped.url;
        cleanBlobRef.current = stripped.blob;
        setCleanUrl(stripped.url);

        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('decode failed'));
          img.src = stripped.url;
        });
        baseImageRef.current = img;

        base64 = await stripAndEncode(file);
      } catch {
        setError('Could not process this image format. Try a JPEG or PNG.');
        setStage('error');
        return;
      }

      // 3. Call the backend vision scan (metadata already stripped).
      setStage('scanning');
      try {
        const data = await apiFetch<AnalyzeResponse>('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ base64Image: base64, chosenModel }),
        });

        setReport(data.report);
        setFindings((data.report.findings ?? []).map((f) => ({ ...f, redacted: false })));
        setGateDownload(!data.gated.download_redacted);
        applyScanResult(data.tier, data.remaining_balance ?? null);
        setStage('results');

        if (data.credits_exhausted) setShowCredits(true);
        // Paint the clean base image once the canvas mounts (see effect below).
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) {
          router.push('/?auth=required');
          return;
        }
        if (err.status === 402 || err.code === 'CREDITS_EXHAUSTED') {
          // Free path still completed the metadata strip — show results + modal.
          setReport({ risk_level: 'unknown', summary: '', findings: [] });
          setFindings([]);
          setGateDownload(true);
          setStage('results');
          setShowCredits(true);
          void refresh();
          return;
        }
        setError(err.message || 'Scan failed. Please try again.');
        setStage('error');
      }
    },
    [chosenModel, applyScanResult, refresh, router],
  );

  // Paint base image to canvas when we enter results.
  useEffect(() => {
    if (stage !== 'results') return;
    const canvas = canvasRef.current;
    const img = baseImageRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(img, 0, 0);
  }, [stage]);

  function redactFinding(index: number) {
    const canvas = canvasRef.current;
    const img = baseImageRef.current;
    const f = findings[index];
    if (!canvas || !img || !f || f.redacted) return;
    redactRegion(canvas, img, locationToRect(f.rough_location));
    setFindings((prev) => prev.map((x, i) => (i === index ? { ...x, redacted: true } : x)));
  }

  function downloadClean() {
    const blob = cleanBlobRef.current;
    if (!blob) return;
    triggerDownload(blob, fileName, 'clean');
  }

  function downloadRedacted() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (b) => {
        if (b) triggerDownload(b, fileName, 'redacted');
      },
      'image/jpeg',
      0.95,
    );
  }

  // ---- drag & drop ----
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  };

  const paidModels = tier === 'paid';

  return (
    <div>
      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}

      {stage === 'idle' && (
        <Dropzone
          dragOver={dragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          onPick={(f) => void handleFile(f)}
          error={error}
        />
      )}

      {(stage === 'reading' || stage === 'scanning') && (
        <ScanningView stage={stage} cleanUrl={cleanUrl} />
      )}

      {stage === 'error' && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ color: 'var(--color-danger)', fontSize: 15 }}>{error}</p>
          <button onClick={reset} style={ghostBtn}>
            ← Try another photo
          </button>
        </div>
      )}

      {stage === 'results' && (
        <div style={{ animation: 'riseIn .5s ease both' }}>
          <button onClick={reset} style={{ ...ghostBtn, marginBottom: 14 }}>
            ← Scan a different photo
          </button>

          {paidModels && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: '.08em' }}>
                MODEL
              </span>
              <select
                value={chosenModel}
                onChange={(e) => setChosenModel(e.target.value)}
                style={{
                  background: 'var(--color-card)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontFamily: 'var(--font-newsreader), serif',
                  fontSize: 14,
                }}
              >
                {CLIENT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'var(--color-muted-2)' }}>
                Re-scan with a different model to apply.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* canvas + highlight boxes */}
            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  borderRadius: 18,
                  overflow: 'hidden',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 34px 80px rgba(0,0,0,.45)',
                }}
              >
                <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
                {findings.map((f, i) => {
                  const rect = locationToRect(f.rough_location);
                  const color = f.redacted ? '#34d399' : SEVERITY_COLOR[f.severity] ?? '#fb7185';
                  return (
                    <button
                      key={i}
                      onClick={() => redactFinding(i)}
                      title={f.redacted ? 'Redacted' : `Click to blur: ${f.type}`}
                      disabled={f.redacted}
                      style={{
                        position: 'absolute',
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.w}%`,
                        height: `${rect.h}%`,
                        border: `2px solid ${color}`,
                        background: f.redacted ? 'rgba(52,211,153,.10)' : 'rgba(226,75,74,.14)',
                        borderRadius: 10,
                        cursor: f.redacted ? 'default' : 'pointer',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        padding: 6,
                        transition: 'border-color .2s, background .2s',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: '.04em',
                          background: 'rgba(8,8,16,.7)',
                          padding: '2px 7px',
                          borderRadius: 6,
                        }}
                      >
                        {f.redacted ? '✓ redacted' : f.type.replace(/_/g, ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* report panel */}
            <div style={{ flex: '0 0 360px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <Verdict report={report} findingsCount={findings.length} metaCount={metaLeaks.length} />

              {/* metadata leaks */}
              {metaLeaks.length > 0 && (
                <Section title="Hidden metadata (removed on-device)">
                  {metaLeaks.map((l) => (
                    <LeakCard
                      key={l.id}
                      tag={l.tag}
                      title={l.title}
                      value={l.value}
                      detail={l.detail}
                      sev={l.severity === 'med' ? 'medium' : l.severity}
                    />
                  ))}
                </Section>
              )}

              {/* AI findings */}
              {findings.length > 0 && (
                <Section title="Visible vulnerabilities — click a box to blur">
                  {findings.map((f, i) => {
                    const [label, col] = SEV_LABEL[f.severity] ?? SEV_LABEL.medium;
                    return (
                      <div
                        key={i}
                        className="card"
                        style={{ borderRadius: 14, padding: '12px 14px', position: 'relative' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, letterSpacing: '.1em', color: col }}>
                            {f.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: 9,
                              color: col,
                              border: `1px solid ${col}55`,
                              padding: '2px 7px',
                              borderRadius: 6,
                            }}
                          >
                            {label}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45, color: 'var(--color-muted)' }}>
                          {f.description}
                        </div>
                        <button
                          onClick={() => redactFinding(i)}
                          disabled={f.redacted}
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            cursor: f.redacted ? 'default' : 'pointer',
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--color-border-strong)',
                            background: f.redacted ? 'rgba(52,211,153,.12)' : 'var(--color-card)',
                            color: f.redacted ? '#34d399' : 'var(--color-ink)',
                          }}
                        >
                          {f.redacted ? '✓ Redacted' : 'Redact'}
                        </button>
                      </div>
                    );
                  })}
                </Section>
              )}

              {/* downloads */}
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={downloadClean} style={primaryBtn}>
                  Download (metadata stripped) ↓
                </button>

                {gateDownload ? (
                  <div className="card" style={{ borderRadius: 12, padding: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>🔒 Download fully redacted image</div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--color-muted-2)', lineHeight: 1.4 }}>
                      Redactions are visible on screen but not saved into your download. Upgrade to
                      export a fully redacted image and save your scan history.
                    </div>
                    <a
                      href="/dashboard/billing"
                      style={{
                        display: 'inline-block',
                        marginTop: 10,
                        fontSize: 13,
                        color: 'var(--teal)',
                        textDecoration: 'none',
                      }}
                    >
                      Add credits →
                    </a>
                  </div>
                ) : (
                  <button onClick={downloadRedacted} style={{ ...primaryBtn, background: 'var(--grad)' }}>
                    Download clean image (redacted) ↓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Dropzone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  error,
}: {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: (f: File) => void;
  error: string;
}) {
  return (
    <div style={{ maxWidth: 540, margin: '40px auto 0', textAlign: 'center' }}>
      <h1 className="font-display" style={{ fontSize: 'clamp(32px,4vw,44px)', margin: 0 }}>
        Drop a photo to scan it.
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, color: 'var(--color-muted)' }}>
        Metadata is stripped in your browser. The image is then scanned for visible clues — and
        never stored.
      </p>

      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        htmlFor="veil-file"
        className="surface"
        style={{
          display: 'block',
          marginTop: 30,
          padding: '46px 30px',
          borderRadius: 20,
          border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--color-border-strong)'}`,
          cursor: 'pointer',
          background: dragOver ? 'rgba(45,212,191,.08)' : 'var(--color-surface)',
          transition: 'border-color .2s, background .2s',
        }}
      >
        <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>
          {dragOver ? 'Drop to scan' : 'Drop a photo or click to upload'}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-muted)' }}>
          JPEG or PNG · metadata never leaves your device
        </div>
      </label>
      <input
        id="veil-file"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = '';
          if (f) onPick(f);
        }}
      />
      {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>}
    </div>
  );
}

function ScanningView({ stage, cleanUrl }: { stage: Stage; cleanUrl: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '40px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '.16em', color: 'var(--teal)' }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--teal)',
            boxShadow: '0 0 8px var(--teal)',
            animation: 'dotPulse 1.4s ease-in-out infinite',
          }}
        />
        {stage === 'reading' ? 'READING HIDDEN DATA' : 'SENDING TO NVIDIA NIM FOR ANALYSIS'}
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          minHeight: 200,
          background: 'var(--color-card)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cleanUrl && <img src={cleanUrl} alt="" style={{ display: 'block', width: '100%' }} />}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg,transparent,var(--teal) 30%,var(--pink) 70%,transparent)',
            boxShadow: '0 0 20px var(--teal)',
            animation: 'scanMove 2.1s ease-in-out infinite',
          }}
        />
      </div>
      <div style={{ fontSize: 15, color: 'var(--color-muted)' }}>
        {stage === 'reading' ? 'Inspecting metadata & stripping it locally…' : 'Analysing the image for visible privacy risks…'}
      </div>
    </div>
  );
}

function Verdict({
  report,
  findingsCount,
  metaCount,
}: {
  report: ScanReport | null;
  findingsCount: number;
  metaCount: number;
}) {
  const risk = report?.risk_level ?? 'unknown';
  const dot =
    risk === 'critical' || risk === 'high' ? '#fb7185' : risk === 'medium' ? '#fbbf24' : '#34d399';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '.16em', color: 'var(--teal)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}` }} />
        EXPOSURE REPORT
      </div>
      <h2 className="font-display" style={{ fontSize: 26, margin: '8px 0 0' }}>
        {findingsCount + metaCount === 0
          ? 'Nothing obvious found'
          : `${findingsCount + metaCount} thing${findingsCount + metaCount > 1 ? 's' : ''} this photo reveals`}
      </h2>
      {report?.summary && (
        <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-muted)' }}>
          {report.summary}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--color-muted-2)', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function LeakCard({
  tag,
  title,
  value,
  detail,
  sev,
}: {
  tag: string;
  title: string;
  value: string;
  detail: string;
  sev: 'high' | 'medium' | 'low';
}) {
  const [label, col] = SEV_LABEL[sev] ?? SEV_LABEL.medium;
  return (
    <div className="card" style={{ borderRadius: 14, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: col }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: '.12em', color: col }}>{tag}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: col, border: `1px solid ${col}55`, padding: '2px 7px', borderRadius: 6 }}>
          {label}
        </span>
      </div>
      <div style={{ marginTop: 8, fontWeight: 500, fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 3, fontSize: 12, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.45, color: 'var(--color-muted-2)' }}>{detail}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const ghostBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--color-muted)',
  fontFamily: 'var(--font-newsreader), serif',
  padding: '6px 0',
};

const primaryBtn: React.CSSProperties = {
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  padding: 14,
  borderRadius: 13,
  background: 'var(--grad)',
  color: '#0a0a12',
  fontFamily: 'var(--font-newsreader), serif',
  fontWeight: 600,
  fontSize: 15,
  boxShadow: '0 14px 34px rgba(139,92,246,.35)',
};

function triggerDownload(blob: Blob, fileName: string, suffix: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = (fileName || 'photo').replace(/\.[^.]+$/, '');
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  a.download = `${base}-${suffix}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
