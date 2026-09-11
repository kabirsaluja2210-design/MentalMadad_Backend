import type { TtsProvider, TtsRequest, TtsResult, VoiceOption } from '../types';
import { encodeWav } from '@/lib/media-encode';
import { writeFile } from '@/lib/storage';
import { estimateTiming } from './timing';

const SAMPLE_RATE = 24000;

/**
 * Offline voiceover.
 *
 * Emits a real, correctly-sized WAV whose duration matches the estimated
 * narration timing, plus word-level timings so captions, scene lengths and the
 * final cut are all genuinely in sync. The audio itself is silent — this is a
 * placeholder track, not synthesised speech — so the edit is fully reviewable
 * before any paid TTS is wired in.
 */
export const stubTts: TtsProvider = {
  info: {
    id: 'stub',
    name: 'Silent placeholder track',
    kind: 'tts',
    available: true,
    placeholder: true,
    note: 'Correct-length silent audio with real word timings. Set ELEVENLABS_API_KEY or OPENAI_API_KEY for spoken audio.',
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const { words, durationMs } = estimateTiming(req.text, req.speed ?? 1);
    const wav = encodeWav(durationMs, SAMPLE_RATE, () => 0);
    await writeFile(req.outPath, wav);

    return { audioPath: req.outPath, durationMs, words, sampleRate: SAMPLE_RATE };
  },

  async listVoices(): Promise<VoiceOption[]> {
    return STUB_VOICES;
  },
};

/** The built-in voice roster. Mirrors the shape of a hosted provider's list. */
export const STUB_VOICES: VoiceOption[] = [
  { externalId: 'nova-f-us', name: 'Nova', gender: 'female', accent: 'us', style: 'narration', premium: false },
  { externalId: 'atlas-m-us', name: 'Atlas', gender: 'male', accent: 'us', style: 'narration', premium: false },
  { externalId: 'ember-f-us', name: 'Ember', gender: 'female', accent: 'us', style: 'energetic', premium: false },
  { externalId: 'slate-m-uk', name: 'Slate', gender: 'male', accent: 'uk', style: 'documentary', premium: false },
  { externalId: 'onyx-m-us', name: 'Onyx', gender: 'male', accent: 'us', style: 'dramatic', premium: true },
  { externalId: 'harbor-f-uk', name: 'Harbor', gender: 'female', accent: 'uk', style: 'calm', premium: true },
  { externalId: 'quill-n-us', name: 'Quill', gender: 'neutral', accent: 'us', style: 'narration', premium: false },
  { externalId: 'moss-f-au', name: 'Moss', gender: 'female', accent: 'au', style: 'asmr', premium: true },
];
