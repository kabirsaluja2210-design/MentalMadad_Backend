import zlib from 'node:zlib';

/**
 * Tiny pure-Node encoders for PNG and WAV.
 *
 * The stub providers need to emit *real* media files — ffmpeg has to be able
 * to decode them, and durations have to be truthful or every downstream
 * timing calculation is wrong. Writing the two container formats by hand is
 * cheaper than pulling in an image/audio dependency for placeholder output.
 */

// ---------------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

export type RgbPixel = [number, number, number];

/**
 * Encodes RGB pixel data as a PNG. `pixelAt` is called once per pixel, which
 * keeps callers free to draw procedurally without allocating a framebuffer.
 */
export function encodePng(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => RgbPixel,
): Buffer {
  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      const p = rowStart + 1 + x * 3;
      raw[p] = r & 0xff;
      raw[p + 1] = g & 0xff;
      raw[p + 2] = b & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------- WAV

/**
 * Encodes 16-bit mono PCM as a RIFF/WAVE file. `sampleAt` returns a float in
 * [-1, 1]; pass a function returning 0 for exact-duration silence.
 */
export function encodeWav(
  durationMs: number,
  sampleRate: number,
  sampleAt: (index: number, sampleRate: number) => number,
): Buffer {
  const frames = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const data = Buffer.alloc(frames * 2);

  for (let i = 0; i < frames; i++) {
    const clamped = Math.max(-1, Math.min(1, sampleAt(i, sampleRate)));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

// -------------------------------------------------------------- determinism

/** FNV-1a. Gives stub providers stable output for the same prompt/seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) seeded from a number. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
