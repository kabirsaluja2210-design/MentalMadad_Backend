import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const schema = z.object({
  videoId: z.string(),
  socialAccountIds: z.array(z.string()).min(1),
  scheduledFor: z.string().datetime(),
  caption: z.string().max(2200).default(''),
  hashtags: z.string().max(500).default(''),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    const posts = await db.scheduledPost.findMany({
      where: { video: { workspaceId: user.workspaceId }, ...(status ? { status } : {}) },
      orderBy: { scheduledFor: 'asc' },
      include: {
        socialAccount: { select: { platform: true, handle: true } },
        video: { select: { id: true, title: true, mode: true, status: true, thumbnailPath: true } },
      },
    });
    return ok({ posts });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const video = await db.video.findUnique({ where: { id: body.videoId } });
    if (!video || video.workspaceId !== user.workspaceId) return fail('Video not found', 404);

    // Only schedule onto channels this workspace actually owns.
    const accounts = await db.socialAccount.findMany({
      where: { id: { in: body.socialAccountIds }, workspaceId: user.workspaceId },
    });
    if (accounts.length !== body.socialAccountIds.length) {
      return fail('One or more channels do not belong to this workspace', 403);
    }

    const posts = await Promise.all(
      accounts.map((account) =>
        db.scheduledPost.create({
          data: {
            videoId: body.videoId,
            socialAccountId: account.id,
            scheduledFor: new Date(body.scheduledFor),
            caption: body.caption,
            hashtags: body.hashtags,
          },
        }),
      ),
    );
    return ok({ posts }, 201);
  } catch (error) {
    return handleError(error);
  }
}
