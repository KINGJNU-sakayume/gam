import { describe, expect, test } from 'bun:test';
import { buyAndHold, createEpisode, episodeView, playReplay, REPLAY_CASH } from '../src/replay/replay';
import type { Bars } from '../src/engine/types';

function line(id: string, n: number, f: (i: number) => number): Bars {
  const c = Array.from({ length: n }, (_, i) => f(i));
  return { id, d: c.map((_, i) => `d${String(i).padStart(5, '0')}`), o: c, h: c.map((x) => x * 1.01), l: c.map((x) => x * 0.99), c, v: c.map(() => 1000), f: c.map(() => 1) };
}

describe('replay', () => {
  const up = line('UP', 400, (i) => 50 + i);
  const pool = [up, line('FLAT', 400, () => 80), line('SHORT', 100, () => 10)];

  test('episodes are deterministic per seed and never pick too-short series', () => {
    for (let seed = 1; seed < 50; seed++) {
      const a = createEpisode(pool, seed)!;
      expect(createEpisode(pool, seed)).toEqual(a);
      expect(a.sourceId).not.toBe('SHORT');
      expect(a.start).toBeGreaterThanOrEqual(120);
      expect(a.start + 60).toBeLessThan(400);
    }
  });

  test('view hides dates, rescales D0 close to 100 and never shows future bars', () => {
    const ep = { seed: 1, sourceId: 'UP', start: 200, lookback: 120, steps: 60 };
    const v = episodeView(ep, up, 5);
    expect(v.c[v.zero]).toBeCloseTo(100, 9);
    expect(v.labels[v.zero]).toBe('D0');
    expect(v.labels.at(-1)).toBe('D+5');
    expect(v.c).toHaveLength(126);
  });

  test('actions execute at the next open; buy-and-hold matches a single buy at step 0', () => {
    const ep = { seed: 1, sourceId: 'UP', start: 200, lookback: 120, steps: 60 };
    const s = playReplay(ep, up, [{ step: 0, side: 'buy', fraction: 1 }, { step: 10, side: 'sell', fraction: 1 }], 60);
    expect(s.trades[0]).toMatchObject({ step: 1, side: 'buy' });
    expect(s.trades[1]).toMatchObject({ step: 11, side: 'sell' });
    expect(s.shares).toBe(0);
    expect(s.equity).toHaveLength(61);
    const bh = buyAndHold(ep, up);
    expect(bh).toBeGreaterThan(0);
    expect(s.equity.at(-1)! / REPLAY_CASH - 1).toBeLessThan(bh);
    expect(s.maxDrawdown).toBeLessThanOrEqual(0);
  });
});
