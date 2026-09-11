import { requireUser } from '@/lib/auth';
import { providerStatus, usingPlaceholders } from '@/providers/registry';
import { ffmpegAvailable } from '@/pipeline/ffmpeg';
import { handleError, ok } from '@/lib/api';

export async function GET() {
  try {
    await requireUser();
    return ok({
      providers: providerStatus(),
      usingPlaceholders: usingPlaceholders(),
      ffmpeg: await ffmpegAvailable(),
    });
  } catch (error) {
    return handleError(error);
  }
}
