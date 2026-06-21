import type { Finding } from '@/lib/api';

export interface PercentRect {
  x: number; // 0..100
  y: number;
  w: number;
  h: number;
}

/**
 * The vision model returns a coarse `rough_location` (a 6-zone grid), not exact
 * pixel boxes — this is intentional per the spec (LLMs are weak at bounding
 * boxes; we keep a human in the loop). We translate each zone into a region the
 * user can confirm-blur with one click.
 */
export function locationToRect(loc: Finding['rough_location']): PercentRect {
  switch (loc) {
    case 'top-left':
      return { x: 2, y: 2, w: 48, h: 48 };
    case 'top-right':
      return { x: 50, y: 2, w: 48, h: 48 };
    case 'bottom-left':
      return { x: 2, y: 50, w: 48, h: 48 };
    case 'bottom-right':
      return { x: 50, y: 50, w: 48, h: 48 };
    case 'center':
      return { x: 25, y: 25, w: 50, h: 50 };
    case 'full-image':
    default:
      return { x: 3, y: 3, w: 94, h: 94 };
  }
}

export const SEVERITY_COLOR: Record<string, string> = {
  high: '#fb7185',
  medium: '#fbbf24',
  low: '#34d399',
};

/** Bakes a blurred + darkened + "REDACTED"-stamped region into the canvas. */
export function redactRegion(
  canvas: HTMLCanvasElement,
  baseImage: HTMLImageElement,
  rect: PercentRect,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const x = (rect.x / 100) * canvas.width;
  const y = (rect.y / 100) * canvas.height;
  const w = (rect.w / 100) * canvas.width;
  const h = (rect.h / 100) * canvas.height;

  ctx.save();
  // Clip to the region, then redraw the whole (heavily blurred) image so only
  // that region is replaced with a blurred version of itself.
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.filter = 'blur(18px)';
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(10,10,16,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // "REDACTED" stamp
  const fontSize = Math.max(14, Math.min(w, h) * 0.14);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('REDACTED', x + w / 2, y + h / 2);
  ctx.restore();
}
