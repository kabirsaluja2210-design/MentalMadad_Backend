import type { MusicProvider, MusicTrack } from '../types';

/**
 * Background music.
 *
 * The built-in library is metadata-only: no audio ships with the repo, so the
 * compositor simply skips the music bed when `path` is null. Dropping licensed
 * tracks into STORAGE_DIR/music and setting `path` turns the bed on with no
 * code change.
 */

const TRACKS: MusicTrack[] = [
  { id: 'tense-lofi-01', name: 'Low Ceiling', mood: 'tense-lofi', bpm: 78, path: null, durationMs: 180_000 },
  { id: 'tense-lofi-02', name: 'Slow Static', mood: 'tense-lofi', bpm: 84, path: null, durationMs: 165_000 },
  { id: 'epic-ambient-01', name: 'Long Horizon', mood: 'epic-ambient', bpm: 70, path: null, durationMs: 210_000 },
  { id: 'epic-ambient-02', name: 'Rising Mass', mood: 'epic-ambient', bpm: 66, path: null, durationMs: 195_000 },
  { id: 'upbeat-electronic-01', name: 'Bright Signal', mood: 'upbeat-electronic', bpm: 122, path: null, durationMs: 150_000 },
  { id: 'upbeat-electronic-02', name: 'Fast Lane', mood: 'upbeat-electronic', bpm: 128, path: null, durationMs: 144_000 },
  { id: 'calm-underscore-01', name: 'Open Room', mood: 'calm-underscore', bpm: 72, path: null, durationMs: 300_000 },
];

export const stubMusic: MusicProvider = {
  info: {
    id: 'stub',
    name: 'Built-in music library',
    kind: 'music',
    available: true,
    placeholder: true,
    note: 'Track metadata only — no audio bundled. Add files under STORAGE_DIR/music to enable the music bed.',
  },

  async listTracks(): Promise<MusicTrack[]> {
    return TRACKS;
  },

  async pickTrack(mood: string, durationMs: number): Promise<MusicTrack> {
    const matches = TRACKS.filter((t) => t.mood === mood);
    const pool = matches.length ? matches : TRACKS;
    // Prefer a track at least as long as the video so there's no loop seam.
    const longEnough = pool.filter((t) => t.durationMs >= durationMs);
    return (longEnough.length ? longEnough : pool)[0];
  },
};
