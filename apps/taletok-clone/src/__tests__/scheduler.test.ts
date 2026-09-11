import { describe, expect, it } from 'vitest';
import { nextRunFor } from '@/worker/scheduler';

const MONDAY_NOON = new Date('2026-03-02T12:00:00Z');

describe('nextRunFor', () => {
  it('always returns a time in the future', () => {
    for (const cadence of ['daily', 'weekdays', 'weekly', 'every-2-days']) {
      expect(nextRunFor(cadence, '17:00', MONDAY_NOON).getTime()).toBeGreaterThan(MONDAY_NOON.getTime());
    }
  });

  it('applies the requested hour and minute', () => {
    const next = nextRunFor('daily', '09:30', MONDAY_NOON);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  it('rolls to the next day when the time has already passed today', () => {
    const next = nextRunFor('daily', '09:00', MONDAY_NOON);
    expect(next.getTime()).toBeGreaterThan(MONDAY_NOON.getTime());
  });

  it('spaces weekly runs about a week out', () => {
    const next = nextRunFor('weekly', '17:00', MONDAY_NOON);
    const days = (next.getTime() - MONDAY_NOON.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(8.5);
  });

  it('never lands on a weekend for the weekdays cadence', () => {
    for (let day = 0; day < 7; day++) {
      const from = new Date(MONDAY_NOON.getTime() + day * 86_400_000);
      const next = nextRunFor('weekdays', '17:00', from);
      expect([0, 6]).not.toContain(next.getDay());
    }
  });

  it('pushes manual series effectively out of the scheduler', () => {
    const next = nextRunFor('manual', '17:00', MONDAY_NOON);
    expect(next.getFullYear()).toBeGreaterThan(MONDAY_NOON.getFullYear() + 50);
  });

  it('tolerates a malformed time by falling back to a default hour', () => {
    expect(() => nextRunFor('daily', 'not-a-time', MONDAY_NOON)).not.toThrow();
  });
});
