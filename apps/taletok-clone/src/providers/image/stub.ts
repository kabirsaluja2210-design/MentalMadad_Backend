import type { ImageProvider, ImageRequest, ImageResult } from '../types';
import { encodePng, hashString, seededRandom, type RgbPixel } from '@/lib/media-encode';
import { writeFile } from '@/lib/storage';

/**
 * Procedural placeholder visuals.
 *
 * Generates a real PNG per scene, deterministically seeded from the prompt so
 * a re-render of an unchanged scene produces an identical frame. Rendered at
 * half resolution and upscaled by the compositor — these are stand-ins for
 * model output, and the extra pixels would only cost render time.
 *
 * Each mode's `visualStyle` gets its own look so the editor timeline is
 * readable at a glance and the formats stay visually distinct.
 */

export function dimensionsFor(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case '1:1':
      return { width: 720, height: 720 };
    case '16:9':
      return { width: 960, height: 540 };
    case '9:16':
    default:
      return { width: 540, height: 960 };
  }
}

type Painter = (x: number, y: number, w: number, h: number, rand: () => number, palette: RgbPixel[]) => RgbPixel;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: RgbPixel, b: RgbPixel, t: number): RgbPixel {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Builds a 3-colour palette from the prompt hash. */
function paletteFor(seed: number, style: string): RgbPixel[] {
  const rand = seededRandom(seed);
  const baseHue = rand() * 360;

  const shift: Record<string, number> = {
    'cinematic-3d': 28,
    illustrated: 140,
    'timelapse-frames': 40,
    'graphic-card': 180,
    'chat-thread': 12,
    typography: 200,
    'background-loop': 90,
  };

  const spread = shift[style] ?? 100;
  return [
    hslToRgb(baseHue, 0.55, 0.16),
    hslToRgb((baseHue + spread) % 360, 0.62, 0.42),
    hslToRgb((baseHue + spread * 1.8) % 360, 0.7, 0.68),
  ];
}

function hslToRgb(h: number, s: number, l: number): RgbPixel {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

// ------------------------------------------------------------------ painters

/** Soft diagonal gradient with a vignette — the cinematic look. */
const cinematic: Painter = (x, y, w, h, _rand, palette) => {
  const t = (x / w) * 0.4 + (y / h) * 0.6;
  const base = mix(palette[0], palette[1], Math.min(1, t));

  // Radial light source in the upper third.
  const dx = (x - w * 0.5) / w;
  const dy = (y - h * 0.32) / h;
  const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
  const lit = mix(base, palette[2], glow * 0.55);

  // Vignette.
  const vx = (x - w / 2) / (w / 2);
  const vy = (y - h / 2) / (h / 2);
  const vig = Math.max(0, 1 - (vx * vx + vy * vy) * 0.45);
  return [lit[0] * vig, lit[1] * vig, lit[2] * vig];
};

/** Flat bands with a hard divide — editorial illustration feel. */
const illustrated: Painter = (x, y, w, h, _rand, palette) => {
  const bands = 5;
  const band = Math.floor((y / h) * bands);
  const wave = Math.sin((x / w) * Math.PI * 2 + band) * 0.06;
  const t = band / (bands - 1) + wave;
  const base = mix(palette[0], palette[2], Math.max(0, Math.min(1, t)));

  // Offset circle motif.
  const cx = w * 0.68;
  const cy = h * 0.42;
  const r = Math.min(w, h) * 0.22;
  const inside = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  return inside ? mix(base, palette[1], 0.75) : base;
};

/** Concentric rings — reads as "progression" for timelapse frames. */
const timelapseFrames: Painter = (x, y, w, h, _rand, palette) => {
  const dx = (x - w / 2) / w;
  const dy = (y - h / 2) / h;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ring = (Math.sin(d * 34) + 1) / 2;
  const horizon = y / h;
  return mix(mix(palette[0], palette[1], horizon), palette[2], ring * 0.35);
};

/** Bold flat colour with a corner wedge — quiz/graphic cards. */
const graphicCard: Painter = (x, y, w, h, _rand, palette) => {
  const wedge = x / w + y / h > 1.45;
  const base = mix(palette[1], palette[0], y / h);
  return wedge ? mix(base, palette[2], 0.6) : base;
};

/** Muted vertical wash — sits behind chat bubbles without competing. */
const chatThread: Painter = (x, y, w, h, _rand, palette) => {
  const t = y / h;
  const base = mix(palette[0], mix(palette[0], palette[1], 0.4), t);
  return [base[0] * 0.6, base[1] * 0.6, base[2] * 0.7];
};

/** High-contrast radial — typography sits on top of this. */
const typography: Painter = (x, y, w, h, _rand, palette) => {
  const dx = (x - w / 2) / (w / 2);
  const dy = (y - h / 2) / (h / 2);
  const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
  const base = mix(palette[2], palette[0], d);
  // Subtle grain so flat areas don't band.
  const grain = ((x * 7 + y * 13) % 11) / 11 - 0.5;
  return [base[0] + grain * 6, base[1] + grain * 6, base[2] + grain * 6];
};

/** Slow blurred blobs — the looping background used behind story narration. */
const backgroundLoop: Painter = (x, y, w, h, rand, palette) => {
  const t = (x / w) * 0.5 + (y / h) * 0.5;
  const base = mix(palette[0], palette[1], t);
  const blob =
    Math.sin((x / w) * 3.1 + 1.2) * Math.cos((y / h) * 2.7 - 0.4) * 0.5 + 0.5;
  const out = mix(base, palette[2], blob * 0.3);
  return [out[0] * 0.75, out[1] * 0.75, out[2] * 0.8];
};

const PAINTERS: Record<string, Painter> = {
  'cinematic-3d': cinematic,
  illustrated,
  'timelapse-frames': timelapseFrames,
  'graphic-card': graphicCard,
  'chat-thread': chatThread,
  typography,
  'background-loop': backgroundLoop,
};

export const stubImage: ImageProvider = {
  info: {
    id: 'stub',
    name: 'Procedural placeholder frames',
    kind: 'image',
    available: true,
    placeholder: true,
    note: 'Deterministic generated frames. Set IMAGE_PROVIDER + a key for model-generated visuals.',
  },

  async generate(req: ImageRequest): Promise<ImageResult> {
    const { width, height } = dimensionsFor(req.aspect);
    const seed = req.seed || hashString(req.prompt);
    const palette = paletteFor(seed, req.style || 'illustrated');
    const painter = PAINTERS[req.style || 'illustrated'] ?? illustrated;
    const rand = seededRandom(seed);

    const png = encodePng(width, height, (x, y) => {
      const [r, g, b] = painter(x, y, width, height, rand, palette);
      return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
    });

    await writeFile(req.outPath, png);
    return { imagePath: req.outPath, width, height };
  },
};
