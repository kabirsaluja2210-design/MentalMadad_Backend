import type { VideoProvider, VideoRequest, VideoResult } from '../types';
import { hashString } from '@/lib/media-encode';
import { writeFile } from '@/lib/storage';
import { ffprobeDuration } from '@/pipeline/ffmpeg';
import { dimensionsFor } from '../visual/painters';
import { proceduralVideo } from './procedural';

/**
 * Google Veo text-to-video.
 *
 * Unlike the chat models, Veo is asynchronous: the request returns an
 * operation name and the video is collected by polling until it completes.
 * It is reached through the same Gemini endpoint and key as script writing,
 * which matters here because it is the only hosted video provider this
 * environment can reach at all.
 *
 * Cost is real and per clip, and a single video is a clip per scene, so this
 * is opt-in via VIDEO_PROVIDER rather than something that switches itself on
 * whenever a key happens to be present.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Veo will not generate anything shorter than this. */
const MIN_DURATION_SEC = 4;
const MAX_DURATION_SEC = 8;

const MODEL = process.env.VEO_MODEL || 'veo-3.1-lite-generate-preview';
const RESOLUTION = process.env.VEO_RESOLUTION || '720p';
const POLL_MS = Number(process.env.VEO_POLL_MS || 6000);
const TIMEOUT_MS = Number(process.env.VEO_TIMEOUT_MS || 10 * 60_000);

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/** Veo accepts a fixed set of ratios; anything else is rejected outright. */
function aspectFor(aspect: string): string {
  return aspect === '16:9' ? '16:9' : '9:16';
}

interface Operation {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: Record<string, unknown>;
}

/** Walks the response for a video URI or inline bytes, whichever is present. */
function extractVideo(response: Record<string, unknown> | undefined):
  { uri?: string; base64?: string } | null {
  if (!response) return null;

  // The payload has moved between shapes across previews, so search rather
  // than assume one path. The keyword test runs against the whole ancestor
  // path, not just the immediate key: Veo nests the link under a key called
  // "uri" inside an object called "video", and matching on the leaf key alone
  // misses it entirely.
  const seen = new Set<unknown>();
  const stack: { node: unknown; path: string }[] = [{ node: response, path: '' }];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const { node, path } = current;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const keyPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string') {
        if (/^https?:\/\//.test(value) && /video|veo|download|sample/i.test(keyPath)) {
          return { uri: value };
        }
        // Inline bytes are large; a short string is a filename, not a video.
        if (/bytes|data|b64/i.test(key) && value.length > 1024) {
          return { base64: value };
        }
      } else if (value && typeof value === 'object') {
        stack.push({ node: value, path: keyPath });
      }
    }
  }

  return null;
}

export const veoVideo: VideoProvider = {
  info: {
    id: 'veo',
    name: 'Google Veo',
    kind: 'video',
    available: Boolean(apiKey()),
    placeholder: false,
    // Deliberately not "connected": a key alone proves nothing, since the
    // free tier exposes the models with no quota behind them.
    note: apiKey()
      ? `Key present (${MODEL}). Requires billing enabled — the free tier has no Veo quota. `
        + 'Billed per clip, and one video is a clip per scene.'
      : 'No Gemini API key set.',
  },

  async generate(req: VideoRequest): Promise<VideoResult> {
    const key = apiKey();
    if (!key) return proceduralVideo.generate(req);

    const headers = { 'content-type': 'application/json', 'x-goog-api-key': key };
    const seconds = Math.max(
      MIN_DURATION_SEC,
      Math.min(MAX_DURATION_SEC, Math.round(req.durationMs / 1000)),
    );

    try {
      const start = await fetch(`${BASE}/models/${encodeURIComponent(MODEL)}:predictLongRunning`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          instances: [{ prompt: req.prompt }],
          parameters: {
            aspectRatio: aspectFor(req.aspect),
            durationSeconds: seconds,
            resolution: RESOLUTION,
            sampleCount: 1,
          },
        }),
      });
      if (!start.ok) {
        const body = await start.text();
        // A key can be entitled to Veo and still have no quota for it: the
        // free tier lists the models but allocates nothing, so generation
        // fails at 429 rather than at authentication. Say so plainly, because
        // the generic message sends people to check their key instead.
        if (start.status === 429) {
          throw new Error(
            'Veo quota is zero on this key. The model is visible but generation '
            + 'requires a billing-enabled Google Cloud project; the free tier '
            + 'does not include video.',
          );
        }
        throw new Error(`Veo responded ${start.status}: ${body}`);
      }

      let operation = (await start.json()) as Operation;
      if (!operation.name) throw new Error('Veo returned no operation name');

      // Poll until the operation settles or we run out of patience.
      const deadline = Date.now() + TIMEOUT_MS;
      while (!operation.done) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for Veo');
        await new Promise((r) => setTimeout(r, POLL_MS));

        const poll = await fetch(`${BASE}/${operation.name}`, { headers });
        if (!poll.ok) throw new Error(`Veo poll responded ${poll.status}`);
        operation = (await poll.json()) as Operation;
      }

      if (operation.error) throw new Error(operation.error.message || 'Veo generation failed');

      const video = extractVideo(operation.response);
      if (!video) throw new Error('No video in the completed operation');

      let bytes: Buffer;
      if (video.base64) {
        bytes = Buffer.from(video.base64, 'base64');
      } else {
        // The download URI needs the key too; it is not a public link.
        const separator = video.uri!.includes('?') ? '&' : '?';
        const res = await fetch(`${video.uri}${separator}key=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(`Could not download the video (${res.status})`);
        bytes = Buffer.from(await res.arrayBuffer());
      }
      if (bytes.length < 1024) throw new Error('Downloaded video was empty');

      await writeFile(req.outPath, bytes);
      const { width, height } = dimensionsFor(req.aspect);

      return {
        clipPath: req.outPath,
        width,
        height,
        durationMs: (await ffprobeDuration(req.outPath)) ?? seconds * 1000,
        // Generated footage has no matching start and end frame, so the
        // compositor must not loop it to pad a longer scene.
        seamless: false,
      };
    } catch (error) {
      console.warn('[veo] falling back to the procedural renderer:', (error as Error).message);
      return proceduralVideo.generate(req);
    }
  },
};

export { extractVideo, aspectFor, MIN_DURATION_SEC, MAX_DURATION_SEC };
