import { describe, expect, it } from 'vitest';
import { encodePng, encodeWav, hashString, seededRandom } from '@/lib/media-encode';

describe('encodePng', () => {
  it('writes a valid PNG signature and IHDR/IEND chunks', () => {
    const png = encodePng(8, 8, () => [255, 0, 0]);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.includes(Buffer.from('IHDR'))).toBe(true);
    expect(png.includes(Buffer.from('IDAT'))).toBe(true);
    expect(png.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('encodes the requested dimensions in the header', () => {
    const png = encodePng(64, 128, () => [0, 0, 0]);
    const ihdr = png.indexOf(Buffer.from('IHDR')) + 4;
    expect(png.readUInt32BE(ihdr)).toBe(64);
    expect(png.readUInt32BE(ihdr + 4)).toBe(128);
  });

  it('calls the painter once per pixel', () => {
    let calls = 0;
    encodePng(10, 7, () => { calls++; return [1, 2, 3]; });
    expect(calls).toBe(70);
  });
});

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header', () => {
    const wav = encodeWav(100, 8000, () => 0);
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
  });

  it('sizes the data chunk to match the requested duration', () => {
    const sampleRate = 16000;
    const wav = encodeWav(1000, sampleRate, () => 0);
    // 1s mono 16-bit at 16kHz = 32000 bytes of samples.
    expect(wav.readUInt32LE(40)).toBe(sampleRate * 2);
    expect(wav.length).toBe(44 + sampleRate * 2);
  });

  it('declares mono 16-bit PCM', () => {
    const wav = encodeWav(50, 44100, () => 0);
    expect(wav.readUInt16LE(20)).toBe(1);  // PCM
    expect(wav.readUInt16LE(22)).toBe(1);  // channels
    expect(wav.readUInt16LE(34)).toBe(16); // bits
  });

  it('clamps samples outside [-1, 1] instead of wrapping', () => {
    const wav = encodeWav(10, 8000, () => 5);
    expect(wav.readInt16LE(44)).toBe(32767);
  });
});

describe('determinism helpers', () => {
  it('hashes the same string to the same value', () => {
    expect(hashString('scene-one')).toBe(hashString('scene-one'));
    expect(hashString('scene-one')).not.toBe(hashString('scene-two'));
  });

  it('produces a repeatable sequence for a seed, in range', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 20; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
