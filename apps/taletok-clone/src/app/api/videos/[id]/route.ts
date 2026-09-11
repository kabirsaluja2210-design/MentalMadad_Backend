import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { parseJson } from '@/lib/json';
import { getMode } from '@/pipeline/modes';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const patchSchema = z.object({
  title: z.string().max(160).optional(),
  script: z.string().max(80_000).optional(),
  hook: z.string().max(500).optional(),
  cta: z.string().max(500).optional(),
  voiceId: z.string().nullable().optional(),
  aspect: z.enum(['9:16', '1:1', '16:9']).optional(),
  visualOutput: z.enum(['auto', 'image', 'video']).optional(),
  renderer: z.enum(['auto', 'fast', 'blender']).optional(),
  options: z.record(z.unknown()).optional(),
});

/** Loads a video and confirms it belongs to the caller's workspace. */
async function loadOwned(id: string, workspaceId: string) {
  const video = await db.video.findUnique({
    where: { id },
    include: {
      scenes: { orderBy: { index: 'asc' } },
      voice: true,
      series: { select: { id: true, name: true } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      posts: { include: { socialAccount: true } },
    },
  });
  if (!video || video.workspaceId !== workspaceId) return null;
  return video;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const video = await loadOwned(params.id, user.workspaceId);
    if (!video) return fail('Video not found', 404);

    return ok({
      video: {
        ...video,
        outputUrl: mediaUrl(video.outputPath),
        thumbnailUrl: mediaUrl(video.thumbnailPath),
        options: parseJson(video.optionsJson, {}),
        job: video.jobs[0] ?? null,
        scenes: video.scenes.map((s) => ({
          ...s,
          imageUrl: mediaUrl(s.imagePath),
          clipUrl: mediaUrl(s.clipPath),
          audioUrl: mediaUrl(s.audioPath),
          words: parseJson(s.wordsJson, []),
        })),
      },
      mode: getMode(video.mode),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await loadOwned(params.id, user.workspaceId);
    if (!existing) return fail('Video not found', 404);
    if (existing.status === 'RENDERING') return fail('Cannot edit a video while it is rendering', 409);

    const body = await parseBody(request, patchSchema);
    const video = await db.video.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.script !== undefined ? { script: body.script } : {}),
        ...(body.hook !== undefined ? { hook: body.hook } : {}),
        ...(body.cta !== undefined ? { cta: body.cta } : {}),
        ...(body.voiceId !== undefined ? { voiceId: body.voiceId } : {}),
        ...(body.aspect !== undefined ? { aspect: body.aspect } : {}),
        ...(body.visualOutput !== undefined ? { visualOutput: body.visualOutput } : {}),
        ...(body.renderer !== undefined ? { renderer: body.renderer } : {}),
        ...(body.options !== undefined ? { optionsJson: JSON.stringify(body.options) } : {}),
      },
    });
    return ok({ video });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await loadOwned(params.id, user.workspaceId);
    if (!existing) return fail('Video not found', 404);

    await db.video.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
