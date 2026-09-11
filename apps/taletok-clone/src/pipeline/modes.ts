/**
 * The catalog of video modes.
 *
 * A mode is a recipe: it decides how the script is structured into beats, how
 * long each beat runs, what the visuals look like, and which caption treatment
 * is applied. Adding a new format means adding one entry here plus a beat
 * planner in `beat-planners.ts` — the pipeline, editors, API and UI all read
 * this catalog, so nothing else needs touching.
 */

export interface ModeOptionField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  default: string | number | boolean;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface VideoMode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Emoji used as the card glyph in the mode picker. */
  glyph: string;
  defaultDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  defaultAspect: '9:16' | '1:1' | '16:9';
  /** Where the raw material comes from. */
  sourceTypes: ('prompt' | 'reddit' | 'url' | 'upload' | 'idea')[];
  /** Seconds of narration per beat — controls scene pacing. */
  secondsPerBeat: number;
  visualStyle: string;
  captionStyle: 'karaoke' | 'block' | 'word-pop' | 'classic';
  /** Motion pool the compositor cycles through. */
  motions: string[];
  /** Background music mood passed to the music provider. */
  musicMood: string;
  /** Mode-specific knobs surfaced in both editors. */
  options: ModeOptionField[];
}

const TONE_OPTIONS = [
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'casual', label: 'Casual' },
  { value: 'suspenseful', label: 'Suspenseful' },
  { value: 'upbeat', label: 'Upbeat' },
  { value: 'documentary', label: 'Documentary' },
];

export const VIDEO_MODES: VideoMode[] = [
  {
    id: 'reddit-story',
    name: 'Reddit Story',
    tagline: 'Story post read over gameplay-style background',
    description:
      'Turns a forum story into a narrated short. Opens on a styled post card, ' +
      'then reads the story over a moving background with karaoke captions.',
    glyph: '💬',
    defaultDurationSec: 50,
    minDurationSec: 20,
    maxDurationSec: 180,
    defaultAspect: '9:16',
    sourceTypes: ['reddit', 'prompt', 'idea', 'url'],
    secondsPerBeat: 4.5,
    visualStyle: 'background-loop',
    captionStyle: 'karaoke',
    motions: ['static', 'pan-left', 'pan-right'],
    musicMood: 'tense-lofi',
    options: [
      { key: 'showPostCard', label: 'Show post card intro', type: 'boolean', default: true,
        help: 'Renders a title card for the first ~3 seconds.' },
      { key: 'subreddit', label: 'Community label', type: 'text', default: 'r/stories',
        help: 'Shown on the post card.' },
      { key: 'tone', label: 'Tone', type: 'select', default: 'dramatic', options: TONE_OPTIONS },
      { key: 'cliffhanger', label: 'End on a cliffhanger', type: 'boolean', default: false,
        help: 'Cuts before the resolution and adds a "part 2" prompt.' },
    ],
  },
  {
    id: 'cinematic-short',
    name: 'Cinematic Short',
    tagline: 'Dramatic narrated fact or scenario, one striking visual per beat',
    description:
      'A slow, weighty voiceover over high-contrast cinematic frames — the ' +
      '"what would happen if…" format. One dramatic image per sentence, heavy ' +
      'depth-of-field look, minimal captions.',
    glyph: '🎬',
    defaultDurationSec: 40,
    minDurationSec: 15,
    maxDurationSec: 120,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea'],
    secondsPerBeat: 5,
    visualStyle: 'cinematic-3d',
    captionStyle: 'block',
    motions: ['kenburns-in', 'kenburns-out', 'zoom-pulse'],
    musicMood: 'epic-ambient',
    options: [
      { key: 'tone', label: 'Tone', type: 'select', default: 'dramatic', options: TONE_OPTIONS },
      { key: 'narrationPace', label: 'Narration pace', type: 'select', default: 'slow',
        options: [
          { value: 'slow', label: 'Slow & weighty' },
          { value: 'normal', label: 'Normal' },
          { value: 'fast', label: 'Fast' },
        ] },
      { key: 'colorGrade', label: 'Colour grade', type: 'select', default: 'teal-orange',
        options: [
          { value: 'teal-orange', label: 'Teal & orange' },
          { value: 'cold-blue', label: 'Cold blue' },
          { value: 'warm-amber', label: 'Warm amber' },
          { value: 'mono', label: 'Monochrome' },
        ] },
    ],
  },
  {
    id: 'ai-short',
    name: 'AI Short',
    tagline: 'Any topic in, finished short out',
    description:
      'The general-purpose format. Give it a topic or a full script and it ' +
      'writes, voices, illustrates and cuts a short on anything.',
    glyph: '⚡',
    defaultDurationSec: 35,
    minDurationSec: 10,
    maxDurationSec: 120,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'url', 'idea', 'upload'],
    secondsPerBeat: 4,
    visualStyle: 'illustrated',
    captionStyle: 'word-pop',
    motions: ['kenburns-in', 'pan-right', 'zoom-pulse', 'kenburns-out'],
    musicMood: 'upbeat-electronic',
    options: [
      { key: 'tone', label: 'Tone', type: 'select', default: 'upbeat', options: TONE_OPTIONS },
      { key: 'useOwnScript', label: 'I will supply the script', type: 'boolean', default: false,
        help: 'Skips script generation and uses your text verbatim.' },
      { key: 'hookStyle', label: 'Hook style', type: 'select', default: 'question',
        options: [
          { value: 'question', label: 'Open with a question' },
          { value: 'bold-claim', label: 'Open with a bold claim' },
          { value: 'stat', label: 'Open with a statistic' },
          { value: 'story', label: 'Open mid-story' },
        ] },
    ],
  },
  {
    id: 'timelapse',
    name: 'Timelapse',
    tagline: 'Evolution of something across time, step by step',
    description:
      'Walks through a progression — a city across centuries, a species across ' +
      'eras, a technology across decades — one frame per step with an animated ' +
      'era label and a continuous push-in.',
    glyph: '⏳',
    defaultDurationSec: 45,
    minDurationSec: 15,
    maxDurationSec: 120,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea'],
    secondsPerBeat: 3.5,
    visualStyle: 'timelapse-frames',
    captionStyle: 'classic',
    motions: ['kenburns-in'],
    musicMood: 'epic-ambient',
    options: [
      { key: 'startLabel', label: 'Start of range', type: 'text', default: '1900',
        help: 'First era label, e.g. "1900" or "Day 1".' },
      { key: 'endLabel', label: 'End of range', type: 'text', default: '2025' },
      { key: 'showEraLabel', label: 'Show era label', type: 'boolean', default: true },
      { key: 'steps', label: 'Number of steps', type: 'number', default: 10,
        help: 'How many points in the progression to show.' },
    ],
  },
  {
    id: 'long-form-story',
    name: 'Long-form Story',
    tagline: 'Up to 10 minutes, chaptered, for YouTube',
    description:
      'A full narrated story for long-form channels. Splits into chapters, ' +
      'paces visuals wider apart, and exports 16:9 by default.',
    glyph: '📖',
    defaultDurationSec: 300,
    minDurationSec: 120,
    maxDurationSec: 600,
    defaultAspect: '16:9',
    sourceTypes: ['prompt', 'reddit', 'url', 'idea'],
    secondsPerBeat: 12,
    visualStyle: 'illustrated',
    captionStyle: 'classic',
    motions: ['kenburns-in', 'kenburns-out', 'pan-left', 'pan-right'],
    musicMood: 'calm-underscore',
    options: [
      { key: 'chapters', label: 'Chapter count', type: 'number', default: 5 },
      { key: 'showChapterCards', label: 'Show chapter cards', type: 'boolean', default: true },
      { key: 'tone', label: 'Tone', type: 'select', default: 'documentary', options: TONE_OPTIONS },
    ],
  },
  {
    id: 'quiz',
    name: 'Quiz',
    tagline: 'Question, countdown, reveal — built for comments',
    description:
      'Poses a question, runs an on-screen countdown, then reveals the answer. ' +
      'The highest-comment format because viewers guess before the reveal.',
    glyph: '❓',
    defaultDurationSec: 40,
    minDurationSec: 15,
    maxDurationSec: 90,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea'],
    secondsPerBeat: 6,
    visualStyle: 'graphic-card',
    captionStyle: 'block',
    motions: ['static', 'zoom-pulse'],
    musicMood: 'upbeat-electronic',
    options: [
      { key: 'questionCount', label: 'Questions', type: 'number', default: 5 },
      { key: 'countdownSec', label: 'Countdown seconds', type: 'number', default: 3 },
      { key: 'difficulty', label: 'Difficulty', type: 'select', default: 'mixed',
        options: [
          { value: 'easy', label: 'Easy' },
          { value: 'mixed', label: 'Mixed' },
          { value: 'hard', label: 'Hard' },
        ] },
    ],
  },
  {
    id: 'listicle',
    name: 'Listicle',
    tagline: 'Top N, counted down with numbered cards',
    description:
      'Counts down a ranked list with a numbered badge per item. Reliable ' +
      'watch-time because the payoff is always at the end.',
    glyph: '🔢',
    defaultDurationSec: 45,
    minDurationSec: 15,
    maxDurationSec: 120,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea', 'url'],
    secondsPerBeat: 5,
    visualStyle: 'illustrated',
    captionStyle: 'word-pop',
    motions: ['kenburns-in', 'pan-left'],
    musicMood: 'upbeat-electronic',
    options: [
      { key: 'itemCount', label: 'Items', type: 'number', default: 7 },
      { key: 'countDirection', label: 'Order', type: 'select', default: 'down',
        options: [
          { value: 'down', label: 'Count down (N → 1)' },
          { value: 'up', label: 'Count up (1 → N)' },
        ] },
      { key: 'showNumberBadge', label: 'Show number badge', type: 'boolean', default: true },
    ],
  },
  {
    id: 'text-message-story',
    name: 'Text Message Story',
    tagline: 'A conversation revealed bubble by bubble',
    description:
      'Plays out a story as a chat thread — bubbles animate in with typing ' +
      'indicators and notification sounds, voiced by two alternating speakers.',
    glyph: '📱',
    defaultDurationSec: 45,
    minDurationSec: 15,
    maxDurationSec: 120,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea'],
    secondsPerBeat: 3,
    visualStyle: 'chat-thread',
    captionStyle: 'classic',
    motions: ['static'],
    musicMood: 'tense-lofi',
    options: [
      { key: 'leftName', label: 'Left speaker', type: 'text', default: 'Sam' },
      { key: 'rightName', label: 'Right speaker', type: 'text', default: 'Alex' },
      { key: 'theme', label: 'Chat theme', type: 'select', default: 'dark',
        options: [
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ] },
      { key: 'typingIndicator', label: 'Show typing indicator', type: 'boolean', default: true },
    ],
  },
  {
    id: 'motivational',
    name: 'Motivational',
    tagline: 'Punchy spoken lines over bold typography',
    description:
      'Short declarative lines delivered over full-bleed typography and slow ' +
      'push-ins. Built for saves and shares rather than watch time.',
    glyph: '🔥',
    defaultDurationSec: 30,
    minDurationSec: 10,
    maxDurationSec: 90,
    defaultAspect: '9:16',
    sourceTypes: ['prompt', 'idea'],
    secondsPerBeat: 3.5,
    visualStyle: 'typography',
    captionStyle: 'word-pop',
    motions: ['zoom-pulse', 'kenburns-in'],
    musicMood: 'epic-ambient',
    options: [
      { key: 'tone', label: 'Tone', type: 'select', default: 'dramatic', options: TONE_OPTIONS },
      { key: 'signOff', label: 'Sign-off line', type: 'text', default: 'Save this.' },
    ],
  },
];

export const MODE_IDS = VIDEO_MODES.map((m) => m.id);

export function getMode(id: string): VideoMode {
  const mode = VIDEO_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown video mode: ${id}`);
  return mode;
}

export function isMode(id: string): boolean {
  return MODE_IDS.includes(id);
}

/** Merges user-supplied options over the mode defaults. */
export function resolveOptions(
  modeId: string,
  provided: Record<string, unknown> = {},
): Record<string, string | number | boolean> {
  const mode = getMode(modeId);
  const resolved: Record<string, string | number | boolean> = {};
  for (const field of mode.options) {
    const value = provided[field.key];
    resolved[field.key] = value === undefined || value === null ? field.default : (value as never);
  }
  return resolved;
}
