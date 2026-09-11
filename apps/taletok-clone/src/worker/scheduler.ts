import { db } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { estimateCredits, spendCredits, InsufficientCreditsError } from '@/lib/credits';
import { getMode, resolveOptions } from '@/pipeline/modes';
import { getSocialProvider } from '@/providers/social';
import { enqueueRender } from './queue';

/**
 * Series automation and the posting calendar.
 *
 * Two independent sweeps: one turns due series into queued videos, the other
 * publishes scheduled posts whose time has come.
 */

/** Advances a series' nextRunAt according to its cadence. */
export function nextRunFor(cadence: string, postTime: string, from = new Date()): Date {
  const [hours, minutes] = postTime.split(':').map((n) => Number.parseInt(n, 10));
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(hours) ? hours : 17, Number.isFinite(minutes) ? minutes : 0);

  // Always land strictly in the future.
  if (next <= from) next.setDate(next.getDate() + 1);

  switch (cadence) {
    case 'weekly':
      next.setDate(next.getDate() + 6);
      break;
    case 'every-2-days':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekdays':
      // Skip Saturday and Sunday.
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      break;
    case 'manual':
      next.setFullYear(next.getFullYear() + 100); // effectively never
      break;
    case 'daily':
    default:
      break;
  }
  return next;
}

/** Creates and queues one video for every series that is due. */
export async function runDueSeries(now = new Date()): Promise<number> {
  const due = await db.series.findMany({
    where: { active: true, cadence: { not: 'manual' }, nextRunAt: { lte: now } },
    include: { workspace: true },
  });

  let created = 0;
  for (const series of due) {
    const mode = getMode(series.mode);
    const options = resolveOptions(series.mode, parseJson(series.configJson, {}));
    const cost = estimateCredits(series.mode, mode.defaultDurationSec);

    try {
      const video = await db.video.create({
        data: {
          workspaceId: series.workspaceId,
          seriesId: series.id,
          title: `${series.name} — ${now.toISOString().slice(0, 10)}`,
          mode: series.mode,
          topic: series.topic,
          aspect: mode.defaultAspect,
          targetDurationSec: mode.defaultDurationSec,
          voiceId: series.voiceId,
          sourceType: 'prompt',
          optionsJson: JSON.stringify(options),
        },
      });

      await spendCredits(series.workspaceId, cost, `Series: ${series.name}`, video.id);
      await enqueueRender(video.id);

      // Auto-publishing queues the posts now; they go out once the render lands.
      if (series.autoPublish) {
        const targets = parseJson<string[]>(series.targetsJson, []);
        for (const accountId of targets) {
          await db.scheduledPost.create({
            data: {
              videoId: video.id,
              socialAccountId: accountId,
              scheduledFor: series.nextRunAt ?? now,
              caption: series.topic,
            },
          });
        }
      }
      created++;
    } catch (error) {
      if (!(error instanceof InsufficientCreditsError)) throw error;
      // Out of credits: pause the series rather than retrying every minute.
      await db.series.update({ where: { id: series.id }, data: { active: false } });
      continue;
    } finally {
      await db.series.update({
        where: { id: series.id },
        data: { lastRunAt: now, nextRunAt: nextRunFor(series.cadence, series.postTime, now) },
      });
    }
  }
  return created;
}

/** Publishes scheduled posts that are due and whose video has finished. */
export async function runDuePosts(now = new Date()): Promise<number> {
  const due = await db.scheduledPost.findMany({
    where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
    include: { video: true, socialAccount: true },
  });

  let posted = 0;
  for (const post of due) {
    // Not rendered yet — leave it queued and try again next sweep.
    if (post.video.status !== 'READY' || !post.video.outputPath) continue;

    await db.scheduledPost.update({ where: { id: post.id }, data: { status: 'POSTING' } });

    try {
      const provider = getSocialProvider(post.socialAccount.platform);
      const result = await provider.publish({
        platform: post.socialAccount.platform,
        accountHandle: post.socialAccount.handle,
        accessToken: post.socialAccount.accessToken,
        videoPath: post.video.outputPath,
        caption: post.caption,
        hashtags: post.hashtags.split(/\s+/).filter(Boolean),
      });

      await db.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'POSTED', postedUrl: result.postedUrl, error: result.simulated ? 'Simulated post — no platform credentials configured' : null },
      });
      await db.video.update({ where: { id: post.video.id }, data: { status: 'PUBLISHED' } });
      posted++;
    } catch (error) {
      await db.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return posted;
}
