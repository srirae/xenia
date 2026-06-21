// On-device EXIF parsing + metadata stripping. No network, no uploads.
// Ported from the original Veil exif-utils.js into typed form.
//
// SECURITY: metadata is stripped client-side (canvas re-encode) BEFORE any
// base64 is sent to the backend vision API — the analysis call never carries
// GPS/device data. This is the spec's non-negotiable rule.

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export interface Leak {
  id: string;
  cat: 'location' | 'identity' | 'device' | 'time' | 'system';
  tag: string;
  title: string;
  value: string;
  detail: string;
  severity: 'high' | 'med' | 'low';
  lat?: number;
  lon?: number;
}

type Tags = Record<string | number, unknown>;

export function parseJpegExif(buffer: ArrayBuffer): { isJpeg: boolean; tags: Tags } {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { isJpeg: false, tags: {} };
  let offset = 2;
  const len = view.byteLength;
  while (offset + 4 <= len) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10);
    }
    offset += 2 + size;
  }
  return { isJpeg: true, tags: {} };
}

function parseTiff(view: DataView, tiffStart: number): { isJpeg: boolean; tags: Tags } {
  const little = view.getUint16(tiffStart) === 0x4949;
  const tags: Tags = {};
  const firstIFD = view.getUint32(tiffStart + 4, little);
  readIFD(view, tiffStart, tiffStart + firstIFD, little, tags, 'ifd0');
  return { isJpeg: true, tags };
}

function readIFD(
  view: DataView,
  tiffStart: number,
  dirStart: number,
  little: boolean,
  tags: Tags,
  which: 'ifd0' | 'exif' | 'gps',
) {
  const get16 = (o: number) => view.getUint16(o, little);
  const get32 = (o: number) => view.getUint32(o, little);
  if (dirStart + 2 > view.byteLength) return;
  const entries = get16(dirStart);
  for (let i = 0; i < entries; i++) {
    const entry = dirStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = get16(entry);
    const type = get16(entry + 2);
    const count = get32(entry + 4);
    const size = (TYPE_SIZE[type] || 1) * count;
    let valueOffset = entry + 8;
    if (size > 4) valueOffset = tiffStart + get32(entry + 8);
    const val = readVal(view, valueOffset, type, count, little);
    const key = which === 'gps' ? 'gps_' + tag : tag;
    tags[key] = val;
    if (which === 'ifd0' && tag === 0x8769 && typeof val === 'number')
      readIFD(view, tiffStart, tiffStart + val, little, tags, 'exif');
    if (which === 'ifd0' && tag === 0x8825 && typeof val === 'number')
      readIFD(view, tiffStart, tiffStart + val, little, tags, 'gps');
  }
}

function readVal(
  view: DataView,
  offset: number,
  type: number,
  count: number,
  little: boolean,
): unknown {
  const get16 = (o: number) => view.getUint16(o, little);
  const get32 = (o: number) => view.getUint32(o, little);
  const gets32 = (o: number) => view.getInt32(o, little);
  try {
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(offset + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    if (type === 3) {
      const a: number[] = [];
      for (let i = 0; i < count; i++) a.push(get16(offset + i * 2));
      return count === 1 ? a[0] : a;
    }
    if (type === 4 || type === 9) {
      const a: number[] = [];
      for (let i = 0; i < count; i++) a.push(get32(offset + i * 4));
      return count === 1 ? a[0] : a;
    }
    if (type === 5) {
      const a: number[] = [];
      for (let i = 0; i < count; i++) {
        const n = get32(offset + i * 8);
        const d = get32(offset + i * 8 + 4);
        a.push(d ? n / d : 0);
      }
      return count === 1 ? a[0] : a;
    }
    if (type === 10) {
      const a: number[] = [];
      for (let i = 0; i < count; i++) {
        const n = gets32(offset + i * 8);
        const d = gets32(offset + i * 8 + 4);
        a.push(d ? n / d : 0);
      }
      return count === 1 ? a[0] : a;
    }
    if (type === 1 || type === 7) {
      const a: number[] = [];
      for (let i = 0; i < count; i++) a.push(view.getUint8(offset + i));
      return count === 1 ? a[0] : a;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractLeaks(tags: Tags): Leak[] {
  const t = tags || {};
  const leaks: Leak[] = [];

  const lat = t['gps_2'];
  const lon = t['gps_4'];
  if (Array.isArray(lat) && Array.isArray(lon) && lat.length === 3) {
    const toDec = (a: number[], ref: unknown) => {
      let v = a[0] + a[1] / 60 + a[2] / 3600;
      if (ref === 'S' || ref === 'W') v = -v;
      return v;
    };
    const la = toDec(lat as number[], t['gps_1']);
    const lo = toDec(lon as number[], t['gps_3']);
    leaks.push({
      id: 'gps',
      cat: 'location',
      tag: 'GPS',
      title: 'Exact GPS coordinates',
      value: `${la.toFixed(5)}, ${lo.toFixed(5)}`,
      detail: 'Pinpoints exactly where this photo was taken.',
      severity: 'high',
      lat: la,
      lon: lo,
    });
  }

  const make = t[0x010f];
  const model = t[0x0110];
  if (make || model) {
    leaks.push({
      id: 'device',
      cat: 'device',
      tag: 'CAM',
      title: 'Camera & device',
      value: [make, model].filter(Boolean).join(' '),
      detail: 'Fingerprints the exact device you carry.',
      severity: 'med',
    });
  }

  const dt = t[0x9003] || t[0x0132];
  if (dt) {
    leaks.push({
      id: 'time',
      cat: 'time',
      tag: 'TIME',
      title: 'Date & time taken',
      value: formatExifDate(dt),
      detail: 'Reveals exactly when you were there.',
      severity: 'med',
    });
  }

  const sw = t[0x0131];
  if (sw) {
    leaks.push({
      id: 'sw',
      cat: 'system',
      tag: 'OS',
      title: 'Software / OS version',
      value: String(sw),
      detail: 'Narrows down your device and software.',
      severity: 'low',
    });
  }

  return leaks;
}

function formatExifDate(s: unknown): string {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s));
  if (!m) return String(s);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = parseInt(m[4], 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]} · ${h}:${m[5]} ${ap}`;
}

export interface StripResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  type: 'image/jpeg' | 'image/png';
}

/** Re-encodes through a canvas, dropping the entire EXIF block. */
export function stripMetadata(file: File): Promise<StripResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('no 2d context'));
      }
      ctx.drawImage(img, 0, 0);
      const type: 'image/jpeg' | 'image/png' =
        file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      c.toBlob(
        (b) => {
          URL.revokeObjectURL(url);
          if (b) resolve({ blob: b, url: URL.createObjectURL(b), width: c.width, height: c.height, type });
          else reject(new Error('encode failed'));
        },
        type,
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/** Strips metadata and returns raw base64 (no data-URL prefix) for the API. */
export async function stripAndEncode(file: File): Promise<string> {
  const { blob } = await stripMetadata(file);
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1] ?? '';
}
