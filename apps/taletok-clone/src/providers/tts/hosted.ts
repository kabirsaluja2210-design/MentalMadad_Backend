import type { TtsProvider, TtsRequest, TtsResult, VoiceOption } from '../types';
import { writeFile } from '@/lib/storage';
import { estimateTiming } from './timing';
import { stubTts, STUB_VOICES } from './stub';

/**
 * ElevenLabs / OpenAI speech adapters.
 *
 * Both return audio bytes but neither returns word timings on the basic
 * endpoints, so we keep the estimator for caption sync and scale it to the
 * real audio duration once the file is on disk.
 */

async function probeDurationMs(relPath: string): Promise<number | null> {
  // Imported lazily so the browser bundle never pulls in child_process.
  const { ffprobeDuration } = await import('@/pipeline/ffmpeg');
  return ffprobeDuration(relPath);
}

/** Rescales estimated word timings onto the true audio duration. */
function rescale(words: TtsResult['words'], fromMs: number, toMs: number): TtsResult['words'] {
  if (!fromMs || !toMs || fromMs === toMs) return words;
  const factor = toMs / fromMs;
  return words.map((w) => ({
    word: w.word,
    startMs: Math.round(w.startMs * factor),
    endMs: Math.round(w.endMs * factor),
  }));
}

export const elevenLabsTts: TtsProvider = {
  info: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    kind: 'tts',
    available: Boolean(process.env.ELEVENLABS_API_KEY),
    placeholder: false,
    note: process.env.ELEVENLABS_API_KEY ? 'Connected.' : 'No API key set.',
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return stubTts.synthesize(req);

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceExternalId)}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: req.text,
            model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );
      if (!res.ok) throw new Error(`ElevenLabs responded ${res.status}`);

      const mp3Path = req.outPath.replace(/\.wav$/, '.mp3');
      await writeFile(mp3Path, Buffer.from(await res.arrayBuffer()));

      const estimate = estimateTiming(req.text, req.speed ?? 1);
      const realMs = (await probeDurationMs(mp3Path)) ?? estimate.durationMs;

      return {
        audioPath: mp3Path,
        durationMs: realMs,
        words: rescale(estimate.words, estimate.durationMs, realMs),
        sampleRate: 44100,
      };
    } catch {
      return stubTts.synthesize(req);
    }
  },

  async listVoices(): Promise<VoiceOption[]> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return STUB_VOICES;
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      return (json.voices ?? []).map((v: Record<string, unknown>) => ({
        externalId: String(v.voice_id),
        name: String(v.name),
        gender: String((v.labels as Record<string, string>)?.gender ?? 'neutral'),
        accent: String((v.labels as Record<string, string>)?.accent ?? 'us'),
        style: String((v.labels as Record<string, string>)?.use_case ?? 'narration'),
        premium: false,
      }));
    } catch {
      return STUB_VOICES;
    }
  },
};

export const openaiTts: TtsProvider = {
  info: {
    id: 'openai',
    name: 'OpenAI Speech',
    kind: 'tts',
    available: Boolean(process.env.OPENAI_API_KEY),
    placeholder: false,
    note: process.env.OPENAI_API_KEY ? 'Connected.' : 'No API key set.',
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return stubTts.synthesize(req);

    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
          voice: req.voiceExternalId || 'alloy',
          input: req.text,
          speed: req.speed ?? 1,
          response_format: 'wav',
        }),
      });
      if (!res.ok) throw new Error(`OpenAI speech responded ${res.status}`);

      await writeFile(req.outPath, Buffer.from(await res.arrayBuffer()));

      const estimate = estimateTiming(req.text, req.speed ?? 1);
      const realMs = (await probeDurationMs(req.outPath)) ?? estimate.durationMs;

      return {
        audioPath: req.outPath,
        durationMs: realMs,
        words: rescale(estimate.words, estimate.durationMs, realMs),
        sampleRate: 24000,
      };
    } catch {
      return stubTts.synthesize(req);
    }
  },

  async listVoices(): Promise<VoiceOption[]> {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((id) => ({
      externalId: id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      gender: 'neutral',
      accent: 'us',
      style: 'narration',
      premium: false,
    }));
  },
};
