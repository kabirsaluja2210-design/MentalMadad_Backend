import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const patchSchema = z.object({
  text: z.string().max(4000).optional(),
  visualPrompt: z.string().max(2000).optional(),
  motion: z.enum(['kenburns-in', 'kenburns-out', 'pan-left', 'pan-right', 'static', 'zoom-pulse']).optional(),
  transition: z.string().max(40).optional(),
  durationMs: z.number().int().min(400).max(120_000).optional(),
  /** Locked scenes are skipped by the pipeline on re-render. */
  locked: z.boolean().optional(),
});

async function loadScene(videoId: string, sceneId: string, workspaceId: string) {
  const scene = await db.scene.findUnique({ where: { id: sceneId }, include: { video: true } });
  if (!scene || scene.videoId !== videoId || scene.video.workspaceId !== workspaceId) return null;
  return scene;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; sceneId: string } },
) {
  try {
    const user = await requireUser();
    const scene = await loadScene(params.id, params.sceneId, user.workspaceId);
    if (!scene) return fail('Scene not found', 404);
    if (scene.video.status === 'RENDERING') return fail('Cannot edit while rendering', 409);

    const body = await parseBody(request, patchSchema);

    // Changing the words invalidates the voiceover and its caption timings.
    const textChanged = body.text !== undefined && body.text !== scene.text;
    // Changing the prompt invalidates the generated frame.
    const visualChanged = body.visualPrompt !== undefined && body.visualPrompt !== scene.visualPrompt;

    const updated = await db.scene.update({
      where: { id: params.sceneId },
      data: {
        ...body,
        ...(textChanged ? { audioPath: null, wordsJson: '[]' } : {}),
        ...(visualChanged ? { imagePath: null, clipPath: null, status: 'PENDING' } : {}),
        ...(textChanged || visualChanged ? { locked: false } : {}),
      },
    });

    return ok({
      scene: {
        ...updated,
        imageUrl: mediaUrl(updated.imagePath),
        clipUrl: mediaUrl(updated.clipPath),
        audioUrl: mediaUrl(updated.audioPath),
      },
      invalidated: { audio: textChanged, visual: visualChanged },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; sceneId: string } },
) {
  try {
    const user = await requireUser();
    const scene = await loadScene(params.id, params.sceneId, user.workspaceId);
    if (!scene) return fail('Scene not found', 404);

    await db.$transaction(async (tx) => {
      await tx.scene.delete({ where: { id: params.sceneId } });
      // Close the gap so indexes stay contiguous.
      const rest = await tx.scene.findMany({
        where: { videoId: params.id }, orderBy: { index: 'asc' },
      });
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].index !== i) {
          await tx.scene.update({ where: { id: rest[i].id }, data: { index: i } });
        }
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
