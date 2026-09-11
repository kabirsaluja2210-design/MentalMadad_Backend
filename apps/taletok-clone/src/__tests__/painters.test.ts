import { describe, expect, it } from 'vitest';
import {
  clampPixel, dimensionsFor, hslToRgb, mix, painterFor, paletteFor,
} from '@/providers/visual/painters';
import { seededRandom } from '@/lib/media-encode';
import { VIDEO_MODES } from '@/pipeline/modes';

const STYLES = [
  'cinematic-3d', 'illustrated', 'timelapse-frames', 'graphic-card',
  'chat-thread', 'typography', 'background-loop',
  // 3D formats render through the rasterizer; this painter is the still
  // fallback used when a user forces images on them.
  'cartoon-3d',
];

function sample(style: string, t: number, x = 40, y = 90) {
  const paint = painterFor(style);
  return clampPixel(
    paint({ x, y, w: 120, h: 200, t, palette: paletteFor(999, style), rand: seededRandom(1) }),
  );
}

describe('dimensionsFor', () => {
  it('matches the requested aspect', () => {
    expect(dimensionsFor('9:16').height).toBeGreaterThan(dimensionsFor('9:16').width);
    expect(dimensionsFor('16:9').width).toBeGreaterThan(dimensionsFor('16:9').height);
    const square = dimensionsFor('1:1');
    expect(square.width).toBe(square.height);
  });

  it('always returns even dimensions, which H.264 requires', () => {
    for (const aspect of ['9:16', '1:1', '16:9']) {
      for (const scale of [1, 0.6, 0.33, 0.1]) {
        const { width, height } = dimensionsFor(aspect, scale);
        expect(width % 2, `${aspect}@${scale} width`).toBe(0);
        expect(height % 2, `${aspect}@${scale} height`).toBe(0);
        expect(width).toBeGreaterThan(0);
      }
    }
  });
});

describe('colour helpers', () => {
  it('converts HSL to RGB in range', () => {
    for (const hue of [0, 90, 180, 270, 359]) {
      for (const channel of hslToRgb(hue, 0.6, 0.5)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('wraps hue rather than producing black', () => {
    expect(hslToRgb(400, 0.6, 0.5)).toEqual(hslToRgb(40, 0.6, 0.5));
    expect(hslToRgb(-20, 0.6, 0.5)).toEqual(hslToRgb(340, 0.6, 0.5));
  });

  it('mixes endpoints and clamps beyond them', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [100, 100, 100];
    expect(mix(a, b, 0)).toEqual(a);
    expect(mix(a, b, 1)).toEqual(b);
    expect(mix(a, b, 0.5)).toEqual([50, 50, 50]);
    expect(mix(a, b, 2)).toEqual(b);
  });

  it('builds three distinct palette colours', () => {
    const palette = paletteFor(12345, 'cinematic-3d');
    expect(palette).toHaveLength(3);
    expect(new Set(palette.map((c) => c.join(','))).size).toBe(3);
  });

  it('is deterministic per seed and style', () => {
    expect(paletteFor(7, 'illustrated')).toEqual(paletteFor(7, 'illustrated'));
    expect(paletteFor(7, 'illustrated')).not.toEqual(paletteFor(8, 'illustrated'));
  });
});

describe('painters', () => {
  it('returns in-range channels for every style across the whole time span', () => {
    for (const style of STYLES) {
      for (const t of [0, 0.25, 0.5, 0.75, 0.999]) {
        for (const channel of sample(style, t)) {
          expect(Number.isFinite(channel), `${style}@${t}`).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('actually changes over time — otherwise a clip would be a still', () => {
    // Sampled across the whole cycle: a painter whose only time term is
    // sin(2*pi*t) is identical at t=0 and t=0.5, so comparing a single pair
    // would wrongly pass a static painter and wrongly fail an animated one.
    for (const style of STYLES) {
      const frames = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
        .map((t) => sample(style, t).join(','));
      expect(new Set(frames).size, `${style} does not animate`).toBeGreaterThan(1);
    }
  });

  it('moves continuously rather than jumping between two states', () => {
    for (const style of STYLES) {
      const frames = [0, 0.25, 0.5, 0.75].map((t) => sample(style, t).join(','));
      expect(new Set(frames).size, `${style} animation is degenerate`).toBeGreaterThanOrEqual(3);
    }
  });

  it('is periodic in t, so generated clips loop without a seam', () => {
    for (const style of STYLES) {
      const first = sample(style, 0);
      const wrapped = sample(style, 1);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(first[c] - wrapped[c]), `${style} channel ${c}`).toBeLessThan(1);
      }
    }
  });

  it('is deterministic for the same pixel, time and seed', () => {
    expect(sample('cinematic-3d', 0.3)).toEqual(sample('cinematic-3d', 0.3));
  });

  it('varies across the frame rather than painting flat colour', () => {
    for (const style of STYLES) {
      const a = sample(style, 0.2, 10, 20).join(',');
      const b = sample(style, 0.2, 110, 180).join(',');
      expect(a, `${style} is flat`).not.toBe(b);
    }
  });

  it('falls back to a working painter for an unknown style', () => {
    expect(() => sample('no-such-style', 0.5)).not.toThrow();
  });

  it('covers every visual style declared by the mode catalog', () => {
    for (const mode of VIDEO_MODES) {
      expect(STYLES, `${mode.id} style untested`).toContain(mode.visualStyle);
    }
  });
});

describe('clampPixel', () => {
  it('bounds values into 8-bit range', () => {
    expect(clampPixel([-50, 300, 128])).toEqual([0, 255, 128]);
  });
});

describe('mode visual defaults', () => {
  it('declares a valid output kind for every mode', () => {
    for (const mode of VIDEO_MODES) {
      expect(['image', 'video']).toContain(mode.visualOutput);
    }
  });

  it('uses motion clips for atmospheric formats and stills for card formats', () => {
    const byId = Object.fromEntries(VIDEO_MODES.map((m) => [m.id, m.visualOutput]));
    expect(byId['cinematic-short']).toBe('video');
    expect(byId['reddit-story']).toBe('video');
    expect(byId.quiz).toBe('image');
    expect(byId['text-message-story']).toBe('image');
  });
});
