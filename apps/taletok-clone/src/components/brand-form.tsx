'use client';

import { useState } from 'react';
import { api, Banner } from './ui';

interface BrandKit {
  watermarkText: string | null; watermarkPos: string; watermarkOpacity: number;
  primaryColor: string; captionStyle: string; captionColor: string;
  captionHighlight: string; outroText: string | null;
}

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
const CAPTION_STYLES = [
  { value: 'auto', label: 'Follow the format', help: 'Each format uses the caption treatment it was designed with.' },
  { value: 'karaoke', label: 'Karaoke', help: 'Full line on screen, active word highlighted.' },
  { value: 'word-pop', label: 'Word pop', help: 'One large word at a time, centred.' },
  { value: 'block', label: 'Block', help: 'Whole sentence held for the beat.' },
  { value: 'classic', label: 'Classic', help: 'Small subtitle line near the bottom.' },
];

export function BrandForm({ brandKit }: { brandKit: BrandKit }) {
  const [form, setForm] = useState(brandKit);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/brand', { method: 'PATCH', body: JSON.stringify(form) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        {saved && <Banner tone="success">Saved — applied from the next render onward.</Banner>}

        <section className="card space-y-4">
          <h2 className="label">Watermark</h2>
          <div>
            <label className="label">Text</label>
            <input className="field" value={form.watermarkText ?? ''} placeholder="@yourhandle"
                   onChange={(e) => set('watermarkText', e.target.value || null)} />
            <p className="mt-1 text-xs text-slate-500">Leave empty for no watermark.</p>
          </div>
          <div>
            <label className="label">Position</label>
            <div className="grid grid-cols-3 gap-2">
              {POSITIONS.map((pos) => (
                <button key={pos} type="button" onClick={() => set('watermarkPos', pos)}
                        className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                          form.watermarkPos === pos
                            ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                            : 'border-white/10 text-slate-400 hover:border-white/25'
                        }`}>
                  {pos.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Opacity — {Math.round(form.watermarkOpacity * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} className="w-full accent-brand-500"
                   value={form.watermarkOpacity}
                   onChange={(e) => set('watermarkOpacity', Number(e.target.value))} />
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="label">Captions</h2>
          <div className="space-y-2">
            {CAPTION_STYLES.map((style) => (
              <button key={style.value} type="button" onClick={() => set('captionStyle', style.value)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        form.captionStyle === style.value
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-white/10 hover:border-white/25'
                      }`}>
                <div className="text-sm font-medium text-slate-100">{style.label}</div>
                <div className="mt-0.5 text-xs text-slate-400">{style.help}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Text colour</label>
              <input type="color" className="h-10 w-full rounded-lg border border-white/10 bg-ink-800"
                     value={form.captionColor} onChange={(e) => set('captionColor', e.target.value)} />
            </div>
            <div>
              <label className="label">Highlight</label>
              <input type="color" className="h-10 w-full rounded-lg border border-white/10 bg-ink-800"
                     value={form.captionHighlight} onChange={(e) => set('captionHighlight', e.target.value)} />
            </div>
          </div>
        </section>

        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? 'Saving…' : 'Save brand kit'}
        </button>
      </div>

      {/* live preview of the caption treatment */}
      <section className="card h-fit">
        <h2 className="label">Preview</h2>
        <div className="relative flex aspect-[9/16] max-h-[520px] items-end justify-center overflow-hidden rounded-lg bg-gradient-to-br from-ink-700 to-ink-900 p-6">
          <p
            className={`text-center font-bold leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
              form.captionStyle === 'word-pop' ? 'mb-auto mt-auto text-4xl'
              : form.captionStyle === 'classic' ? 'mb-2 text-base'
              : form.captionStyle === 'block' ? 'mb-20 text-2xl' : 'mb-28 text-3xl'
            }`}
            style={{ color: form.captionColor }}
          >
            {form.captionStyle === 'auto' ? (
              <>Set by the format</>
            ) : form.captionStyle === 'word-pop' ? (
              <span style={{ color: form.captionHighlight }}>everything</span>
            ) : (
              <>
                This changes <span style={{ color: form.captionHighlight }}>everything</span>
              </>
            )}
          </p>
          {form.watermarkText && (
            <span
              className={`absolute text-xs text-white ${
                form.watermarkPos === 'top-left' ? 'left-3 top-3'
                : form.watermarkPos === 'top-right' ? 'right-3 top-3'
                : form.watermarkPos === 'bottom-left' ? 'bottom-3 left-3'
                : form.watermarkPos === 'center' ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                : 'bottom-3 right-3'
              }`}
              style={{ opacity: form.watermarkOpacity }}
            >
              {form.watermarkText}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Approximate — the render burns captions with libass at full resolution.
        </p>
      </section>
    </div>
  );
}
