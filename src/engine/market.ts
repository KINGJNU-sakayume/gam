import type { Currency, Market } from './types';

export function isKorean(market: Market | null | undefined): boolean {
  return market === 'KOSPI' || market === 'KOSDAQ';
}

export function currencyOf(market: Market): Currency {
  return isKorean(market) ? 'KRW' : 'USD';
}

export function timeZoneOf(market: Market): string {
  return isKorean(market) ? 'Asia/Seoul' : 'America/New_York';
}

/** Korean tick size (unified KOSPI/KOSDAQ table); US stocks trade in cents. */
export function tickSize(market: Market, price: number): number {
  if (!isKorean(market)) return 0.01;
  if (price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}

function snap(value: number, tick: number, mode: 'up' | 'down' | 'nearest'): number {
  const n = value / tick;
  const eps = 1e-9;
  const k = mode === 'up' ? Math.ceil(n - eps) : mode === 'down' ? Math.floor(n + eps) : Math.round(n);
  return Number((k * tick).toFixed(tick < 1 ? 2 : 0));
}

/** Round a price to the market's tick. The tick depends on the price band, so the result is checked once more. */
export function roundToTick(market: Market, price: number, mode: 'up' | 'down' | 'nearest'): number {
  let p = snap(price, tickSize(market, price), mode);
  const t2 = tickSize(market, p);
  if (t2 !== tickSize(market, price)) p = snap(p, t2, mode);
  return p;
}

export function isOnTick(market: Market, price: number): boolean {
  return Math.abs(roundToTick(market, price, 'nearest') - price) < 1e-9;
}

/** Korean daily price limit: ±30% of the previous close. */
export function priceLimits(market: Market, prevClose: number): { low: number; high: number } | null {
  if (!isKorean(market)) return null;
  return {
    low: roundToTick(market, prevClose * 0.7, 'up'),
    high: roundToTick(market, prevClose * 1.3, 'down'),
  };
}

/** Calendar date (YYYY-MM-DD) of an ISO timestamp in the given time zone. */
export function dateIn(timeZone: string, iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
