import type {
  ImageProvider, LlmProvider, MusicProvider, ProviderInfo, TtsProvider, VideoProvider,
} from './types';
import { stubLlm } from './llm/stub';
import { anthropicLlm, openaiLlm } from './llm/hosted';
import { stubTts } from './tts/stub';
import { elevenLabsTts, openaiTts } from './tts/hosted';
import { stubImage } from './image/stub';
import { openaiImage, replicateImage } from './image/hosted';
import { stubVideo } from './video/stub';
import { cartoon3dVideo } from './video/cartoon3d';
import { proceduralVideo } from './video/procedural';
import { lumaVideo, replicateVideo } from './video/hosted';
import { blenderVideo } from './video/blender';
import { stubMusic } from './music/stub';
import { SOCIAL_PLATFORMS, socialProviders } from './social';

/**
 * Provider selection.
 *
 * Resolution order per stage:
 *   1. an explicit *_PROVIDER env var, if that provider has credentials
 *   2. the first hosted provider that does have credentials
 *   3. the built-in stub
 *
 * Stage selection is independent — running model-written scripts against
 * placeholder visuals is a normal, supported configuration.
 */

function pick<T extends { info: ProviderInfo }>(
  requested: string | undefined,
  hosted: T[],
  stub: T,
): T {
  if (requested) {
    const match = hosted.find((p) => p.info.id === requested && p.info.available);
    if (match) return match;
  }
  return hosted.find((p) => p.info.available) ?? stub;
}

export function getLlm(): LlmProvider {
  return pick(process.env.LLM_PROVIDER, [anthropicLlm, openaiLlm], stubLlm);
}

export function getTts(): TtsProvider {
  return pick(process.env.TTS_PROVIDER, [elevenLabsTts, openaiTts], stubTts);
}

export function getImage(): ImageProvider {
  return pick(process.env.IMAGE_PROVIDER, [openaiImage, replicateImage], stubImage);
}

/**
 * Video renderer selection.
 *
 * A configured hosted model always wins -- if someone has paid for one, that is
 * what they want used. Otherwise the per-video preference chooses between the
 * in-process rasterizer (seconds per clip) and Blender (minutes per clip).
 * 'auto' means fast, so nobody is surprised by a twenty-minute render they did
 * not ask for; set VIDEO_RENDERER=blender to flip that default.
 */
export function getVideo(renderer = 'auto'): VideoProvider {
  const hosted = pick(process.env.VIDEO_PROVIDER, [replicateVideo, lumaVideo], proceduralVideo);
  if (hosted !== proceduralVideo) return hosted;

  const preference = renderer === 'auto' ? (process.env.VIDEO_RENDERER || 'fast') : renderer;
  return preference === 'blender' ? blenderVideo : proceduralVideo;
}

export function getMusic(): MusicProvider {
  return stubMusic;
}

export interface ProviderStatus {
  kind: string;
  active: ProviderInfo;
  alternatives: ProviderInfo[];
}

/** Powers the Settings > Providers screen. */
export function providerStatus(): ProviderStatus[] {
  return [
    { kind: 'llm', active: getLlm().info, alternatives: [stubLlm.info, anthropicLlm.info, openaiLlm.info] },
    { kind: 'tts', active: getTts().info, alternatives: [stubTts.info, elevenLabsTts.info, openaiTts.info] },
    { kind: 'image', active: getImage().info, alternatives: [stubImage.info, openaiImage.info, replicateImage.info] },
    { kind: 'video', active: getVideo().info, alternatives: [proceduralVideo.info, cartoon3dVideo.info, blenderVideo.info, stubVideo.info, replicateVideo.info, lumaVideo.info] },
    { kind: 'music', active: getMusic().info, alternatives: [stubMusic.info] },
    {
      kind: 'social',
      active: {
        id: SOCIAL_PLATFORMS.every((p) => !p.configured) ? 'stub' : 'mixed',
        name: SOCIAL_PLATFORMS.filter((p) => p.configured).map((p) => p.name).join(', ') || 'Simulated publishing',
        kind: 'social',
        available: true,
        placeholder: SOCIAL_PLATFORMS.every((p) => !p.configured),
        note: 'Posts are recorded locally until platform app credentials are set.',
      },
      alternatives: Object.values(socialProviders).map((p) => p.info),
    },
  ];
}

/** True when any stage is still running on placeholder output. */
export function usingPlaceholders(): boolean {
  return providerStatus().some((s) => s.active.placeholder);
}
