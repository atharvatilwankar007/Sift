import { useEffect, useRef } from 'react';

export type OrbMode = 'idle' | 'listening' | 'thinking';

const BLOBS = [
  { color: [124, 92, 255], phase: 0, speed: 0.9, orbit: 0.22 },
  { color: [255, 92, 168], phase: 2.1, speed: 1.15, orbit: 0.26 },
  { color: [255, 181, 71], phase: 4.2, speed: 0.75, orbit: 0.2 },
  { color: [61, 217, 255], phase: 1.2, speed: 1.3, orbit: 0.24 },
];

/** Living gradient orb. `energy` (0..1) is nudged by the parent while you talk. */
export function Orb({ mode, energy, size = 260 }: { mode: OrbMode; energy: React.RefObject<number>; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let t = 0;
    let smooth = 0;
    let last = performance.now();
    const R = size / 2;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      energy.current = Math.max(0, (energy.current ?? 0) * Math.pow(0.12, dt));
      const target = m === 'thinking' ? 0.55 : m === 'listening' ? 0.25 + energy.current * 0.75 : 0;
      smooth += (target - smooth) * Math.min(1, dt * 6);
      const speed = reduce ? 0.15 : m === 'thinking' ? 2.6 : m === 'listening' ? 1 + smooth * 1.6 : 0.35;
      t += dt * speed;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      const breathe = 1 + Math.sin(t * 1.4) * 0.015 + smooth * 0.06;
      ctx.arc(R, R, R * 0.78 * breathe, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#0d0b1e';
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${size * 0.06}px)`;
      for (const b of BLOBS) {
        const a = t * b.speed + b.phase;
        const x = R + Math.cos(a) * R * b.orbit * (1 + smooth * 0.5);
        const y = R + Math.sin(a * 1.3) * R * b.orbit * (1 + smooth * 0.5);
        const r = R * (0.5 + 0.08 * Math.sin(a * 2) + smooth * 0.18);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = b.color;
        g.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';

      // glassy highlight + rim
      const hl = ctx.createRadialGradient(R * 0.7, R * 0.55, 0, R * 0.7, R * 0.55, R * 0.7);
      hl.addColorStop(0, 'rgba(255,255,255,0.28)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(R, R, R * 0.78 * breathe, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + smooth * 0.2})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, energy]);

  return <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden />;
}
