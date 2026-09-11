'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { VideoMode } from '@/pipeline/modes';
import { api, Banner, EmptyState, formatDate } from './ui';

interface SeriesRow {
  id: string; name: string; mode: string; topic: string; cadence: string; postTime: string;
  autoPublish: boolean; active: boolean; voiceId: string | null; videoCount: number;
  targets: string[]; nextRunAt: string | null; lastRunAt: string | null;
}

const CADENCES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'every-2-days', label: 'Every 2 days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'manual', label: 'Manual only' },
];

export function SeriesManager({
  series, modes, voices, accounts,
}: {
  series: SeriesRow[];
  modes: VideoMode[];
  voices: { id: string; name: string; style: string }[];
  accounts: { id: string; platform: string; handle: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '', mode: modes[0].id, topic: '', voiceId: voices[0]?.id ?? '',
    cadence: 'daily', postTime: '17:00', autoPublish: false, targets: [] as string[],
  });

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/series', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      setForm((f) => ({ ...f, name: '', topic: '' }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the series');
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, data: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/api/series/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remove(id: string) {
    await api(`/api/series/${id}`, { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex justify-end">
        <button onClick={() => setCreating((v) => !v)} className="btn-primary">
          {creating ? 'Cancel' : 'New series'}
        </button>
      </div>

      {creating && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-100">New series</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input className="field" value={form.name}
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                     placeholder="Daily Story Drop" />
            </div>
            <div>
              <label className="label">Format</label>
              <select className="field" value={form.mode}
                      onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
                {modes.map((m) => <option key={m.id} value={m.id}>{m.glyph} {m.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Standing topic</label>
            <textarea rows={2} className="field resize-y" value={form.topic}
                      onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                      placeholder="What every video in this series should be about" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Cadence</label>
              <select className="field" value={form.cadence}
                      onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))}>
                {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Post time</label>
              <input type="time" className="field" value={form.postTime}
                     onChange={(e) => setForm((f) => ({ ...f, postTime: e.target.value }))} />
            </div>
            <div>
              <label className="label">Voice</label>
              <select className="field" value={form.voiceId}
                      onChange={(e) => setForm((f) => ({ ...f, voiceId: e.target.value }))}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          {accounts.length > 0 && (
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-ink-800"
                       checked={form.autoPublish}
                       onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))} />
                Publish automatically when each render finishes
              </label>
              {form.autoPublish && (
                <div className="mt-2 space-y-1.5 pl-6">
                  {accounts.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                      <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-ink-800"
                             checked={form.targets.includes(a.id)}
                             onChange={(e) => setForm((f) => ({
                               ...f,
                               targets: e.target.checked
                                 ? [...f.targets, a.id]
                                 : f.targets.filter((id) => id !== a.id),
                             }))} />
                      <span className="capitalize">{a.platform}</span> {a.handle}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={create} disabled={busy || !form.name || form.topic.length < 3}
                  className="btn-primary">
            {busy ? 'Creating…' : 'Create series'}
          </button>
        </div>
      )}

      {series.length === 0 && !creating ? (
        <EmptyState
          glyph="↻"
          title="No series yet"
          body="A series keeps producing videos on a schedule — pick a format and a standing topic, and it runs without you."
        />
      ) : (
        series.map((s) => {
          const mode = modes.find((m) => m.id === s.mode);
          return (
            <div key={s.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{mode?.glyph}</span>
                    <h3 className="font-semibold text-slate-100">{s.name}</h3>
                    <span className={`pill ${s.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
                      {s.active ? 'active' : 'paused'}
                    </span>
                    {s.autoPublish && <span className="pill bg-sky-500/15 text-sky-300">auto-posts</span>}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-400">{s.topic}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {mode?.name} · {CADENCES.find((c) => c.value === s.cadence)?.label} at {s.postTime} ·{' '}
                    {s.videoCount} produced
                    {s.nextRunAt && s.active && ` · next ${formatDate(s.nextRunAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => update(s.id, { active: !s.active })} className="btn-ghost px-3 py-1.5 text-xs">
                    {s.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => remove(s.id)} className="btn-danger px-3 py-1.5 text-xs">Delete</button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
