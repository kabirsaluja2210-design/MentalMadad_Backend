import { promises as fs } from 'node:fs';
import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { encodePng, hashString } from '@/lib/media-encode';
import { ensureDir, storagePath, writeFile } from '@/lib/storage';
import { encodeFrameSequence } from '@/pipeline/ffmpeg';
import { clampPixel, dimensionsFor, painterFor, paletteFor, seededRandom } from '../visual/painters';

/**
 * Procedural motion clips.
 *
 * Renders a PNG sequence from the time-aware painters and encodes it to a
 * silent H.264 clip — a real moving video, not a still with a camera move.
 *
 * Two things keep this fast enough to sit in the render path:
 *  - frames are generated at a fraction of playback resolution and rate, then
 *    scaled and interpolated up by ffmpeg (abstract gradients upscale well);
 *  - the painters are periodic in `t`, so a long scene reuses a short seamless
 *    loop rather than generating every frame.
 */

/** Generation resolution as a fraction of the placeholder frame size. */
const RENDER_SCALE = 0.6;
/** Frames generated per second of clip; ffmpeg interpolates up from here. */
const SOURCE_FPS = 12;
/** Longest clip generated; longer scenes loop it. */
const MAX_CLIP_SECONDS = 4;

export const stubVideo: VideoProvider = {
  info: {
    id: 'stub',
    name: 'Procedural motion clips',
    kind: 'video',
    available: true,
    placeholder: true,
    note: 'Generated animated clips with real movement. Set VIDEO_PROVIDER + a key for model-generated video.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    const out = dimensionsFor(req.aspect);
    const gen = dimensionsFor(req.aspect, RENDER_SCALE);

    const seed = req.seed || hashString(req.prompt);
    const palette = paletteFor(seed, req.style || 'illustrated');
    const paint = painterFor(req.style || 'illustrated');
    const rand = seededRandom(seed);

    const clipSeconds = Math.min(MAX_CLIP_SECONDS, Math.max(1, req.durationMs / 1000));
    const frameCount = Math.max(2, Math.round(clipSeconds * SOURCE_FPS));

    // Frames live in their own directory so the encoder can glob them by index.
    const frameDir = `${req.outPath.replace(/\.[^.]+$/, '')}-frames`;
    await ensureDir(frameDir);

    try {
      for (let i = 0; i < frameCount; i++) {
        // t spans [0, 1) so the last frame joins back to the first cleanly.
        const t = i / frameCount;
        const png = encodePng(gen.width, gen.height, (x, y) =>
          clampPixel(paint({ x, y, w: gen.width, h: gen.height, t, palette, rand })),
        );
        await writeFile(
          `${frameDir}/frame-${String(i + 1).padStart(5, '0')}.png`,
          png,
        );
      }

      await encodeFrameSequence({
        frameDir,
        sourceFps: SOURCE_FPS,
        outPath: req.outPath,
        width: out.width,
        height: out.height,
      });
    } finally {
      // The sequence is large and never read again once encoded.
      await fs.rm(storagePath(frameDir), { recursive: true, force: true }).catch(() => {});
    }

    return {
      clipPath: req.outPath,
      width: out.width,
      height: out.height,
      durationMs: Math.round(clipSeconds * 1000),
      /** Painters are periodic, so the clip can be looped without a seam. */
      seamless: true,
    };
  },
};
