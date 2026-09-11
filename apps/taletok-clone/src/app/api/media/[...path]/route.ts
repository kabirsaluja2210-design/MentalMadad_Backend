import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { STORAGE_DIR } from '@/lib/storage';
import { currentUser } from '@/lib/auth';
import { fail } from '@/lib/api';

/**
 * Serves generated media out of STORAGE_DIR.
 *
 * Supports Range requests so the editor's <video> element can seek, and
 * resolves the path against STORAGE_DIR before checking containment so
 * `../` segments cannot escape the storage root.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ass': 'text/plain; charset=utf-8',
};

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const user = await currentUser();
  if (!user) return fail('Not signed in', 401);

  const resolved = path.resolve(STORAGE_DIR, ...params.path);
  if (resolved !== STORAGE_DIR && !resolved.startsWith(STORAGE_DIR + path.sep)) {
    return fail('Not found', 404);
  }

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return fail('Not found', 404);
  }
  if (!stat.isFile()) return fail('Not found', 404);

  const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.get('range');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;

      if (start >= stat.size || end >= stat.size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${stat.size}` },
        });
      }

      const stream = Readable.toWeb(createReadStream(resolved, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          'content-type': contentType,
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${stat.size}`,
          'accept-ranges': 'bytes',
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'content-type': contentType,
      'content-length': String(stat.size),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
    },
  });
}
