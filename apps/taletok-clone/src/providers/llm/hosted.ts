import type { IdeaSuggestion, LlmProvider, ScriptBeat, ScriptRequest, ScriptResult } from '../types';
import { resolveOptions, getMode } from '@/pipeline/modes';
import { hashtagsFor, wordsForDuration } from './text';
import { stubLlm } from './stub';

/**
 * Hosted script writers (Anthropic / OpenAI).
 *
 * Both speak the same interface as the stub, so turning one on is purely a
 * matter of setting a key. If a call fails at runtime we fall back to the
 * offline planner rather than failing the render — a placeholder script is a
 * better outcome for the user than a dead job.
 */

interface HostedConfig {
  id: 'anthropic' | 'openai';
  name: string;
  apiKey: string | undefined;
  endpoint: string;
  model: string;
}

function buildPrompt(req: ScriptRequest, options: Record<string, unknown>): string {
  const mode = getMode(req.mode);
  const beatCount = Math.max(2, Math.round(req.targetDurationSec / mode.secondsPerBeat));
  const wordBudget = wordsForDuration(req.targetDurationSec);

  return [
    `Write a short-form video script in the "${mode.name}" format.`,
    `Format brief: ${mode.description}`,
    `Topic: ${req.topic}`,
    req.sourceText ? `Source material to adapt:\n"""\n${req.sourceText.slice(0, 6000)}\n"""` : '',
    `Target length: ${req.targetDurationSec}s (~${wordBudget} words of narration).`,
    `Split the narration into exactly ${beatCount} beats.`,
    `Tone: ${options.tone ?? 'natural'}.`,
    '',
    'Return strict JSON with this shape and nothing else:',
    '{"title":string,"hook":string,"cta":string,"beats":[{"text":string,"visualPrompt":string}]}',
    'The hook is the first line of narration and must earn the next two seconds.',
    'Each visualPrompt describes one still image for that beat.',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseScriptJson(raw: string): { title: string; hook: string; cta: string; beats: ScriptBeat[] } | null {
  // Models often wrap JSON in prose or a fenced block; take the outermost object.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.beats) || !parsed.beats.length) return null;
    return {
      title: String(parsed.title ?? ''),
      hook: String(parsed.hook ?? ''),
      cta: String(parsed.cta ?? ''),
      beats: parsed.beats.map((b: { text?: unknown; visualPrompt?: unknown }) => ({
        text: String(b.text ?? ''),
        visualPrompt: String(b.visualPrompt ?? ''),
      })).filter((b: ScriptBeat) => b.text.trim()),
    };
  } catch {
    return null;
  }
}

async function callModel(cfg: HostedConfig, prompt: string): Promise<string> {
  const isAnthropic = cfg.id === 'anthropic';

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (isAnthropic) {
    headers['x-api-key'] = cfg.apiKey!;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.authorization = `Bearer ${cfg.apiKey}`;
  }

  const body = isAnthropic
    ? { model: cfg.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }
    : { model: cfg.model, messages: [{ role: 'user', content: prompt }] };

  const res = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${cfg.name} responded ${res.status}: ${await res.text()}`);

  const json = await res.json();
  return isAnthropic
    ? (json.content?.[0]?.text ?? '')
    : (json.choices?.[0]?.message?.content ?? '');
}

function makeHostedLlm(cfg: HostedConfig): LlmProvider {
  return {
    info: {
      id: cfg.id,
      name: cfg.name,
      kind: 'llm',
      available: Boolean(cfg.apiKey),
      placeholder: false,
      note: cfg.apiKey ? `Using ${cfg.model}.` : 'No API key set.',
    },

    async writeScript(req: ScriptRequest): Promise<ScriptResult> {
      const options = resolveOptions(req.mode, (req as { options?: Record<string, unknown> }).options);
      try {
        const raw = await callModel(cfg, buildPrompt(req, options));
        const parsed = parseScriptJson(raw);
        if (!parsed) throw new Error('Model did not return usable JSON');

        const scriptLines = [parsed.hook, ...parsed.beats.map((b) => b.text)];
        if (parsed.cta) scriptLines.push(parsed.cta);

        return {
          title: parsed.title || req.topic,
          hook: parsed.hook,
          cta: parsed.cta,
          script: scriptLines.filter(Boolean).join('\n'),
          beats: parsed.beats,
          hashtags: hashtagsFor(req.topic, req.mode),
        };
      } catch {
        return stubLlm.writeScript(req);
      }
    },

    async rewriteBeat(req, beat, instruction) {
      try {
        const raw = await callModel(
          cfg,
          [
            `Rewrite one beat of a ${req.mode} short-form video script about "${req.topic}".`,
            `Current beat: "${beat.text}"`,
            instruction ? `Direction: ${instruction}` : 'Make it punchier without changing meaning.',
            'Return strict JSON: {"text":string,"visualPrompt":string}',
          ].join('\n'),
        );
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('no json');
        const parsed = JSON.parse(match[0]);
        return {
          text: String(parsed.text ?? beat.text),
          visualPrompt: String(parsed.visualPrompt ?? beat.visualPrompt),
          motion: beat.motion,
        };
      } catch {
        return stubLlm.rewriteBeat(req, beat, instruction);
      }
    },

    async suggestIdeas(topic: string, count: number): Promise<IdeaSuggestion[]> {
      try {
        const raw = await callModel(
          cfg,
          [
            `Suggest ${count} short-form video ideas about "${topic}".`,
            'Return strict JSON: {"ideas":[{"title":string,"body":string,"suggestedMode":string,"viralScore":number}]}',
            'suggestedMode must be one of: reddit-story, cinematic-short, ai-short, timelapse,',
            'long-form-story, quiz, listicle, text-message-story, motivational.',
            'viralScore is 0-100.',
          ].join('\n'),
        );
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('no json');
        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed.ideas)) throw new Error('no ideas');
        return parsed.ideas.slice(0, count);
      } catch {
        return stubLlm.suggestIdeas(topic, count);
      }
    },
  };
}

export const anthropicLlm = makeHostedLlm({
  id: 'anthropic',
  name: 'Anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
});

export const openaiLlm = makeHostedLlm({
  id: 'openai',
  name: 'OpenAI',
  apiKey: process.env.OPENAI_API_KEY,
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
});
