import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok, fail } from '@/lib/api';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const account = await db.socialAccount.findUnique({ where: { id: params.id } });
    if (!account || account.workspaceId !== user.workspaceId) return fail('Channel not found', 404);

    await db.socialAccount.delete({ where: { id: params.id } });
    return ok({ disconnected: true });
  } catch (error) {
    return handleError(error);
  }
}
