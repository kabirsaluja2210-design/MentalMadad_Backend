import type { ImageProvider, ImageRequest, ImageResult } from '../types';
import { writeFile } from '@/lib/storage';
import { dimensionsFor, stubImage } from './stub';

/**
 * Hosted image generation. Falls back to the procedural provider on any
 * failure so a flaky vendor never kills a render.
 */

function sizeParam(aspect: string): string {
  switch (aspect) {
    case '1:1': return '1024x1024';
    case '16:9': return '1792x1024';
    default: return '1024x1792';
  }
}

export const openaiImage: ImageProvider = {
  info: {
    id: 'openai',
    name: 'OpenAI Images',
    kind: 'image',
    available: Boolean(process.env.OPENAI_API_KEY),
    placeholder: false,
    note: process.env.OPENAI_API_KEY ? 'Connected.' : 'No API key set.',
  },

  async generate(req: ImageRequest): Promise<ImageResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return stubImage.generate(req);

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
          prompt: req.prompt,
          size: sizeParam(req.aspect),
          n: 1,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI images responded ${res.status}`);

      const json = await res.json();
      const b64 = json.data?.[0]?.b64_json;
      const url = json.data?.[0]?.url;

      let bytes: Buffer;
      if (b64) {
        bytes = Buffer.from(b64, 'base64');
      } else if (url) {
        bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
      } else {
        throw new Error('No image in response');
      }

      const outPath = req.outPath.replace(/\.png$/, '.png');
      await writeFile(outPath, bytes);
      const { width, height } = dimensionsFor(req.aspect);
      return { imagePath: outPath, width, height };
    } catch {
      return stubImage.generate(req);
    }
  },
};

export const replicateImage: ImageProvider = {
  info: {
    id: 'replicate',
    name: 'Replicate',
    kind: 'image',
    available: Boolean(process.env.REPLICATE_API_TOKEN),
    placeholder: false,
    note: process.env.REPLICATE_API_TOKEN ? 'Connected.' : 'No API token set.',
  },

  async generate(req: ImageRequest): Promise<ImageResult> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return stubImage.generate(req);

    try {
      const create = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'wait' },
        body: JSON.stringify({
          version: process.env.REPLICATE_IMAGE_VERSION || 'black-forest-labs/flux-schnell',
          input: { prompt: req.prompt, aspect_ratio: req.aspect, seed: req.seed },
        }),
      });
      if (!create.ok) throw new Error(`Replicate responded ${create.status}`);

      const json = await create.json();
      const output = Array.isArray(json.output) ? json.output[0] : json.output;
      if (typeof output !== 'string') throw new Error('No image URL in response');

      const bytes = Buffer.from(await (await fetch(output)).arrayBuffer());
      await writeFile(req.outPath, bytes);
      const { width, height } = dimensionsFor(req.aspect);
      return { imagePath: req.outPath, width, height };
    } catch {
      return stubImage.generate(req);
    }
  },
};
