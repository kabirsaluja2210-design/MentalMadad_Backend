import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { stringifyJson } from '@/lib/json';
import { getLlm, getImage, getTts } from '@/providers/registry';
import { getMode } from '@/pipeline/modes';
import { hashString } from '@/lib/media-encode';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const schema = z.object({
  /** Which parts to redo. */
  parts: z.array(z.enum(['script', 'voice', 'visual'])).min(1),
  instruction: z.string().max(500).optional(),
});

/**
 * Regenerates one scene in place — the core of the Advanced editor. Each part
 * is independent so a user can reroll only the visual without losing a line
 * of narration they liked.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; sceneId: string } },
) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const scene = await db.scene.findUnique({
      where: { id: params.sceneId },
      include: { video: { include: { voice: true } } },
    });
    if (!scene || scene.videoId !== params.id || scene.video.workspaceId !== user.workspaceId) {
      return fail('Scene not found', 404);
    }
    if (scene.video.status === 'RENDERING') return fail('Cannot edit while rendering', 409);

    const video = scene.video;
    const mode = getMode(video.mode);
    const workDir = `videos/${video.id}`;
    let text = scene.text;
    let visualPrompt = scene.visualPrompt;

    if (body.parts.includes('script')) {
      const beat = await getLlm().rewriteBeat(
        {
          mode: video.mode,
          topic: video.topic || video.title,
          targetDurationSec: video.targetDurationSec,
        },
        { text: scene.text, visualPrompt: scene.visualPrompt, motion: scene.motion },
        body.instruction,
      );
      text = beat.text;
      visualPrompt = beat.visualPrompt;
    }

    let audioPath = scene.audioPath;
    let durationMs = scene.durationMs;
    let words = scene.wordsJson;

    if (body.parts.includes('voice') || body.parts.includes('script')) {
      const result = await getTts().synthesize({
        text,
        voiceExternalId: video.voice?.externalId || 'nova-f-us',
        style: video.voice?.style,
        outPath: `${workDir}/scene-${scene.index}.wav`,
      });
      audioPath = result.audioPath;
      durationMs = result.durationMs;
      words = stringifyJson(result.words);
    }

    let imagePath = scene.imagePath;
    if (body.parts.includes('visual') || body.parts.includes('script')) {
      // Re-seed so a reroll of an unchanged prompt still yields a new frame.
      const result = await getImage().generate({
        prompt: visualPrompt || text,
        aspect: video.aspect,
        seed: hashString(`${scene.id}:${visualPrompt}:${Date.now()}`),
        style: mode.visualStyle,
        outPath: `${workDir}/scene-${scene.index}.png`,
      });
      imagePath = result.imagePath;
    }

    const updated = await db.scene.update({
      where: { id: scene.id },
      data: { text, visualPrompt, audioPath, imagePath, durationMs, wordsJson: words, status: 'READY' },
    });

    // The finished cut no longer matches the scenes.
    await db.video.update({ where: { id: video.id }, data: { status: 'DRAFT' } });

    return ok({
      scene: { ...updated, imageUrl: mediaUrl(updated.imagePath), audioUrl: mediaUrl(updated.audioPath) },
    });
  } catch (error) {
    return handleError(error);
  }
}
