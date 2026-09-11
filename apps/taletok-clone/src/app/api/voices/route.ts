import { db } from '@/lib/db';
import { handleError, ok } from '@/lib/api';

export async function GET() {
  try {
    const voices = await db.voice.findMany({ orderBy: [{ premium: 'asc' }, { name: 'asc' }] });
    return ok({ voices });
  } catch (error) {
    return handleError(error);
  }
}
