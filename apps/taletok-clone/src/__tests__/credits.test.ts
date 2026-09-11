import { describe, expect, it } from 'vitest';
import { estimateCredits, MODE_CREDIT_RATE, PLANS } from '@/lib/credits';
import { VIDEO_MODES } from '@/pipeline/modes';

describe('estimateCredits', () => {
  it('scales with duration', () => {
    expect(estimateCredits('ai-short', 60)).toBeGreaterThan(estimateCredits('ai-short', 30));
  });

  it('never charges less than one credit', () => {
    expect(estimateCredits('ai-short', 1)).toBe(1);
  });

  it('always returns a whole number', () => {
    for (const seconds of [7, 13, 45, 137]) {
      expect(Number.isInteger(estimateCredits('cinematic-short', seconds))).toBe(true);
    }
  });

  it('falls back to a default rate for an unknown mode', () => {
    expect(estimateCredits('not-a-mode', 50)).toBeGreaterThan(0);
  });

  it('prices long-form below shorts per second', () => {
    expect(MODE_CREDIT_RATE['long-form-story']).toBeLessThan(MODE_CREDIT_RATE['cinematic-short']);
  });

  it('has a rate for every mode in the catalog', () => {
    for (const mode of VIDEO_MODES) {
      expect(MODE_CREDIT_RATE[mode.id], `no rate for ${mode.id}`).toBeDefined();
    }
  });
});

describe('plans', () => {
  it('increases credits with price', () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].credits).toBeGreaterThan(PLANS[i - 1].credits);
      expect(PLANS[i].price).toBeGreaterThan(PLANS[i - 1].price);
    }
  });

  it('affords a plausible number of videos on the free tier', () => {
    const free = PLANS[0];
    const perVideo = estimateCredits('ai-short', 35);
    expect(Math.floor(free.credits / perVideo)).toBeGreaterThanOrEqual(3);
  });
});
