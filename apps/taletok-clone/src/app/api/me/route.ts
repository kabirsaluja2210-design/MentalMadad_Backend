import { currentUser } from '@/lib/auth';
import { handleError, ok } from '@/lib/api';

export async function GET() {
  try {
    const user = await currentUser();
    return ok({ user });
  } catch (error) {
    return handleError(error);
  }
}
