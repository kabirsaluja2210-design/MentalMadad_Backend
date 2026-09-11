import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PLANS } from '@/lib/credits';
import { handleError, ok, parseBody, fail } from '@/lib/api';

export async function GET() {
  try {
    const user = await requireUser();
    const [workspace, entries, usage] = await Promise.all([
      db.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } }),
      db.creditEntry.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.video.groupBy({
        by: ['mode'],
        where: { workspaceId: user.workspaceId },
        _count: { mode: true },
      }),
    ]);

    return ok({
      plan: workspace.plan,
      credits: workspace.credits,
      plans: PLANS,
      entries,
      usageByMode: usage.map((u) => ({ mode: u.mode, count: u._count.mode })),
    });
  } catch (error) {
    return handleError(error);
  }
}

const schema = z.object({ plan: z.enum(['FREE', 'CREATOR', 'STUDIO', 'AGENCY']) });

/**
 * Plan switching.
 *
 * No payment processor is wired up, so this grants the plan's credits
 * directly. Swapping in a real checkout means calling this from the
 * provider's webhook instead of from the client.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const plan = PLANS.find((p) => p.id === body.plan);
    if (!plan) return fail('Unknown plan', 422);

    const workspace = await db.workspace.update({
      where: { id: user.workspaceId },
      data: { plan: plan.id, credits: { increment: plan.credits } },
    });
    await db.creditEntry.create({
      data: {
        workspaceId: user.workspaceId,
        delta: plan.credits,
        reason: `Switched to ${plan.name} (no payment taken — billing is not connected)`,
        balanceAfter: workspace.credits,
      },
    });

    return ok({ plan: workspace.plan, credits: workspace.credits, simulated: true });
  } catch (error) {
    return handleError(error);
  }
}
