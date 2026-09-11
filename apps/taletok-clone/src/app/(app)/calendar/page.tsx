import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { StatusPill, EmptyState, formatDate } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Groups scheduled posts by calendar day. */
function groupByDay<T extends { scheduledFor: Date }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.scheduledFor.toISOString().slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default async function CalendarPage() {
  const user = await requireUser();

  const posts = await db.scheduledPost.findMany({
    where: { video: { workspaceId: user.workspaceId }, status: { not: 'CANCELLED' } },
    orderBy: { scheduledFor: 'asc' },
    include: {
      socialAccount: { select: { platform: true, handle: true } },
      video: { select: { id: true, title: true, status: true } },
    },
  });

  const days = groupByDay(posts);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Calendar</h1>
        <p className="mt-1 text-slate-400">
          Everything queued to go out. The worker publishes each post once its render is done.
        </p>
      </header>

      {days.length === 0 ? (
        <EmptyState
          glyph="▤"
          title="Nothing scheduled"
          body="Schedule a finished video from its editor, or switch a series to auto-publish."
          action={<Link href="/videos" className="btn-primary mt-2">Go to library</Link>}
        />
      ) : (
        <div className="space-y-6">
          {days.map(([day, dayPosts]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm font-medium text-slate-300">
                {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </h2>
              <div className="space-y-2">
                {dayPosts.map((post) => (
                  <div key={post.id} className="card flex flex-wrap items-center gap-3 py-3">
                    <span className="font-mono text-sm text-slate-400">
                      {post.scheduledFor.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Link href={`/videos/${post.video.id}`}
                          className="min-w-0 flex-1 truncate text-sm text-slate-100 hover:text-brand-400">
                      {post.video.title}
                    </Link>
                    <span className="text-xs capitalize text-slate-500">
                      {post.socialAccount.platform} · {post.socialAccount.handle}
                    </span>
                    <StatusPill status={post.status} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
