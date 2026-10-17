// Paper-trading settlement (docs/03_PAPER_TRADING.md). Pure: the same journal and prices always give the same result.
import { currencyOf, dateIn, isKorean, roundToTick, timeZoneOf } from './market';
import type { Bars, Currency, Instrument, Journal, Market, Order } from './types';

export interface Fill {
  orderId: string;
  ticker: string;
  side: 'buy' | 'sell';
  date: string;
  price: number;
  qty: number;
  gross: number;
  fee: number;
  tax: number;
  currency: Currency;
  /** Realised profit of a sell, net of all costs (cost basis includes buy fees). */
  realized?: number;
}

export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired' | 'rejected' | 'unknown-ticker';

export interface OrderOutcome {
  orderId: string;
  status: OrderStatus;
  date?: string;
  reason?: string;
  /** First trading day after which the order can fill. */
  effectiveAfter: string;
}

export interface Position {
  ticker: string;
  qty: number;
  /** Total cost basis including buy fees. */
  cost: number;
  currency: Currency;
}

export interface Account {
  cash: Record<Currency, number>;
  positions: Position[];
  realized: Record<Currency, number>;
  fees: Record<Currency, number>;
  fills: Fill[];
  outcomes: Record<string, OrderOutcome>;
}

interface Prepared {
  order: Order;
  market: Market;
  bars: Bars;
  index: Map<string, number>;
  effectiveAfter: string;
  cancelDate?: string;
  seen: number;
  status: OrderStatus;
}

function byPlacement(a: Order, b: Order): number {
  const ta = Date.parse(a.placedAt);
  const tb = Date.parse(b.placedAt);
  return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function settle(journal: Journal, bars: Record<string, Bars>, instruments: Record<string, Instrument>): Account {
  const s = journal.settings;
  const cash: Record<Currency, number> = { KRW: s.startCash.KRW, USD: s.startCash.USD };
  const realized: Record<Currency, number> = { KRW: 0, USD: 0 };
  const fees: Record<Currency, number> = { KRW: 0, USD: 0 };
  const positions = new Map<string, Position>();
  const fills: Fill[] = [];
  const outcomes: Record<string, OrderOutcome> = {};

  const cancelAt = new Map<string, string>();
  for (const c of journal.cancels) {
    const prev = cancelAt.get(c.orderId);
    if (!prev || Date.parse(c.at) < Date.parse(prev)) cancelAt.set(c.orderId, c.at);
  }

  const prepared: Prepared[] = [];
  for (const order of [...journal.orders].sort(byPlacement)) {
    const inst = instruments[order.ticker];
    const b = bars[order.ticker];
    if (!inst || !inst.market || !b) {
      outcomes[order.id] = { orderId: order.id, status: 'unknown-ticker', effectiveAfter: '', reason: '시세 없음' };
      continue;
    }
    const tz = timeZoneOf(inst.market);
    const p: Prepared = {
      order,
      market: inst.market,
      bars: b,
      index: new Map(b.d.map((d, i) => [d, i])),
      effectiveAfter: dateIn(tz, order.placedAt),
      cancelDate: cancelAt.has(order.id) ? dateIn(tz, cancelAt.get(order.id)!) : undefined,
      seen: 0,
      status: 'open',
    };
    prepared.push(p);
  }

  const dates = new Set<string>();
  for (const p of prepared) for (const d of p.bars.d) if (d > p.effectiveAfter) dates.add(d);
  const timeline = [...dates].sort();

  const finish = (p: Prepared, status: OrderStatus, date?: string, reason?: string) => {
    p.status = status;
    outcomes[p.order.id] = { orderId: p.order.id, status, date, reason, effectiveAfter: p.effectiveAfter };
  };

  for (const date of timeline) {
    for (const p of prepared) {
      if (p.status !== 'open' || date <= p.effectiveAfter) continue;
      const i = p.index.get(date);
      if (i === undefined) continue;
      if (p.cancelDate && date > p.cancelDate) {
        finish(p, 'cancelled', p.cancelDate);
        continue;
      }
      p.seen += 1;
      const { order, market } = p;
      const o = p.bars.o[i], h = p.bars.h[i], l = p.bars.l[i], v = p.bars.v[i];
      let price: number | null = null;
      if (order.type === 'market') {
        price = order.side === 'buy'
          ? roundToTick(market, o * (1 + s.slippage), 'up')
          : roundToTick(market, o * (1 - s.slippage), 'down');
      } else if (order.type === 'limit' && order.price !== undefined) {
        const L = order.price;
        if (order.side === 'buy') price = o <= L ? o : l <= L ? L : null;
        else price = o >= L ? o : h >= L ? L : null;
      } else if (order.type === 'stop' && order.price !== undefined && order.side === 'sell') {
        const S = order.price;
        const trigger = o <= S ? o : l <= S ? S : null;
        price = trigger === null ? null : roundToTick(market, trigger * (1 - s.slippage), 'down');
      } else {
        finish(p, 'rejected', date, '지원하지 않는 주문');
        continue;
      }

      if (price === null) {
        if (p.seen >= (order.validDays ?? s.validDays)) finish(p, 'expired', date);
        continue;
      }
      if (v > 0 && order.qty > s.maxVolumeShare * v) {
        finish(p, 'rejected', date, `하루 거래량의 ${Math.round(s.maxVolumeShare * 100)}% 초과`);
        continue;
      }

      const currency = currencyOf(market);
      const rule = isKorean(market) ? s.fees.KR : s.fees.US;
      const gross = price * order.qty;
      const fee = gross * rule.commission;
      const pos = positions.get(order.ticker) ?? { ticker: order.ticker, qty: 0, cost: 0, currency };

      if (order.side === 'buy') {
        if (gross + fee > cash[currency] + 1e-9) {
          finish(p, 'rejected', date, '현금 부족');
          continue;
        }
        cash[currency] -= gross + fee;
        pos.qty += order.qty;
        pos.cost += gross + fee;
        positions.set(order.ticker, pos);
        fees[currency] += fee;
        fills.push({ orderId: order.id, ticker: order.ticker, side: 'buy', date, price, qty: order.qty, gross, fee, tax: 0, currency });
      } else {
        if (order.qty > pos.qty) {
          finish(p, 'rejected', date, '보유 수량 부족');
          continue;
        }
        const tax = gross * rule.tax;
        const basis = pos.qty > 0 ? (pos.cost * order.qty) / pos.qty : 0;
        const net = gross - fee - tax;
        cash[currency] += net;
        pos.cost -= basis;
        pos.qty -= order.qty;
        if (pos.qty === 0) pos.cost = 0;
        positions.set(order.ticker, pos);
        realized[currency] += net - basis;
        fees[currency] += fee + tax;
        fills.push({ orderId: order.id, ticker: order.ticker, side: 'sell', date, price, qty: order.qty, gross, fee, tax, currency, realized: net - basis });
      }
      finish(p, 'filled', date);
    }
  }

  for (const p of prepared) {
    if (p.status !== 'open') continue;
    if (p.cancelDate) finish(p, 'cancelled', p.cancelDate);
    else outcomes[p.order.id] = { orderId: p.order.id, status: 'open', effectiveAfter: p.effectiveAfter };
  }

  return {
    cash,
    positions: [...positions.values()].filter((x) => x.qty > 0),
    realized,
    fees,
    fills,
    outcomes,
  };
}

/** Last close on or before `date` (raw prices). */
export function closeOn(b: Bars, date: string): number | null {
  let lo = 0, hi = b.d.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (b.d[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : b.c[ans];
}

export interface EquityPoint { date: string; krw: number }

/** Daily account value in KRW, from the first fill to the latest data. USD is converted at that day's rate. */
export function equityCurve(journal: Journal, account: Account, bars: Record<string, Bars>, fxId = 'FX:USDKRW'): EquityPoint[] {
  if (account.fills.length === 0) return [];
  const fx = bars[fxId];
  const tickers = [...new Set(account.fills.map((f) => f.ticker))];
  const first = account.fills[0].date;
  const dates = new Set<string>();
  for (const t of tickers) for (const d of bars[t]?.d ?? []) if (d >= first) dates.add(d);
  const timeline = [...dates].sort();
  const cash: Record<Currency, number> = { ...journal.settings.startCash };
  const qty = new Map<string, number>();
  const fills = [...account.fills].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let k = 0;
  const out: EquityPoint[] = [];
  for (const date of timeline) {
    while (k < fills.length && fills[k].date <= date) {
      const f = fills[k++];
      const sign = f.side === 'buy' ? 1 : -1;
      qty.set(f.ticker, (qty.get(f.ticker) ?? 0) + sign * f.qty);
      cash[f.currency] += f.side === 'buy' ? -(f.gross + f.fee) : f.gross - f.fee - f.tax;
    }
    const rate = fx ? closeOn(fx, date) ?? 0 : 0;
    let krw = cash.KRW + cash.USD * rate;
    for (const [t, q] of qty) {
      if (q === 0) continue;
      const c = closeOn(bars[t], date) ?? 0;
      const isUsd = account.fills.find((f) => f.ticker === t)?.currency === 'USD';
      krw += q * c * (isUsd ? rate : 1);
    }
    out.push({ date, krw });
  }
  return out;
}
