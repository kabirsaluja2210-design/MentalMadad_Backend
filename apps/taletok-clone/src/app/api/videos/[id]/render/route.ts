import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { estimateCredits, spendCredits } from '@/lib/credits';
import { enqueueRender } from '@/worker/queue';
import { stageLabel } from '@/pipeline/engine';
import { handleError, ok, fail } from '@/lib/api';

/** Queues (or re-queues) a render. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const video = await db.video.findUnique({ where: { id: params.id } });
    if (!video || video.workspaceId !== user.workspaceId) return fail('Video not found', 404);
    if (video.status === 'RENDERING') return fail('This video is already rendering', 409);

    // A re-render of an already-charged draft isn't billed twice; a retry
    // after a refunded failure is.
    const charged = await db.creditEntry.findFirst({ where: { videoId: video.id, delta: { lt: 0 } } });
    const refunded = await db.creditEntry.findFirst({ where: { videoId: video.id, delta: { gt: 0 } } });
    if (!charged || refunded) {
      await spendCredits(
        user.workspaceId,
        estimateCredits(video.mode, video.targetDurationSec),
        'Render',
        video.id,
      );
    }

    const jobId = await enqueueRender(video.id);
    return ok({ jobId, status: 'QUEUED' }, 202);
  } catch (error) {
    return handleError(error);
  }
}

/** Poll target for the progress bar. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const video = await db.video.findUnique({
      where: { id: params.id },
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!video || video.workspaceId !== user.workspaceId) return fail('Video not found', 404);

    const job = video.jobs[0];
    return ok({
      status: video.status,
      job: job
        ? { id: job.id, status: job.status, stage: job.stage, label: stageLabel(job.stage),
            progress: job.progress, attempts: job.attempts, error: job.error }
        : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
