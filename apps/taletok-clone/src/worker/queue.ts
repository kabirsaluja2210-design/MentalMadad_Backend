import { db } from '@/lib/db';
import { parseJson, stringifyJson } from '@/lib/json';
import { refundCredits } from '@/lib/credits';
import { renderVideo, type Stage } from '@/pipeline/engine';

/**
 * Render queue.
 *
 * Backed by the RenderJob table rather than an external broker so the app runs
 * with nothing but a database. Jobs are claimed with a conditional update, so
 * several workers can share a queue without handing the same job out twice.
 */

export const MAX_ATTEMPTS = 3;

export interface JobLogEntry {
  at: string;
  stage: string;
  progress: number;
  message: string;
}

/** Atomically claims the oldest queued job. Returns null when idle. */
export async function claimNextJob(): Promise<{ id: string; videoId: string } | null> {
  const candidate = await db.renderJob.findFirst({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, videoId: true },
  });
  if (!candidate) return null;

  // Only one worker can flip QUEUED -> RUNNING for a given row.
  const claimed = await db.renderJob.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date(), stage: 'script', progress: 1 },
  });
  if (claimed.count === 0) return null; // lost the race; caller retries

  return candidate;
}

async function appendLog(jobId: string, entry: JobLogEntry): Promise<void> {
  const job = await db.renderJob.findUnique({ where: { id: jobId }, select: { logJson: true } });
  const log = parseJson<JobLogEntry[]>(job?.logJson, []);
  log.push(entry);
  await db.renderJob.update({
    where: { id: jobId },
    data: { logJson: stringifyJson(log.slice(-80)) },
  });
}

/** Runs one job to completion, updating the video and job rows as it goes. */
export async function runJob(jobId: string, videoId: string): Promise<void> {
  await db.video.update({ where: { id: videoId }, data: { status: 'RENDERING' } });

  try {
    const result = await renderVideo(videoId, async (stage: Stage, progress, message) => {
      await db.renderJob.update({ where: { id: jobId }, data: { stage, progress } });
      await appendLog(jobId, { at: new Date().toISOString(), stage, progress, message });
    });

    await db.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        outputPath: result.outputPath,
        thumbnailPath: result.thumbnailPath,
        actualDurationMs: result.durationMs,
      },
    });

    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'SUCCEEDED', stage: 'done', progress: 100, finishedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const job = await db.renderJob.findUnique({ where: { id: jobId } });
    const attempts = (job?.attempts ?? 0) + 1;

    if (attempts < MAX_ATTEMPTS) {
      // Requeue for another pass; completed stages are reused on retry.
      await db.renderJob.update({
        where: { id: jobId },
        data: { status: 'QUEUED', attempts, error: message, stage: 'queued', progress: 0 },
      });
      await appendLog(jobId, {
        at: new Date().toISOString(), stage: 'queued', progress: 0,
        message: `Attempt ${attempts} failed, retrying: ${message}`,
      });
      await db.video.update({ where: { id: videoId }, data: { status: 'QUEUED' } });
      return;
    }

    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', attempts, error: message, finishedAt: new Date() },
    });
    await db.video.update({ where: { id: videoId }, data: { status: 'FAILED' } });
    await appendLog(jobId, {
      at: new Date().toISOString(), stage: 'queued', progress: 0,
      message: `Failed after ${attempts} attempts: ${message}`,
    });

    // The user should not pay for a render they never received.
    const video = await db.video.findUnique({ where: { id: videoId } });
    const spent = await db.creditEntry.findFirst({
      where: { videoId, delta: { lt: 0 } },
      orderBy: { createdAt: 'desc' },
    });
    if (video && spent) {
      await refundCredits(video.workspaceId, Math.abs(spent.delta), 'Refund: render failed', videoId);
    }
  }
}

/** Enqueues a render, reusing an already-pending job if there is one. */
export async function enqueueRender(videoId: string): Promise<string> {
  const existing = await db.renderJob.findFirst({
    where: { videoId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (existing) return existing.id;

  const job = await db.renderJob.create({ data: { videoId, status: 'QUEUED' } });
  await db.video.update({ where: { id: videoId }, data: { status: 'QUEUED' } });
  return job.id;
}

/** Re-queues jobs left RUNNING by a worker that died mid-render. */
export async function requeueStaleJobs(olderThanMs = 30 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await db.renderJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: cutoff } },
    data: { status: 'QUEUED', stage: 'queued', progress: 0 },
  });
  return result.count;
}
