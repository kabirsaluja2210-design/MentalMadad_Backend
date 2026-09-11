import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PLANS, MODE_CREDIT_RATE } from '@/lib/credits';
import { getMode } from '@/pipeline/modes';
import { formatDate, Banner } from '@/components/ui';
import { PlanPicker } from '@/components/plan-picker';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const user = await requireUser();

  const [workspace, entries, usage] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } }),
    db.creditEntry.findMany({
      where: { workspaceId: user.workspaceId }, orderBy: { createdAt: 'desc' }, take: 30,
    }),
    db.video.groupBy({
      by: ['mode'], where: { workspaceId: user.workspaceId }, _count: { mode: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Billing</h1>
        <p className="mt-1 text-slate-400">
          {workspace.credits.toLocaleString()} credits on the {workspace.plan} plan.
        </p>
      </header>

      <Banner tone="info">
        No payment processor is connected. Switching plans grants the credits directly so the whole
        flow is testable; wire a checkout webhook to <code className="text-xs">POST /api/billing</code> to
        charge for real.
      </Banner>

      <PlanPicker current={workspace.plan} plans={PLANS.map((p) => ({ ...p, features: [...p.features] }))} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="label">Credit cost per second</h2>
          <ul className="space-y-2">
            {Object.entries(MODE_CREDIT_RATE).map(([mode, rate]) => (
              <li key={mode} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {getMode(mode).glyph} {getMode(mode).name}
                </span>
                <span className="text-slate-500">{rate} / sec</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="label">Videos by format</h2>
          {usage.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing rendered yet.</p>
          ) : (
            <ul className="space-y-2">
              {usage.map((row) => (
                <li key={row.mode} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{getMode(row.mode).name}</span>
                  <span className="text-slate-500">{row._count.mode}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="label">Credit history</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-300">{entry.reason}</p>
                  <p className="text-xs text-slate-600">{formatDate(entry.createdAt)}</p>
                </div>
                <span className={entry.delta > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                  {entry.delta > 0 ? '+' : ''}{entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
