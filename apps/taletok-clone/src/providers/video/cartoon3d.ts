import { promises as fs } from 'node:fs';
import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { encodePng, hashString } from '@/lib/media-encode';
import { ensureDir, storagePath, writeFile } from '@/lib/storage';
import { encodeFrameSequence } from '@/pipeline/ffmpeg';
import { clampPixel, dimensionsFor } from '../visual/painters';
import { Renderer } from '../visual/three/raster';
import { buildScene, frameObjects } from '../visual/three/scenes';

/**
 * 3D cartoon animation, rendered in-process.
 *
 * Builds a procedural 3D set from the beat's visual prompt and renders it with
 * the software rasterizer using cel shading and cartoon outlines — real
 * geometry, lighting and camera motion, not a filtered still.
 *
 * Cost is the constraint: a rasterized frame is far more work than a gradient,
 * so frames are rendered small and interpolated up, the scene's static geometry
 * is built once and shared across every frame, and the camera path returns to
 * where it started so a short clip loops instead of covering the whole scene.
 */

/** 3D renders at a lower fraction than the gradient painters — it costs more. */
const RENDER_SCALE = 0.42;
const SOURCE_FPS = 12;
const MAX_CLIP_SECONDS = 4;

export const cartoon3dVideo: VideoProvider = {
  info: {
    id: 'cartoon3d',
    name: '3D cartoon renderer',
    kind: 'video',
    available: true,
    // Real 3D animation, but procedural sets rather than model-generated film.
    placeholder: true,
    note: 'In-process 3D toon renderer — cel shading, outlines, animated camera. No API key needed.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    const out = dimensionsFor(req.aspect);
    const gen = dimensionsFor(req.aspect, RENDER_SCALE);

    const seed = req.seed || hashString(req.prompt);
    const spec = buildScene(req.prompt, seed);
    const renderer = new Renderer(gen.width, gen.height);

    const clipSeconds = Math.min(MAX_CLIP_SECONDS, Math.max(1, req.durationMs / 1000));
    const frameCount = Math.max(2, Math.round(clipSeconds * SOURCE_FPS));

    const frameDir = `${req.outPath.replace(/\.[^.]+$/, '')}-frames`;
    await ensureDir(frameDir);

    try {
      for (let i = 0; i < frameCount; i++) {
        // t spans [0, 1) so the camera path closes back on itself.
        const t = i / frameCount;
        const sample = renderer.render(frameObjects(spec, t), spec.camera(t), spec.options);

        const png = encodePng(gen.width, gen.height, (x, y) => clampPixel(sample(x, y)));
        await writeFile(`${frameDir}/frame-${String(i + 1).padStart(5, '0')}.png`, png);
      }

      await encodeFrameSequence({
        frameDir,
        sourceFps: SOURCE_FPS,
        outPath: req.outPath,
        width: out.width,
        height: out.height,
      });
    } finally {
      await fs.rm(storagePath(frameDir), { recursive: true, force: true }).catch(() => {});
    }

    return {
      clipPath: req.outPath,
      width: out.width,
      height: out.height,
      durationMs: Math.round(clipSeconds * 1000),
      // Camera and animation cycles both complete over t, so looping is clean.
      seamless: true,
    };
  },
};
