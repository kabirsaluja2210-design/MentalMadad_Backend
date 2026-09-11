import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, setSessionCookie, verifyPassword } from '@/lib/auth';
import { handleError, ok, parseBody, fail } from '@/lib/api';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, schema);
    const user = await db.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return fail('Incorrect email or password', 401);
    }

    await setSessionCookie(await createSession(user.id, request.headers.get('user-agent') ?? undefined));
    return ok({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    return handleError(error);
  }
}
