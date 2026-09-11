import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { SOCIAL_PLATFORMS, getSocialProvider } from '@/providers/social';
import { ChannelManager } from '@/components/channel-manager';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const user = await requireUser();

  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: { createdAt: 'asc' },
  });

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Channels</h1>
        <p className="mt-1 text-slate-400">
          Where finished videos get posted. Series can publish to these automatically.
        </p>
      </header>

      <ChannelManager
        accounts={accounts.map((a) => ({
          id: a.id, platform: a.platform, handle: a.handle,
          displayName: a.displayName, status: a.status,
        }))}
        platforms={SOCIAL_PLATFORMS.map((p) => ({
          ...p,
          authorizeUrl: getSocialProvider(p.platform).authorizeUrl(
            user.workspaceId, `${base}/api/accounts/callback/${p.platform}`,
          ),
        }))}
      />
    </div>
  );
}
