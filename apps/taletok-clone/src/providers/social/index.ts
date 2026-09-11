import type { PublishRequest, PublishResult, SocialProvider } from '../types';
import { hashString } from '@/lib/media-encode';

/**
 * Publishing connectors.
 *
 * Each platform has a real OAuth entry point that activates when its client
 * credentials are present, and a simulated publish path used otherwise. The
 * simulated path records a post exactly like a real one but never uploads —
 * `simulated: true` is carried all the way to the UI so a scheduled post is
 * never mistaken for a live one.
 */

interface PlatformConfig {
  platform: string;
  name: string;
  clientId: string | undefined;
  authorizeEndpoint: string;
  scopes: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    platform: 'tiktok',
    name: 'TikTok',
    clientId: process.env.TIKTOK_CLIENT_KEY,
    authorizeEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
    scopes: 'user.info.basic,video.publish',
  },
  {
    platform: 'youtube',
    name: 'YouTube',
    clientId: process.env.YOUTUBE_CLIENT_ID,
    authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'https://www.googleapis.com/auth/youtube.upload',
  },
  {
    platform: 'instagram',
    name: 'Instagram',
    clientId: process.env.INSTAGRAM_APP_ID,
    authorizeEndpoint: 'https://api.instagram.com/oauth/authorize',
    scopes: 'instagram_business_content_publish',
  },
];

function makeSocialProvider(cfg: PlatformConfig): SocialProvider {
  return {
    platform: cfg.platform,
    info: {
      id: cfg.platform,
      name: cfg.name,
      kind: 'social',
      available: Boolean(cfg.clientId),
      placeholder: !cfg.clientId,
      note: cfg.clientId
        ? 'App credentials present — real OAuth enabled.'
        : 'No app credentials. Connections and posts are simulated locally.',
    },

    authorizeUrl(workspaceId: string, redirectUri: string): string | null {
      if (!cfg.clientId) return null;
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: cfg.scopes,
        state: workspaceId,
      });
      return `${cfg.authorizeEndpoint}?${params.toString()}`;
    },

    async publish(req: PublishRequest): Promise<PublishResult> {
      // A real upload needs a live token; without app credentials we record
      // the post locally and flag it as simulated.
      if (!cfg.clientId || !req.accessToken) {
        const id = hashString(`${req.platform}:${req.videoPath}:${req.caption}`)
          .toString(36)
          .padStart(8, '0');
        return {
          externalId: `sim_${id}`,
          postedUrl: `https://example.invalid/${cfg.platform}/${req.accountHandle}/${id}`,
          simulated: true,
        };
      }

      // Real upload flows differ per platform and each needs its own
      // multi-step implementation (init -> upload -> publish). Until those are
      // written, refuse loudly rather than silently dropping the post.
      throw new Error(
        `${cfg.name} upload is not implemented yet. Credentials are configured, ` +
          `so the OAuth connect flow works, but the upload step still needs building.`,
      );
    },
  };
}

export const socialProviders: Record<string, SocialProvider> = Object.fromEntries(
  PLATFORMS.map((cfg) => [cfg.platform, makeSocialProvider(cfg)]),
);

export const SOCIAL_PLATFORMS = PLATFORMS.map((p) => ({
  platform: p.platform,
  name: p.name,
  configured: Boolean(p.clientId),
}));

export function getSocialProvider(platform: string): SocialProvider {
  const provider = socialProviders[platform];
  if (!provider) throw new Error(`Unsupported platform: ${platform}`);
  return provider;
}
