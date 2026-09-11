import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureDir, storagePath } from '@/lib/storage';

/**
 * ffmpeg driver.
 *
 * Everything that touches a media file goes through here. Scene clips are all
 * encoded with identical parameters so the final assembly can use the concat
 * demuxer with stream copy, which keeps long-form renders fast.
 */

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export const FPS = 30;

export function dimensionsFor(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case '1:1': return { width: 1080, height: 1080 };
    case '16:9': return { width: 1920, height: 1080 };
    case '9:16':
    default: return { width: 1080, height: 1920 };
  }
}

export class FfmpegError extends Error {
  constructor(message: string, public stderr: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/** Runs a binary and resolves with stdout, rejecting with captured stderr. */
function run(bin: string, args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new FfmpegError(`${bin} timed out after ${timeoutMs}ms`, stderr));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    // ffmpeg is chatty on stderr even when healthy; keep only the tail.
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-8000); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new FfmpegError(`Failed to launch ${bin}: ${err.message}`, stderr));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new FfmpegError(`${bin} exited with code ${code}`, stderr));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(FFMPEG, ['-hide_banner', '-version'], 15_000);
    return true;
  } catch {
    return false;
  }
}

/** Duration of a media file in milliseconds, or null if unreadable. */
export async function ffprobeDuration(relPath: string): Promise<number | null> {
  try {
    const out = await run(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', storagePath(relPath)],
      30_000,
    );
    const seconds = Number.parseFloat(out.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- motion

/**
 * Builds the zoompan expressions for a camera move.
 * `on` is the output frame index; `frames` the total for this clip.
 */
function motionFilter(motion: string, frames: number, width: number, height: number): string {
  const n = Math.max(1, frames);
  // Source is pre-scaled 1.5x so there is headroom to zoom and pan into.
  const pre = `scale=${Math.round(width * 1.5)}:${Math.round(height * 1.5)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.5)}:${Math.round(height * 1.5)}`;

  const centreX = `iw/2-(iw/zoom/2)`;
  const centreY = `ih/2-(ih/zoom/2)`;

  let z = '1';
  let x = centreX;
  let y = centreY;

  switch (motion) {
    case 'kenburns-in':
      z = `1+0.26*on/${n}`;
      break;
    case 'kenburns-out':
      z = `1.26-0.26*on/${n}`;
      break;
    case 'zoom-pulse':
      z = `1.10+0.05*sin(2*PI*on/${n})`;
      break;
    case 'pan-left':
      z = '1.18';
      x = `(iw-iw/zoom)*(1-on/${n})`;
      break;
    case 'pan-right':
      z = '1.18';
      x = `(iw-iw/zoom)*(on/${n})`;
      break;
    case 'static':
    default:
      z = '1.001'; // a hair above 1 keeps zoompan's sampling stable
      break;
  }

  return (
    `${pre},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${FPS},` +
    `format=yuv420p,setsar=1`
  );
}

// ------------------------------------------------------------- scene clips

export interface SceneClipOptions {
  imagePath: string;
  audioPath: string | null;
  durationMs: number;
  motion: string;
  aspect: string;
  outPath: string;
}

/** Renders one scene: a still image with camera motion, plus its narration. */
export async function renderSceneClip(opts: SceneClipOptions): Promise<string> {
  const { width, height } = dimensionsFor(opts.aspect);
  const seconds = Math.max(0.4, opts.durationMs / 1000);
  const frames = Math.round(seconds * FPS);

  await ensureDir(path.dirname(storagePath(opts.outPath)));

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', seconds.toFixed(3),
    '-i', storagePath(opts.imagePath),
  ];

  if (opts.audioPath) {
    args.push('-i', storagePath(opts.audioPath));
  } else {
    // Every clip must carry an audio stream or concat will desync.
    args.push('-f', 'lavfi', '-t', seconds.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo');
  }

  args.push(
    '-vf', motionFilter(opts.motion, frames, width, height),
    '-t', seconds.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-g', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-shortest',
    storagePath(opts.outPath),
  );

  await run(FFMPEG, args);
  return opts.outPath;
}

// --------------------------------------------------------------- assembly

/** Joins pre-encoded clips with the concat demuxer (stream copy). */
export async function concatClips(clipPaths: string[], outPath: string): Promise<string> {
  if (!clipPaths.length) throw new Error('Nothing to concatenate');

  const listPath = storagePath(`${outPath}.concat.txt`);
  await ensureDir(path.dirname(listPath));
  await fs.writeFile(
    listPath,
    clipPaths.map((p) => `file '${storagePath(p).replace(/'/g, "'\\''")}'`).join('\n'),
  );

  await ensureDir(path.dirname(storagePath(outPath)));
  await run(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', storagePath(outPath),
  ]);

  await fs.unlink(listPath).catch(() => {});
  return outPath;
}

// -------------------------------------------------------- captions + brand

export interface FinishOptions {
  inPath: string;
  outPath: string;
  assPath: string | null;
  watermarkText: string | null;
  watermarkPos: string;
  watermarkOpacity: number;
  musicPath: string | null;
  musicVolume: number;
  aspect: string;
}

function watermarkOverlay(text: string, pos: string, opacity: number, height: number): string {
  const margin = Math.round(height * 0.03);
  const size = Math.round(height * 0.022);

  const placement: Record<string, string> = {
    'top-left': `x=${margin}:y=${margin}`,
    'top-right': `x=w-tw-${margin}:y=${margin}`,
    'bottom-left': `x=${margin}:y=h-th-${margin}`,
    'bottom-right': `x=w-tw-${margin}:y=h-th-${margin}`,
    center: `x=(w-tw)/2:y=(h-th)/2`,
  };

  return [
    `drawtext=text='${escapeDrawtext(text)}'`,
    `fontfile=${DEFAULT_FONT}`,
    `fontsize=${size}`,
    `fontcolor=white@${Math.max(0, Math.min(1, opacity)).toFixed(2)}`,
    `shadowcolor=black@0.5:shadowx=2:shadowy=2`,
    placement[pos] ?? placement['bottom-right'],
  ].join(':');
}

export const DEFAULT_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

/** Final pass: burns captions, applies the watermark, mixes music. */
export async function finishVideo(opts: FinishOptions): Promise<string> {
  const { height } = dimensionsFor(opts.aspect);
  const filters: string[] = [];

  if (opts.assPath) {
    const escaped = storagePath(opts.assPath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    filters.push(`subtitles='${escaped}'`);
  }
  if (opts.watermarkText) {
    filters.push(watermarkOverlay(opts.watermarkText, opts.watermarkPos, opts.watermarkOpacity, height));
  }

  await ensureDir(path.dirname(storagePath(opts.outPath)));

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', storagePath(opts.inPath)];

  if (opts.musicPath) {
    args.push('-stream_loop', '-1', '-i', storagePath(opts.musicPath));
  }

  if (filters.length) args.push('-vf', filters.join(','));

  if (opts.musicPath) {
    args.push(
      '-filter_complex',
      `[1:a]volume=${opts.musicVolume.toFixed(2)}[bed];[0:a][bed]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      '-map', '0:v', '-map', '[aout]',
    );
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    '-shortest',
    storagePath(opts.outPath),
  );

  await run(FFMPEG, args);
  return opts.outPath;
}

/** Grabs a poster frame for the video library. */
export async function makeThumbnail(videoPath: string, outPath: string, atSec = 1): Promise<string> {
  await ensureDir(path.dirname(storagePath(outPath)));
  await run(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(atSec), '-i', storagePath(videoPath),
    '-frames:v', '1', '-q:v', '3',
    storagePath(outPath),
  ]);
  return outPath;
}
