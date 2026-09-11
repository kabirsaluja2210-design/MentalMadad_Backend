import { clearSession } from '@/lib/auth';
import { handleError, ok } from '@/lib/api';

export async function POST() {
  try {
    await clearSession();
    return ok({ signedOut: true });
  } catch (error) {
    return handleError(error);
  }
}
