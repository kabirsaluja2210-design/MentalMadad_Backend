import { describe, expect, it } from 'vitest';
import { VIDEO_MODES, getMode, isMode, resolveOptions } from '@/pipeline/modes';
import { planBeats } from '@/providers/llm/beat-planners';
import { stubLlm } from '@/providers/llm/stub';

describe('mode catalog', () => {
  it('has unique ids', () => {
    const ids = VIDEO_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every default duration inside its own range', () => {
    for (const mode of VIDEO_MODES) {
      expect(mode.minDurationSec).toBeLessThanOrEqual(mode.defaultDurationSec);
      expect(mode.defaultDurationSec).toBeLessThanOrEqual(mode.maxDurationSec);
    }
  });

  it('gives every mode at least one source type and one motion', () => {
    for (const mode of VIDEO_MODES) {
      expect(mode.sourceTypes.length).toBeGreaterThan(0);
      expect(mode.motions.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown ids', () => {
    expect(isMode('reddit-story')).toBe(true);
    expect(isMode('not-a-mode')).toBe(false);
    expect(() => getMode('not-a-mode')).toThrow();
  });
});

describe('resolveOptions', () => {
  it('fills in defaults for anything not supplied', () => {
    const resolved = resolveOptions('quiz', {});
    expect(resolved.questionCount).toBe(5);
    expect(resolved.countdownSec).toBe(3);
  });

  it('lets supplied values win', () => {
    expect(resolveOptions('quiz', { questionCount: 12 }).questionCount).toBe(12);
  });

  it('ignores keys the mode does not declare', () => {
    expect(resolveOptions('quiz', { nonsense: true })).not.toHaveProperty('nonsense');
  });
});

describe('beat planners', () => {
  it('produces beats for every mode', () => {
    for (const mode of VIDEO_MODES) {
      const { beats, hook } = planBeats(
        { mode: mode.id, topic: 'deep sea exploration', targetDurationSec: mode.defaultDurationSec },
        resolveOptions(mode.id, {}),
      );
      expect(beats.length, `${mode.id} produced no beats`).toBeGreaterThan(0);
      expect(hook.length, `${mode.id} produced no hook`).toBeGreaterThan(0);
      for (const beat of beats) {
        expect(beat.text.trim()).not.toBe('');
        expect(beat.visualPrompt.trim()).not.toBe('');
      }
    }
  });

  it('honours the requested item count for listicles', () => {
    const { beats } = planBeats(
      { mode: 'listicle', topic: 'ancient engineering', targetDurationSec: 60 },
      resolveOptions('listicle', { itemCount: 5 }),
    );
    expect(beats).toHaveLength(5);
  });

  it('emits a question and an answer per quiz item', () => {
    const { beats } = planBeats(
      { mode: 'quiz', topic: 'world capitals', targetDurationSec: 60 },
      resolveOptions('quiz', { questionCount: 4 }),
    );
    expect(beats).toHaveLength(8);
  });

  it('interpolates era labels across a timelapse range', () => {
    const { beats } = planBeats(
      { mode: 'timelapse', topic: 'city skylines', targetDurationSec: 45 },
      resolveOptions('timelapse', { steps: 5, startLabel: '1900', endLabel: '2000' }),
    );
    expect(beats).toHaveLength(5);
    expect(beats[0].text).toContain('1900');
    expect(beats[4].text).toContain('2000');
  });

  it('narrates supplied source text rather than inventing one', () => {
    const source = 'A very specific sentence that must survive. And a second one here.';
    const { beats } = planBeats(
      { mode: 'reddit-story', topic: 'a story', targetDurationSec: 60, sourceText: source },
      resolveOptions('reddit-story', {}),
    );
    expect(beats.map((b) => b.text).join(' ')).toContain('A very specific sentence');
  });
});

describe('stub script writer', () => {
  it('is deterministic for the same input', async () => {
    const req = { mode: 'cinematic-short', topic: 'the deep ocean', targetDurationSec: 30 };
    const a = await stubLlm.writeScript(req);
    const b = await stubLlm.writeScript(req);
    expect(a.script).toBe(b.script);
  });

  it('includes the hook and every beat in the script body', async () => {
    const result = await stubLlm.writeScript({
      mode: 'ai-short', topic: 'why bread rises', targetDurationSec: 30,
    });
    expect(result.script).toContain(result.hook);
    for (const beat of result.beats) expect(result.script).toContain(beat.text);
  });

  it('returns hashtags without duplicates', async () => {
    const { hashtags } = await stubLlm.writeScript({
      mode: 'listicle', topic: 'ancient ancient engineering', targetDurationSec: 30,
    });
    expect(new Set(hashtags).size).toBe(hashtags.length);
  });

  it('suggests ideas mapped to real modes', async () => {
    const ideas = await stubLlm.suggestIdeas('volcanoes', 5);
    expect(ideas).toHaveLength(5);
    for (const idea of ideas) expect(isMode(idea.suggestedMode)).toBe(true);
  });
});
