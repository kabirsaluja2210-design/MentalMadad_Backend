import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, hashPassword, setSessionCookie } from '@/lib/auth';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(80),
  workspaceName: z.string().min(1).max(80).optional(),
});

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
}

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, schema);
    const email = body.email.toLowerCase().trim();

    if (await db.user.findUnique({ where: { email } })) {
      return fail('An account with that email already exists', 409);
    }

    const user = await db.user.create({
      data: { email, name: body.name.trim(), passwordHash: await hashPassword(body.password) },
    });

    // Every account gets a workspace; the slug must stay unique.
    const base = slugify(body.workspaceName || `${body.name}s studio`);
    let slug = base;
    for (let i = 2; await db.workspace.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

    const workspace = await db.workspace.create({
      data: { name: body.workspaceName?.trim() || `${body.name}'s Studio`, slug, plan: 'FREE', credits: 30 },
    });
    await db.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
    await db.brandKit.create({ data: { workspaceId: workspace.id } });
    await db.creditEntry.create({
      data: { workspaceId: workspace.id, delta: 30, reason: 'Free plan — welcome credits', balanceAfter: 30 },
    });

    await setSessionCookie(await createSession(user.id, request.headers.get('user-agent') ?? undefined));
    return ok({ id: user.id, email: user.email, name: user.name, workspaceId: workspace.id }, 201);
  } catch (error) {
    return handleError(error);
  }
}
