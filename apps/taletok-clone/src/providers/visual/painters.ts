import { hashString, seededRandom, type RgbPixel } from '@/lib/media-encode';

/**
 * Time-aware procedural painters.
 *
 * Every painter takes a normalised time `t` in [0, 1] and is continuous across
 * it, so the same function serves two purposes: sampled once at t=0 it is a
 * still frame, sampled across a range it is an animated clip. Motion here is
 * *content* motion (drifting light, evolving structure) and is independent of
 * the camera moves the compositor applies on top.
 */

export interface PaintContext {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Normalised time within the clip, 0 at the first frame and 1 at the last. */
  t: number;
  palette: RgbPixel[];
  rand: () => number;
}

export type Painter = (ctx: PaintContext) => RgbPixel;

// ------------------------------------------------------------------ colour

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function mix(a: RgbPixel, b: RgbPixel, u: number): RgbPixel {
  const c = Math.max(0, Math.min(1, u));
  return [lerp(a[0], b[0], c), lerp(a[1], b[1], c), lerp(a[2], b[2], c)];
}

export function hslToRgb(h: number, s: number, l: number): RgbPixel {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const rgb: [number, number, number] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/** Builds a 3-colour palette deterministically from a seed and visual style. */
export function paletteFor(seed: number, style: string): RgbPixel[] {
  const rand = seededRandom(seed);
  const baseHue = rand() * 360;

  const spreadByStyle: Record<string, number> = {
    'cinematic-3d': 28,
    illustrated: 140,
    'timelapse-frames': 40,
    'graphic-card': 180,
    'chat-thread': 12,
    typography: 200,
    'background-loop': 90,
    'cartoon-3d': 150,
  };
  const spread = spreadByStyle[style] ?? 100;

  return [
    hslToRgb(baseHue, 0.55, 0.16),
    hslToRgb(baseHue + spread, 0.62, 0.42),
    hslToRgb(baseHue + spread * 1.8, 0.7, 0.68),
  ];
}

export function dimensionsFor(aspect: string, scale = 1): { width: number; height: number } {
  const base =
    aspect === '1:1' ? { width: 720, height: 720 }
    : aspect === '16:9' ? { width: 960, height: 540 }
    : { width: 540, height: 960 };

  // Keep both dimensions even — H.264 requires it.
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(base.width), height: even(base.height) };
}

// ---------------------------------------------------------------- painters

const TAU = Math.PI * 2;

/** Drifting key light over a diagonal gradient, with a breathing vignette. */
const cinematic: Painter = ({ x, y, w, h, t, palette }) => {
  const grad = (x / w) * 0.4 + (y / h) * 0.6;
  const base = mix(palette[0], palette[1], grad);

  // The light source travels a slow ellipse across the frame.
  const lx = 0.5 + 0.18 * Math.cos(TAU * t);
  const ly = 0.32 + 0.10 * Math.sin(TAU * t);
  const dx = x / w - lx;
  const dy = y / h - ly;
  const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
  const lit = mix(base, palette[2], glow * (0.5 + 0.12 * Math.sin(TAU * t)));

  const vx = (x - w / 2) / (w / 2);
  const vy = (y - h / 2) / (h / 2);
  const vignette = Math.max(0, 1 - (vx * vx + vy * vy) * (0.42 + 0.06 * Math.sin(TAU * t)));
  return [lit[0] * vignette, lit[1] * vignette, lit[2] * vignette];
};

/** Flat bands that undulate, with a circle motif orbiting slowly. */
const illustrated: Painter = ({ x, y, w, h, t, palette }) => {
  const bands = 5;
  const band = Math.floor((y / h) * bands);
  const wave = Math.sin((x / w) * TAU + band + TAU * t) * 0.06;
  const base = mix(palette[0], palette[2], band / (bands - 1) + wave);

  const cx = w * (0.68 + 0.06 * Math.cos(TAU * t));
  const cy = h * (0.42 + 0.05 * Math.sin(TAU * t));
  const r = Math.min(w, h) * 0.22;
  const inside = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  return inside ? mix(base, palette[1], 0.75) : base;
};

/** Rings expanding outward — reads as forward progression. */
const timelapseFrames: Painter = ({ x, y, w, h, t, palette }) => {
  const dx = (x - w / 2) / w;
  const dy = (y - h / 2) / h;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ring = (Math.sin(d * 34 - TAU * t) + 1) / 2;
  const horizon = y / h;
  return mix(mix(palette[0], palette[1], horizon), palette[2], ring * 0.35);
};

/**
 * Bold flat colour with a wedge that sweeps the full diagonal.
 *
 * The sweep spans the whole 0..2 diagonal range so it crosses every pixel over
 * a cycle, and the base gradient drifts underneath it — a narrow sweep over a
 * fixed base left most of the frame static, which read as a frozen clip.
 */
const graphicCard: Painter = ({ x, y, w, h, t, palette }) => {
  const sweep = 1 + 0.75 * Math.sin(TAU * t);
  const wedge = x / w + y / h > sweep;
  const base = mix(palette[1], palette[0], (y / h) * (0.85 + 0.15 * Math.cos(TAU * t)));
  return wedge ? mix(base, palette[2], 0.6) : base;
};

/** Muted vertical wash that slowly shifts — sits behind chat bubbles. */
const chatThread: Painter = ({ y, h, t, palette }) => {
  const shift = 0.4 + 0.08 * Math.sin(TAU * t);
  const base = mix(palette[0], mix(palette[0], palette[1], shift), y / h);
  return [base[0] * 0.6, base[1] * 0.6, base[2] * 0.7];
};

/** High-contrast radial that pulses, with static grain to avoid banding. */
const typography: Painter = ({ x, y, w, h, t, palette }) => {
  const dx = (x - w / 2) / (w / 2);
  const dy = (y - h / 2) / (h / 2);
  const pulse = 1 + 0.08 * Math.sin(TAU * t);
  const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * pulse);
  const base = mix(palette[2], palette[0], d);
  const grain = ((x * 7 + y * 13) % 11) / 11 - 0.5;
  return [base[0] + grain * 6, base[1] + grain * 6, base[2] + grain * 6];
};

/**
 * Two blobs drifting in opposite directions — the looping background behind
 * story narration.
 *
 * Only one factor of each product carries the time term. Putting it on both
 * makes the phase cancel under the product-to-sum identity, which collapses
 * the pair into a single wave at double rate; keeping it on one factor gives
 * each blob a genuinely independent drift with period exactly 1, so the clip
 * still loops seamlessly.
 */
const backgroundLoop: Painter = ({ x, y, w, h, t, palette }) => {
  const u = x / w;
  const v = y / h;
  const base = mix(palette[0], palette[1], u * 0.5 + v * 0.5);

  const blobA = Math.sin(u * 3.1 + 1.2 + TAU * t) * Math.cos(v * 2.7 - 0.4) * 0.5 + 0.5;
  const blobB = Math.cos(v * 3.4 + 1.1 - TAU * t) * Math.sin(u * 2.2 - 0.6) * 0.5 + 0.5;

  const out = mix(base, palette[2], (blobA * 0.6 + blobB * 0.4) * 0.32);
  return [out[0] * 0.75, out[1] * 0.75, out[2] * 0.8];
};

const PAINTERS: Record<string, Painter> = {
  'cinematic-3d': cinematic,
  // Forcing stills on a 3D format falls back to the illustrated look.
  'cartoon-3d': illustrated,
  illustrated,
  'timelapse-frames': timelapseFrames,
  'graphic-card': graphicCard,
  'chat-thread': chatThread,
  typography,
  'background-loop': backgroundLoop,
};

export function painterFor(style: string): Painter {
  return PAINTERS[style] ?? illustrated;
}

/** Clamps a painter result into valid 8-bit channel range. */
export function clampPixel(pixel: RgbPixel): RgbPixel {
  return [
    Math.max(0, Math.min(255, pixel[0])),
    Math.max(0, Math.min(255, pixel[1])),
    Math.max(0, Math.min(255, pixel[2])),
  ];
}

export { hashString, seededRandom };
