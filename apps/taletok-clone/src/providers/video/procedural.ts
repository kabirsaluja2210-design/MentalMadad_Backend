import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { stubVideo } from './stub';
import { cartoon3dVideo } from './cartoon3d';

/**
 * Routes a clip request to the right procedural renderer.
 *
 * Formats whose visual style is `cartoon-3d` get the software 3D toon renderer;
 * everything else gets the cheaper animated gradient. Keeping the choice here
 * means the pipeline asks for "a clip" and never has to know which.
 */
export const proceduralVideo: VideoProvider = {
  info: {
    id: 'procedural',
    name: 'Built-in renderers (3D toon + gradient)',
    kind: 'video',
    available: true,
    placeholder: true,
    note: '3D cel-shaded animation for cartoon formats, animated gradients elsewhere. No API key needed.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    return req.style === 'cartoon-3d' ? cartoon3dVideo.generate(req) : stubVideo.generate(req);
  },
};
