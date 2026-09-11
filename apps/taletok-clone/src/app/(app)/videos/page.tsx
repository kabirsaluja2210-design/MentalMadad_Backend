import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { getMode, VIDEO_MODES } from '@/pipeline/modes';
import { StatusPill, EmptyState, formatDate, formatDuration } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { status?: string; mode?: string };
}) {
  const user = await requireUser();

  const videos = await db.video.findMany({
    where: {
      workspaceId: user.workspaceId,
      ...(searchParams.status ? { status: searchParams.status } : {}),
      ...(searchParams.mode ? { mode: searchParams.mode } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { series: { select: { name: true } } },
  });

  const statuses = ['DRAFT', 'QUEUED', 'RENDERING', 'READY', 'PUBLISHED', 'FAILED'];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Library</h1>
          <p className="mt-1 text-slate-400">{videos.length} video{videos.length === 1 ? '' : 's'}</p>
        </div>
        <Link href="/create" className="btn-primary">New video</Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/videos"
              className={`pill border ${!searchParams.status && !searchParams.mode ? 'border-brand-500 text-brand-400' : 'border-white/10 text-slate-400'}`}>
          All
        </Link>
        {statuses.map((status) => (
          <Link key={status} href={`/videos?status=${status}`}
                className={`pill border ${searchParams.status === status ? 'border-brand-500 text-brand-400' : 'border-white/10 text-slate-400'}`}>
            {status.toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        {VIDEO_MODES.map((mode) => (
          <Link key={mode.id} href={`/videos?mode=${mode.id}`}
                className={`pill border ${searchParams.mode === mode.id ? 'border-brand-500 text-brand-400' : 'border-white/10 text-slate-400'}`}>
            {mode.glyph} {mode.name}
          </Link>
        ))}
      </div>

      {videos.length === 0 ? (
        <EmptyState
          glyph="▦"
          title="Nothing here yet"
          body="Generate a video and it will show up in the library, along with everything your series produce."
          action={<Link href="/create" className="btn-primary mt-2">Create a video</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((video) => {
            const thumb = mediaUrl(video.thumbnailPath);
            const mode = getMode(video.mode);
            return (
              <Link key={video.id} href={`/videos/${video.id}`}
                    className="card group transition-colors hover:border-brand-500/40">
                <div className={`mb-3 flex overflow-hidden rounded-lg bg-ink-800 ${
                  video.aspect === '9:16' ? 'aspect-[9/16]' : video.aspect === '1:1' ? 'aspect-square' : 'aspect-video'
                }`}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="m-auto text-4xl opacity-30">{mode.glyph}</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-medium text-slate-100">{video.title}</h3>
                  <StatusPill status={video.status} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {mode.name}
                  {video.actualDurationMs > 0 && ` · ${formatDuration(video.actualDurationMs)}`}
                  {video.series && ` · ${video.series.name}`}
                </p>
                <p className="text-xs text-slate-600">{formatDate(video.createdAt)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
