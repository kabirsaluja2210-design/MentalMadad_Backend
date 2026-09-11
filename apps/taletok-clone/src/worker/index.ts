import { claimNextJob, requeueStaleJobs, runJob } from './queue';
import { runDueSeries, runDuePosts } from './scheduler';

/**
 * Background worker.
 *
 * Run alongside the web app with `npm run worker`. Renders are CPU-bound, so
 * this deliberately processes one job at a time; scale out by starting more
 * worker processes against the same database.
 */

const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const SWEEP_MS = Number(process.env.WORKER_SWEEP_MS || 60_000);

let running = true;

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function sweep(): Promise<void> {
  try {
    const stale = await requeueStaleJobs();
    if (stale) log(`Re-queued ${stale} stale job(s)`);

    const series = await runDueSeries();
    if (series) log(`Series automation queued ${series} video(s)`);

    const posts = await runDuePosts();
    if (posts) log(`Published ${posts} scheduled post(s)`);
  } catch (error) {
    log(`Sweep error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  log('Worker started');
  await sweep();
  const sweepTimer = setInterval(() => void sweep(), SWEEP_MS);

  while (running) {
    let didWork = false;
    try {
      const job = await claimNextJob();
      if (job) {
        didWork = true;
        log(`Rendering video ${job.videoId} (job ${job.id})`);
        const started = Date.now();
        await runJob(job.id, job.videoId);
        log(`Finished job ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    } catch (error) {
      log(`Job error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!didWork) await new Promise((r) => setTimeout(r, POLL_MS));
  }

  clearInterval(sweepTimer);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log(`${signal} received, finishing current job then exiting`);
    running = false;
    setTimeout(() => process.exit(0), 15_000).unref();
  });
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
