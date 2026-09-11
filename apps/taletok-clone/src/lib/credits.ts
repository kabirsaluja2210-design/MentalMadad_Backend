import { db } from './db';

/** Credit cost per generated second, by video mode. */
export const MODE_CREDIT_RATE: Record<string, number> = {
  'reddit-story': 0.2,
  'cinematic-short': 0.35,
  'short-documentary': 0.3,
  'mechanism-explainer': 0.35,
  'ai-short': 0.2,
  timelapse: 0.25,
  'long-form-story': 0.12,
  quiz: 0.2,
  listicle: 0.2,
  'text-message-story': 0.22,
  motivational: 0.2,
};

export function estimateCredits(mode: string, durationSec: number): number {
  const rate = MODE_CREDIT_RATE[mode] ?? 0.2;
  return Math.max(1, Math.ceil(rate * durationSec));
}

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public available: number) {
    super(`Needs ${needed} credits, workspace has ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Atomically debits credits and writes a ledger entry. Throws
 * InsufficientCreditsError rather than letting a balance go negative.
 */
export async function spendCredits(
  workspaceId: string,
  amount: number,
  reason: string,
  videoId?: string,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (ws.credits < amount) throw new InsufficientCreditsError(amount, ws.credits);

    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: { credits: { decrement: amount } },
    });
    await tx.creditEntry.create({
      data: { workspaceId, delta: -amount, reason, videoId, balanceAfter: updated.credits },
    });
    return updated.credits;
  });
}

/** Returns credits to a workspace — used when a render fails. */
export async function refundCredits(
  workspaceId: string,
  amount: number,
  reason: string,
  videoId?: string,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: { credits: { increment: amount } },
    });
    await tx.creditEntry.create({
      data: { workspaceId, delta: amount, reason, videoId, balanceAfter: updated.credits },
    });
    return updated.credits;
  });
}

export const PLANS = [
  { id: 'FREE', name: 'Free', price: 0, credits: 30, seats: 1,
    features: ['3 videos / month', '720p export', 'Platform watermark', 'Manual download only'] },
  { id: 'CREATOR', name: 'Creator', price: 19, credits: 400, seats: 1,
    features: ['~40 videos / month', '1080p export', 'Own watermark', '1 auto-posting channel', 'All video modes'] },
  { id: 'STUDIO', name: 'Studio', price: 49, credits: 1500, seats: 3,
    features: ['~150 videos / month', '1080p + 4K export', 'No watermark', '5 auto-posting channels', 'Series automation', 'Priority rendering'] },
  { id: 'AGENCY', name: 'Agency', price: 149, credits: 6000, seats: 10,
    features: ['~600 videos / month', 'Everything in Studio', 'Unlimited channels', '10 team seats', 'API access'] },
] as const;
