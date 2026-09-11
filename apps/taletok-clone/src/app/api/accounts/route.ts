import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { SOCIAL_PLATFORMS, getSocialProvider } from '@/providers/social';
import { handleError, ok, parseBody } from '@/lib/api';

const schema = z.object({
  platform: z.enum(['tiktok', 'youtube', 'instagram']),
  handle: z.string().min(1).max(80),
  displayName: z.string().max(120).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = await db.socialAccount.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, platform: true, handle: true, displayName: true, status: true, createdAt: true },
    });

    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    return ok({
      accounts,
      platforms: SOCIAL_PLATFORMS.map((p) => ({
        ...p,
        authorizeUrl: getSocialProvider(p.platform).authorizeUrl(
          user.workspaceId,
          `${base}/api/accounts/callback/${p.platform}`,
        ),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Connects a channel. With platform app credentials configured the UI sends
 * users through `authorizeUrl` instead; this path records the local,
 * simulated connection used when no credentials are present.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const account = await db.socialAccount.create({
      data: {
        workspaceId: user.workspaceId,
        platform: body.platform,
        handle: body.handle.startsWith('@') ? body.handle : `@${body.handle}`,
        displayName: body.displayName ?? '',
      },
    });
    return ok({ account, simulated: !getSocialProvider(body.platform).info.available }, 201);
  } catch (error) {
    return handleError(error);
  }
}
