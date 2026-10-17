// Forecast scoring (docs/04_FORECASTS.md).
import type { Bars, Forecast } from './types';

export interface ScoredForecast {
  forecast: Forecast;
  status: 'open' | 'scored' | 'no-data';
  /** Trading date the forecast is judged on, when known. */
  dueDate?: string;
  /** Trading days still to go, for open forecasts. */
  remaining?: number;
  ret?: number;
  up?: boolean;
  brier?: number;
  inRange?: boolean;
}

function indexOnOrBefore(d: string[], date: string): number {
  let lo = 0, hi = d.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (d[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function scoreForecast(f: Forecast, bars: Bars | undefined): ScoredForecast {
  if (!bars) return { forecast: f, status: 'no-data' };
  const base = indexOnOrBefore(bars.d, f.madeAfter);
  if (base < 0) return { forecast: f, status: 'no-data' };
  const target = base + f.horizon;
  if (target >= bars.d.length) {
    return { forecast: f, status: 'open', remaining: target - (bars.d.length - 1) };
  }
  const adj = (i: number) => bars.c[i] * bars.f[i];
  const ret = adj(target) / adj(base) - 1;
  const up = ret > 0;
  return {
    forecast: f,
    status: 'scored',
    dueDate: bars.d[target],
    ret,
    up,
    brier: (f.pUp - (up ? 1 : 0)) ** 2,
    inRange: ret >= f.low && ret <= f.high,
  };
}

export interface Scoreboard {
  count: number;
  open: number;
  brier: number | null;
  coverage: number | null;
  hitRate: number | null;
  /** Buckets of stated probability (0.0–0.1, …, 0.9–1.0): how often the price actually went up. */
  calibration: { from: number; to: number; n: number; upShare: number | null; meanP: number | null }[];
}

export function scoreboard(scored: ScoredForecast[]): Scoreboard {
  const done = scored.filter((s) => s.status === 'scored');
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const buckets = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, items: [] as ScoredForecast[] }));
  for (const s of done) buckets[Math.min(9, Math.floor(s.forecast.pUp * 10))].items.push(s);
  return {
    count: done.length,
    open: scored.filter((s) => s.status === 'open').length,
    brier: mean(done.map((s) => s.brier!)),
    coverage: mean(done.map((s) => (s.inRange ? 1 : 0))),
    hitRate: mean(done.map((s) => ((s.forecast.pUp >= 0.5) === s.up ? 1 : 0))),
    calibration: buckets.map((b) => ({
      from: b.from,
      to: b.to,
      n: b.items.length,
      upShare: mean(b.items.map((s) => (s.up ? 1 : 0))),
      meanP: mean(b.items.map((s) => s.forecast.pUp)),
    })),
  };
}

/** Pairs of my and the AI's forecasts on the same ticker, base date and horizon, both scored. */
export function headToHead(scored: ScoredForecast[]): { me: ScoredForecast; ai: ScoredForecast }[] {
  const key = (s: ScoredForecast) => `${s.forecast.ticker}|${s.forecast.madeAfter}|${s.forecast.horizon}`;
  const ai = new Map<string, ScoredForecast>();
  for (const s of scored) if (s.status === 'scored' && s.forecast.by === 'ai') ai.set(key(s), s);
  const out: { me: ScoredForecast; ai: ScoredForecast }[] = [];
  for (const s of scored) {
    if (s.status !== 'scored' || s.forecast.by !== 'me') continue;
    const other = ai.get(key(s));
    if (other) out.push({ me: s, ai: other });
  }
  return out;
}
