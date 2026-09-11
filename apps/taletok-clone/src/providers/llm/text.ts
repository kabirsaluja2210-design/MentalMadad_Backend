/** Text utilities shared by the script generators. */

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Groups sentences into beats of roughly `targetWords` each. */
export function chunkIntoBeats(sentences: string[], targetWords: number): string[] {
  const beats: string[] = [];
  let current: string[] = [];
  let words = 0;

  for (const sentence of sentences) {
    const count = countWords(sentence);
    // Start a new beat once adding this sentence would overshoot, but never
    // emit an empty one.
    if (words > 0 && words + count > targetWords) {
      beats.push(current.join(' '));
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += count;
  }
  if (current.length) beats.push(current.join(' '));
  return beats;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Narration words-per-minute by pace label. */
export const WPM = { slow: 125, normal: 155, fast: 185 } as const;

export function wordsForDuration(seconds: number, pace: keyof typeof WPM = 'normal'): number {
  return Math.round((WPM[pace] / 60) * seconds);
}

export function titleCase(text: string): string {
  const small = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'to', 'and', 'or', 'for', 'is']);
  return text
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && small.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

export function trimTo(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '…';
}

/** Strips a topic down to a short noun phrase usable inside a sentence. */
export function topicPhrase(topic: string): string {
  return topic
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/[.?!]+$/, '')
    .trim()
    .toLowerCase();
}

export function hashtagsFor(topic: string, mode: string): string[] {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3)
    .map((w) => `#${w}`);

  const modeTags: Record<string, string[]> = {
    'reddit-story': ['#storytime', '#reddit'],
    'cinematic-short': ['#whatif', '#cinematic'],
    'ai-short': ['#shorts', '#learnontiktok'],
    timelapse: ['#timelapse', '#history'],
    'long-form-story': ['#storytime', '#documentary'],
    quiz: ['#quiz', '#trivia'],
    listicle: ['#top10', '#facts'],
    'text-message-story': ['#textstory', '#storytime'],
    motivational: ['#motivation', '#mindset'],
  };

  return Array.from(new Set([...base, ...(modeTags[mode] ?? ['#shorts']), '#fyp'])).slice(0, 8);
}
