import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { nextRunFor } from '@/worker/scheduler';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  topic: z.string().min(3).max(500).optional(),
  voiceId: z.string().nullable().optional(),
  cadence: z.enum(['daily', 'weekdays', 'weekly', 'every-2-days', 'manual']).optional(),
  postTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  autoPublish: z.boolean().optional(),
  targets: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await db.series.findUnique({ where: { id: params.id } });
    if (!existing || existing.workspaceId !== user.workspaceId) return fail('Series not found', 404);

    const body = await parseBody(request, patchSchema);
    const cadence = body.cadence ?? existing.cadence;
    const postTime = body.postTime ?? existing.postTime;
    // Any schedule change re-anchors the next run.
    const rescheduled = body.cadence !== undefined || body.postTime !== undefined;

    const series = await db.series.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.voiceId !== undefined ? { voiceId: body.voiceId } : {}),
        ...(body.autoPublish !== undefined ? { autoPublish: body.autoPublish } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.targets !== undefined ? { targetsJson: JSON.stringify(body.targets) } : {}),
        ...(body.options !== undefined ? { configJson: JSON.stringify(body.options) } : {}),
        cadence,
        postTime,
        ...(rescheduled || body.active
          ? { nextRunAt: cadence === 'manual' ? null : nextRunFor(cadence, postTime) }
          : {}),
      },
    });
    return ok({ series });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await db.series.findUnique({ where: { id: params.id } });
    if (!existing || existing.workspaceId !== user.workspaceId) return fail('Series not found', 404);

    await db.series.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
