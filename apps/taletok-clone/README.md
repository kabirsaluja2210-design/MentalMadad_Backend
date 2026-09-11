# ReelForge

A self-hosted faceless short-form video platform: pick a format, give it a topic, and
get back a rendered vertical MP4 with a voiceover track, per-scene visuals, timed
captions and your watermark burned in. Put a format on a schedule and it keeps
producing without you.

Built as a functional equivalent of a TaleTok-style product, with its own
implementation, interface and copy.

---

## What actually works right now

Everything below runs **with no API keys and no external services**. The render
pipeline is real: ffmpeg composition, `zoompan` camera moves, libass caption
burn-in, AAC audio, `+faststart` MP4s.

| Area | Status |
|---|---|
| 9 video formats, each with its own pacing/visuals/captions | Working |
| Script generation, scene breakdown, word-level caption timing | Working (offline template engine) |
| Voiceover track + word timings | **Placeholder** — correct-length silent WAV |
| Per-scene visuals | **Placeholder** — procedurally generated PNGs |
| ffmpeg composition, camera motion, caption burn-in, watermark | Working (real) |
| Quick editor + Advanced per-scene editor | Working |
| Render queue, retries, progress, credit refund on failure | Working |
| Series automation + posting calendar | Working |
| Publishing to TikTok/YouTube/Instagram | **Simulated** — recorded locally, never uploaded |
| Auth, workspaces, brand kit, credits, plans | Working |

The two placeholder stages and simulated publishing are clearly marked as such
in the UI (Settings → Providers), and are the only things standing between this
and a production deployment.

---

## Quick start

```bash
npm install
cp .env.example .env        # defaults work as-is
npm run setup               # generate client, create SQLite db, seed demo data
npm run dev                 # web app on http://localhost:3000
npm run worker              # in a second terminal — renders the queue
```

Sign in with **`demo@reelforge.local` / `demo1234`**.

Requires Node 20+ and **ffmpeg on PATH** (`apt install ffmpeg`, `brew install ffmpeg`),
or set `FFMPEG_PATH`. Settings will tell you if it is missing.

---

## The nine formats

| Format | What it makes |
|---|---|
| **Reddit Story** | Forum story narrated over a moving background, karaoke captions |
| **Cinematic Short** | Slow dramatic voiceover, one striking frame per beat |
| **AI Short** | General-purpose: any topic (or your own script) into a short |
| **Timelapse** | A progression across eras with interpolated era labels |
| **Long-form Story** | Up to 10 minutes, chaptered, 16:9 by default |
| **Quiz** | Question → countdown → reveal, one beat pair per question |
| **Listicle** | Ranked countdown with numbered beats |
| **Text Message Story** | A story told as a chat thread between two speakers |
| **Motivational** | Punchy declarative lines over bold typography |

A format is a recipe, not a prompt: each one sets beat length, visual style,
caption treatment, camera-move pool, music mood and its own options panel.
Adding a tenth means one entry in `src/pipeline/modes.ts` plus a beat planner —
the API, both editors and the UI pick it up automatically.

---

## How a render runs

```
script → voice → visuals → captions → compose → finish → thumbnail
```

1. **script** — the LLM provider writes a title, hook, CTA and a list of beats.
   Beats become `Scene` rows.
2. **voice** — each scene's text is synthesised; the provider returns audio plus
   **word-level timings**, which set the scene's true duration.
3. **visuals** — one image per scene, seeded deterministically from the prompt so
   an unchanged scene re-renders identically.
4. **captions** — word timings are offset onto the global timeline and written as
   an ASS subtitle file.
5. **compose** — each scene becomes a clip with its camera move (`zoompan`), then
   clips are joined with the concat demuxer using stream copy.
6. **finish** — captions burned via libass, watermark drawn, music bed mixed.
7. **thumbnail** — poster frame extracted.

Each stage persists before the next begins, so a failed render resumes and the
Advanced editor can regenerate one scene without redoing the rest. Scenes marked
**locked** are skipped on re-render.

---

## Adding real AI

Every external-AI touchpoint sits behind an interface in `src/providers/types.ts`
with a built-in stub. Resolution per stage: an explicit `*_PROVIDER` env var → the
first provider that has credentials → the stub.

```bash
ANTHROPIC_API_KEY=...     # or OPENAI_API_KEY  — model-written scripts
ELEVENLABS_API_KEY=...    # or OPENAI_API_KEY  — real voiceover
IMAGE_PROVIDER=replicate
REPLICATE_API_TOKEN=...   # or OPENAI_API_KEY  — generated visuals
```

Stages are independent — model-written scripts over placeholder visuals is a
normal, supported configuration. Hosted adapters fall back to the stub on any
error rather than failing a render. **No code changes are needed anywhere.**

Adapters are already written for Anthropic, OpenAI (chat/speech/images),
ElevenLabs and Replicate.

### Publishing

`TIKTOK_CLIENT_KEY`, `YOUTUBE_CLIENT_ID`, `INSTAGRAM_APP_ID` (+ secrets) switch
channel connection to real OAuth. The **upload step itself is deliberately not
implemented** — each platform needs its own multi-step init/upload/publish flow.
Without credentials, posts are recorded locally and flagged `simulated: true` all
the way to the UI, so a simulated post is never mistaken for a live one. With
credentials but no upload implementation, publishing throws loudly rather than
silently dropping a post.

---

## Architecture

```
src/
  app/            Next.js App Router — 14 screens + 23 API routes
  components/     React client components (editors, managers)
  lib/            db, auth, credits, storage, api helpers, PNG/WAV encoders
  providers/      llm | tts | image | music | social — interfaces, stubs, hosted adapters
  pipeline/       modes catalog, beat planners, captions (ASS), ffmpeg, engine
  worker/         render queue, series scheduler, worker loop
prisma/           schema + seed
```

**Data model** — `User`, `Session`, `Workspace`, `Membership`, `BrandKit`, `Voice`,
`Series`, `Video`, `Scene`, `RenderJob`, `SocialAccount`, `ScheduledPost`,
`StoryIdea`, `Asset`, `CreditEntry`, `ProviderSetting`.

**Notable choices**

- **SQLite by default** so the app runs with zero services. JSON payloads are
  stored as TEXT, so switching `provider` to `postgresql` needs no model changes.
- **Queue in the database**, claimed with a conditional update — several workers
  can share it safely without a broker.
- **Credits charged up front, refunded automatically** when a render fails after
  its retries.
- **Sessions are DB-backed**; the JWT is only an envelope, so signing out really
  revokes access.
- **PNG and WAV encoders written by hand** (`src/lib/media-encode.ts`) — the stubs
  must emit files ffmpeg can decode with *truthful durations*, or every downstream
  timing calculation is wrong.
- **Captions as ASS, not drawtext** — libass handles per-word highlighting,
  outlines and safe-area margins in one filter pass.

---

## Testing

```bash
npm test          # 61 unit tests
npm run typecheck
npm run build
```

Covered: speech timing and caption grouping, ASS generation (including that
caption text cannot inject override tags), the mode catalog and all nine beat
planners, credit maths, schedule advancement, and the PNG/WAV encoders.

---

## Known gaps

- Voiceover audio is silent and visuals are procedural until keys are supplied.
- Platform uploads are not implemented (see **Publishing** above).
- No payment processor — switching plans grants credits directly.
- Music library is metadata-only; no audio ships with the repo. Drop files in
  `STORAGE_DIR/music` and set `path` to enable the bed.
- Renders are CPU-bound and processed one at a time per worker.
