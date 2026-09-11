import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { VIDEO_MODES } from '@/pipeline/modes';
import { DiscoverFeed } from '@/components/discover-feed';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  await requireUser();

  const ideas = await db.storyIdea.findMany({
    orderBy: [{ viralScore: 'desc' }, { capturedAt: 'desc' }],
    take: 60,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Discover</h1>
        <p className="mt-1 text-slate-400">
          Story ideas ranked by how well they tend to travel. Send one straight into a format.
        </p>
      </header>

      <DiscoverFeed
        modes={VIDEO_MODES.map((m) => ({ id: m.id, name: m.name, glyph: m.glyph }))}
        ideas={ideas.map((i) => ({
          id: i.id, title: i.title, body: i.body, source: i.source,
          sourceRef: i.sourceRef, score: i.score, comments: i.comments,
          viralScore: i.viralScore, suggestedMode: i.suggestedMode,
        }))}
      />
    </div>
  );
}
