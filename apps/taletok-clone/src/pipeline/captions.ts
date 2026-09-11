import type { WordTiming } from '@/providers/types';
import { groupIntoCaptionLines } from '@/providers/tts/timing';
import { dimensionsFor } from './ffmpeg';

/**
 * Caption rendering as ASS (Advanced SubStation Alpha).
 *
 * ASS is used rather than burning text with drawtext because libass handles
 * per-word highlighting, outlines and safe-area margins correctly, and one
 * subtitle file covers the whole timeline in a single filter pass.
 */

export type CaptionStyle = 'karaoke' | 'block' | 'word-pop' | 'classic';

export interface CaptionScene {
  /** Absolute offset of this scene on the final timeline. */
  startMs: number;
  durationMs: number;
  text: string;
  /** Word timings relative to the scene start. */
  words: WordTiming[];
}

export interface CaptionOptions {
  style: CaptionStyle;
  aspect: string;
  fontColor: string;
  highlightColor: string;
  fontName?: string;
}

/** #RRGGBB -> &HAABBGGRR (ASS stores colour byte-reversed). */
export function hexToAss(hex: string, alpha = 0): string {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = full.slice(0, 2) || 'ff';
  const g = full.slice(2, 4) || 'ff';
  const b = full.slice(4, 6) || 'ff';
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** Milliseconds -> H:MM:SS.cc */
export function assTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const cs = Math.floor((total % 1000) / 10);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** ASS treats braces as override blocks and newlines as \N. */
function escapeAss(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N');
}

interface StyleSpec {
  fontSize: number;
  marginV: number;
  outline: number;
  alignment: number; // numpad layout: 2 = bottom-centre, 5 = middle-centre
  bold: number;
  wordsPerLine: number;
}

function styleSpec(style: CaptionStyle, height: number): StyleSpec {
  const unit = height / 1920; // specs are authored against a 1080x1920 frame
  switch (style) {
    case 'word-pop':
      return { fontSize: Math.round(130 * unit), marginV: Math.round(760 * unit), outline: Math.round(9 * unit), alignment: 5, bold: -1, wordsPerLine: 1 };
    case 'block':
      return { fontSize: Math.round(78 * unit), marginV: Math.round(420 * unit), outline: Math.round(6 * unit), alignment: 2, bold: -1, wordsPerLine: 8 };
    case 'classic':
      return { fontSize: Math.round(62 * unit), marginV: Math.round(150 * unit), outline: Math.round(4 * unit), alignment: 2, bold: 0, wordsPerLine: 10 };
    case 'karaoke':
    default:
      return { fontSize: Math.round(84 * unit), marginV: Math.round(520 * unit), outline: Math.round(7 * unit), alignment: 2, bold: -1, wordsPerLine: 3 };
  }
}

function header(opts: CaptionOptions, spec: StyleSpec, width: number, height: number): string {
  const font = opts.fontName || 'DejaVu Sans';
  const margin = Math.round(width * 0.07);

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // 0 = wrap within the margins, balancing lines. WrapStyle 2 disables
    // wrapping entirely, which lets a long caption run off both edges.
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
      'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, ' +
      'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Main,${font},${spec.fontSize},${hexToAss(opts.fontColor)},${hexToAss(opts.highlightColor)},` +
      `${hexToAss('#000000')},${hexToAss('#000000', 0.4)},${spec.bold},0,0,0,100,100,0,0,1,` +
      `${spec.outline},${Math.round(spec.outline / 2)},${spec.alignment},${margin},${margin},${spec.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
}

function dialogue(startMs: number, endMs: number, text: string): string {
  return `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},Main,,0,0,0,,${text}`;
}

/**
 * Builds the full ASS document for a video.
 * Word timings are offset by each scene's position on the timeline.
 */
export function buildAss(scenes: CaptionScene[], opts: CaptionOptions): string {
  const { width, height } = dimensionsFor(opts.aspect);
  const spec = styleSpec(opts.style, height);
  const events: string[] = [];

  for (const scene of scenes) {
    const words = scene.words.length
      ? scene.words
      : // No timings (e.g. an imported scene) — spread the text evenly.
        spreadEvenly(scene.text, scene.durationMs);

    const lines = groupIntoCaptionLines(words, spec.wordsPerLine);

    for (const line of lines) {
      const lineStart = scene.startMs + line[0].startMs;
      const lineEnd = scene.startMs + line[line.length - 1].endMs;
      if (lineEnd <= lineStart) continue;

      if (opts.style === 'karaoke') {
        // One event per word: the full line stays on screen while the active
        // word switches to the highlight colour.
        for (let i = 0; i < line.length; i++) {
          const rendered = line
            .map((w, j) =>
              j === i
                ? `{\\c${hexToAss(opts.highlightColor)}}${escapeAss(w.word)}{\\c${hexToAss(opts.fontColor)}}`
                : escapeAss(w.word),
            )
            .join(' ');
          events.push(
            dialogue(scene.startMs + line[i].startMs, scene.startMs + line[i].endMs, rendered),
          );
        }
      } else if (opts.style === 'word-pop') {
        for (const w of line) {
          events.push(
            dialogue(
              scene.startMs + w.startMs,
              scene.startMs + w.endMs,
              `{\\fscx112\\fscy112\\c${hexToAss(opts.highlightColor)}}${escapeAss(w.word)}`,
            ),
          );
        }
      } else {
        events.push(dialogue(lineStart, lineEnd, escapeAss(line.map((w) => w.word).join(' '))));
      }
    }
  }

  return `${header(opts, spec, width, height)}\n${events.join('\n')}\n`;
}

/** Fallback timing when a scene has no word-level data. */
function spreadEvenly(text: string, durationMs: number): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const per = durationMs / tokens.length;
  return tokens.map((word, i) => ({
    word,
    startMs: Math.round(i * per),
    endMs: Math.round((i + 1) * per),
  }));
}
