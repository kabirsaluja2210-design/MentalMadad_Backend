import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isMode, resolveOptions } from '@/pipeline/modes';
import { nextRunFor } from '@/worker/scheduler';
import { handleError, ok, parseBody } from '@/lib/api';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  mode: z.string().refine(isMode, 'Unknown video mode'),
  topic: z.string().min(3).max(500),
  voiceId: z.string().optional(),
  cadence: z.enum(['daily', 'weekdays', 'weekly', 'every-2-days', 'manual']).default('daily'),
  postTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm').default('17:00'),
  autoPublish: z.boolean().default(false),
  targets: z.array(z.string()).default([]),
  options: z.record(z.unknown()).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const series = await db.series.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { voice: true, _count: { select: { videos: true } } },
    });
    return ok({ series });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);

    const series = await db.series.create({
      data: {
        workspaceId: user.workspaceId,
        name: body.name.trim(),
        mode: body.mode,
        topic: body.topic.trim(),
        voiceId: body.voiceId,
        cadence: body.cadence,
        postTime: body.postTime,
        autoPublish: body.autoPublish,
        targetsJson: JSON.stringify(body.targets),
        configJson: JSON.stringify(resolveOptions(body.mode, body.options ?? {})),
        nextRunAt: body.cadence === 'manual' ? null : nextRunFor(body.cadence, body.postTime),
      },
    });
    return ok({ series }, 201);
  } catch (error) {
    return handleError(error);
  }
}
