import { VIDEO_MODES } from '@/pipeline/modes';
import { handleError, ok } from '@/lib/api';

export async function GET() {
  try {
    return ok({ modes: VIDEO_MODES });
  } catch (error) {
    return handleError(error);
  }
}
