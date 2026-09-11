import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { VIDEO_MODES } from '@/pipeline/modes';
import { PLANS } from '@/lib/credits';

const PIPELINE_STEPS = [
  { n: '01', title: 'Pick a format', body: 'Nine generators, each with its own pacing, visual treatment and caption style.' },
  { n: '02', title: 'Give it a topic', body: 'A sentence, a link or a pasted story. Discovery will suggest one if you would rather not.' },
  { n: '03', title: 'It writes and cuts', body: 'Script, voiceover, per-scene visuals, timed captions and your watermark — one pass.' },
  { n: '04', title: 'Refine or ship', body: 'Reroll any single scene in the editor, or send it straight to the posting calendar.' },
];

export default async function LandingPage() {
  // Signed-in visitors go straight to work.
  if (await currentUser()) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-ink-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold text-white">
          Reel<span className="text-brand-400">Forge</span>
        </span>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary">Start free</Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 text-center">
        <p className="mb-4 inline-block rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400">
          Faceless video automation
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
          Turn one topic into a finished short — script, voice, visuals and captions.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
          Pick a format, give it a subject, and get a vertical video with timed captions and your
          watermark burned in. Put it on a schedule and it keeps producing without you.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Create your first video</Link>
          <Link href="/login" className="btn-ghost px-6 py-3 text-base">Sign in</Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          30 render credits on the free plan. No card, no API keys required.
        </p>
      </section>

      {/* formats */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-white">Nine generators</h2>
        <p className="mt-2 text-slate-400">Each one is a different recipe, not a different prompt.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VIDEO_MODES.map((mode) => (
            <div key={mode.id} className="card transition-colors hover:border-brand-500/40">
              <div className="mb-3 text-2xl">{mode.glyph}</div>
              <h3 className="font-semibold text-slate-100">{mode.name}</h3>
              <p className="mt-1 text-sm text-brand-400">{mode.tagline}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{mode.description}</p>
              <p className="mt-4 text-xs text-slate-500">
                {mode.defaultDurationSec}s default · {mode.defaultAspect} · {mode.captionStyle} captions
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* pipeline */}
      <section className="border-y border-white/5 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold text-white">How a render runs</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map((step) => (
              <div key={step.n}>
                <div className="mb-3 font-mono text-sm text-brand-400">{step.n}</div>
                <h3 className="font-semibold text-slate-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-white">Plans</h2>
        <p className="mt-2 text-slate-400">Credits are spent per second of finished video.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`card flex flex-col ${plan.id === 'STUDIO' ? 'border-brand-500/50' : ''}`}
            >
              {plan.id === 'STUDIO' && (
                <span className="mb-3 self-start rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-400">
                  Most popular
                </span>
              )}
              <h3 className="font-semibold text-slate-100">{plan.name}</h3>
              <p className="mt-2 text-3xl font-bold text-white">
                ${plan.price}
                <span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-slate-400">{plan.credits.toLocaleString()} credits</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-400">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand-400">·</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="btn-ghost mt-5 w-full">Choose {plan.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-10 text-center text-sm text-slate-500">
        ReelForge — a self-hosted faceless video pipeline.
      </footer>
    </main>
  );
}
