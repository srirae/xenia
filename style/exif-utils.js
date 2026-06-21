// exif-utils.js — real, on-device EXIF parsing + metadata stripping.
// No network, no uploads. Everything runs in the browser.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

// ---------- Parse EXIF out of a JPEG ArrayBuffer ----------
export function parseJpegExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return { isJpeg: false, tags: {} };
  }
  let offset = 2;
  const len = view.byteLength;
  while (offset + 4 <= len) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1) {
      // APP1 — check for "Exif\0\0"
      if (view.getUint32(offset + 4) === 0x45786966) {
        return parseTiff(view, offset + 10);
      }
    }
    offset += 2 + size;
  }
  return { isJpeg: true, tags: {} };
}

function parseTiff(view, tiffStart) {
  const little = view.getUint16(tiffStart) === 0x4949;
  const get16 = (o) => view.getUint16(o, little);
  const get32 = (o) => view.getUint32(o, little);
  const tags = {};
  const firstIFD = get32(tiffStart + 4);
  readIFD(view, tiffStart, tiffStart + firstIFD, little, tags, "ifd0");
  return { isJpeg: true, tags, tiffStart };
}

function readIFD(view, tiffStart, dirStart, little, tags, which) {
  const get16 = (o) => view.getUint16(o, little);
  const get32 = (o) => view.getUint32(o, little);
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
    const key = which === "gps" ? "gps_" + tag : tag;
    tags[key] = val;
    if (which === "ifd0" && tag === 0x8769 && typeof val === "number")
      readIFD(view, tiffStart, tiffStart + val, little, tags, "exif");
    if (which === "ifd0" && tag === 0x8825 && typeof val === "number")
      readIFD(view, tiffStart, tiffStart + val, little, tags, "gps");
  }
}

function readVal(view, offset, type, count, little) {
  const get16 = (o) => view.getUint16(o, little);
  const get32 = (o) => view.getUint32(o, little);
  const gets32 = (o) => view.getInt32(o, little);
  try {
    if (type === 2) {
      let s = "";
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(offset + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    if (type === 3) {
      const a = [];
      for (let i = 0; i < count; i++) a.push(get16(offset + i * 2));
      return count === 1 ? a[0] : a;
    }
    if (type === 4 || type === 9) {
      const a = [];
      for (let i = 0; i < count; i++) a.push(get32(offset + i * 4));
      return count === 1 ? a[0] : a;
    }
    if (type === 5) {
      const a = [];
      for (let i = 0; i < count; i++) {
        const n = get32(offset + i * 8), d = get32(offset + i * 8 + 4);
        a.push(d ? n / d : 0);
      }
      return count === 1 ? a[0] : a;
    }
    if (type === 10) {
      const a = [];
      for (let i = 0; i < count; i++) {
        const n = gets32(offset + i * 8), d = gets32(offset + i * 8 + 4);
        a.push(d ? n / d : 0);
      }
      return count === 1 ? a[0] : a;
    }
    if (type === 1 || type === 7) {
      const a = [];
      for (let i = 0; i < count; i++) a.push(view.getUint8(offset + i));
      return count === 1 ? a[0] : a;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ---------- Turn raw tags into friendly "leak" cards ----------
export function extractLeaks(tags) {
  const t = tags || {};
  const leaks = [];

  const lat = t["gps_2"], lon = t["gps_4"];
  if (Array.isArray(lat) && Array.isArray(lon) && lat.length === 3) {
    const toDec = (a, ref) => {
      let v = a[0] + a[1] / 60 + a[2] / 3600;
      if (ref === "S" || ref === "W") v = -v;
      return v;
    };
    const la = toDec(lat, t["gps_1"]);
    const lo = toDec(lon, t["gps_3"]);
    leaks.push({
      id: "gps", cat: "location", tag: "GPS", title: "Exact GPS coordinates",
      value: `${la.toFixed(5)}, ${lo.toFixed(5)}`,
      detail: "Pinpoints exactly where this photo was taken.",
      severity: "high", lat: la, lon: lo,
    });
  }

  const make = t[0x010f], model = t[0x0110];
  if (make || model) {
    leaks.push({
      id: "device", cat: "device", tag: "CAM", title: "Camera & device",
      value: [make, model].filter(Boolean).join(" "),
      detail: "Fingerprints the exact device you carry.",
      severity: "med",
    });
  }

  const dt = t[0x9003] || t[0x0132];
  if (dt) {
    leaks.push({
      id: "time", cat: "time", tag: "TIME", title: "Date & time taken",
      value: formatExifDate(dt),
      detail: "Reveals exactly when you were there.",
      severity: "med",
    });
  }

  const sw = t[0x0131];
  if (sw) {
    leaks.push({
      id: "sw", cat: "system", tag: "OS", title: "Software / OS version",
      value: String(sw),
      detail: "Narrows down your device and software.",
      severity: "low",
    });
  }

  return leaks;
}

function formatExifDate(s) {
  // "2025:06:14 18:32:07"
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s));
  if (!m) return String(s);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h = parseInt(m[4], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${months[parseInt(m[2],10)-1]} ${parseInt(m[3],10)}, ${m[1]} · ${h}:${m[5]} ${ap}`;
}

// ---------- Strip ALL metadata by re-encoding through a canvas ----------
export function stripMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      c.toBlob(
        (b) => {
          URL.revokeObjectURL(url);
          if (b) resolve({ blob: b, url: URL.createObjectURL(b), width: c.width, height: c.height, type });
          else reject(new Error("encode failed"));
        },
        type,
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

// ---------- Build a believable sample photo WITH real EXIF (for first-run demo) ----------
export async function buildSampleFile() {
  const canvas = drawScene();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  const ab = await blob.arrayBuffer();
  const orig = new Uint8Array(ab);
  const app1 = buildExifApp1({
    make: "Apple", model: "iPhone 15 Pro", software: "iOS 18.5",
    datetime: "2025:06:14 18:32:07",
    lat: 36.05445, lon: -112.14012, latRef: "N", lonRef: "W",
  });
  const out = new Uint8Array(orig.length + app1.length);
  out.set(orig.slice(0, 2), 0);          // SOI
  out.set(app1, 2);                       // our APP1 (Exif)
  out.set(orig.slice(2), 2 + app1.length);
  return new File([out], "IMG_4821.jpg", { type: "image/jpeg" });
}

function drawScene() {
  const W = 1280, H = 960;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, "#243b6b");
  sky.addColorStop(0.45, "#6d4d8a");
  sky.addColorStop(0.8, "#e07a5f");
  sky.addColorStop(1, "#f2cc8f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // sun
  const sun = ctx.createRadialGradient(W * 0.72, H * 0.42, 0, W * 0.72, H * 0.42, 180);
  sun.addColorStop(0, "rgba(255,240,200,0.95)");
  sun.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  ctx.arc(W * 0.72, H * 0.42, 70, 0, Math.PI * 2);
  ctx.fillStyle = "#ffeecb";
  ctx.fill();
  // canyon ridges
  const ridge = (yBase, amp, color) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, yBase);
    for (let x = 0; x <= W; x += 40) {
      const y = yBase + Math.sin(x * 0.012 + yBase) * amp + Math.cos(x * 0.05) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ridge(H * 0.52, 26, "#7d4a63");
  ridge(H * 0.6, 34, "#8c4f54");
  ridge(H * 0.7, 40, "#7a3f47");
  ridge(H * 0.82, 30, "#5e2f3a");
  // soft haze
  ctx.fillStyle = "rgba(240,204,143,0.12)";
  ctx.fillRect(0, H * 0.5, W, H * 0.2);
  return c;
}

function buildExifApp1(o) {
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
  const str = (s) => {
    const b = [];
    for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 0xff);
    b.push(0);
    return b;
  };
  const mk = str(o.make), md = str(o.model), sw = str(o.software), dt = str(o.datetime);

  const ifd0Off = 8;
  const ifd0Size = 2 + 5 * 12 + 4;
  let d = ifd0Off + ifd0Size;
  const mkOff = d; d += mk.length;
  const mdOff = d; d += md.length;
  const swOff = d; d += sw.length;
  const dtOff = d; d += dt.length;
  const gpsOff = d;
  const gpsSize = 2 + 4 * 12 + 4;
  let g = gpsOff + gpsSize;
  const latOff = g; g += 24;
  const lonOff = g; g += 24;
  const total = g;

  const buf = new Uint8Array(total);
  const put = (arr, at) => buf.set(arr, at);
  // TIFF header (little endian)
  put([0x49, 0x49, 0x2a, 0x00], 0);
  put(u32(8), 4);
  // IFD0
  let p = ifd0Off;
  put(u16(5), p); p += 2;
  const ent = (tag, type, count, val) => { put(u16(tag), p); put(u16(type), p + 2); put(u32(count), p + 4); put(val, p + 8); p += 12; };
  ent(0x010f, 2, mk.length, u32(mkOff));
  ent(0x0110, 2, md.length, u32(mdOff));
  ent(0x0131, 2, sw.length, u32(swOff));
  ent(0x0132, 2, dt.length, u32(dtOff));
  ent(0x8825, 4, 1, u32(gpsOff));
  put(u32(0), p); p += 4;
  put(mk, mkOff); put(md, mdOff); put(sw, swOff); put(dt, dtOff);
  // GPS IFD
  p = gpsOff;
  put(u16(4), p); p += 2;
  const ref = (ch) => [ch.charCodeAt(0), 0, 0, 0];
  put(u16(0x0001), p); put(u16(2), p + 2); put(u32(2), p + 4); put(ref(o.latRef), p + 8); p += 12;
  put(u16(0x0002), p); put(u16(5), p + 2); put(u32(3), p + 4); put(u32(latOff), p + 8); p += 12;
  put(u16(0x0003), p); put(u16(2), p + 2); put(u32(2), p + 4); put(ref(o.lonRef), p + 8); p += 12;
  put(u16(0x0004), p); put(u16(5), p + 2); put(u32(3), p + 4); put(u32(lonOff), p + 8); p += 12;
  put(u32(0), p);
  const dms = (dec) => {
    const a = Math.abs(dec), D = Math.floor(a), M = Math.floor((a - D) * 60), S = ((a - D) * 60 - M) * 60;
    return [[D, 1], [M, 1], [Math.round(S * 100), 100]];
  };
  const writeRat = (off, arr) => { let q = off; for (const [n, den] of arr) { put(u32(n), q); put(u32(den), q + 4); q += 8; } };
  writeRat(latOff, dms(o.lat));
  writeRat(lonOff, dms(o.lon));

  // Assemble APP1 segment
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const payloadLen = header.length + buf.length;
  const segLen = payloadLen + 2;
  const app1 = new Uint8Array(4 + payloadLen);
  app1[0] = 0xff; app1[1] = 0xe1;
  app1[2] = (segLen >> 8) & 0xff; app1[3] = segLen & 0xff; // big-endian marker length
  app1.set(header, 4);
  app1.set(buf, 4 + header.length);
  return app1;
}
