'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { VideoMode } from '@/pipeline/modes';
import { api, Banner } from './ui';

interface VoiceOption {
  id: string; name: string; gender: string; accent: string; style: string; premium: boolean;
}

/**
 * The Quick editor: one pass from format + topic to a queued render.
 * Mode-specific options are rendered straight from the mode catalog, so a new
 * format's knobs appear here without touching this component.
 */
export function CreateForm({
  modes, voices, initialMode, initialTopic, initialSourceType,
}: {
  modes: VideoMode[];
  voices: VoiceOption[];
  initialMode?: string;
  initialTopic?: string;
  initialSourceType?: string;
}) {
  const router = useRouter();

  const [modeId, setModeId] = useState(
    modes.find((m) => m.id === initialMode)?.id ?? modes[0].id,
  );
  const mode = useMemo(() => modes.find((m) => m.id === modeId)!, [modes, modeId]);

  const [topic, setTopic] = useState(initialTopic ?? '');
  const [sourceText, setSourceText] = useState('');
  const [sourceType, setSourceType] = useState(initialSourceType ?? 'prompt');
  const [aspect, setAspect] = useState(mode.defaultAspect);
  const [duration, setDuration] = useState(mode.defaultDurationSec);
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? '');
  const [visualOutput, setVisualOutput] = useState<'auto' | 'image' | 'video'>('auto');
  const [renderer, setRenderer] = useState<'auto' | 'fast' | 'blender'>('auto');
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(() =>
    Object.fromEntries(mode.options.map((o) => [o.key, o.default])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Switching format resets the knobs and defaults that belong to it. */
  function selectMode(next: VideoMode) {
    setModeId(next.id);
    setAspect(next.defaultAspect);
    setDuration(next.defaultDurationSec);
    setOptions(Object.fromEntries(next.options.map((o) => [o.key, o.default])));
    if (!next.sourceTypes.includes(sourceType as never)) setSourceType(next.sourceTypes[0]);
  }

  async function submit(startRender: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { video } = await api<{ video: { id: string } }>('/api/videos', {
        method: 'POST',
        body: JSON.stringify({
          mode: modeId,
          topic,
          aspect,
          visualOutput,
          renderer,
          durationSec: duration,
          voiceId: voiceId || undefined,
          sourceType,
          sourceText: sourceText || undefined,
          options,
          startRender,
        }),
      });
      router.push(`/videos/${video.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the video');
      setBusy(false);
    }
  }

  const needsSourceText = sourceType === 'reddit' || sourceType === 'url' || options.useOwnScript === true;

  return (
    <div className="space-y-6">
      {error && <Banner tone="error">{error}</Banner>}

      {/* format picker */}
      <section className="card">
        <h2 className="label">Format</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMode(m)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                m.id === modeId
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-white/10 hover:border-white/25'
              }`}
            >
              <div className="mb-1 text-xl">{m.glyph}</div>
              <div className="text-sm font-medium text-slate-100">{m.name}</div>
              <div className="mt-0.5 text-xs text-slate-400">{m.tagline}</div>
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{mode.description}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4 lg:col-span-2">
          <div>
            <label className="label" htmlFor="topic">Topic</label>
            <textarea
              id="topic" rows={3} className="field resize-y" value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should this video be about?"
            />
          </div>

          {mode.sourceTypes.length > 1 && (
            <div>
              <label className="label">Source</label>
              <div className="flex flex-wrap gap-2">
                {mode.sourceTypes.map((type) => (
                  <button
                    key={type} type="button" onClick={() => setSourceType(type)}
                    className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                      type === sourceType
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsSourceText && (
            <div>
              <label className="label" htmlFor="sourceText">
                {options.useOwnScript ? 'Your script' : 'Source text'}
              </label>
              <textarea
                id="sourceText" rows={7} className="field resize-y font-mono text-xs"
                value={sourceText} onChange={(e) => setSourceText(e.target.value)}
                placeholder={
                  options.useOwnScript
                    ? 'Paste the exact narration you want voiced.'
                    : 'Paste the story or article to adapt.'
                }
              />
            </div>
          )}

          {/* mode-specific knobs */}
          {mode.options.length > 0 && (
            <div className="space-y-3 border-t border-white/5 pt-4">
              <h3 className="label">{mode.name} options</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {mode.options.map((field) => (
                  <div key={field.key}>
                    {field.type === 'boolean' ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(options[field.key])}
                          onChange={(e) => setOptions((o) => ({ ...o, [field.key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-white/20 bg-ink-800"
                        />
                        {field.label}
                      </label>
                    ) : field.type === 'select' ? (
                      <>
                        <label className="label">{field.label}</label>
                        <select
                          className="field"
                          value={String(options[field.key])}
                          onChange={(e) => setOptions((o) => ({ ...o, [field.key]: e.target.value }))}
                        >
                          {field.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <label className="label">{field.label}</label>
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          className="field"
                          value={String(options[field.key])}
                          onChange={(e) =>
                            setOptions((o) => ({
                              ...o,
                              [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                            }))
                          }
                        />
                      </>
                    )}
                    {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* output settings */}
        <section className="card h-fit space-y-4">
          <h2 className="label">Output</h2>

          <div>
            <label className="label">Aspect ratio</label>
            <div className="flex gap-2">
              {(['9:16', '1:1', '16:9'] as const).map((value) => (
                <button
                  key={value} type="button" onClick={() => setAspect(value)}
                  className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                    value === aspect
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="duration">
              Length — {duration}s
            </label>
            <input
              id="duration" type="range" className="w-full accent-brand-500"
              min={mode.minDurationSec} max={mode.maxDurationSec} step={5}
              value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>{mode.minDurationSec}s</span>
              <span>{mode.maxDurationSec}s</span>
            </div>
          </div>

          <div>
            <label className="label">Scene visuals</label>
            <div className="space-y-1.5">
              {([
                { value: 'auto', label: `Auto — ${mode.visualOutput === 'video' ? 'motion clips' : 'still frames'} for ${mode.name}` },
                { value: 'video', label: 'Generated motion clips' },
                { value: 'image', label: 'Still frames with camera moves' },
              ] as const).map((opt) => (
                <button
                  key={opt.value} type="button" onClick={() => setVisualOutput(opt.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    visualOutput === opt.value
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Clips take longer to generate than stills.
            </p>
          </div>

          <div>
            <label className="label">Render quality</label>
            <div className="space-y-1.5">
              {([
                { value: 'auto', label: 'Fast — seconds per scene', help: 'In-process renderer. Good for drafts.' },
                { value: 'blender', label: 'High — path traced', help: 'Real shadows, depth of field and materials. Minutes per scene.' },
              ] as const).map((opt) => (
                <button
                  key={opt.value} type="button"
                  onClick={() => setRenderer(opt.value === 'auto' ? 'auto' : 'blender')}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    (renderer === 'blender') === (opt.value === 'blender')
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-xs opacity-70">{opt.help}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="voice">Voice</label>
            <select id="voice" className="field" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.gender}, {v.accent}, {v.style}{v.premium ? ' (premium)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t border-white/5 pt-4">
            <button
              onClick={() => submit(true)} disabled={busy || topic.trim().length < 3}
              className="btn-primary w-full"
            >
              {busy ? 'Queueing…' : 'Generate video'}
            </button>
            <button
              onClick={() => submit(false)} disabled={busy || topic.trim().length < 3}
              className="btn-ghost w-full"
            >
              Save as draft
            </button>
            <p className="text-center text-xs text-slate-500">
              Drafts open in the advanced editor without spending credits.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
