// Compact summary of my journal and of both forecast records, for Claude's reviews and notes.
//   npx tsx scripts/review-input.ts            everything
//   npx tsx scripts/review-input.ts --ai-only  only the AI forecast record (for the daily note)
//   npx tsx scripts/review-input.ts --since 2026-10-10
import { headToHead, scoreboard, scoreForecast } from '../src/engine/forecast';
import { settle } from '../src/engine/settle';
import { aiForecasts, allBars, arg, instruments, journal, r } from './lib';

const since = arg('since', '0000-00-00')!;
const aiOnly = process.argv.includes('--ai-only');
const inst = instruments();
const ai = aiForecasts();
const j = aiOnly ? null : journal();
const forecasts = [...(j?.forecasts ?? []), ...ai];
const tickers = new Set([...forecasts.map((f) => f.ticker), ...(j?.orders ?? []).map((o) => o.ticker), 'FX:USDKRW']);
const prices = allBars(tickers);
const scored = forecasts.map((f) => scoreForecast(f, prices[f.ticker]));
const board = (by: 'me' | 'ai') => {
  const b = scoreboard(scored.filter((s) => s.forecast.by === by));
  return { scored: b.count, open: b.open, brier: r(b.brier, 3), hitRate: r(b.hitRate, 2), coverage80: r(b.coverage, 2) };
};
const name = (id: string) => inst[id]?.name ?? id;

const out: Record<string, unknown> = {
  aiForecasts: {
    record: board('ai'),
    open: scored.filter((s) => s.forecast.by === 'ai' && s.status === 'open').map((s) => ({ ticker: s.forecast.ticker, name: name(s.forecast.ticker), madeAfter: s.forecast.madeAfter, pUp: s.forecast.pUp, remaining: s.remaining })),
    recentlyScored: scored.filter((s) => s.forecast.by === 'ai' && s.status === 'scored' && s.dueDate! >= since)
      .map((s) => ({ ticker: s.forecast.ticker, madeAfter: s.forecast.madeAfter, pUp: s.forecast.pUp, ret: r(s.ret), inRange: s.inRange, brier: r(s.brier, 3) })),
  },
};

if (!aiOnly) {
  if (!j) {
    out.journal = 'journal/journal.json 없음 — 사이트 설정에서 내보내기 후 올려야 리뷰할 수 있음';
  } else {
    const acc = settle(j, prices, inst);
    const byOrder = new Map(j.orders.map((o) => [o.id, o]));
    const sells = acc.fills.filter((f) => f.side === 'sell');
    const wins = sells.filter((f) => (f.realized ?? 0) > 0).length;
    const byConfidence: Record<string, { trades: number; wins: number }> = {};
    for (const f of sells) {
      // confidence of the buy that opened the position: the most recent buy fill before this sell
      const buy = [...acc.fills].reverse().find((x) => x.ticker === f.ticker && x.side === 'buy' && x.date <= f.date);
      const c = String(byOrder.get(buy?.orderId ?? '')?.confidence ?? '?');
      byConfidence[c] ??= { trades: 0, wins: 0 };
      byConfidence[c].trades++;
      if ((f.realized ?? 0) > 0) byConfidence[c].wins++;
    }
    out.journal = {
      settings: j.settings,
      cash: acc.cash,
      realized: acc.realized,
      costs: acc.fees,
      positions: acc.positions.map((p) => {
        const b = prices[p.ticker];
        const last = b ? b.c[b.c.length - 1] : null;
        return { ticker: p.ticker, name: name(p.ticker), qty: p.qty, avgCost: r(p.cost / p.qty, 2), last, ret: last ? r((last * p.qty) / p.cost - 1) : null };
      }),
      closedTrades: { count: sells.length, wins, winRate: sells.length ? r(wins / sells.length, 2) : null, byBuyConfidence: byConfidence },
      orders: j.orders.filter((o) => o.placedAt.slice(0, 10) >= since).map((o) => {
        const oc = acc.outcomes[o.id];
        const f = acc.fills.find((x) => x.orderId === o.id);
        return {
          placed: o.placedAt.slice(0, 10), ticker: o.ticker, name: name(o.ticker), side: o.side, type: o.type, qty: o.qty, price: o.price,
          reason: o.reason, confidence: o.confidence, status: oc?.status, statusReason: oc?.reason,
          fill: f ? { date: f.date, price: f.price, realized: r(f.realized ?? null, 0) } : undefined,
        };
      }),
      myForecasts: { record: board('me'), headToHead: headToHead(scored).map((p) => ({ ticker: p.me.forecast.ticker, madeAfter: p.me.forecast.madeAfter, me: r(p.me.brier, 3), ai: r(p.ai.brier, 3) })) },
      replays: j.replays.filter((x) => x.at.slice(0, 10) >= since).map((x) => ({
        at: x.at.slice(0, 10), curated: x.curated, source: name(x.sourceId), period: `${x.startDate}~${x.endDate}`,
        actions: x.actions.map((a) => `D+${a.step} ${a.side} ${Math.round(a.fraction * 100)}%`), ret: r(x.finalReturn), buyHold: r(x.buyHold), note: x.note,
      })),
      memos: j.memos.filter((m) => m.at.slice(0, 10) >= since),
    };
  }
}

console.log(JSON.stringify(out, null, 1));
