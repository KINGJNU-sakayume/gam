// Shared types. Formats are defined in docs/02_DATA.md, docs/03_PAPER_TRADING.md and docs/04_FORECASTS.md.

export type Market = 'KOSPI' | 'KOSDAQ' | 'NASDAQ' | 'NYSE';
export type Currency = 'KRW' | 'USD';

export interface Bars {
  id: string;
  asOf?: string;
  d: string[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  f: number[];
  meta?: { sample?: boolean };
}

export interface Instrument {
  id: string;
  name: string;
  currency: Currency;
  kind: 'stock' | 'index';
  market?: Market | null;
  file: string;
  available: boolean;
  asOf: string | null;
}

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';

export interface Order {
  id: string;
  ticker: string;
  side: Side;
  type: OrderType;
  qty: number;
  /** Limit or stop price; absent for market orders. */
  price?: number;
  /** ISO timestamp with offset, when the order was placed. */
  placedAt: string;
  /** Trading days a limit or stop order stays open. */
  validDays?: number;
  reason?: string;
  /** 1 (unsure) – 5 (very sure). */
  confidence?: number;
}

export interface Cancel {
  orderId: string;
  at: string;
}

export interface Forecast {
  id: string;
  by: 'me' | 'ai';
  ticker: string;
  madeAfter: string;
  horizon: number;
  pUp: number;
  low: number;
  high: number;
  why?: string;
}

export interface Memo {
  id: string;
  at: string;
  ticker?: string;
  text: string;
}

export interface ReplayAction {
  step: number;
  side: Side;
  /** Buy: fraction of cash to spend. Sell: fraction of shares to sell. */
  fraction: number;
}

export interface ReplayResult {
  seed: number;
  curated?: string;
  sourceId: string;
  startDate: string;
  endDate: string;
  actions: ReplayAction[];
  finalReturn: number;
  buyHold: number;
  at: string;
  note?: string;
}

export interface FeeRule {
  /** Commission rate applied to buys and sells. */
  commission: number;
  /** Tax rate applied to sells only. */
  tax: number;
}

export interface Settings {
  startCash: Record<Currency, number>;
  slippage: number;
  validDays: number;
  /** Maximum share of a day's volume one order may take. */
  maxVolumeShare: number;
  fees: { KR: FeeRule; US: FeeRule };
}

export interface Journal {
  version: 1;
  settings: Settings;
  orders: Order[];
  cancels: Cancel[];
  forecasts: Forecast[];
  memos: Memo[];
  replays: ReplayResult[];
}

export const DEFAULT_SETTINGS: Settings = {
  startCash: { KRW: 10_000_000, USD: 7_500 },
  slippage: 0.001,
  validDays: 5,
  maxVolumeShare: 0.1,
  fees: {
    KR: { commission: 0.00015, tax: 0.002 },
    US: { commission: 0.0025, tax: 0 },
  },
};

export function emptyJournal(): Journal {
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), orders: [], cancels: [], forecasts: [], memos: [], replays: [] };
}
