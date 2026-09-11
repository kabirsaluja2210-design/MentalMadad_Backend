'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, Banner, EmptyState } from './ui';

interface Idea {
  id: string; title: string; body: string; source: string; sourceRef: string | null;
  score: number; comments: number; viralScore: number; suggestedMode: string;
}

export function DiscoverFeed({
  ideas, modes,
}: {
  ideas: Idea[];
  modes: { id: string; name: string; glyph: string }[];
}) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/discover', { method: 'POST', body: JSON.stringify({ topic, count: 8 }) });
      setTopic('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch ideas');
    } finally {
      setBusy(false);
    }
  }

  const visible = filter ? ideas.filter((i) => i.suggestedMode === filter) : ideas;

  return (
    <div className="space-y-5">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="card flex flex-wrap gap-2">
        <input
          className="field flex-1" value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="Find ideas about… (e.g. deep sea, first jobs, ancient engineering)"
          onKeyDown={(e) => e.key === 'Enter' && topic.length > 1 && generate()}
        />
        <button onClick={generate} disabled={busy || topic.trim().length < 2} className="btn-primary">
          {busy ? 'Thinking…' : 'Suggest ideas'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter(null)}
                className={`pill border ${!filter ? 'border-brand-500 text-brand-400' : 'border-white/10 text-slate-400'}`}>
          All formats
        </button>
        {modes.map((m) => (
          <button key={m.id} onClick={() => setFilter(m.id)}
                  className={`pill border ${filter === m.id ? 'border-brand-500 text-brand-400' : 'border-white/10 text-slate-400'}`}>
            {m.glyph} {m.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState glyph="◎" title="No ideas in this format"
                    body="Search for a topic above and a fresh set will be generated." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((idea) => {
            const mode = modes.find((m) => m.id === idea.suggestedMode);
            return (
              <div key={idea.id} className="card flex flex-col">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {idea.sourceRef || idea.source}
                  </span>
                  <span className="pill bg-brand-500/15 text-brand-400">{idea.viralScore}</span>
                </div>
                <h3 className="flex-1 text-sm font-medium leading-relaxed text-slate-100">{idea.title}</h3>
                {idea.score > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {idea.score.toLocaleString()} upvotes · {idea.comments.toLocaleString()} comments
                  </p>
                )}
                <a
                  href={`/create?mode=${idea.suggestedMode}&topic=${encodeURIComponent(idea.title)}`}
                  className="btn-ghost mt-3 w-full text-xs"
                >
                  Make as {mode?.name ?? idea.suggestedMode}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
