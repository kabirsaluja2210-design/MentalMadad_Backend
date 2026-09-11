import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { getMode } from '@/pipeline/modes';
import { StatusPill, formatDate } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();

  const [videos, counts, series, duePosts] = await Promise.all([
    db.video.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    db.video.groupBy({
      by: ['status'],
      where: { workspaceId: user.workspaceId },
      _count: { status: true },
    }),
    db.series.count({ where: { workspaceId: user.workspaceId, active: true } }),
    db.scheduledPost.count({
      where: { video: { workspaceId: user.workspaceId }, status: 'SCHEDULED' },
    }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count.status]));
  const total = counts.reduce((sum, c) => sum + c._count.status, 0);

  const stats = [
    { label: 'Videos', value: total },
    { label: 'Ready', value: byStatus.READY ?? 0 },
    { label: 'In progress', value: (byStatus.QUEUED ?? 0) + (byStatus.RENDERING ?? 0) },
    { label: 'Active series', value: series },
    { label: 'Scheduled posts', value: duePosts },
    { label: 'Credits', value: user.credits },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-slate-400">{user.workspaceName}</p>
        </div>
        <Link href="/create" className="btn-primary">New video</Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-2xl font-semibold text-white">{stat.value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent videos</h2>
          <Link href="/videos" className="text-sm text-brand-400 hover:underline">View all</Link>
        </div>

        {videos.length === 0 ? (
          <div className="card py-12 text-center">
            <p className="text-slate-400">Nothing rendered yet.</p>
            <Link href="/create" className="btn-primary mt-4">Create your first video</Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => {
              const thumb = mediaUrl(video.thumbnailPath);
              return (
                <Link key={video.id} href={`/videos/${video.id}`}
                      className="card transition-colors hover:border-brand-500/40">
                  <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-ink-800">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl opacity-40">{getMode(video.mode).glyph}</span>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-medium text-slate-100">{video.title}</h3>
                    <StatusPill status={video.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {getMode(video.mode).name} · {formatDate(video.createdAt)}
                  </p>
                  {video.jobs[0]?.status === 'RUNNING' && (
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-brand-500 transition-all"
                           style={{ width: `${video.jobs[0].progress}%` }} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
