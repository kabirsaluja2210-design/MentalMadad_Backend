'use client';

import { useEffect, useState } from 'react';

/** Small shared presentational pieces used across the app screens. */

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-slate-500/15 text-slate-300',
    QUEUED: 'bg-amber-500/15 text-amber-300',
    RENDERING: 'bg-brand-500/20 text-brand-400',
    READY: 'bg-emerald-500/15 text-emerald-300',
    PUBLISHED: 'bg-sky-500/15 text-sky-300',
    FAILED: 'bg-red-500/15 text-red-300',
    SCHEDULED: 'bg-amber-500/15 text-amber-300',
    POSTED: 'bg-emerald-500/15 text-emerald-300',
    CANCELLED: 'bg-slate-500/15 text-slate-400',
    POSTING: 'bg-brand-500/20 text-brand-400',
  };
  return (
    <span className={`pill ${styles[status] ?? 'bg-slate-500/15 text-slate-300'}`}>
      {status === 'RENDERING' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {status.toLowerCase()}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-slate-400">
          <span>{label}</span>
          <span>{Math.round(value)}%</span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  glyph, title, body, action,
}: { glyph: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-14 text-center">
      <span className="text-4xl">{glyph}</span>
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <p className="max-w-md text-sm text-slate-400">{body}</p>
      {action}
    </div>
  );
}

export function Banner({
  tone = 'info', children,
}: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const tones = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    error: 'border-red-500/30 bg-red-500/10 text-red-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Formats a millisecond duration as m:ss. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Polls an endpoint while `active`, returning the latest payload. */
export function usePoll<T>(url: string, active: boolean, intervalMs = 1500): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* transient — the next tick retries */
      }
    };

    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, active, intervalMs]);

  return data;
}

/** Thin fetch wrapper that surfaces the API's error message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}
