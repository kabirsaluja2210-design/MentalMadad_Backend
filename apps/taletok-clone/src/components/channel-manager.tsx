'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, Banner, EmptyState } from './ui';

interface Account {
  id: string; platform: string; handle: string; displayName: string; status: string;
}
interface Platform {
  platform: string; name: string; configured: boolean; authorizeUrl: string | null;
}

export function ChannelManager({ accounts, platforms }: { accounts: Account[]; platforms: Platform[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState(platforms[0]?.platform ?? 'tiktok');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anyConfigured = platforms.some((p) => p.configured);

  async function connect() {
    const target = platforms.find((p) => p.platform === platform);
    // Real OAuth when the platform app is configured; local record otherwise.
    if (target?.authorizeUrl) {
      window.location.href = target.authorizeUrl;
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/accounts', { method: 'POST', body: JSON.stringify({ platform, handle }) });
      setHandle('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    await api(`/api/accounts/${id}`, { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error && <Banner tone="error">{error}</Banner>}

      {!anyConfigured && (
        <Banner tone="warn">
          No platform app credentials are set, so channels connect locally and scheduled posts are
          recorded without being uploaded. Posts made this way are marked as simulated. Add the
          platform credentials from <code className="text-xs">.env.example</code> to enable real OAuth.
        </Banner>
      )}

      <section className="card space-y-3">
        <h2 className="label">Connect a channel</h2>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <button key={p.platform} onClick={() => setPlatform(p.platform)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      platform === p.platform
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}>
              {p.name}
              {p.configured && <span className="ml-1.5 text-xs text-emerald-400">●</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="field flex-1" value={handle} onChange={(e) => setHandle(e.target.value)}
                 placeholder="@yourhandle" />
          <button onClick={connect} disabled={busy || handle.trim().length < 2} className="btn-primary">
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </section>

      {accounts.length === 0 ? (
        <EmptyState glyph="⇱" title="No channels connected"
                    body="Connect at least one channel to schedule posts or let a series publish on its own." />
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.id} className="card flex flex-wrap items-center gap-3 py-3">
              <span className="rounded bg-white/10 px-2 py-1 text-xs capitalize text-slate-300">
                {account.platform}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-100">{account.handle}</p>
                {account.displayName && (
                  <p className="truncate text-xs text-slate-500">{account.displayName}</p>
                )}
              </div>
              <span className="pill bg-emerald-500/15 text-emerald-300">{account.status.toLowerCase()}</span>
              <button onClick={() => disconnect(account.id)} className="btn-danger px-3 py-1.5 text-xs">
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
