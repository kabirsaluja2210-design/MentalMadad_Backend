import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { hashString, seededRandom, type RgbPixel } from '@/lib/media-encode';
import { ensureDir, storagePath, writeFile } from '@/lib/storage';
import { encodeFrameSequence } from '@/pipeline/ffmpeg';
import { dimensionsFor } from '../visual/painters';
import { chooseSceneKind } from '../visual/three/scenes';
import { proceduralVideo } from './procedural';

/**
 * Blender renderer.
 *
 * Shells out to a headless Blender, which builds the scene procedurally from a
 * JSON spec (see `blender/build_scene.py`) and renders a PNG sequence that is
 * then encoded like any other clip. This buys real path-traced lighting: soft
 * shadows, ambient occlusion, depth of field and proper metallic/roughness
 * materials — none of which the in-process rasterizer can produce.
 *
 * The cost is time. Cycles on CPU is roughly two orders of magnitude slower
 * than the rasterizer, so this is opt-in per video rather than a default, and
 * the defaults below trade resolution and sample count for a usable wall clock.
 * Any failure falls back to the procedural renderer rather than killing a job.
 */

const BLENDER = process.env.BLENDER_PATH || 'blender';

/**
 * Quality tiers.
 *
 * Only these three numbers meaningfully drive render time. The material and
 * lighting detail in the scene script is shared by every tier because shading
 * complexity costs almost nothing next to resolution, sample count and frame
 * count -- measured at 6.3s/frame with the full detail treatment against
 * 6.9s/frame without it.
 */
const QUALITY_TIERS: Record<string, { scale: number; samples: number; fps: number }> = {
  draft: { scale: 0.45, samples: 24, fps: 8 },
  standard: { scale: 0.62, samples: 48, fps: 8 },
  high: { scale: 0.8, samples: 96, fps: 10 },
  max: { scale: 1.0, samples: 160, fps: 12 },
};

const QUALITY = process.env.BLENDER_QUALITY || 'standard';
const TIER = QUALITY_TIERS[QUALITY] ?? QUALITY_TIERS.standard;

/** Render fraction of the placeholder frame size; ffmpeg scales up. */
const RENDER_SCALE = Number(process.env.BLENDER_SCALE || TIER.scale);
const SOURCE_FPS = Number(process.env.BLENDER_FPS || TIER.fps);
const SAMPLES = Number(process.env.BLENDER_SAMPLES || TIER.samples);
const MAX_CLIP_SECONDS = Number(process.env.BLENDER_CLIP_SECONDS || 3);
const TIMEOUT_MS = Number(process.env.BLENDER_TIMEOUT_MS || 20 * 60_000);

const SCRIPT = path.join(process.cwd(), 'src/providers/video/blender/build_scene.py');

let cachedAvailability: boolean | null = null;

/** True when a usable Blender binary is on PATH. Probed once per process. */
export async function blenderAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  cachedAvailability = await new Promise<boolean>((resolve) => {
    const child = spawn(BLENDER, ['--version'], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 20_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
  return cachedAvailability;
}

/** Blender works in linear colour; the palettes are 0-255 sRGB. */
function srgbToLinear(channel: number): number {
  const c = Math.max(0, Math.min(1, channel / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toLinear(pixel: RgbPixel): [number, number, number] {
  return [srgbToLinear(pixel[0]), srgbToLinear(pixel[1]), srgbToLinear(pixel[2])];
}

function hsl(h: number, s: number, l: number): RgbPixel {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const rgb: [number, number, number] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/** Palette in the same families the rasterizer uses, converted to linear. */
function paletteFor(kind: string, seed: number) {
  const rand = seededRandom(seed);

  if (kind === 'vehicle' || kind === 'machine') {
    const heroHue = [12, 210, 32, 348][Math.floor(rand() * 4)];
    return {
      sky_top: toLinear(hsl(205, 0.28, 0.66)),
      sky_bottom: toLinear(hsl(200, 0.14, 0.86)),
      ground: toLinear(hsl(215, 0.04, 0.2)),
      primary: toLinear(hsl(heroHue, 0.66, 0.46)),
    };
  }

  const groundHue = 96 + rand() * 24;
  return {
    sky_top: toLinear(hsl(207, 0.55, 0.6)),
    sky_bottom: toLinear(hsl(196, 0.4, 0.85)),
    ground: toLinear(hsl(groundHue, 0.35, 0.34)),
    primary: toLinear(hsl(groundHue + 6, 0.4, 0.3)),
  };
}

function runBlender(specPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      BLENDER,
      ['--background', '--python', SCRIPT, '--', specPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Blender timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    // Blender is extremely chatty on stdout; only the tail of stderr is useful.
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not launch Blender: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Blender exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

export const blenderVideo: VideoProvider = {
  info: {
    id: 'blender',
    name: 'Blender (Cycles)',
    kind: 'video',
    available: true, // probed properly at call time
    placeholder: false,
    note: `Path-traced 3D: clearcoat paint, cavity grime, three-point lighting and a physical sky. Free and local. Quality tier: ${QUALITY}.`,
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    if (!(await blenderAvailable())) return proceduralVideo.generate(req);

    const out = dimensionsFor(req.aspect);
    const gen = dimensionsFor(req.aspect, RENDER_SCALE);
    const seed = req.seed || hashString(req.prompt);

    const clipSeconds = Math.min(MAX_CLIP_SECONDS, Math.max(1, req.durationMs / 1000));
    const frames = Math.max(2, Math.round(clipSeconds * SOURCE_FPS));

    const frameDir = `${req.outPath.replace(/\.[^.]+$/, '')}-blender`;
    const absFrameDir = await ensureDir(frameDir);
    const specPath = path.join(absFrameDir, 'spec.json');

    const kind = chooseSceneKind(req.prompt, seed);

    try {
      await writeFile(
        `${frameDir}/spec.json`,
        JSON.stringify({
          kind,
          seed,
          width: gen.width,
          height: gen.height,
          frames,
          fov: 0.9,
          samples: SAMPLES,
          quality: QUALITY,
          shot: req.shot || 'auto',
          // Distribution builds are often compiled without OpenImageDenoise;
          // the script probes for it and falls back to raw samples.
          denoise: true,
          sweep: 0.5,
          push: 0.14,
          start_angle: 0.7,
          fstop: 3.4,
          out_dir: absFrameDir,
          palette: paletteFor(kind, seed),
        }, null, 2),
      );

      await runBlender(specPath);

      // Blender names frames frame-0001.png; the encoder expects 5 digits.
      const written = (await fs.readdir(absFrameDir)).filter((f) => f.endsWith('.png')).sort();
      if (!written.length) throw new Error('Blender produced no frames');
      for (let i = 0; i < written.length; i++) {
        await fs.rename(
          path.join(absFrameDir, written[i]),
          path.join(absFrameDir, `frame-${String(i + 1).padStart(5, '0')}.png`),
        );
      }

      await encodeFrameSequence({
        frameDir,
        sourceFps: SOURCE_FPS,
        outPath: req.outPath,
        width: out.width,
        height: out.height,
      });

      return {
        clipPath: req.outPath,
        width: out.width,
        height: out.height,
        durationMs: Math.round(clipSeconds * 1000),
        seamless: true,
      };
    } catch (error) {
      console.warn('[blender] falling back to procedural renderer:', (error as Error).message);
      return proceduralVideo.generate(req);
    } finally {
      await fs.rm(absFrameDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
