import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { VIDEO_MODES } from '@/pipeline/modes';
import { CreateForm } from '@/components/create-form';

export const dynamic = 'force-dynamic';

export default async function CreatePage({
  searchParams,
}: {
  searchParams: { mode?: string; topic?: string; source?: string };
}) {
  await requireUser();
  const voices = await db.voice.findMany({ orderBy: [{ premium: 'asc' }, { name: 'asc' }] });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Create a video</h1>
        <p className="mt-1 text-slate-400">
          Pick a format and give it a subject. Everything else is generated.
        </p>
      </header>

      <CreateForm
        modes={VIDEO_MODES}
        voices={voices.map((v) => ({ id: v.id, name: v.name, gender: v.gender, accent: v.accent, style: v.style, premium: v.premium }))}
        initialMode={searchParams.mode}
        initialTopic={searchParams.topic}
        initialSourceType={searchParams.source}
      />
    </div>
  );
}
