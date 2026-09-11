import type { WordTiming } from '../types';

/**
 * Speech timing model.
 *
 * Caption sync is the difference between a watchable short and an unwatchable
 * one, so timings are derived from a syllable estimate plus punctuation pauses
 * rather than dividing the clip evenly. When a real TTS provider returns its
 * own word timestamps we use those instead; this model is what keeps the stub
 * output honest enough to edit against.
 */

const MS_PER_SYLLABLE = 185;
const MIN_WORD_MS = 120;

/** Rough English syllable count — good enough for caption pacing. */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 1;
  if (clean.length <= 3) return 1;

  const trimmed = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Extra silence after a word, based on its trailing punctuation. */
function pauseAfter(word: string): number {
  if (/[.!?]["')\]]?$/.test(word)) return 380;
  if (/[,;:]["')\]]?$/.test(word)) return 190;
  if (/[—–-]$/.test(word)) return 150;
  return 0;
}

export interface TimingResult {
  words: WordTiming[];
  durationMs: number;
}

/**
 * Produces word-level timings for a piece of narration.
 * `speed` > 1 shortens everything proportionally.
 */
export function estimateTiming(text: string, speed = 1, startMs = 0): TimingResult {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const rate = speed > 0 ? speed : 1;

  const words: WordTiming[] = [];
  let cursor = startMs;

  for (const token of tokens) {
    const spoken = Math.max(MIN_WORD_MS, countSyllables(token) * MS_PER_SYLLABLE) / rate;
    const start = cursor;
    const end = start + spoken;
    words.push({ word: token, startMs: Math.round(start), endMs: Math.round(end) });
    cursor = end + pauseAfter(token) / rate;
  }

  // Trailing breath so scenes don't butt straight into each other.
  const durationMs = Math.round(Math.max(cursor - startMs, 400) + 180 / rate);
  return { words, durationMs };
}

/**
 * Groups word timings into caption lines of at most `maxWords`, breaking at
 * sentence ends where possible.
 */
export function groupIntoCaptionLines(words: WordTiming[], maxWords = 4): WordTiming[][] {
  const lines: WordTiming[][] = [];
  let current: WordTiming[] = [];

  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]["')\]]?$/.test(word.word);
    if (current.length >= maxWords || endsSentence) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length) lines.push(current);
  return lines;
}
