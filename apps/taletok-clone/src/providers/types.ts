/**
 * Provider contracts.
 *
 * Every external-AI touchpoint in the pipeline goes through one of these
 * interfaces. Each has a built-in stub implementation that needs no API key
 * and no network, so the whole product works out of the box; a hosted adapter
 * takes over for a stage as soon as that stage's credentials appear.
 * The pipeline code never learns which one it got.
 */

export type ProviderKind = 'llm' | 'tts' | 'image' | 'video' | 'music' | 'social';

export interface ProviderInfo {
  /** Stable id, e.g. "stub", "openai", "elevenlabs". */
  id: string;
  name: string;
  kind: ProviderKind;
  /** False when credentials are missing — the registry then falls back to stub. */
  available: boolean;
  /** Shown in the UI so it's obvious which stages are running on placeholders. */
  placeholder: boolean;
  /** Human-readable note rendered next to the provider in settings. */
  note?: string;
}

// ------------------------------------------------------------------- script

export interface ScriptBeat {
  /** Narration for this beat — one or two sentences. */
  text: string;
  /**
   * Narrative role (hook, development, turn…). Drives the camera treatment,
   * so a piece cuts between framings instead of repeating one move.
   */
  shot?: string;
  /** What the visual for this beat should show. */
  visualPrompt: string;
  /** Camera move hint for the compositor. */
  motion?: string;
}

export interface ScriptRequest {
  mode: string;
  topic: string;
  targetDurationSec: number;
  tone?: string;
  /** Raw source material (a Reddit post body, an article, a transcript). */
  sourceText?: string;
  language?: string;
}

export interface ScriptResult {
  title: string;
  /** The first 1-2 seconds of narration — carries the whole retention curve. */
  hook: string;
  script: string;
  cta: string;
  beats: ScriptBeat[];
  hashtags: string[];
}

export interface IdeaSuggestion {
  title: string;
  body: string;
  suggestedMode: string;
  viralScore: number;
}

export interface LlmProvider {
  info: ProviderInfo;
  writeScript(req: ScriptRequest): Promise<ScriptResult>;
  /** Regenerate a single beat — powers per-scene regeneration in the editor. */
  rewriteBeat(req: ScriptRequest, beat: ScriptBeat, instruction?: string): Promise<ScriptBeat>;
  suggestIdeas(topic: string, count: number): Promise<IdeaSuggestion[]>;
}

// -------------------------------------------------------------------- voice

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TtsRequest {
  text: string;
  voiceExternalId: string;
  style?: string;
  /** 1.0 = natural. Shorts usually run 1.05-1.2. */
  speed?: number;
  /** Where to write the audio, relative to STORAGE_DIR. */
  outPath: string;
}

export interface TtsResult {
  audioPath: string;
  durationMs: number;
  /** Word-level timings drive karaoke captions. */
  words: WordTiming[];
  sampleRate: number;
}

export interface VoiceOption {
  externalId: string;
  name: string;
  gender: string;
  accent: string;
  style: string;
  premium: boolean;
}

export interface TtsProvider {
  info: ProviderInfo;
  synthesize(req: TtsRequest): Promise<TtsResult>;
  listVoices(): Promise<VoiceOption[]>;
}

// ------------------------------------------------------------------ visuals

export interface ImageRequest {
  prompt: string;
  aspect: string;
  /** Deterministic output for the same seed — keeps re-renders stable. */
  seed: number;
  style?: string;
  outPath: string;
}

export interface ImageResult {
  imagePath: string;
  width: number;
  height: number;
}

export interface ImageProvider {
  info: ProviderInfo;
  generate(req: ImageRequest): Promise<ImageResult>;
}

// ------------------------------------------------------------ motion clips

export interface VideoRequest {
  prompt: string;
  aspect: string;
  /** Deterministic output for the same seed — keeps re-renders stable. */
  seed: number;
  style?: string;
  /** How long the scene needs. Providers may return a shorter loopable clip. */
  durationMs: number;
  /** Renderer preference: 'fast' | 'blender'. Ignored by hosted providers. */
  renderer?: string;
  /** Narrative role of this beat; selects the camera treatment. */
  shot?: string;
  outPath: string;
}

export interface VideoResult {
  clipPath: string;
  width: number;
  height: number;
  /** Actual length of the returned clip, which may be under what was asked. */
  durationMs: number;
  /** True when the clip can be looped without a visible seam. */
  seamless: boolean;
}

export interface VideoProvider {
  info: ProviderInfo;
  generate(req: VideoRequest): Promise<VideoResult>;
}

// -------------------------------------------------------------------- music

export interface MusicTrack {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  path: string | null;
  durationMs: number;
}

export interface MusicProvider {
  info: ProviderInfo;
  listTracks(): Promise<MusicTrack[]>;
  pickTrack(mood: string, durationMs: number): Promise<MusicTrack>;
}

// --------------------------------------------------------------- publishing

export interface PublishRequest {
  platform: string;
  accountHandle: string;
  accessToken: string | null;
  videoPath: string;
  caption: string;
  hashtags: string[];
}

export interface PublishResult {
  postedUrl: string;
  externalId: string;
  /** True when nothing actually left the machine. */
  simulated: boolean;
}

export interface SocialProvider {
  info: ProviderInfo;
  platform: string;
  publish(req: PublishRequest): Promise<PublishResult>;
  /** OAuth entry point — returns null for the stub. */
  authorizeUrl(workspaceId: string, redirectUri: string): string | null;
}
