// What a blind-replay player sees after the close of D+step — and nothing more. Claude writes step commentary
// from this output only (docs/05_AI_RULES.md). No ticker, no dates, prices rescaled so D0's close = 100.
//   npx tsx scripts/replay-window.ts --ticker KR:005930 --start 2021-01-04 --step 10 [--lookback 120] [--steps 60]
//   npx tsx scripts/replay-window.ts --ticker KR:005930 --start 2021-01-04 --check   (only validates the window)
import { rsi, sma } from '../src/engine/indicators';
import { episodeFromDate, episodeView } from '../src/replay/replay';
import { arg, bars, r } from './lib';

const ticker = arg('ticker');
const start = arg('start');
const lookback = Number(arg('lookback', '120'));
const steps = Number(arg('steps', '60'));
const step = Number(arg('step', '0'));
if (!ticker || !start) throw new Error('--ticker and --start are required');
const b = bars(ticker);
if (!b) throw new Error(`no prices for ${ticker}`);
const ep = episodeFromDate(b, start, lookback, steps, 'draft');
if (!ep) throw new Error(`window does not fit: need ${lookback} bars before and ${steps} after ${start}`);
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ ok: true, d0: b.d[ep.start], end: b.d[ep.start + steps] }));
  process.exit(0);
}

const v = episodeView(ep, b, step);
const s20 = sma(v.c, 20), s60 = sma(v.c, 60), rs = rsi(v.c);
const n = v.c.length;
const last = n - 1;
const recent = Array.from({ length: Math.min(30, n) }, (_, k) => n - Math.min(30, n) + k).map((i) => ({
  t: v.labels[i], o: r(v.o[i], 2), h: r(v.h[i], 2), l: r(v.l[i], 2), c: r(v.c[i], 2), vol: r(v.v[i], 0),
}));
const ret = (k: number) => (last - k >= 0 ? r(v.c[last] / v.c[last - k] - 1) : null);
const hi = Math.max(...v.h), lo = Math.min(...v.l);
console.log(JSON.stringify({
  now: v.labels[last],
  note: 'Prices rescaled (D0 close = 100); volume is % of the lookback average. Dates and ticker are hidden on purpose.',
  summary: {
    close: r(v.c[last], 2), ret5: ret(5), ret20: ret(20), ret60: ret(60),
    sma20: r(s20[last], 2), sma60: r(s60[last], 2), rsi14: r(rs[last], 1),
    rangeHigh: r(hi, 2), rangeLow: r(lo, 2), fromHigh: r(v.c[last] / hi - 1), fromLow: r(v.c[last] / lo - 1),
    volumeVsAvg: r(v.v[last], 0),
  },
  last30: recent,
}, null, 1));
