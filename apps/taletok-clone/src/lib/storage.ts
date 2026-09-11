import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Local filesystem storage. Everything the pipeline produces (audio, frames,
 * rendered MP4s) lands under STORAGE_DIR and is served back through
 * /api/media/[...path]. Swapping in S3 means reimplementing these four
 * functions; nothing else in the codebase touches the disk directly.
 */

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || './storage');

export async function ensureDir(dir: string): Promise<string> {
  const abs = path.isAbsolute(dir) ? dir : path.join(STORAGE_DIR, dir);
  await fs.mkdir(abs, { recursive: true });
  return abs;
}

export function storagePath(...parts: string[]): string {
  return path.join(STORAGE_DIR, ...parts);
}

export async function writeFile(relPath: string, data: Buffer | string): Promise<string> {
  const abs = storagePath(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return relPath;
}

export async function readFile(relPath: string): Promise<Buffer> {
  return fs.readFile(storagePath(relPath));
}

export async function exists(relPath: string): Promise<boolean> {
  try {
    await fs.access(storagePath(relPath));
    return true;
  } catch {
    return false;
  }
}

export async function fileSize(relPath: string): Promise<number> {
  try {
    const stat = await fs.stat(storagePath(relPath));
    return stat.size;
  } catch {
    return 0;
  }
}

/** Public URL for a stored file. */
export function mediaUrl(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  return `/api/media/${relPath.split(path.sep).join('/')}`;
}
