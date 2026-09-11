import { describe, expect, it } from 'vitest';
import { arcShape, buildArc, REGISTERS } from '@/providers/llm/narrative';
import { stubLlm } from '@/providers/llm/stub';
import { estimateTiming } from '@/providers/tts/timing';
import { resolveOptions, getMode } from '@/pipeline/modes';

describe('arcShape', () => {
  it('always opens on a hook', () => {
    for (const n of [4, 8, 14, 30]) expect(arcShape(n)[0]).toBe('hook');
  });

  it('returns the requested number of beats', () => {
    for (const n of [4, 6, 13, 22, 40]) expect(arcShape(n)).toHaveLength(n);
  });

  it('grows the middle, not the ending', () => {
    const short = arcShape(6).filter((f) => f === 'development').length;
    const long = arcShape(24).filter((f) => f === 'development').length;
    expect(long).toBeGreaterThan(short);
    // The closing sections stay at one beat each however long the piece runs.
    expect(arcShape(24).filter((f) => f === 'close')).toHaveLength(1);
    expect(arcShape(24).filter((f) => f === 'turn')).toHaveLength(1);
  });

  it('keeps development before the turn and resolution', () => {
    const shape = arcShape(16);
    const lastDevelopment = shape.lastIndexOf('development');
    for (const section of ['turn', 'consequence', 'resolution', 'close'] as const) {
      const index = shape.indexOf(section);
      if (index >= 0) expect(index, section).toBeGreaterThan(lastDevelopment);
    }
  });

  it('still produces a usable arc at the minimum length', () => {
    expect(arcShape(1).length).toBeGreaterThanOrEqual(4);
  });
});

describe('buildArc', () => {
  it('fills a long arc without repeating a line', () => {
    for (const register of ['documentary', 'story'] as const) {
      const beats = buildArc('the coastal railway', 24, register, 42);
      const texts = beats.map((b) => b.text);
      expect(new Set(texts).size, `${register} repeats`).toBe(texts.length);
    }
  });

  it('is deterministic for the same topic, length and seed', () => {
    const a = buildArc('deep sea cables', 12, 'documentary', 7).map((b) => b.text);
    const b = buildArc('deep sea cables', 12, 'documentary', 7).map((b) => b.text);
    expect(a).toEqual(b);
  });

  it('reads differently in each register', () => {
    const doc = buildArc('the old mill', 10, 'documentary', 3).map((b) => b.text).join(' ');
    const story = buildArc('the old mill', 10, 'story', 3).map((b) => b.text).join(' ');
    expect(doc).not.toBe(story);
  });

  it('keeps the leading article so the topic reads inside a sentence', () => {
    const text = buildArc('the lighthouse on the coast', 8, 'documentary', 1)
      .map((b) => b.text).join(' ');
    expect(text).not.toMatch(/\b(For decades|story of) lighthouse\b/);
  });

  it('marks position monotonically from 0 to 1', () => {
    const beats = buildArc('anything', 10, 'documentary', 1);
    expect(beats[0].position).toBe(0);
    expect(beats[beats.length - 1].position).toBeCloseTo(1, 6);
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i].position).toBeGreaterThan(beats[i - 1].position);
    }
  });

  it('has enough frames in every section to build a long arc', () => {
    for (const [name, frames] of Object.entries(REGISTERS)) {
      expect(frames.development.length, `${name} development pool`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('duration fitting', () => {
  /** Narration length the pipeline will actually produce for this request. */
  async function narrationSeconds(mode: string, seconds: number): Promise<number> {
    const options = resolveOptions(mode, {});
    const pace =
      options.narrationPace === 'slow' ? 0.92 : options.narrationPace === 'fast' ? 1.15 : 1;
    const script = await stubLlm.writeScript({
      mode, topic: 'the bridge that took ninety years to finish', targetDurationSec: seconds,
    });
    // The engine voices the hook plus every beat.
    const spoken = [script.hook, ...script.beats.map((b) => b.text)]
      .filter((line, i, all) => i === 0 || line !== all[0])
      .join(' ');
    return estimateTiming(spoken, pace).durationMs / 1000;
  }

  it('lands a 60-second documentary near 60 seconds', async () => {
    // The original planner drew from a fixed line pool and produced roughly
    // half of any long request.
    const actual = await narrationSeconds('short-documentary', 60);
    expect(actual).toBeGreaterThan(54);
    expect(actual).toBeLessThan(68);
  });

  it('scales across the whole supported range', async () => {
    for (const seconds of [30, 60, 90, 120]) {
      const actual = await narrationSeconds('short-documentary', seconds);
      const ratio = actual / seconds;
      expect(ratio, `${seconds}s came out at ${actual.toFixed(1)}s`).toBeGreaterThan(0.85);
      expect(ratio, `${seconds}s came out at ${actual.toFixed(1)}s`).toBeLessThan(1.15);
    }
  });

  it('produces more beats for a longer video', async () => {
    const short = await stubLlm.writeScript({ mode: 'short-documentary', topic: 'x', targetDurationSec: 30 });
    const long = await stubLlm.writeScript({ mode: 'short-documentary', topic: 'x', targetDurationSec: 120 });
    expect(long.beats.length).toBeGreaterThan(short.beats.length * 2);
  });

  it('keeps the hook as the first spoken beat', async () => {
    const script = await stubLlm.writeScript({
      mode: 'short-documentary', topic: 'the old mill', targetDurationSec: 60,
    });
    expect(script.beats[0].text).toBe(script.hook);
  });
});

describe('3D documentary mode', () => {
  it('defaults to 60 seconds of 3D animation', () => {
    const mode = getMode('short-documentary');
    expect(mode.defaultDurationSec).toBe(60);
    expect(mode.visualOutput).toBe('video');
    expect(mode.visualStyle).toBe('cartoon-3d');
  });

  it('offers both narration registers', () => {
    const register = getMode('short-documentary').options.find((o) => o.key === 'register');
    expect(register?.options?.map((o) => o.value).sort()).toEqual(['documentary', 'story']);
  });
});
