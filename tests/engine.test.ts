import { describe, expect, test } from 'bun:test';
import { dateIn, isOnTick, priceLimits, roundToTick, tickSize } from '../src/engine/market';
import { closeOn, equityCurve, settle } from '../src/engine/settle';
import { headToHead, scoreboard, scoreForecast } from '../src/engine/forecast';
import { validateOrder } from '../src/engine/validate';
import { rsi, sma } from '../src/engine/indicators';
import { emptyJournal, type Bars, type Instrument, type Journal, type Order } from '../src/engine/types';

const KR: Instrument = { id: 'KR:005930', name: '삼성전자', currency: 'KRW', kind: 'stock', market: 'KOSPI', file: '', available: true, asOf: null };
const US: Instrument = { id: 'US:NVDA', name: '엔비디아', currency: 'USD', kind: 'stock', market: 'NASDAQ', file: '', available: true, asOf: null };
const instruments = { [KR.id]: KR, [US.id]: US };

function bars(id: string, rows: [string, number, number, number, number, number?][]): Bars {
  return {
    id,
    d: rows.map((r) => r[0]),
    o: rows.map((r) => r[1]),
    h: rows.map((r) => r[2]),
    l: rows.map((r) => r[3]),
    c: rows.map((r) => r[4]),
    v: rows.map((r) => r[5] ?? 1_000_000),
    f: rows.map(() => 1),
  };
}

// Mon 10-12 … Fri 10-16
const kr = bars('KR:005930', [
  ['2026-10-12', 60000, 61000, 59000, 60500],
  ['2026-10-13', 60600, 62000, 60100, 61800],
  ['2026-10-14', 61500, 61700, 58000, 58500],
  ['2026-10-15', 58000, 59000, 57000, 58800],
  ['2026-10-16', 59000, 60000, 58500, 59900],
]);
const us = bars('US:NVDA', [
  ['2026-10-12', 100, 102, 99, 101],
  ['2026-10-13', 101, 105, 100, 104],
  ['2026-10-14', 104, 104.5, 96, 97],
  ['2026-10-15', 97, 99, 95, 98],
  ['2026-10-16', 98, 100, 97.5, 99.5],
]);
const prices = { [kr.id]: kr, [us.id]: us };

let n = 0;
function order(o: Partial<Order> & Pick<Order, 'ticker' | 'side' | 'type' | 'qty' | 'placedAt'>): Order {
  return { id: `o${++n}`, ...o };
}
function journal(orders: Order[], extra: Partial<Journal> = {}): Journal {
  return { ...emptyJournal(), orders, ...extra };
}

describe('market rules', () => {
  test('Korean tick table', () => {
    expect(tickSize('KOSPI', 1_999)).toBe(1);
    expect(tickSize('KOSPI', 4_999)).toBe(5);
    expect(tickSize('KOSDAQ', 19_990)).toBe(10);
    expect(tickSize('KOSPI', 49_950)).toBe(50);
    expect(tickSize('KOSPI', 199_900)).toBe(100);
    expect(tickSize('KOSPI', 499_500)).toBe(500);
    expect(tickSize('KOSPI', 500_000)).toBe(1_000);
    expect(tickSize('NASDAQ', 1234)).toBe(0.01);
  });
  test('rounding respects direction and band edges', () => {
    expect(roundToTick('KOSPI', 60_020, 'up')).toBe(60_100);
    expect(roundToTick('KOSPI', 60_020, 'down')).toBe(60_000);
    expect(roundToTick('KOSPI', 49_990, 'up')).toBe(50_000);
    expect(roundToTick('NASDAQ', 100.123, 'up')).toBe(100.13);
    expect(roundToTick('NASDAQ', 100.129, 'down')).toBe(100.12);
    expect(isOnTick('KOSPI', 60_050)).toBe(false);
    expect(isOnTick('KOSPI', 60_100)).toBe(true);
  });
  test('price limits ±30%', () => {
    expect(priceLimits('KOSPI', 60_000)).toEqual({ low: 42_000, high: 78_000 });
    expect(priceLimits('NASDAQ', 100)).toBeNull();
  });
  test('date in exchange time zone', () => {
    // Fri 10:00 KST = Thu 21:00 New York
    expect(dateIn('Asia/Seoul', '2026-10-16T10:00:00+09:00')).toBe('2026-10-16');
    expect(dateIn('America/New_York', '2026-10-16T10:00:00+09:00')).toBe('2026-10-15');
  });
});

describe('settle', () => {
  test('market buy fills at next trading day open with slippage, rounded up to tick', () => {
    const o = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 10, placedAt: '2026-10-12T20:00:00+09:00' });
    const a = settle(journal([o]), prices, instruments);
    expect(a.outcomes[o.id].status).toBe('filled');
    expect(a.fills[0].date).toBe('2026-10-13');
    expect(a.fills[0].price).toBe(60_700); // 60,600 × 1.001 = 60,660.6 → tick 100 up
    const fee = 60_700 * 10 * 0.00015;
    expect(a.cash.KRW).toBeCloseTo(10_000_000 - 607_000 - fee, 6);
  });

  test('order placed during the Korean session does not fill that same day', () => {
    const o = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 1, placedAt: '2026-10-13T10:00:00+09:00' });
    const a = settle(journal([o]), prices, instruments);
    expect(a.fills[0].date).toBe('2026-10-14');
  });

  test('US order uses New York date', () => {
    // Tue 08:00 KST = Mon 19:00 NY → first eligible bar is Tue 10-13
    const o = order({ ticker: US.id, side: 'buy', type: 'market', qty: 5, placedAt: '2026-10-13T08:00:00+09:00' });
    const a = settle(journal([o]), prices, instruments);
    expect(a.fills[0].date).toBe('2026-10-13');
    expect(a.fills[0].price).toBe(101.11); // 101 × 1.001 = 101.101 → 101.11
    expect(a.fills[0].currency).toBe('USD');
  });

  test('limit buy fills at the limit when the low touches it, or at the open when it gaps through', () => {
    const touch = order({ ticker: KR.id, side: 'buy', type: 'limit', price: 58_500, qty: 1, placedAt: '2026-10-12T20:00:00+09:00' });
    const gap = order({ ticker: KR.id, side: 'buy', type: 'limit', price: 58_500, qty: 1, placedAt: '2026-10-14T20:00:00+09:00' });
    const a = settle(journal([touch, gap]), prices, instruments);
    expect(a.fills.find((f) => f.orderId === touch.id)).toMatchObject({ date: '2026-10-14', price: 58_500 });
    expect(a.fills.find((f) => f.orderId === gap.id)).toMatchObject({ date: '2026-10-15', price: 58_000 });
  });

  test('limit orders expire after their valid days', () => {
    const o = order({ ticker: KR.id, side: 'buy', type: 'limit', price: 50_000, qty: 1, validDays: 2, placedAt: '2026-10-12T20:00:00+09:00' });
    const a = settle(journal([o]), prices, instruments);
    expect(a.outcomes[o.id]).toMatchObject({ status: 'expired', date: '2026-10-14' });
  });

  test('stop sell triggers at the stop with slippage, sell tax and realised profit', () => {
    const buy = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 10, placedAt: '2026-10-12T20:00:00+09:00' });
    const stop = order({ ticker: KR.id, side: 'sell', type: 'stop', price: 59_000, qty: 10, placedAt: '2026-10-13T20:00:00+09:00' });
    const a = settle(journal([buy, stop]), prices, instruments);
    const f = a.fills.find((x) => x.orderId === stop.id)!;
    expect(f.date).toBe('2026-10-14');
    expect(f.price).toBe(58_900); // 59,000 × 0.999 = 58,941 → down to 58,900
    expect(f.tax).toBeCloseTo(589_000 * 0.002, 6);
    const buyCost = 607_000 * (1 + 0.00015);
    expect(f.realized!).toBeCloseTo(589_000 - 589_000 * 0.00015 - 589_000 * 0.002 - buyCost, 6);
    expect(a.positions).toHaveLength(0);
  });

  test('rejections: no short selling, not enough cash, volume cap', () => {
    const sell = order({ ticker: KR.id, side: 'sell', type: 'market', qty: 1, placedAt: '2026-10-12T20:00:00+09:00' });
    const big = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 1_000, placedAt: '2026-10-12T20:00:00+09:00' });
    const huge = order({ ticker: US.id, side: 'buy', type: 'market', qty: 200_000, placedAt: '2026-10-12T20:00:00+09:00' });
    const a = settle(journal([sell, big, huge]), prices, instruments);
    expect(a.outcomes[sell.id]).toMatchObject({ status: 'rejected', reason: '보유 수량 부족' });
    expect(a.outcomes[big.id]).toMatchObject({ status: 'rejected', reason: '현금 부족' });
    expect(a.outcomes[huge.id].status).toBe('rejected');
    expect(a.outcomes[huge.id].reason).toContain('거래량');
  });

  test('cancel stops an order from the next trading day', () => {
    const o = order({ ticker: KR.id, side: 'buy', type: 'limit', price: 50_000, qty: 1, validDays: 10, placedAt: '2026-10-12T20:00:00+09:00' });
    const a = settle(journal([o], { cancels: [{ orderId: o.id, at: '2026-10-13T21:00:00+09:00' }] }), prices, instruments);
    expect(a.outcomes[o.id]).toMatchObject({ status: 'cancelled', date: '2026-10-13' });
  });

  test('open orders stay open when no data after them exists yet', () => {
    const o = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 1, placedAt: '2026-10-17T08:00:00+09:00' });
    const a = settle(journal([o]), prices, instruments);
    expect(a.outcomes[o.id]).toMatchObject({ status: 'open', effectiveAfter: '2026-10-17' });
  });

  test('settle is deterministic and order-independent in input array', () => {
    const a1 = order({ ticker: KR.id, side: 'buy', type: 'market', qty: 3, placedAt: '2026-10-12T20:00:00+09:00' });
    const a2 = order({ ticker: KR.id, side: 'sell', type: 'limit', price: 61_500, qty: 3, placedAt: '2026-10-13T20:00:00+09:00' });
    const x = settle(journal([a1, a2]), prices, instruments);
    const y = settle(journal([a2, a1]), prices, instruments);
    expect(y).toEqual(x);
    expect(x.fills.map((f) => f.date)).toEqual(['2026-10-13', '2026-10-14']);
  });

  test('equity curve converts USD at the daily rate', () => {
    const fx = bars('FX:USDKRW', kr.d.map((d) => [d, 1400, 1400, 1400, 1400, 0]) as [string, number, number, number, number, number][]);
    const o = order({ ticker: US.id, side: 'buy', type: 'market', qty: 10, placedAt: '2026-10-13T08:00:00+09:00' });
    const j = journal([o]);
    const a = settle(j, prices, instruments);
    const curve = equityCurve(j, a, { ...prices, [fx.id]: fx });
    expect(curve[0].date).toBe('2026-10-13');
    const f = a.fills[0];
    const expected = 10_000_000 + (7_500 - f.gross - f.fee) * 1400 + 10 * 104 * 1400;
    expect(curve[0].krw).toBeCloseTo(expected, 6);
    expect(closeOn(us, '2026-10-17')).toBe(99.5);
  });
});

describe('validateOrder', () => {
  test('tick, limits, stops and holdings', () => {
    expect(validateOrder({ side: 'buy', type: 'limit', qty: 1, price: 60_050 }, 'KOSPI', 60_000, 0)[0]).toContain('호가 단위');
    expect(validateOrder({ side: 'buy', type: 'limit', qty: 1, price: 80_000 }, 'KOSPI', 60_000, 0)[0]).toContain('제한폭');
    expect(validateOrder({ side: 'sell', type: 'stop', qty: 1, price: 61_000 }, 'KOSPI', 60_000, 5)).toContain('손절가는 현재가보다 낮아야 합니다.');
    expect(validateOrder({ side: 'sell', type: 'market', qty: 6 }, 'NASDAQ', 100, 5)[0]).toContain('보유 수량');
    expect(validateOrder({ side: 'buy', type: 'limit', qty: 2, price: 99.99 }, 'NASDAQ', 100, 0)).toEqual([]);
  });
});

describe('forecasts', () => {
  const series = bars('US:NVDA', Array.from({ length: 30 }, (_, i) => {
    const c = 100 + i;
    return [`2026-09-${String(i + 1).padStart(2, '0')}`, c, c, c, c] as [string, number, number, number, number];
  }));
  test('scores after the horizon, open before it', () => {
    const f = { id: 'f1', by: 'me' as const, ticker: 'US:NVDA', madeAfter: '2026-09-05', horizon: 20, pUp: 0.7, low: -0.05, high: 0.1 };
    const s = scoreForecast(f, series);
    expect(s.status).toBe('scored');
    expect(s.dueDate).toBe('2026-09-25');
    expect(s.ret).toBeCloseTo(124 / 104 - 1, 9);
    expect(s.brier).toBeCloseTo(0.09, 9);
    expect(s.inRange).toBe(false);
    const late = scoreForecast({ ...f, madeAfter: '2026-09-20' }, series);
    expect(late).toMatchObject({ status: 'open', remaining: 10 });
  });
  test('scoreboard and head-to-head', () => {
    const mk = (by: 'me' | 'ai', pUp: number) => scoreForecast({ id: by, by, ticker: 'US:NVDA', madeAfter: '2026-09-01', horizon: 20, pUp, low: 0, high: 0.5 }, series);
    const all = [mk('me', 0.8), mk('ai', 0.55)];
    const board = scoreboard(all.filter((s) => s.forecast.by === 'me'));
    expect(board.count).toBe(1);
    expect(board.brier).toBeCloseTo(0.04, 9);
    expect(board.coverage).toBe(1);
    expect(board.calibration[8]).toMatchObject({ n: 1, upShare: 1 });
    expect(headToHead(all)).toHaveLength(1);
  });
});

describe('indicators', () => {
  test('sma and rsi match the Python pipeline definitions', () => {
    expect(sma([1, 2, 3, 4], 2).slice(1)).toEqual([1.5, 2.5, 3.5]);
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(closes)[14]).toBeCloseTo(100 - 100 / (1 + 3.34 / 1.4), 6);
  });
});
