import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/storage';
import { parseJson } from '@/lib/json';
import { getMode } from '@/pipeline/modes';
import { VideoEditor } from '@/components/video-editor';

export const dynamic = 'force-dynamic';

export default async function VideoPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const video = await db.video.findUnique({
    where: { id: params.id },
    include: {
      scenes: { orderBy: { index: 'asc' } },
      voice: true,
      jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      posts: { include: { socialAccount: true } },
    },
  });
  if (!video || video.workspaceId !== user.workspaceId) notFound();

  const [voices, accounts] = await Promise.all([
    db.voice.findMany({ orderBy: [{ premium: 'asc' }, { name: 'asc' }] }),
    db.socialAccount.findMany({ where: { workspaceId: user.workspaceId } }),
  ]);

  return (
    <VideoEditor
      mode={getMode(video.mode)}
      voices={voices.map((v) => ({ id: v.id, name: v.name, style: v.style }))}
      accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }))}
      video={{
        id: video.id,
        title: video.title,
        status: video.status,
        aspect: video.aspect,
        mode: video.mode,
        topic: video.topic,
        hook: video.hook,
        cta: video.cta,
        script: video.script,
        voiceId: video.voiceId,
        actualDurationMs: video.actualDurationMs,
        outputUrl: mediaUrl(video.outputPath),
        thumbnailUrl: mediaUrl(video.thumbnailPath),
        job: video.jobs[0]
          ? { status: video.jobs[0].status, stage: video.jobs[0].stage,
              progress: video.jobs[0].progress, error: video.jobs[0].error }
          : null,
        scenes: video.scenes.map((s) => ({
          id: s.id,
          index: s.index,
          text: s.text,
          visualPrompt: s.visualPrompt,
          motion: s.motion,
          durationMs: s.durationMs,
          locked: s.locked,
          status: s.status,
          imageUrl: mediaUrl(s.imagePath),
          audioUrl: mediaUrl(s.audioPath),
          wordCount: parseJson<unknown[]>(s.wordsJson, []).length,
        })),
        posts: video.posts.map((p) => ({
          id: p.id, status: p.status, scheduledFor: p.scheduledFor.toISOString(),
          platform: p.socialAccount.platform, handle: p.socialAccount.handle,
          postedUrl: p.postedUrl, error: p.error,
        })),
      }}
    />
  );
}
