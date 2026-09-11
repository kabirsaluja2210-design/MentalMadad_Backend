import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { VIDEO_MODES } from '@/pipeline/modes';
import { parseJson } from '@/lib/json';
import { SeriesManager } from '@/components/series-manager';

export const dynamic = 'force-dynamic';

export default async function SeriesPage() {
  const user = await requireUser();

  const [series, voices, accounts] = await Promise.all([
    db.series.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { videos: true } } },
    }),
    db.voice.findMany({ orderBy: { name: 'asc' } }),
    db.socialAccount.findMany({ where: { workspaceId: user.workspaceId } }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Series</h1>
        <p className="mt-1 text-slate-400">
          A series produces a new video on a schedule, with no prompting each time.
        </p>
      </header>

      <SeriesManager
        modes={VIDEO_MODES}
        voices={voices.map((v) => ({ id: v.id, name: v.name, style: v.style }))}
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }))}
        series={series.map((s) => ({
          id: s.id, name: s.name, mode: s.mode, topic: s.topic, cadence: s.cadence,
          postTime: s.postTime, autoPublish: s.autoPublish, active: s.active,
          voiceId: s.voiceId, videoCount: s._count.videos,
          targets: parseJson<string[]>(s.targetsJson, []),
          nextRunAt: s.nextRunAt?.toISOString() ?? null,
          lastRunAt: s.lastRunAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
