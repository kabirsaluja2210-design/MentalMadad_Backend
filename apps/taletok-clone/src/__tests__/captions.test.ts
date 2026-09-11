import { describe, expect, it } from 'vitest';
import { assTime, buildAss, hexToAss } from '@/pipeline/captions';
import { estimateTiming } from '@/providers/tts/timing';

const opts = {
  aspect: '9:16',
  fontColor: '#ffffff',
  highlightColor: '#ffe14d',
} as const;

function sceneAt(startMs: number, text: string) {
  const { words, durationMs } = estimateTiming(text);
  return { startMs, durationMs, text, words };
}

describe('hexToAss', () => {
  it('reverses RGB into ASS byte order', () => {
    // #ff0000 (red) -> blue-green-red = 0000FF
    expect(hexToAss('#ff0000')).toBe('&H000000FF');
    expect(hexToAss('#0000ff')).toBe('&H00FF0000');
  });

  it('encodes alpha in the leading byte', () => {
    expect(hexToAss('#ffffff', 1)).toBe('&HFFFFFFFF');
    expect(hexToAss('#ffffff', 0)).toBe('&H00FFFFFF');
  });
});

describe('assTime', () => {
  it('formats as H:MM:SS.cc', () => {
    expect(assTime(0)).toBe('0:00:00.00');
    expect(assTime(1500)).toBe('0:00:01.50');
    expect(assTime(3_661_000)).toBe('1:01:01.00');
  });

  it('clamps negatives to zero', () => {
    expect(assTime(-500)).toBe('0:00:00.00');
  });
});

describe('buildAss', () => {
  it('emits a valid header with the right resolution', () => {
    const ass = buildAss([sceneAt(0, 'Hello there')], { ...opts, style: 'karaoke' });
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('[Events]');
  });

  it('offsets a later scene past the first', () => {
    const ass = buildAss(
      [sceneAt(0, 'First scene here'), sceneAt(10_000, 'Second scene here')],
      { ...opts, style: 'classic' },
    );
    // A dialogue line starting at ten seconds can only come from scene two.
    expect(ass).toMatch(/Dialogue: 0,0:00:1[0-9]\./);
  });

  it('gives karaoke one event per word so the highlight can move', () => {
    const ass = buildAss([sceneAt(0, 'one two three four')], { ...opts, style: 'karaoke' });
    const events = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(events).toHaveLength(4);
    expect(ass).toContain(hexToAss(opts.highlightColor));
  });

  it('gives block style one event for the whole line', () => {
    const ass = buildAss([sceneAt(0, 'one two three four')], { ...opts, style: 'block' });
    const events = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(events).toHaveLength(1);
  });

  it('neutralises braces so text cannot inject override tags', () => {
    const ass = buildAss([sceneAt(0, '{\\fs99}injected')], { ...opts, style: 'classic' });
    expect(ass).not.toContain('{\\fs99}');
  });

  it('falls back to even spacing when a scene has no word timings', () => {
    const ass = buildAss(
      [{ startMs: 0, durationMs: 4000, text: 'no timings here', words: [] }],
      { ...opts, style: 'classic' },
    );
    expect(ass).toContain('Dialogue:');
  });
});
