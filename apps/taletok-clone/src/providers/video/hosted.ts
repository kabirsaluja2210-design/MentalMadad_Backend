import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { writeFile } from '@/lib/storage';
import { ffprobeDuration } from '@/pipeline/ffmpeg';
import { dimensionsFor } from '../visual/painters';
import { stubVideo } from './stub';

/**
 * Hosted text-to-video.
 *
 * Video models are slow and expensive relative to the rest of the pipeline, so
 * these adapters poll with a generous ceiling and fall back to the procedural
 * clip on any failure rather than killing a render that is otherwise fine.
 *
 * Model output is never seamless, so `seamless: false` tells the compositor to
 * hold the last frame rather than loop when a clip is shorter than its scene.
 */

async function download(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download generated video (${res.status})`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function finish(req: VideoRequest, url: string): Promise<VideoResult> {
  await download(url, req.outPath);
  const { width, height } = dimensionsFor(req.aspect);
  return {
    clipPath: req.outPath,
    width,
    height,
    durationMs: (await ffprobeDuration(req.outPath)) ?? req.durationMs,
    seamless: false,
  };
}

export const replicateVideo: VideoProvider = {
  info: {
    id: 'replicate',
    name: 'Replicate (video)',
    kind: 'video',
    available: Boolean(process.env.REPLICATE_API_TOKEN),
    placeholder: false,
    note: process.env.REPLICATE_API_TOKEN ? 'Connected.' : 'No API token set.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return stubVideo.generate(req);

    try {
      const create = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          version: process.env.REPLICATE_VIDEO_VERSION || 'wan-video/wan-2.5-t2v-fast',
          input: {
            prompt: req.prompt,
            aspect_ratio: req.aspect,
            duration: Math.min(10, Math.max(1, Math.round(req.durationMs / 1000))),
            seed: req.seed,
          },
        }),
      });
      if (!create.ok) throw new Error(`Replicate responded ${create.status}`);

      let prediction = await create.json();

      // Poll until the prediction settles or we run out of patience.
      const deadline = Date.now() + Number(process.env.VIDEO_TIMEOUT_MS || 300_000);
      while (['starting', 'processing'].includes(prediction.status)) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for video generation');
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(prediction.urls.get, { headers: { authorization: `Bearer ${token}` } });
        if (!poll.ok) throw new Error(`Replicate poll responded ${poll.status}`);
        prediction = await poll.json();
      }

      if (prediction.status !== 'succeeded') {
        throw new Error(prediction.error || `Generation ${prediction.status}`);
      }

      const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (typeof output !== 'string') throw new Error('No video URL in response');

      return await finish(req, output);
    } catch {
      return stubVideo.generate(req);
    }
  },
};

export const lumaVideo: VideoProvider = {
  info: {
    id: 'luma',
    name: 'Luma Dream Machine',
    kind: 'video',
    available: Boolean(process.env.LUMA_API_KEY),
    placeholder: false,
    note: process.env.LUMA_API_KEY ? 'Connected.' : 'No API key set.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    const key = process.env.LUMA_API_KEY;
    if (!key) return stubVideo.generate(req);

    try {
      const create = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: req.prompt,
          aspect_ratio: req.aspect,
          model: process.env.LUMA_MODEL || 'ray-flash-2',
          loop: true,
        }),
      });
      if (!create.ok) throw new Error(`Luma responded ${create.status}`);

      let generation = await create.json();
      const deadline = Date.now() + Number(process.env.VIDEO_TIMEOUT_MS || 300_000);

      while (['queued', 'dreaming'].includes(generation.state)) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for video generation');
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(
          `https://api.lumalabs.ai/dream-machine/v1/generations/${generation.id}`,
          { headers: { authorization: `Bearer ${key}` } },
        );
        if (!poll.ok) throw new Error(`Luma poll responded ${poll.status}`);
        generation = await poll.json();
      }

      if (generation.state !== 'completed') {
        throw new Error(generation.failure_reason || `Generation ${generation.state}`);
      }

      const url = generation.assets?.video;
      if (typeof url !== 'string') throw new Error('No video URL in response');

      // Luma can loop, so a clip generated this way is safe to repeat.
      const result = await finish(req, url);
      return { ...result, seamless: true };
    } catch {
      return stubVideo.generate(req);
    }
  },
};
