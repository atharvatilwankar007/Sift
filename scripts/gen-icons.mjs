// Draws the Sift app icons (glowing gradient orb on near-black) as PNGs, no dependencies.
// Run: node scripts/gen-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const STOPS = [
  [0, [124, 92, 255]],
  [0.55, [255, 92, 168]],
  [1, [255, 181, 71]],
];
const BG = [7, 6, 13];

function grad(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (t <= b) {
      const k = (t - a) / (b - a);
      return ca.map((v, j) => v + (cb[j] - v) * k);
    }
  }
  return STOPS.at(-1)[1];
}

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function draw(size, orbScale, rounded) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * orbScale;
  const corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      let col = [...BG];
      // glow
      const glow = Math.exp(-Math.pow(Math.max(0, d - R * 0.7) / (R * 0.55), 2)) * 0.55;
      const gc = grad((dx + dy) / (4 * R) + 0.5);
      col = col.map((v, i) => v + (gc[i] - v) * glow * 0.6);
      // orb body
      const inside = 1 - smooth(R - 1.2, R + 1.2, d);
      if (inside > 0) {
        let oc = grad((dx + dy) / (2.8 * R) + 0.5);
        // highlight
        const hx = dx + R * 0.32;
        const hy = dy + R * 0.38;
        const h = Math.exp(-(hx * hx + hy * hy) / (2 * Math.pow(R * 0.32, 2))) * 0.45;
        oc = oc.map((v) => v + (255 - v) * h);
        // soft shade at bottom right
        const s = smooth(-R, R, (dx + dy) / 1.4) * 0.18;
        oc = oc.map((v) => v * (1 - s));
        col = col.map((v, i) => v + (oc[i] - v) * inside);
      }
      let alpha = 255;
      if (rounded) {
        const qx = Math.max(Math.abs(dx) - (c - corner), 0);
        const qy = Math.max(Math.abs(dy) - (c - corner), 0);
        const rd = Math.hypot(qx, qy);
        alpha = Math.round(255 * (1 - smooth(corner - 1, corner + 1, rd)));
      }
      const o = (y * size + x) * 4;
      px[o] = Math.round(col[0]);
      px[o + 1] = Math.round(col[1]);
      px[o + 2] = Math.round(col[2]);
      px[o + 3] = alpha;
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), draw(192, 0.3, true));
writeFileSync(new URL('icon-512.png', out), draw(512, 0.3, true));
writeFileSync(new URL('icon-maskable-512.png', out), draw(512, 0.24, false));
console.log('icons written');
