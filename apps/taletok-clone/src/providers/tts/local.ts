import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TtsProvider, TtsRequest, TtsResult, VoiceOption, WordTiming } from '../types';
import { ensureDir, storagePath } from '@/lib/storage';
import { ffprobeDuration } from '@/pipeline/ffmpeg';
import { estimateTiming } from './timing';
import { stubTts, STUB_VOICES } from './stub';

/**
 * Local text-to-speech. Real spoken audio with no API key and no network.
 *
 * Two engines, tried in order:
 *   1. Piper  — small neural TTS, genuinely natural. Needs a voice model on
 *               disk (`npm run fetch-voices`).
 *   2. espeak-ng — formant synthesis. Robotic, but it ships complete with no
 *               model download, so it always works offline.
 *
 * Neither engine reports word timestamps, so the estimator still produces the
 * caption timings and they are rescaled onto the real audio duration once the
 * file exists. That keeps karaoke captions locked to the actual speech.
 */

export const VOICE_DIR = process.env.PIPER_VOICE_DIR || storagePath('voices');

type Engine = 'piper' | 'espeak' | null;
let cachedEngine: Engine | undefined;
let cachedModels: string[] | null = null;

function run(bin: string, args: string[], stdin?: string, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);

    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not launch ${bin}: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`));
    });

    // Text goes over stdin, never as an argument: narration contains quotes and
    // apostrophes that would otherwise need shell-safe escaping.
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** Voice models present on disk, newest listing cached for the process. */
export async function availableModels(): Promise<string[]> {
  if (cachedModels) return cachedModels;
  try {
    const entries = await fs.readdir(VOICE_DIR);
    cachedModels = entries.filter((f) => f.endsWith('.onnx')).sort();
  } catch {
    cachedModels = [];
  }
  return cachedModels;
}

async function binaryWorks(bin: string, args: string[]): Promise<boolean> {
  try {
    await run(bin, args, undefined, 20_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the best engine available. Probed once per process, since both checks
 * spawn a subprocess.
 */
export async function detectEngine(): Promise<Engine> {
  if (cachedEngine !== undefined) return cachedEngine;

  if ((await availableModels()).length > 0) {
    // The apt package named "piper" is a gaming-mouse tool that shadows the
    // TTS binary, so the Python module is invoked explicitly instead.
    if (await binaryWorks('python3', ['-m', 'piper', '--help'])) {
      cachedEngine = 'piper';
      return cachedEngine;
    }
  }

  if (await binaryWorks('espeak-ng', ['--version'])) {
    cachedEngine = 'espeak';
    return cachedEngine;
  }

  cachedEngine = null;
  return cachedEngine;
}

/** Resets the cached probe — used by tests and after fetching new voices. */
export function resetDetection(): void {
  cachedEngine = undefined;
  cachedModels = null;
}

/** Maps the workspace voice roster onto whichever models are on disk. */
export async function resolveModel(voiceExternalId: string): Promise<string | null> {
  const models = await availableModels();
  if (!models.length) return null;

  const voice = STUB_VOICES.find((v) => v.externalId === voiceExternalId);
  const wantsMale = voice?.gender === 'male';
  const wantsUk = voice?.accent === 'uk';

  const score = (file: string): number => {
    const name = file.toLowerCase();
    let points = 0;
    if (wantsUk && name.includes('-gb-')) points += 2;
    if (!wantsUk && name.includes('-us-')) points += 2;
    // The bundled models are named after their speaker, so gender is matched
    // by known speaker name rather than anything in the filename itself.
    const male = /alan|ryan|joe|danny|kusal/.test(name);
    if (male === wantsMale) points += 1;
    return points;
  };

  const best = [...models].sort((a, b) => score(b) - score(a))[0];
  return path.join(VOICE_DIR, best);
}

/** espeak-ng voice code for a roster entry. */
function espeakVoice(voiceExternalId: string): string {
  const voice = STUB_VOICES.find((v) => v.externalId === voiceExternalId);
  if (voice?.accent === 'uk') return voice.gender === 'male' ? 'en-gb' : 'en-gb-x-rp';
  if (voice?.accent === 'au') return 'en-gb-x-rp';
  return voice?.gender === 'male' ? 'en-us' : 'en-us';
}

/** Rescales estimated word timings onto the real audio duration. */
function rescale(words: WordTiming[], fromMs: number, toMs: number): WordTiming[] {
  if (!fromMs || !toMs || fromMs === toMs) return words;
  const factor = toMs / fromMs;
  return words.map((w) => ({
    word: w.word,
    startMs: Math.round(w.startMs * factor),
    endMs: Math.round(w.endMs * factor),
  }));
}

export const localTts: TtsProvider = {
  info: {
    id: 'local',
    name: 'Local speech (Piper / espeak-ng)',
    kind: 'tts',
    available: true, // probed properly at call time
    placeholder: false,
    note: 'Real spoken audio, generated on this machine. No API key.',
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const engine = await detectEngine();
    if (!engine) return stubTts.synthesize(req);

    const outPath = req.outPath.replace(/\.[^.]+$/, '.wav');
    await ensureDir(path.dirname(storagePath(outPath)));
    const absOut = storagePath(outPath);
    const speed = req.speed ?? 1;

    try {
      if (engine === 'piper') {
        const model = await resolveModel(req.voiceExternalId);
        if (!model) throw new Error('No Piper voice model on disk');
        await run('python3', [
          '-m', 'piper',
          '--model', model,
          '--output_file', absOut,
          // length_scale is duration per phoneme, so it is the inverse of rate.
          '--length_scale', (1 / speed).toFixed(3),
        ], req.text);
      } else {
        await run('espeak-ng', [
          '-v', espeakVoice(req.voiceExternalId),
          '-s', String(Math.round(165 * speed)),
          '-w', absOut,
        ], req.text);
      }

      const estimate = estimateTiming(req.text, speed);
      const realMs = (await ffprobeDuration(outPath)) ?? estimate.durationMs;
      if (!realMs) throw new Error('Synthesised file had no duration');

      return {
        audioPath: outPath,
        durationMs: realMs,
        words: rescale(estimate.words, estimate.durationMs, realMs),
        sampleRate: engine === 'piper' ? 16000 : 22050,
      };
    } catch (error) {
      console.warn('[tts] local synthesis failed, using silent track:', (error as Error).message);
      return stubTts.synthesize(req);
    }
  },

  async listVoices(): Promise<VoiceOption[]> {
    return STUB_VOICES;
  },
};
