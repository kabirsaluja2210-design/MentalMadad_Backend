'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, Banner } from './ui';

interface Plan {
  id: string; name: string; price: number; credits: number; seats: number; features: string[];
}

export function PlanPicker({ current, plans }: { current: string; plans: Plan[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(plan: string) {
    setBusy(plan);
    setError(null);
    try {
      await api('/api/billing', { method: 'POST', body: JSON.stringify({ plan }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch plan');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div key={plan.id}
               className={`card flex flex-col ${plan.id === current ? 'border-brand-500' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">{plan.name}</h3>
              {plan.id === current && (
                <span className="pill bg-brand-500/15 text-brand-400">current</span>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold text-white">
              ${plan.price}<span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">{plan.credits.toLocaleString()} credits</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-xs text-slate-400">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-1.5"><span className="text-brand-400">·</span>{f}</li>
              ))}
            </ul>
            <button onClick={() => choose(plan.id)} disabled={busy !== null || plan.id === current}
                    className="btn-ghost mt-4 w-full text-xs">
              {busy === plan.id ? 'Switching…' : plan.id === current ? 'Active' : `Switch to ${plan.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
