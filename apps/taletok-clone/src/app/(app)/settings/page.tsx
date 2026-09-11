import { requireUser } from '@/lib/auth';
import { providerStatus } from '@/providers/registry';
import { ffmpegAvailable } from '@/pipeline/ffmpeg';
import { Banner } from '@/components/ui';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  llm: 'Script writing',
  tts: 'Voiceover',
  image: 'Scene visuals',
  music: 'Background music',
  social: 'Publishing',
};

export default async function SettingsPage() {
  const user = await requireUser();
  const providers = providerStatus();
  const ffmpeg = await ffmpegAvailable();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-slate-400">{user.workspaceName} · signed in as {user.email}</p>
      </header>

      {!ffmpeg && (
        <Banner tone="error">
          ffmpeg was not found on this machine, so renders will fail. Install it, or set{' '}
          <code className="text-xs">FFMPEG_PATH</code> to its location.
        </Banner>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Generation providers</h2>
          <p className="mt-1 text-sm text-slate-400">
            Each stage resolves independently. Anything marked <em>placeholder</em> produces real,
            correctly-timed output without calling a paid service — set that stage&apos;s API key to
            upgrade it in place, with no other change.
          </p>
        </div>

        {providers.map((status) => (
          <div key={status.kind} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-slate-100">{KIND_LABELS[status.kind] ?? status.kind}</h3>
                <p className="mt-1 text-sm text-slate-400">{status.active.name}</p>
              </div>
              <span className={`pill ${
                status.active.placeholder
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                {status.active.placeholder ? 'placeholder' : 'live'}
              </span>
            </div>

            {status.active.note && (
              <p className="mt-2 text-xs text-slate-500">{status.active.note}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
              {status.alternatives.map((alt) => (
                <span key={alt.id}
                      className={`pill border text-xs ${
                        alt.id === status.active.id
                          ? 'border-brand-500/50 text-brand-400'
                          : alt.available
                            ? 'border-white/15 text-slate-400'
                            : 'border-white/5 text-slate-600'
                      }`}>
                  {alt.name}{!alt.available && ' — no key'}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="label">Render environment</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-400">ffmpeg</dt>
            <dd className={ffmpeg ? 'text-emerald-400' : 'text-red-400'}>
              {ffmpeg ? 'available' : 'not found'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Storage</dt>
            <dd className="text-slate-300">{process.env.STORAGE_DIR || './storage'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Plan</dt>
            <dd className="text-slate-300">{user.plan}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
