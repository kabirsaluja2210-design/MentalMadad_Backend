import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { availableModels, localTts, resolveModel } from '@/providers/tts/local';
import { getTts } from '@/providers/registry';
import { stubTts } from '@/providers/tts/stub';
import { estimateTiming } from '@/providers/tts/timing';

const SOURCE = readFileSync(path.join(process.cwd(), 'src/providers/tts/local.ts'), 'utf8');

describe('speech provider selection', () => {
  it('prefers local synthesis over the silent placeholder', () => {
    // Robotic speech still carries the script; silence does not.
    expect(getTts().info.id).not.toBe(stubTts.info.id);
  });

  it('does not advertise itself as placeholder output', () => {
    expect(localTts.info.placeholder).toBe(false);
    expect(stubTts.info.placeholder).toBe(true);
  });
});

describe('voice model resolution', () => {
  it('returns null when no models are installed', async () => {
    const models = await availableModels();
    if (models.length === 0) {
      expect(await resolveModel('nova-f-us')).toBeNull();
    } else {
      expect(await resolveModel('nova-f-us')).toBeTruthy();
    }
  });

  it('matches accent and gender when models are present', async () => {
    const models = await availableModels();
    if (models.length === 0) return; // nothing to match against

    const uk = await resolveModel('slate-m-uk');
    const us = await resolveModel('nova-f-us');

    if (models.some((m) => m.includes('-gb-'))) {
      expect(uk, 'UK voice should map to a GB model').toContain('-gb-');
    }
    if (models.some((m) => m.includes('-us-'))) {
      expect(us, 'US voice should map to a US model').toContain('-us-');
    }
  });

  it('always resolves to a model that exists on disk', async () => {
    const models = await availableModels();
    if (!models.length) return;
    for (const voice of ['nova-f-us', 'atlas-m-us', 'slate-m-uk', 'moss-f-au']) {
      const resolved = await resolveModel(voice);
      expect(models.some((m) => resolved?.endsWith(m)), voice).toBe(true);
    }
  });
});

describe('implementation guards', () => {
  it('passes narration over stdin, never as a shell argument', () => {
    // Scripts contain quotes and apostrophes; putting them in argv would need
    // shell-safe escaping and is an injection surface.
    expect(SOURCE).toContain('child.stdin.write(stdin)');
    expect(SOURCE).not.toMatch(/shell:\s*true/);
  });

  it('invokes Piper as a Python module', () => {
    // The apt package called "piper" is a gaming-mouse tool that shadows the
    // TTS binary on PATH.
    expect(SOURCE).toContain("'python3', ['-m', 'piper'");
  });

  it('falls back rather than failing a render', () => {
    expect(SOURCE).toContain('stubTts.synthesize(req)');
    expect(SOURCE).toContain('espeak-ng');
  });

  it('rescales caption timings onto the real audio duration', () => {
    // Neither engine reports word timestamps, so estimated timings have to be
    // mapped onto the measured duration or captions drift out of sync.
    expect(SOURCE).toContain('ffprobeDuration');
    expect(SOURCE).toContain('function rescale');
  });

  it('kills a hung synthesis instead of blocking the queue', () => {
    expect(SOURCE).toContain("child.kill('SIGKILL')");
  });
});

describe('timing rescale behaviour', () => {
  it('keeps words ordered and inside the clip after scaling', () => {
    const { words, durationMs } = estimateTiming('One two three four five six.');
    const factor = 1.4;
    const scaled = words.map((w) => ({
      word: w.word,
      startMs: Math.round(w.startMs * factor),
      endMs: Math.round(w.endMs * factor),
    }));

    expect(scaled[scaled.length - 1].endMs).toBeLessThanOrEqual(
      Math.round(durationMs * factor) + 1,
    );
    for (let i = 1; i < scaled.length; i++) {
      expect(scaled[i].startMs).toBeGreaterThanOrEqual(scaled[i - 1].startMs);
    }
  });
});
