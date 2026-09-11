import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok, parseBody } from '@/lib/api';

const schema = z.object({
  watermarkText: z.string().max(60).nullable().optional(),
  watermarkPos: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional(),
  watermarkOpacity: z.number().min(0).max(1).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  captionStyle: z.enum(['karaoke', 'block', 'word-pop', 'classic']).optional(),
  captionColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  captionHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  outroText: z.string().max(200).nullable().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const brandKit =
      (await db.brandKit.findUnique({ where: { workspaceId: user.workspaceId } })) ??
      (await db.brandKit.create({ data: { workspaceId: user.workspaceId } }));
    return ok({ brandKit });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const brandKit = await db.brandKit.upsert({
      where: { workspaceId: user.workspaceId },
      update: body,
      create: { workspaceId: user.workspaceId, ...body },
    });
    return ok({ brandKit });
  } catch (error) {
    return handleError(error);
  }
}
