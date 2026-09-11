import { describe, expect, it } from 'vitest';
import { countSyllables, estimateTiming, groupIntoCaptionLines } from '@/providers/tts/timing';

describe('countSyllables', () => {
  it('counts single-syllable words as one', () => {
    for (const word of ['cat', 'the', 'bridge', 'stopped']) {
      expect(countSyllables(word)).toBe(1);
    }
  });

  it('counts multi-syllable words above one', () => {
    expect(countSyllables('lighthouse')).toBeGreaterThan(1);
    expect(countSyllables('extraordinary')).toBeGreaterThan(3);
  });

  it('never returns zero, even for punctuation', () => {
    expect(countSyllables('—')).toBe(1);
    expect(countSyllables('')).toBe(1);
  });
});

describe('estimateTiming', () => {
  it('produces one timing per word, in order and non-overlapping', () => {
    const { words } = estimateTiming('The first change is small enough to ignore.');
    expect(words).toHaveLength(8);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].endMs);
    }
  });

  it('reports a duration covering every word', () => {
    const { words, durationMs } = estimateTiming('One two three four five.');
    expect(durationMs).toBeGreaterThanOrEqual(words[words.length - 1].endMs);
  });

  it('shortens output as speed increases', () => {
    const slow = estimateTiming('The same sentence entirely.', 0.8);
    const fast = estimateTiming('The same sentence entirely.', 1.4);
    expect(fast.durationMs).toBeLessThan(slow.durationMs);
  });

  it('adds a longer pause after a sentence than after a comma', () => {
    const comma = estimateTiming('word, word');
    const period = estimateTiming('word. word');
    expect(period.words[1].startMs).toBeGreaterThan(comma.words[1].startMs);
  });

  it('offsets every word when given a start', () => {
    const { words } = estimateTiming('two words', 1, 5000);
    expect(words[0].startMs).toBeGreaterThanOrEqual(5000);
  });
});

describe('groupIntoCaptionLines', () => {
  it('never exceeds the requested words per line', () => {
    const { words } = estimateTiming('one two three four five six seven eight nine ten');
    for (const line of groupIntoCaptionLines(words, 3)) {
      expect(line.length).toBeLessThanOrEqual(3);
    }
  });

  it('breaks at a sentence end even below the limit', () => {
    const { words } = estimateTiming('Stop. Keep going now');
    expect(groupIntoCaptionLines(words, 4)[0]).toHaveLength(1);
  });

  it('keeps every word', () => {
    const { words } = estimateTiming('a b c d e f g');
    const flat = groupIntoCaptionLines(words, 2).flat();
    expect(flat).toHaveLength(words.length);
  });
});
