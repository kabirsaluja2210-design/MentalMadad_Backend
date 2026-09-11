import { describe, expect, it } from 'vitest';
import { Renderer } from '@/providers/visual/three/raster';
import { buildScene, chooseSceneKind, framingDistance, frameObjects } from '@/providers/visual/three/scenes';
import { identity, lookAt } from '@/providers/visual/three/math';
import { sphere } from '@/providers/visual/three/mesh';
import { buildArc, REGISTERS } from '@/providers/llm/narrative';
import { stubLlm } from '@/providers/llm/stub';
import { getMode } from '@/pipeline/modes';
import { THREE_D_STYLES } from '@/providers/video/procedural';

describe('framingDistance', () => {
  it('pulls back further for a portrait frame than a landscape one', () => {
    // At 9:16 the horizontal field is ~56% of the vertical, so it binds first.
    const portrait = framingDistance(5, 0.9, 9 / 16);
    const landscape = framingDistance(5, 0.9, 16 / 9);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it('scales linearly with subject size', () => {
    const small = framingDistance(2, 0.9, 9 / 16);
    const large = framingDistance(4, 0.9, 9 / 16);
    expect(large / small).toBeCloseTo(2, 5);
  });

  it('fits the subject inside the horizontal field', () => {
    const radius = 5;
    const fov = 0.9;
    const aspect = 9 / 16;
    const d = framingDistance(radius, fov, aspect, 1.1);
    // Half-width visible at that distance must exceed the subject's radius.
    const halfWidth = Math.tan(fov / 2) * aspect * d;
    expect(halfWidth).toBeGreaterThan(radius);
  });

  it('stays finite for a very narrow field', () => {
    expect(Number.isFinite(framingDistance(1, 0.001, 0.01))).toBe(true);
  });
});

describe('smooth shading', () => {
  function shadeWith(options: Partial<Parameters<Renderer['render']>[2]>) {
    const renderer = new Renderer(48, 48);
    const sample = renderer.render(
      [{ mesh: sphere(2, 20, 16), transform: identity(), material: { color: [180, 180, 180] } }],
      { position: [0, 0, 8], view: lookAt([0, 0, 8], [0, 0, 0]), fov: 1 },
      {
        lightDirection: [-0.4, -0.8, -0.4],
        skyTop: [5, 5, 5], skyBottom: [5, 5, 5],
        outlineColor: [0, 0, 0], outlineWidth: 0, fogStrength: 0,
        ...options,
      },
    );
    const levels = new Set<number>();
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const [r, g, b] = sample(x, y);
        if (!(r === 5 && g === 5 && b === 5)) levels.add(Math.round(r));
      }
    }
    return levels;
  }

  it('produces a continuous ramp rather than flat bands', () => {
    const smooth = shadeWith({ shading: 'smooth', specular: 0 });
    const toon = shadeWith({ shading: 'toon' });
    expect(smooth.size).toBeGreaterThan(toon.size * 2);
  });

  it('keeps toon shading to a handful of bands', () => {
    expect(shadeWith({ shading: 'toon' }).size).toBeLessThanOrEqual(6);
  });

  it('adds a brighter highlight when specular is on', () => {
    const withSpec = Math.max(...shadeWith({ shading: 'smooth', specular: 0.8 }));
    const without = Math.max(...shadeWith({ shading: 'smooth', specular: 0 }));
    expect(withSpec).toBeGreaterThan(without);
  });

  it('defaults to toon when no shading is given', () => {
    expect(shadeWith({}).size).toBeLessThanOrEqual(6);
  });
});

describe('explainer scene sets', () => {
  it('routes mechanical subjects to the right set', () => {
    expect(chooseSceneKind('why the engine mount drops in a crash', 0)).toBe('vehicle');
    expect(chooseSceneKind('how a hydraulic pump moves fluid', 0)).toBe('machine');
    expect(chooseSceneKind('what a turbine bearing does', 0)).toBe('machine');
  });

  it('prefers the subject over its surroundings', () => {
    // "street" would match the city set, but the car is what is being explained.
    expect(chooseSceneKind('a car braking hard on a city street', 0)).toBe('vehicle');
  });

  it('builds both explainer sets with geometry', () => {
    for (const kind of ['vehicle', 'machine'] as const) {
      const spec = buildScene(`${kind} explainer`, 5150, '9:16', 'product-3d');
      expect(spec.kind).toBe(kind);
      expect(frameObjects(spec, 0.4).length).toBeGreaterThan(3);
    }
  });

  it('forces smooth un-inked shading for the explainer style', () => {
    // Even on a landscape set, so a topic without a mechanism keyword does not
    // come back cel-shaded mid-piece.
    for (const prompt of ['a vehicle on a road', 'a quiet meadow at dawn']) {
      const spec = buildScene(prompt, 11, '9:16', 'product-3d');
      expect(spec.options.shading, prompt).toBe('smooth');
      expect(spec.options.outlineWidth, prompt).toBe(0);
    }
  });

  it('leaves the cartoon style cel-shaded', () => {
    const spec = buildScene('a quiet meadow at dawn', 11, '9:16', 'cartoon-3d');
    expect(spec.options.shading ?? 'toon').toBe('toon');
    expect(spec.options.outlineWidth).toBeGreaterThan(0);
  });

  it('frames the subject differently per aspect', () => {
    const portrait = buildScene('a vehicle on a road', 3, '9:16', 'product-3d').camera(0).position;
    const landscape = buildScene('a vehicle on a road', 3, '16:9', 'product-3d').camera(0).position;
    expect(Math.hypot(...portrait)).toBeGreaterThan(Math.hypot(...landscape));
  });
});

describe('mechanism register', () => {
  it('has enough frames to fill the format', () => {
    expect(REGISTERS.mechanism.development.length).toBeGreaterThanOrEqual(20);
  });

  it('fills a long arc without repeating', () => {
    const texts = buildArc('an engine mount', 24, 'mechanism', 9).map((b) => b.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('does not title-case the subject mid-sentence', () => {
    const text = buildArc('a car engine mount', 8, 'mechanism', 1).map((b) => b.text).join(' ');
    expect(text).not.toContain('A Car Engine Mount');
  });

  it('reads as an explainer, not a personal story', () => {
    const text = buildArc('a pressure valve', 14, 'mechanism', 2).map((b) => b.text).join(' ');
    expect(text).not.toMatch(/\bI\b/);
  });
});

describe('mechanism-explainer format', () => {
  const mode = getMode('mechanism-explainer');

  it('is smooth-shaded 3D video with plain captions', () => {
    expect(mode.visualStyle).toBe('product-3d');
    expect(mode.visualOutput).toBe('video');
    expect(mode.captionStyle).toBe('block');
  });

  it('holds long shots rather than cutting per line', () => {
    // The reference format runs a single continuous move for many seconds.
    expect(mode.secondsPerBeat).toBeGreaterThanOrEqual(5);
    expect(mode.motions).toEqual(['static']);
  });

  it('renders its style with real geometry', () => {
    expect(THREE_D_STYLES.has(mode.visualStyle)).toBe(true);
  });

  it('writes a mechanism script at the requested length', async () => {
    const script = await stubLlm.writeScript({
      mode: 'mechanism-explainer',
      topic: 'an engine mount that releases in a crash',
      targetDurationSec: 30,
    });
    expect(script.beats.length).toBeGreaterThan(3);
    expect(script.title.startsWith('Why')).toBe(true);
  });

  it('lets the subject option force a set', async () => {
    const script = await stubLlm.writeScript({
      mode: 'mechanism-explainer', topic: 'thermal expansion', targetDurationSec: 30,
      ...({ options: { subject: 'machine' } } as object),
    });
    expect(chooseSceneKind(script.beats[0].visualPrompt, 0)).toBe('machine');
  });
});
