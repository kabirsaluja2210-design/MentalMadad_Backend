import path from 'node:path';
import { promises as fs } from 'node:fs';
import { db } from '@/lib/db';
import { parseJson, stringifyJson } from '@/lib/json';
import { ensureDir, storagePath, writeFile, fileSize } from '@/lib/storage';
import { getImage, getLlm, getMusic, getTts } from '@/providers/registry';
import type { ScriptBeat, WordTiming } from '@/providers/types';
import { getMode, resolveOptions } from './modes';
import { buildAss, type CaptionScene, type CaptionStyle } from './captions';
import {
  concatClips, finishVideo, makeThumbnail, renderSceneClip, ffmpegAvailable, ffprobeDuration,
} from './ffmpeg';

/**
 * The render pipeline.
 *
 * Stages run in order and each one persists its output before the next starts,
 * so a failed render can be resumed and the Advanced editor can regenerate a
 * single scene without redoing the rest. `onProgress` is how the worker keeps
 * the RenderJob row current for the UI's progress bar.
 */

export type Stage =
  | 'queued' | 'script' | 'voice' | 'visuals' | 'captions'
  | 'compose' | 'finish' | 'thumbnail' | 'done';

export const STAGE_ORDER: Stage[] = [
  'queued', 'script', 'voice', 'visuals', 'captions', 'compose', 'finish', 'thumbnail', 'done',
];

/** Weight of each stage in the overall progress bar. */
const STAGE_WEIGHT: Record<Stage, number> = {
  queued: 0, script: 8, voice: 22, visuals: 25, captions: 5,
  compose: 28, finish: 10, thumbnail: 2, done: 0,
};

export type ProgressFn = (stage: Stage, progress: number, message: string) => Promise<void> | void;

function progressAt(stage: Stage, withinStage: number): number {
  const index = STAGE_ORDER.indexOf(stage);
  let base = 0;
  for (let i = 0; i < index; i++) base += STAGE_WEIGHT[STAGE_ORDER[i]];
  return Math.min(100, Math.round(base + STAGE_WEIGHT[stage] * Math.max(0, Math.min(1, withinStage))));
}

export class PipelineError extends Error {
  constructor(message: string, public stage: Stage, public cause?: unknown) {
    super(message);
    this.name = 'PipelineError';
  }
}

// --------------------------------------------------------------------------

export interface RenderResult {
  outputPath: string;
  thumbnailPath: string | null;
  durationMs: number;
  sceneCount: number;
}

export async function renderVideo(videoId: string, onProgress: ProgressFn): Promise<RenderResult> {
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { scenes: { orderBy: { index: 'asc' } }, voice: true, workspace: { include: { brandKit: true } } },
  });
  if (!video) throw new PipelineError(`Video ${videoId} not found`, 'queued');

  const mode = getMode(video.mode);
  const options = resolveOptions(video.mode, parseJson(video.optionsJson, {}));
  const workDir = `videos/${video.id}`;
  await ensureDir(workDir);

  // ---------------------------------------------------------------- script
  await onProgress('script', progressAt('script', 0), 'Writing the script');

  let scenes = video.scenes;
  if (!scenes.length) {
    const llm = getLlm();
    const script = await llm.writeScript({
      mode: video.mode,
      topic: video.topic || video.title,
      targetDurationSec: video.targetDurationSec,
      tone: String(options.tone ?? 'natural'),
      sourceText: video.sourceRef ?? undefined,
      ...( { options } as object ),
    });

    await db.video.update({
      where: { id: video.id },
      data: {
        title: video.title || script.title,
        hook: script.hook,
        cta: script.cta,
        script: script.script,
      },
    });

    scenes = await createScenesFromBeats(video.id, script.beats, mode.secondsPerBeat, mode.motions);
  }
  await onProgress('script', progressAt('script', 1), `${scenes.length} scenes planned`);

  // ----------------------------------------------------------------- voice
  const tts = getTts();
  const voiceId = video.voice?.externalId || 'nova-f-us';
  const speed = options.narrationPace === 'fast' ? 1.15 : options.narrationPace === 'slow' ? 0.92 : 1;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    await onProgress('voice', progressAt('voice', i / scenes.length), `Voicing scene ${i + 1}/${scenes.length}`);

    // Locked scenes keep whatever the editor last produced.
    if (scene.locked && scene.audioPath) continue;

    const result = await tts.synthesize({
      text: scene.text,
      voiceExternalId: voiceId,
      style: video.voice?.style,
      speed,
      outPath: `${workDir}/scene-${scene.index}.wav`,
    });

    scenes[i] = await db.scene.update({
      where: { id: scene.id },
      data: {
        audioPath: result.audioPath,
        durationMs: result.durationMs,
        wordsJson: stringifyJson(result.words),
      },
    });
  }
  await onProgress('voice', progressAt('voice', 1), 'Voiceover complete');

  // --------------------------------------------------------------- visuals
  const image = getImage();
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    await onProgress('visuals', progressAt('visuals', i / scenes.length), `Rendering visual ${i + 1}/${scenes.length}`);

    if (scene.locked && scene.imagePath) continue;

    const result = await image.generate({
      prompt: scene.visualPrompt || scene.text,
      aspect: video.aspect,
      seed: hashSeed(`${video.id}:${scene.index}:${scene.visualPrompt}`),
      style: mode.visualStyle,
      outPath: `${workDir}/scene-${scene.index}.png`,
    });

    scenes[i] = await db.scene.update({
      where: { id: scene.id },
      data: { imagePath: result.imagePath, status: 'READY' },
    });
  }
  await onProgress('visuals', progressAt('visuals', 1), 'Visuals ready');

  // -------------------------------------------------------------- captions
  await onProgress('captions', progressAt('captions', 0), 'Timing captions');

  let cursor = 0;
  const captionScenes: CaptionScene[] = [];
  for (const scene of scenes) {
    await db.scene.update({ where: { id: scene.id }, data: { startMs: cursor } });
    captionScenes.push({
      startMs: cursor,
      durationMs: scene.durationMs,
      text: scene.text,
      words: parseJson<WordTiming[]>(scene.wordsJson, []),
    });
    cursor += scene.durationMs;
  }
  const totalMs = cursor;

  const brand = video.workspace.brandKit;
  const assPath = `${workDir}/captions.ass`;
  await writeFile(
    assPath,
    buildAss(captionScenes, {
      style: (brand?.captionStyle as CaptionStyle) || (mode.captionStyle as CaptionStyle),
      aspect: video.aspect,
      fontColor: brand?.captionColor || '#ffffff',
      highlightColor: brand?.captionHighlight || '#ffe14d',
    }),
  );
  await onProgress('captions', progressAt('captions', 1), 'Captions timed');

  // --------------------------------------------------------------- compose
  if (!(await ffmpegAvailable())) {
    throw new PipelineError(
      'ffmpeg was not found. Install ffmpeg or set FFMPEG_PATH to its location.',
      'compose',
    );
  }

  const clipPaths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    await onProgress('compose', progressAt('compose', i / scenes.length), `Composing clip ${i + 1}/${scenes.length}`);

    if (!scene.imagePath) throw new PipelineError(`Scene ${scene.index} has no visual`, 'compose');

    const clipPath = `${workDir}/clip-${scene.index}.mp4`;
    await renderSceneClip({
      imagePath: scene.imagePath,
      audioPath: scene.audioPath,
      durationMs: scene.durationMs,
      motion: scene.motion,
      aspect: video.aspect,
      outPath: clipPath,
    });
    clipPaths.push(clipPath);
  }

  const joinedPath = `${workDir}/joined.mp4`;
  await concatClips(clipPaths, joinedPath);
  await onProgress('compose', progressAt('compose', 1), 'Scenes joined');

  // ---------------------------------------------------------------- finish
  await onProgress('finish', progressAt('finish', 0), 'Burning captions and branding');

  const music = await getMusic().pickTrack(mode.musicMood, totalMs);
  const outputPath = `${workDir}/final.mp4`;

  await finishVideo({
    inPath: joinedPath,
    outPath: outputPath,
    assPath,
    watermarkText: brand?.watermarkText || null,
    watermarkPos: brand?.watermarkPos || 'bottom-right',
    watermarkOpacity: brand?.watermarkOpacity ?? 0.75,
    musicPath: music.path,
    musicVolume: 0.12,
    aspect: video.aspect,
  });

  // ------------------------------------------------------------- thumbnail
  await onProgress('thumbnail', progressAt('thumbnail', 0), 'Generating thumbnail');
  let thumbnailPath: string | null = `${workDir}/thumb.jpg`;
  try {
    await makeThumbnail(outputPath, thumbnailPath, Math.min(1, totalMs / 2000));
  } catch {
    thumbnailPath = null; // a missing poster frame is not worth failing a render over
  }

  const realDuration = (await ffprobeDuration(outputPath)) ?? totalMs;
  await cleanupIntermediates(workDir, clipPaths.concat([joinedPath]));

  await onProgress('done', 100, 'Render complete');

  return { outputPath, thumbnailPath, durationMs: realDuration, sceneCount: scenes.length };
}

// -------------------------------------------------------------- helpers

async function createScenesFromBeats(
  videoId: string,
  beats: ScriptBeat[],
  secondsPerBeat: number,
  motions: string[],
) {
  const created = [];
  for (let i = 0; i < beats.length; i++) {
    created.push(
      await db.scene.create({
        data: {
          videoId,
          index: i,
          text: beats[i].text,
          visualPrompt: beats[i].visualPrompt,
          motion: beats[i].motion || motions[i % motions.length],
          durationMs: Math.round(secondsPerBeat * 1000),
        },
      }),
    );
  }
  return created;
}

function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Per-scene clips and the pre-caption join are large and never re-read. */
async function cleanupIntermediates(workDir: string, paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.unlink(storagePath(p));
      } catch {
        /* already gone */
      }
    }),
  );
  void workDir;
}

/** Total bytes a video is using on disk — shown in the library. */
export async function videoDiskUsage(videoId: string): Promise<number> {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video?.outputPath) return 0;
  return fileSize(video.outputPath);
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: 'Queued',
    script: 'Writing script',
    voice: 'Generating voiceover',
    visuals: 'Generating visuals',
    captions: 'Timing captions',
    compose: 'Composing scenes',
    finish: 'Burning captions',
    thumbnail: 'Finishing up',
    done: 'Complete',
  };
  return labels[stage] ?? stage;
}
