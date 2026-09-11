import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const schema = z.object({ sceneIds: z.array(z.string()).min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const video = await db.video.findUnique({
      where: { id: params.id },
      include: { scenes: true },
    });
    if (!video || video.workspaceId !== user.workspaceId) return fail('Video not found', 404);
    if (video.status === 'RENDERING') return fail('Cannot reorder while rendering', 409);

    const body = await parseBody(request, schema);
    const existing = new Set(video.scenes.map((s) => s.id));
    if (body.sceneIds.length !== existing.size || body.sceneIds.some((id) => !existing.has(id))) {
      return fail('sceneIds must list every scene in this video exactly once', 422);
    }

    // Two-phase to dodge the (videoId, index) unique constraint.
    await db.$transaction(async (tx) => {
      for (let i = 0; i < body.sceneIds.length; i++) {
        await tx.scene.update({ where: { id: body.sceneIds[i] }, data: { index: -(i + 1) } });
      }
      for (let i = 0; i < body.sceneIds.length; i++) {
        await tx.scene.update({ where: { id: body.sceneIds[i] }, data: { index: i } });
      }
    });

    await db.video.update({ where: { id: params.id }, data: { status: 'DRAFT' } });
    const scenes = await db.scene.findMany({ where: { videoId: params.id }, orderBy: { index: 'asc' } });
    return ok({ scenes });
  } catch (error) {
    return handleError(error);
  }
}
