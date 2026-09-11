import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok, fail } from '@/lib/api';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const post = await db.scheduledPost.findUnique({
      where: { id: params.id },
      include: { video: true },
    });
    if (!post || post.video.workspaceId !== user.workspaceId) return fail('Post not found', 404);
    if (post.status === 'POSTED') return fail('That post has already gone out', 409);

    await db.scheduledPost.update({ where: { id: params.id }, data: { status: 'CANCELLED' } });
    return ok({ cancelled: true });
  } catch (error) {
    return handleError(error);
  }
}
