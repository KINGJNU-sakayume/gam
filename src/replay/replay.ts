// Blind replay (docs/03_PAPER_TRADING.md, "리플레이 계좌"). Deterministic from the seed and the action list.
import type { Bars, ReplayAction } from '../engine/types';

export const REPLAY_CASH = 10_000_000;
export const REPLAY_COST = 0.001; // commission per side
export const REPLAY_SLIPPAGE = 0.001;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Episode {
  seed: number;
  sourceId: string;
  /** Index of the decision bar D0 in the source series. */
  start: number;
  lookback: number;
  steps: number;
  curated?: string;
}

export function createEpisode(pool: Bars[], seed: number, lookback = 120, steps = 60): Episode | null {
  const usable = pool.filter((b) => b.d.length >= lookback + steps + 1).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (usable.length === 0) return null;
  const rnd = mulberry32(seed);
  const src = usable[Math.floor(rnd() * usable.length)];
  const lo = lookback;
  const hi = src.d.length - steps - 1;
  const start = lo + Math.floor(rnd() * (hi - lo + 1));
  return { seed, sourceId: src.id, start, lookback, steps };
}

export function episodeFromDate(bars: Bars, startDate: string, lookback: number, steps: number, curated: string): Episode | null {
  const start = bars.d.findIndex((d) => d >= startDate);
  if (start < lookback || start + steps >= bars.d.length) return null;
  return { seed: 0, sourceId: bars.id, start, lookback, steps, curated };
}

export interface ReplayView {
  o: number[]; h: number[]; l: number[]; c: number[]; v: number[];
  /** "D-120" … "D+12" */
  labels: string[];
  /** Index (within the view) of D0. */
  zero: number;
}

/** Bars visible after the close of D+step, prices rescaled so D0's close is 100 and volume to its mean. */
export function episodeView(ep: Episode, b: Bars, step: number): ReplayView {
  const from = ep.start - ep.lookback;
  const to = ep.start + Math.min(step, ep.steps);
  const scale = 100 / (b.c[ep.start] * b.f[ep.start]);
  const idx = Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const vols = b.v.slice(from, ep.start + 1);
  const vMean = vols.reduce((a, x) => a + x, 0) / Math.max(1, vols.length) || 1;
  return {
    o: idx.map((i) => b.o[i] * b.f[i] * scale),
    h: idx.map((i) => b.h[i] * b.f[i] * scale),
    l: idx.map((i) => b.l[i] * b.f[i] * scale),
    c: idx.map((i) => b.c[i] * b.f[i] * scale),
    v: idx.map((i) => (b.v[i] / vMean) * 100),
    labels: idx.map((i) => {
      const k = i - ep.start;
      return k === 0 ? 'D0' : k > 0 ? `D+${k}` : `D${k}`;
    }),
    zero: ep.lookback,
  };
}

export interface ReplayTrade { step: number; side: 'buy' | 'sell'; price: number; shares: number }

export interface ReplayState {
  cash: number;
  shares: number;
  equity: number[]; // value at the close of D0 … D+step
  trades: ReplayTrade[];
  maxDrawdown: number;
}

/**
 * Plays the actions up to D+step. An action decided at step k (after the close of D+k) executes at the open of
 * D+(k+1). Actions at the final step never execute.
 */
export function playReplay(ep: Episode, b: Bars, actions: ReplayAction[], step: number): ReplayState {
  const scale = 100 / (b.c[ep.start] * b.f[ep.start]);
  const px = (arr: number[], i: number) => arr[i] * b.f[i] * scale;
  let cash = REPLAY_CASH;
  let shares = 0;
  const equity: number[] = [];
  const trades: ReplayTrade[] = [];
  const last = Math.min(step, ep.steps);
  for (let k = 0; k <= last; k++) {
    const i = ep.start + k;
    if (k > 0) {
      for (const a of actions.filter((x) => x.step === k - 1)) {
        const open = px(b.o, i);
        if (a.side === 'buy') {
          const price = open * (1 + REPLAY_SLIPPAGE);
          const n = Math.floor((cash * Math.min(1, a.fraction)) / (price * (1 + REPLAY_COST)));
          if (n > 0) {
            cash -= n * price * (1 + REPLAY_COST);
            shares += n;
            trades.push({ step: k, side: 'buy', price, shares: n });
          }
        } else {
          const price = open * (1 - REPLAY_SLIPPAGE);
          const n = Math.floor(shares * Math.min(1, a.fraction));
          if (n > 0) {
            cash += n * price * (1 - REPLAY_COST);
            shares -= n;
            trades.push({ step: k, side: 'sell', price, shares: n });
          }
        }
      }
    }
    equity.push(cash + shares * px(b.c, i));
  }
  let peak = -Infinity, mdd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    mdd = Math.min(mdd, e / peak - 1);
  }
  return { cash, shares, equity, trades, maxDrawdown: mdd };
}

/** Return of buying everything at the open of D+1 and holding to the close of D+steps. */
export function buyAndHold(ep: Episode, b: Bars): number {
  const s = playReplay(ep, b, [{ step: 0, side: 'buy', fraction: 1 }], ep.steps);
  return s.equity[s.equity.length - 1] / REPLAY_CASH - 1;
}
