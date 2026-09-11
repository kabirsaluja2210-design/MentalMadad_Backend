import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anthropicLlm, geminiLlm, openaiLlm } from '@/providers/llm/hosted';
import { getLlm } from '@/providers/registry';
import { stubLlm } from '@/providers/llm/stub';
import { isMode } from '@/pipeline/modes';

const SOURCE = readFileSync(path.join(process.cwd(), 'src/providers/llm/hosted.ts'), 'utf8');

describe('Gemini request shape', () => {
  // Gemini's native API is not OpenAI-compatible. These guard the four
  // differences that make a key alone insufficient.

  it('puts the model in the URL path', () => {
    expect(SOURCE).toContain('/v1beta/models/{model}:generateContent');
    expect(SOURCE).toContain("replace('{model}'");
  });

  it('authenticates with the Google header, not a bearer token', () => {
    expect(SOURCE).toContain("'x-goog-api-key': key");
  });

  it('nests the prompt under contents/parts rather than messages', () => {
    expect(SOURCE).toContain('contents: [{ parts: [{ text: prompt }] }]');
  });

  it('joins every response part instead of taking the first', () => {
    // Long responses arrive split across several parts; taking parts[0] would
    // silently truncate the script.
    expect(SOURCE).toMatch(/parts \?\? \[\]\)\.map\(\(p\) => p\.text \?\? ''\)\.join\(''\)/);
  });

  it('url-encodes the model name', () => {
    expect(SOURCE).toContain('encodeURIComponent(cfg.model)');
  });
});

describe('provider shapes stay distinct', () => {
  it('gives each vendor its own id and name', () => {
    const ids = [anthropicLlm, openaiLlm, geminiLlm].map((p) => p.info.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('gemini');
  });

  it('keeps all three on the llm kind', () => {
    for (const provider of [anthropicLlm, openaiLlm, geminiLlm]) {
      expect(provider.info.kind, provider.info.id).toBe('llm');
      expect(provider.info.placeholder, provider.info.id).toBe(false);
    }
  });

  it('reports availability from its own credentials', () => {
    expect(geminiLlm.info.available).toBe(
      Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    );
  });
});

describe('behaviour without a key', () => {
  it('falls back to the template engine rather than the hosted model', () => {
    if (!geminiLlm.info.available && !anthropicLlm.info.available && !openaiLlm.info.available) {
      expect(getLlm().info.id).toBe(stubLlm.info.id);
    }
  });

  it('still returns a usable script instead of throwing', async () => {
    // A dead vendor must never kill a render; a template script beats a failed job.
    const script = await geminiLlm.writeScript({
      mode: 'short-documentary', topic: 'a pressure relief valve', targetDurationSec: 30,
    });
    expect(script.beats.length).toBeGreaterThan(3);
    expect(script.hook.trim()).not.toBe('');
  });

  it('still returns usable ideas', async () => {
    const ideas = await geminiLlm.suggestIdeas('hydraulics', 4);
    expect(ideas).toHaveLength(4);
    for (const idea of ideas) expect(isMode(idea.suggestedMode)).toBe(true);
  });

  it('still rewrites a beat', async () => {
    const beat = await geminiLlm.rewriteBeat(
      { mode: 'ai-short', topic: 'valves', targetDurationSec: 30 },
      { text: 'original line', visualPrompt: 'a valve' },
      'make it punchier',
    );
    expect(beat.text.trim()).not.toBe('');
  });
});

describe('response parsing', () => {
  it('tolerates prose or fences around the JSON', () => {
    // Models routinely wrap JSON in explanation or a code fence.
    expect(SOURCE).toContain('match(/\\{[\\s\\S]*\\}/)');
  });

  it('falls back when the model returns unusable JSON', () => {
    expect(SOURCE).toContain('stubLlm.writeScript(req)');
  });
});
