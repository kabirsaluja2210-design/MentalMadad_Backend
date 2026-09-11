import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { estimateCredits, spendCredits } from '@/lib/credits';
import { getMode, isMode, resolveOptions } from '@/pipeline/modes';
import { mediaUrl } from '@/lib/storage';
import { enqueueRender } from '@/worker/queue';
import { handleError, ok, parseBody } from '@/lib/api';

const createSchema = z.object({
  mode: z.string().refine(isMode, 'Unknown video mode'),
  topic: z.string().min(3, 'Give the generator something to work with').max(500),
  title: z.string().max(160).optional(),
  aspect: z.enum(['9:16', '1:1', '16:9']).optional(),
  durationSec: z.number().int().min(5).max(600).optional(),
  voiceId: z.string().optional(),
  sourceType: z.enum(['prompt', 'reddit', 'url', 'upload', 'idea']).optional(),
  sourceText: z.string().max(40_000).optional(),
  seriesId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
  /** Quick editor queues immediately; advanced editor creates a draft first. */
  startRender: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const mode = url.searchParams.get('mode');
    const take = Math.min(100, Number(url.searchParams.get('limit')) || 50);

    const videos = await db.video.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(status ? { status } : {}),
        ...(mode ? { mode } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        series: { select: { id: true, name: true } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1,
          select: { status: true, stage: true, progress: true, error: true } },
        _count: { select: { scenes: true } },
      },
    });

    return ok({
      videos: videos.map((v) => ({
        ...v,
        outputUrl: mediaUrl(v.outputPath),
        thumbnailUrl: mediaUrl(v.thumbnailPath),
        job: v.jobs[0] ?? null,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const mode = getMode(body.mode);

    const durationSec = Math.max(
      mode.minDurationSec,
      Math.min(mode.maxDurationSec, body.durationSec ?? mode.defaultDurationSec),
    );

    const video = await db.video.create({
      data: {
        workspaceId: user.workspaceId,
        seriesId: body.seriesId,
        title: body.title?.trim() || body.topic.slice(0, 80),
        mode: body.mode,
        topic: body.topic.trim(),
        aspect: body.aspect ?? mode.defaultAspect,
        targetDurationSec: durationSec,
        voiceId: body.voiceId,
        sourceType: body.sourceType ?? 'prompt',
        sourceRef: body.sourceText,
        optionsJson: JSON.stringify(resolveOptions(body.mode, body.options ?? {})),
      },
    });

    // Charge up front; the worker refunds automatically if the render fails.
    const cost = estimateCredits(body.mode, durationSec);
    if (body.startRender !== false) {
      await spendCredits(user.workspaceId, cost, `Render: ${mode.name}`, video.id);
      await enqueueRender(video.id);
    }

    return ok({ video, estimatedCredits: cost }, 201);
  } catch (error) {
    return handleError(error);
  }
}
