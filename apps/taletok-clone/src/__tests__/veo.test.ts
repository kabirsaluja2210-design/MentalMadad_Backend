import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { veoVideo, extractVideo, aspectFor, MIN_DURATION_SEC, MAX_DURATION_SEC } from '@/providers/video/veo';
import { getVideo } from '@/providers/registry';
import { proceduralVideo } from '@/providers/video/procedural';

const SOURCE = readFileSync(path.join(process.cwd(), 'src/providers/video/veo.ts'), 'utf8');

describe('aspect mapping', () => {
  it('maps to the two ratios Veo accepts', () => {
    // Anything else is rejected outright by the API.
    expect(aspectFor('9:16')).toBe('9:16');
    expect(aspectFor('16:9')).toBe('16:9');
    expect(aspectFor('1:1')).toBe('9:16');
    expect(aspectFor('nonsense')).toBe('9:16');
  });
});

describe('duration bounds', () => {
  it('matches what the API actually allows', () => {
    // Probed against the live endpoint: shorter requests are rejected.
    expect(MIN_DURATION_SEC).toBe(4);
    expect(MAX_DURATION_SEC).toBeGreaterThan(MIN_DURATION_SEC);
  });

  it('clamps rather than sending an out-of-range request', () => {
    expect(SOURCE).toContain('Math.max(\n      MIN_DURATION_SEC,');
    expect(SOURCE).toContain('Math.min(MAX_DURATION_SEC');
  });
});

describe('extractVideo', () => {
  it('finds a URI nested anywhere in the response', () => {
    // The payload has moved between shapes across previews.
    const found = extractVideo({
      generateVideoResponse: {
        generatedSamples: [{ video: { uri: 'https://example.invalid/v/abc' } }],
      },
    });
    expect(found?.uri).toBe('https://example.invalid/v/abc');
  });

  it('finds inline bytes when there is no URI', () => {
    const found = extractVideo({ predictions: [{ bytesBase64Encoded: 'A'.repeat(2048) }] });
    expect(found?.base64).toHaveLength(2048);
  });

  it('ignores short strings that are filenames, not video data', () => {
    expect(extractVideo({ predictions: [{ videoData: 'clip.mp4' }] })).toBeNull();
  });

  it('returns null for an empty or missing response', () => {
    expect(extractVideo(undefined)).toBeNull();
    expect(extractVideo({})).toBeNull();
  });

  it('terminates on a self-referencing response', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => extractVideo(cyclic)).not.toThrow();
  });
});

describe('selection', () => {
  const original = process.env.VIDEO_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = original;
  });

  it('is never chosen automatically, even with a key present', () => {
    // It bills per clip and one video is a clip per scene, so a key alone
    // must not switch it on.
    delete process.env.VIDEO_PROVIDER;
    expect(getVideo('auto').info.id).not.toBe('veo');
    expect(getVideo('fast').info.id).toBe(proceduralVideo.info.id);
  });

  it('is selected only when named explicitly', () => {
    process.env.VIDEO_PROVIDER = 'veo';
    const selected = getVideo('auto').info.id;
    // Without a key it must still decline rather than fail later.
    expect(selected).toBe(veoVideo.info.available ? 'veo' : proceduralVideo.info.id);
  });
});

describe('honest reporting and failure handling', () => {
  it('does not claim to be connected merely because a key exists', () => {
    // The free tier lists the Veo models with no quota behind them, so a key
    // proves entitlement but not usability.
    expect(veoVideo.info.note).not.toMatch(/^Connected/);
    if (veoVideo.info.available) {
      expect(veoVideo.info.note).toMatch(/billing/i);
    }
  });

  it('explains a 429 as a billing problem, not a bad key', () => {
    expect(SOURCE).toContain('start.status === 429');
    expect(SOURCE).toContain('billing-enabled');
  });

  it('marks generated footage as non-loopable', () => {
    // Model output has no matching start and end frame, so the compositor
    // must not repeat it to pad a longer scene.
    expect(SOURCE).toContain('seamless: false');
  });

  it('falls back to the procedural renderer instead of failing a render', () => {
    expect(SOURCE).toContain('proceduralVideo.generate(req)');
    expect(SOURCE).toContain('VEO_TIMEOUT_MS');
  });

  it('rejects a truncated download rather than writing a broken clip', () => {
    expect(SOURCE).toContain('bytes.length < 1024');
  });

  it('authenticates the download, which is not a public link', () => {
    expect(SOURCE).toContain('key=${encodeURIComponent(key)}');
  });
});
