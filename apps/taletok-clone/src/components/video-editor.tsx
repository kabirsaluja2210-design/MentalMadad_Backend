'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { VideoMode } from '@/pipeline/modes';
import { api, Banner, ProgressBar, StatusPill, formatDuration, usePoll } from './ui';

/** Shapes passed down from the server component. */
interface Scene {
  id: string; index: number; text: string; visualPrompt: string; motion: string;
  durationMs: number; locked: boolean; status: string; visualKind: string;
  imageUrl: string | null; clipUrl: string | null; audioUrl: string | null; wordCount: number;
}
interface Post {
  id: string; status: string; scheduledFor: string; platform: string;
  handle: string; postedUrl: string | null; error: string | null;
}
interface VideoData {
  id: string; title: string; status: string; aspect: string; visualOutput: string;
  mode: string; topic: string;
  hook: string; cta: string; script: string; voiceId: string | null; actualDurationMs: number;
  outputUrl: string | null; thumbnailUrl: string | null;
  job: { status: string; stage: string; progress: number; error: string | null } | null;
  scenes: Scene[]; posts: Post[];
}

const MOTIONS = ['kenburns-in', 'kenburns-out', 'pan-left', 'pan-right', 'static', 'zoom-pulse'];

/**
 * The Advanced editor.
 *
 * Shows the finished cut alongside the scene timeline, and lets any single
 * scene be rewritten, revoiced or re-illustrated without touching the rest.
 * While a render is running it polls the job endpoint for live progress.
 */
export function VideoEditor({
  video, mode, voices, accounts,
}: {
  video: VideoData;
  mode: VideoMode;
  voices: { id: string; name: string; style: string }[];
  accounts: { id: string; platform: string; handle: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openScene, setOpenScene] = useState<string | null>(null);

  const isWorking = video.status === 'RENDERING' || video.status === 'QUEUED';
  const live = usePoll<{ status: string; job: { progress: number; label: string; error: string | null } | null }>(
    `/api/videos/${video.id}/render`, isWorking,
  );

  // The poller tells us when the render lands; refresh to pull the new cut.
  if (live && live.status !== video.status && !['QUEUED', 'RENDERING'].includes(live.status)) {
    router.refresh();
  }

  const totalMs = video.scenes.reduce((sum, s) => sum + s.durationMs, 0);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const render = () =>
    act('render', () => api(`/api/videos/${video.id}/render`, { method: 'POST' }));

  const regenerate = (sceneId: string, parts: string[]) =>
    act(`scene-${sceneId}`, () =>
      api(`/api/videos/${video.id}/scenes/${sceneId}/regenerate`, {
        method: 'POST', body: JSON.stringify({ parts }),
      }),
    );

  const patchScene = (sceneId: string, data: Record<string, unknown>) =>
    act(`scene-${sceneId}`, () =>
      api(`/api/videos/${video.id}/scenes/${sceneId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    );

  const move = (index: number, delta: number) => {
    const ids = video.scenes.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return act('reorder', () =>
      api(`/api/videos/${video.id}/scenes/reorder`, {
        method: 'POST', body: JSON.stringify({ sceneIds: ids }),
      }),
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">{mode.glyph}</span>
            <span className="text-sm text-slate-400">{mode.name}</span>
            <StatusPill status={video.status} />
          </div>
          <h1 className="truncate text-2xl font-semibold text-white">{video.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {video.aspect} · {video.scenes.length} scenes ·{' '}
            {formatDuration(video.actualDurationMs || totalMs)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {video.outputUrl && (
            <a href={video.outputUrl} download className="btn-ghost">Download</a>
          )}
          <button onClick={render} disabled={busy !== null || isWorking} className="btn-primary">
            {isWorking ? 'Rendering…' : video.outputUrl ? 'Re-render' : 'Render'}
          </button>
        </div>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {video.job?.error && video.status === 'FAILED' && (
        <Banner tone="error">Render failed: {video.job.error}</Banner>
      )}

      {isWorking && (
        <div className="card">
          <ProgressBar
            value={live?.job?.progress ?? video.job?.progress ?? 0}
            label={live?.job?.label ?? 'Starting…'}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* preview + meta */}
        <div className="space-y-4">
          <section className="card">
            <h2 className="label">Preview</h2>
            {video.outputUrl ? (
              <video
                key={video.outputUrl}
                src={video.outputUrl}
                controls
                poster={video.thumbnailUrl ?? undefined}
                className={`w-full rounded-lg bg-black ${
                  video.aspect === '9:16' ? 'aspect-[9/16]' : video.aspect === '1:1' ? 'aspect-square' : 'aspect-video'
                }`}
              />
            ) : (
              <div className={`flex items-center justify-center rounded-lg bg-ink-800 text-sm text-slate-500 ${
                video.aspect === '9:16' ? 'aspect-[9/16]' : video.aspect === '1:1' ? 'aspect-square' : 'aspect-video'
              }`}>
                {isWorking ? 'Rendering…' : 'Not rendered yet'}
              </div>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="label">Settings</h2>
            <div>
              <label className="label" htmlFor="voice">Voice</label>
              <select
                id="voice" className="field" defaultValue={video.voiceId ?? ''}
                onChange={(e) => act('voice', () =>
                  api(`/api/videos/${video.id}`, {
                    method: 'PATCH', body: JSON.stringify({ voiceId: e.target.value || null }),
                  }))}
              >
                <option value="">Default</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.style}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="visualOutput">Scene visuals</label>
              <select
                id="visualOutput" className="field" defaultValue={video.visualOutput}
                onChange={(e) => act('visualOutput', () =>
                  api(`/api/videos/${video.id}`, {
                    method: 'PATCH', body: JSON.stringify({ visualOutput: e.target.value }),
                  }))}
              >
                <option value="auto">Auto — follow the {mode.name} default</option>
                <option value="video">Generated motion clips</option>
                <option value="image">Still frames with camera moves</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Takes effect on the next render.
              </p>
            </div>
            <div>
              <p className="label">Hook</p>
              <p className="rounded-lg bg-white/5 p-2 text-sm text-slate-300">{video.hook || '—'}</p>
            </div>
            {video.cta && (
              <div>
                <p className="label">Call to action</p>
                <p className="rounded-lg bg-white/5 p-2 text-sm text-slate-300">{video.cta}</p>
              </div>
            )}
          </section>

          <PublishPanel videoId={video.id} posts={video.posts} accounts={accounts}
                        ready={video.status === 'READY' || video.status === 'PUBLISHED'} />
        </div>

        {/* scene timeline */}
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Scenes</h2>
            <span className="text-xs text-slate-500">
              Reroll any scene without redoing the rest
            </span>
          </div>

          {video.scenes.length === 0 ? (
            <div className="card py-10 text-center text-sm text-slate-400">
              No scenes yet — render once and they will appear here for editing.
            </div>
          ) : (
            video.scenes.map((scene, i) => {
              const open = openScene === scene.id;
              const sceneBusy = busy === `scene-${scene.id}`;
              return (
                <div key={scene.id} className={`card ${sceneBusy ? 'opacity-60' : ''}`}>
                  <div className="flex gap-4">
                    <div className="w-20 shrink-0">
                      <div className={`overflow-hidden rounded bg-ink-800 ${
                        video.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
                      }`}>
                        {scene.visualKind === 'video' && scene.clipUrl ? (
                          // Muted autoplay so the timeline shows the actual motion.
                          <video
                            src={scene.clipUrl}
                            muted loop autoPlay playsInline
                            className="h-full w-full object-cover"
                          />
                        ) : scene.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-600">—</div>
                        )}
                      </div>
                      <p className="mt-1 text-center text-xs text-slate-500">
                        {(scene.durationMs / 1000).toFixed(1)}s
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="pill bg-white/5 text-slate-400">#{i + 1}</span>
                        {scene.locked && <span className="pill bg-amber-500/15 text-amber-300">locked</span>}
                        <span className="text-xs text-slate-600">
                          {scene.visualKind === 'video' ? 'motion clip' : scene.motion}
                        </span>
                        <div className="ml-auto flex gap-1">
                          <button onClick={() => move(i, -1)} disabled={i === 0 || busy !== null}
                                  className="rounded px-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30"
                                  aria-label="Move scene up">↑</button>
                          <button onClick={() => move(i, 1)} disabled={i === video.scenes.length - 1 || busy !== null}
                                  className="rounded px-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30"
                                  aria-label="Move scene down">↓</button>
                        </div>
                      </div>

                      <p className="text-sm leading-relaxed text-slate-200">{scene.text}</p>
                      <p className="mt-1.5 line-clamp-1 text-xs text-slate-500">{scene.visualPrompt}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => regenerate(scene.id, ['script'])} disabled={busy !== null}
                                className="btn-ghost px-2.5 py-1 text-xs">Reroll script</button>
                        <button onClick={() => regenerate(scene.id, ['visual'])} disabled={busy !== null}
                                className="btn-ghost px-2.5 py-1 text-xs">
                          {scene.visualKind === 'video' ? 'Reroll clip' : 'Reroll visual'}
                        </button>
                        <button onClick={() => regenerate(scene.id, ['voice'])} disabled={busy !== null}
                                className="btn-ghost px-2.5 py-1 text-xs">Revoice</button>
                        <button onClick={() => patchScene(scene.id, { locked: !scene.locked })} disabled={busy !== null}
                                className="btn-ghost px-2.5 py-1 text-xs">
                          {scene.locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button onClick={() => setOpenScene(open ? null : scene.id)}
                                className="btn-ghost px-2.5 py-1 text-xs">
                          {open ? 'Close' : 'Edit'}
                        </button>
                      </div>

                      {open && (
                        <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                          <div>
                            <label className="label">Narration</label>
                            <textarea
                              rows={3} className="field resize-y" defaultValue={scene.text}
                              onBlur={(e) => e.target.value !== scene.text && patchScene(scene.id, { text: e.target.value })}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              Editing the words clears the voiceover so it is regenerated on the next render.
                            </p>
                          </div>
                          <div>
                            <label className="label">Visual prompt</label>
                            <textarea
                              rows={2} className="field resize-y" defaultValue={scene.visualPrompt}
                              onBlur={(e) => e.target.value !== scene.visualPrompt && patchScene(scene.id, { visualPrompt: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="label">Camera move</label>
                              <select className="field" defaultValue={scene.motion}
                                      disabled={scene.visualKind === 'video'}
                                      onChange={(e) => patchScene(scene.id, { motion: e.target.value })}>
                                {MOTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              {scene.visualKind === 'video' && (
                                <p className="mt-1 text-xs text-slate-500">
                                  The generated clip carries its own motion.
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="label">Duration (seconds)</label>
                              <input
                                type="number" step={0.5} min={0.5} className="field"
                                defaultValue={(scene.durationMs / 1000).toFixed(1)}
                                onBlur={(e) => patchScene(scene.id, { durationMs: Math.round(Number(e.target.value) * 1000) })}
                              />
                            </div>
                          </div>
                          {scene.audioUrl && (
                            <div>
                              <label className="label">Voiceover ({scene.wordCount} words timed)</label>
                              <audio src={scene.audioUrl} controls className="w-full" />
                            </div>
                          )}
                          <button
                            onClick={() => act(`scene-${scene.id}`, () =>
                              api(`/api/videos/${video.id}/scenes/${scene.id}`, { method: 'DELETE' }))}
                            disabled={busy !== null}
                            className="btn-danger px-2.5 py-1 text-xs"
                          >
                            Delete scene
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

/** Scheduling panel shown under the preview. */
function PublishPanel({
  videoId, posts, accounts, ready,
}: {
  videoId: string; posts: Post[];
  accounts: { id: string; platform: string; handle: string }[];
  ready: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [when, setWhen] = useState(() => new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function schedule() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          socialAccountIds: selected,
          scheduledFor: new Date(when).toISOString(),
          caption,
        }),
      });
      setSelected([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="label">Publishing</h2>

      {posts.length > 0 && (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post.id} className="rounded-lg bg-white/5 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{post.platform} · {post.handle}</span>
                <StatusPill status={post.status} />
              </div>
              <p className="mt-1 text-slate-500">{new Date(post.scheduledFor).toLocaleString()}</p>
              {post.error && <p className="mt-1 text-amber-300">{post.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {!ready ? (
        <p className="text-xs text-slate-500">Render the video before scheduling it.</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-slate-500">Connect a channel first.</p>
      ) : (
        <>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="space-y-1.5">
            {accounts.map((account) => (
              <label key={account.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox" className="h-4 w-4 rounded border-white/20 bg-ink-800"
                  checked={selected.includes(account.id)}
                  onChange={(e) =>
                    setSelected((s) => e.target.checked ? [...s, account.id] : s.filter((id) => id !== account.id))
                  }
                />
                <span className="capitalize text-slate-400">{account.platform}</span> {account.handle}
              </label>
            ))}
          </div>
          <input type="datetime-local" className="field" value={when} onChange={(e) => setWhen(e.target.value)} />
          <textarea rows={2} className="field resize-y" placeholder="Caption"
                    value={caption} onChange={(e) => setCaption(e.target.value)} />
          <button onClick={schedule} disabled={busy || selected.length === 0} className="btn-primary w-full">
            {busy ? 'Scheduling…' : `Schedule ${selected.length || ''}`.trim()}
          </button>
        </>
      )}
    </section>
  );
}
