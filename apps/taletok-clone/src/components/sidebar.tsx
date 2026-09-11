'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SessionUser } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', glyph: '◈' },
  { href: '/create', label: 'Create', glyph: '✦' },
  { href: '/videos', label: 'Library', glyph: '▦' },
  { href: '/series', label: 'Series', glyph: '↻' },
  { href: '/calendar', label: 'Calendar', glyph: '▤' },
  { href: '/discover', label: 'Discover', glyph: '◎' },
  { href: '/brand', label: 'Brand kit', glyph: '◑' },
  { href: '/channels', label: 'Channels', glyph: '⇱' },
  { href: '/billing', label: 'Billing', glyph: '◱' },
  { href: '/settings', label: 'Settings', glyph: '⚙' },
];

export function Sidebar({ user, placeholders }: { user: SessionUser; placeholders: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* mobile bar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed right-4 top-4 z-50 rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-sm lg:hidden"
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      <aside
        className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-64 flex-col
                    border-r border-white/5 bg-ink-900 p-4 lg:static lg:flex`}
      >
        <Link href="/dashboard" className="mb-6 px-2 text-lg font-semibold text-white">
          Reel<span className="text-brand-400">Forge</span>
        </Link>

        <nav className="flex-1 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`nav-link ${active ? 'nav-link-active' : ''}`}
              >
                <span className="w-4 text-center opacity-70">{item.glyph}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {placeholders && (
          <Link
            href="/settings"
            className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            Some stages are running on placeholder output. See settings →
          </Link>
        )}

        <div className="rounded-lg bg-white/5 p-3">
          <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.workspaceName}</p>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              <span className="font-medium text-brand-400">{user.credits.toLocaleString()}</span> credits
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-400">{user.plan}</span>
          </div>
          <button onClick={signOut} className="mt-3 w-full text-left text-xs text-slate-500 hover:text-slate-300">
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
