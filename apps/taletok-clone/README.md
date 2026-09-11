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
| Voiceover track + word timings | **Working** — real local speech, no API key |
| Per-scene visuals — **generated motion clips** or stills | Procedural, but real animated MP4s |
| **3D cel-shaded animation** — software renderer, no GPU or API | Working (real 3D) |
| **Path-traced 3D via Blender** — real shadows, DOF, materials | Working (free, local, no key) |
| **Full 60s stories/documentaries** with a scaling narrative arc | Working |
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

For spoken narration (optional but recommended — see **Speech** below):

```bash
pip install piper-tts       # small neural TTS, runs locally
npm run fetch-voices        # ~180MB of voice models, gitignored
```

Sign in with **`demo@reelforge.local` / `demo1234`**.

Requires Node 20+ and **ffmpeg on PATH** (`apt install ffmpeg`, `brew install ffmpeg`),
or set `FFMPEG_PATH`. Settings will tell you if it is missing.

---

## The eleven formats

| Format | What it makes |
|---|---|
| **Reddit Story** | Forum story narrated over a moving background, karaoke captions |
| **Mechanism Explainer** | Why a designed object behaves as it does — smooth-shaded 3D, one continuous move |
| **Short Documentary** | A full 60s piece with a real arc, animated in 3D cel shading |
| **Cinematic Short** | Slow dramatic voiceover, animated in 3D cel shading |
| **AI Short** | General-purpose: any topic (or your own script) into a short |
| **Timelapse** | A progression across eras with interpolated era labels |
| **Long-form Story** | Up to 10 minutes, chaptered, 16:9 by default |
| **Quiz** | Question → countdown → reveal, one beat pair per question |
| **Listicle** | Ranked countdown with numbered beats |
| **Text Message Story** | A story told as a chat thread between two speakers |
| **Motivational** | Punchy declarative lines over bold typography |

### Motion clips vs stills

Each format declares whether its scenes default to a **generated motion clip** or
a **still frame with a camera move**. Atmospheric formats (cinematic short,
reddit story, AI short, timelapse, motivational) default to clips; card-like
formats where the visual carries information (quiz, listicle, chat thread,
long-form) default to stills, which are cheaper and read more clearly.

Either default can be overridden per video — at creation or later from the
editor — with `auto | video | image`.

The built-in clip generator is genuinely animated, not a still with a pan: the
painters are functions of position **and** time, so light drifts, rings expand
and blobs travel. They are periodic in time, so a short clip loops seamlessly to
fill a long scene instead of regenerating every second of it. Frames are
generated below playback resolution and rate, then scaled and interpolated up by
ffmpeg — abstract gradients upscale well, and generating 30fps of procedural
pixels in JS would be far too slow.

### 3D cartoon animation

Three formats (**Mechanism Explainer**, **Short Documentary** and **Cinematic
Short**) render their scenes with a **software 3D renderer written from scratch** — no GPU, no WebGL, no API
key, no model files. It is real geometry, not a filter over a still:

- a perspective camera with **near-plane clipping**, and a half-space triangle
  rasterizer with a z-buffer and perspective-correct normal interpolation;
- two shading models — **cel** (four flat bands, cartoon) and **smooth**
  (continuous ramp with a Blinn-Phong highlight, for explainers);
- **cartoon outlines**, drawn as a post-pass wherever the frame is
  discontinuous in object id, depth, or normal (a crease), and faded out past a
  distance so the horizon is not inked;
- nine procedural **sets** — hills, city, peaks, forest, coast, interior, crowd,
  plus **vehicle** and **machine** hero sets — chosen by keyword-matching the
  beat's visual prompt, with distance fog and per-archetype palettes;
- **aspect-aware framing**: the distance needed to fit a subject is solved for
  whichever axis is tighter, since at 9:16 the horizontal field is only ~56% of
  the vertical and framing by vertical FOV alone crops the subject badly;
- animated cameras and figures, on cycles that close over the clip so it loops.

Every mesh is generated from parameters (`mesh.ts`). Figures are **generic
original forms** — a capsule torso, a sphere head, simple limbs — and the
vehicle and machine sets are archetypes built from boxes and cylinders, with no
marque, badge or model-specific shaping. There are no model assets in the repo
and nothing is traced from existing artwork or products.

A 4-second 1080x1920 clip takes roughly 1.5s to render; a full 60-second
documentary renders end to end in under a minute.

### The explainer look

**Mechanism Explainer** targets the "why does this object do that" genre: one
designed object held in a **single continuous camera move** rather than cut
between shots, a pale desaturated sky over a dark ground so the one saturated
hero carries the frame, smooth shading with a specular highlight, no outlines,
and plain white captions. Its narration uses a third register — *mechanism* —
which walks a mechanism a step at a time and closes on design intent rather than
a moral.

Formats declare the caption treatment they were designed with. A workspace brand
kit can override it, but only when a style is explicitly chosen: `auto` (the
default) means each format keeps its own.

### Speech

Narration is synthesised **locally, with no API key and no network**. Two
engines, tried in order:

| | Piper | espeak-ng |
|---|---|---|
| Quality | Small neural TTS, natural | Formant synthesis, robotic |
| Setup | `pip install piper-tts` + `npm run fetch-voices` | `apt install espeak-ng`, nothing to download |
| Speed | ~1.7s per 4s of audio | Near-instant |

Piper is used whenever a voice model is on disk; otherwise espeak-ng takes over;
if neither is installed the pipeline falls back to the silent placeholder track
so a render never fails for want of a voice. Setting `ELEVENLABS_API_KEY` or
`OPENAI_API_KEY` overrides both.

Voice models come from GitHub releases rather than the usual Hugging Face
mirror, because many locked-down networks block the latter. They are ~60MB each
and live in `STORAGE_DIR/voices`, which is gitignored.

Neither local engine reports word timestamps, so the estimator produces the
caption timings and they are rescaled onto the measured audio duration — which
keeps karaoke captions locked to the real speech.

Note that the apt package named `piper` is an unrelated gaming-mouse tool that
shadows the TTS binary on `PATH`; the provider invokes `python3 -m piper`
explicitly to avoid it.

### Two renderers

Scene clips can be produced by either of two local renderers. Neither needs an
API key.

| | Fast (built-in) | High (Blender) |
|---|---|---|
| Engine | Software rasterizer written from scratch | Blender Cycles, path traced |
| Lighting | Cel or smooth shading, no shadows | Soft shadows, ambient occlusion, bounce |
| Optics | None | Depth of field, real metallic/roughness |
| Cost | **~1.5s** per clip | **~2min** per clip |

`auto` means fast, so nobody waits twenty minutes for a render they did not ask
for; set `VIDEO_RENDERER=blender` to flip that default, or choose per video at
creation or in the editor. A configured hosted model still overrides both.

Blender is invoked headless and builds its scenes procedurally from a JSON spec
(`src/providers/video/blender/build_scene.py`) — same archetypes, same original
geometry, no model files. Any failure falls back to the fast renderer rather
than killing the job. Install with `apt install blender` (or `brew install
--cask blender`); set `BLENDER_PATH` if it is not on `PATH`. Tune with
`BLENDER_SAMPLES`, `BLENDER_SCALE`, `BLENDER_FPS`, `BLENDER_CLIP_SECONDS`.

Note that distribution builds of Blender are often compiled without
OpenImageDenoise; the script probes for it and falls back to raw sampling.

### Writing a full minute

Formats that tell a story build a **narrative arc** sized to the request:
hook → premise → context → development → turn → consequence → resolution →
close. Extra length goes into *development*, where a story actually expands,
rather than padding the ending.

Beat count is then fitted against the **measured** narration length, not a
words-per-minute constant, and converges within a few percent — so a 60-second
documentary really is about 60 seconds. Two registers are available:
documentary (explanatory, third person) and story (first person, scene-driven).

A format is a recipe, not a prompt: each one sets beat length, visual style,
visual output kind, caption treatment, camera-move pool, music mood and its own
options panel.
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
3. **visuals** — one asset per scene, seeded deterministically from the prompt so
   an unchanged scene re-renders identically. Depending on the format this is a
   **generated motion clip** (a real moving MP4) or a still frame that the
   compositor gives a camera move to.
4. **captions** — word timings are offset onto the global timeline and written as
   an ASS subtitle file.
5. **compose** — each scene becomes a clip. Stills are held for the scene and
   given a camera move (`zoompan`); generated clips are looped to fill the scene
   and keep their own motion instead. Clips are then joined with the concat
   demuxer using stream copy.
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
REPLICATE_API_TOKEN=...   # or OPENAI_API_KEY  — generated stills
VIDEO_PROVIDER=replicate  # or luma            — generated motion clips
LUMA_API_KEY=...
```

Stages are independent — model-written scripts over placeholder visuals is a
normal, supported configuration. Hosted adapters fall back to the stub on any
error rather than failing a render. **No code changes are needed anywhere.**

Adapters are already written for Anthropic, OpenAI (chat/speech/images),
ElevenLabs, Replicate (images **and** video) and Luma.

Video models are slow and expensive relative to the rest of the pipeline, so
those adapters poll with a generous ceiling (`VIDEO_TIMEOUT_MS`, default 5min)
and fall back to the procedural clip rather than killing a render. Model output
is not loopable, so it is marked non-seamless and the compositor will not repeat
it to fill a longer scene.

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
caption text cannot inject override tags), the mode catalog and every beat
planner, credit maths, schedule advancement, the PNG/WAV encoders, the
procedural painters (every style animates across a full cycle, loops without a
seam, stays in gamut, yields even dimensions for H.264), the 3D subsystem
(matrix and camera conventions, mesh well-formedness and unit normals, that the
rasterizer actually draws geometry and shades into discrete bands, near-plane
clipping, and that every camera path closes so clips loop), and the narrative
arc (shape, no repeated lines in a long piece, and that each duration lands
within 15% of its target), plus the explainer path — framing distance across
aspects, that smooth shading yields a continuous ramp where cel shading yields a
handful of bands, specular response, and subject-led scene routing.

---

## Known gaps

- Local speech is good but not broadcast quality; a hosted voice is still a
  step up if you have one.
- 3D sets are procedural — stylised original geometry, not photographic
  footage. Blender raises the lighting and material quality substantially but
  does not change that; a hosted video model is the only route to realism.
- Platform uploads are not implemented (see **Publishing** above).
- No payment processor — switching plans grants credits directly.
- Music library is metadata-only; no audio ships with the repo. Drop files in
  `STORAGE_DIR/music` and set `path` to enable the bed.
- Renders are CPU-bound and processed one at a time per worker.
