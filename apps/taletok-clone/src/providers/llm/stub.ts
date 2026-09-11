import type { IdeaSuggestion, LlmProvider, ScriptBeat, ScriptRequest, ScriptResult } from '../types';
import { resolveOptions } from '@/pipeline/modes';
import { planBeats } from './beat-planners';
import { hashtagsFor, titleCase, topicPhrase, trimTo } from './text';
import { hashString, seededRandom } from '@/lib/media-encode';

/**
 * Offline script writer. Deterministic templates per mode — no network, no
 * key, same input always yields the same script.
 */
export const stubLlm: LlmProvider = {
  info: {
    id: 'stub',
    name: 'Built-in script engine',
    kind: 'llm',
    available: true,
    placeholder: true,
    note: 'Template-based scripts. Set ANTHROPIC_API_KEY or OPENAI_API_KEY for model-written scripts.',
  },

  async writeScript(req: ScriptRequest): Promise<ScriptResult> {
    const options = resolveOptions(req.mode, (req as { options?: Record<string, unknown> }).options);
    const { beats, hook, cta, title } = planBeats(req, options);

    const scriptLines = [hook, ...beats.map((b) => b.text)];
    if (cta) scriptLines.push(cta);

    return {
      title,
      hook,
      cta,
      script: scriptLines.join('\n'),
      beats,
      hashtags: hashtagsFor(req.topic, req.mode),
    };
  },

  async rewriteBeat(req: ScriptRequest, beat: ScriptBeat, instruction?: string): Promise<ScriptBeat> {
    // Without a model we can still give a genuinely different take: re-seed
    // from the instruction so each regeneration returns a new variant.
    const rand = seededRandom(hashString(`${beat.text}:${instruction ?? ''}:${Date.now() >> 12}`));
    const phrase = topicPhrase(req.topic);

    const variants = [
      `Here is the part that actually matters about ${phrase}.`,
      `Most people stop reading right before this bit.`,
      `The detail everyone skips is the one that explains the rest.`,
      `This is where it stops being a coincidence.`,
      `And that is the moment the whole thing turns.`,
      `Keep this one in mind — it comes back later.`,
    ];

    const picked = variants[Math.floor(rand() * variants.length)];
    const text = instruction?.trim() ? `${picked} ${trimTo(instruction.trim(), 25)}` : picked;

    return {
      text,
      visualPrompt: beat.visualPrompt,
      motion: beat.motion,
    };
  },

  async suggestIdeas(topic: string, count: number): Promise<IdeaSuggestion[]> {
    const rand = seededRandom(hashString(`ideas:${topic}`));
    const phrase = topicPhrase(topic) || 'this topic';

    const frames = [
      { t: `The part of ${phrase} nobody explains`, m: 'ai-short' },
      { t: `What happens if ${phrase} stops working`, m: 'cinematic-short' },
      { t: `${titleCase(phrase)} across the last hundred years`, m: 'timelapse' },
      { t: `Seven things about ${phrase} worth knowing`, m: 'listicle' },
      { t: `Can you answer five questions on ${phrase}?`, m: 'quiz' },
      { t: `The message that ended it`, m: 'text-message-story' },
      { t: `I ignored ${phrase} for a year. Here is what it cost.`, m: 'reddit-story' },
      { t: `Start ${phrase} badly, but start today`, m: 'motivational' },
      { t: `The full story behind ${phrase}`, m: 'long-form-story' },
    ];

    return frames.slice(0, Math.max(1, count)).map((f) => ({
      title: f.t,
      body: `An angle on ${phrase} built for the ${f.m} format.`,
      suggestedMode: f.m,
      viralScore: 55 + Math.floor(rand() * 45),
    }));
  },
};
