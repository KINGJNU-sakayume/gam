import type { Bars, Forecast, Instrument } from '../engine/types';

/** `?sample` reads the synthetic data made by `npm run sample` (never deployed). */
export const SAMPLE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('sample');
const BASE = SAMPLE ? 'sample-data/' : 'data/';

async function getJson<T>(path: string, optional = false): Promise<T | null> {
  try {
    const res = await fetch(BASE + path, { cache: 'no-cache' });
    if (!res.ok) {
      if (optional) return null;
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

export interface DataIndex {
  generatedAt: string;
  sample: boolean;
  asOf: Partial<Record<'KR' | 'US', string>>;
  entries: Instrument[];
}

export interface PatternStats { window?: number; horizon: number; matches?: number; samples?: number; upShare: number; median: number; p10: number; p90: number }

export interface Card {
  id: string;
  kind: 'stock' | 'index';
  date: string;
  close: number;
  chg1d: number | null;
  chg5d: number | null;
  chg20d: number | null;
  sma: Record<'20' | '60' | '120', number | null>;
  rsi14: number | null;
  atrPct: number | null;
  volRatio20: number | null;
  from52wHigh: number | null;
  from52wLow: number | null;
  pattern: PatternStats | null;
  baseRate: PatternStats | null;
  flags: string[];
  history: number;
}

export interface CardsFile { asOf: Record<string, string>; generatedAt: string; sample?: boolean; cards: Card[] }

export interface Source { title: string; url: string }
export interface NoteItem { id: string; changed: boolean; text: string; sources?: Source[] }
export interface NotesFile { date: string; written: string; model?: string; sample?: boolean; market: string; notes: NoteItem[]; forecasts?: Forecast[] }

export interface ReplayIndexItem { id: string; title: string; level?: string }
export interface CuratedReplay {
  id: string;
  title: string;
  ticker: string;
  startDate: string;
  lookback: number;
  steps: number;
  /** Commentary keyed by step ("0", "5", …), written only from data up to that step. */
  commentary: Record<string, string>;
  reveal: { text: string; sources?: Source[] };
}

export interface StatusFile { generatedAt: string; sample?: boolean; results: { id: string; ok: boolean; error?: string; asOf: string | null }[] }

export interface ReviewFile { date: string; period?: string; summary: string; sections: { title: string; text: string }[] }
export const loadReview = () => getJson<ReviewFile>('notes/reviews/latest.json', true);

export const loadIndex = () => getJson<DataIndex>('index.json', true);
export const loadCards = () => getJson<CardsFile>('cards/latest.json', true);
export const loadNotes = () => getJson<NotesFile>('notes/latest.json', true);
export const loadStatus = () => getJson<StatusFile>('status.json', true);
export const loadReplayIndex = async () => (await getJson<ReplayIndexItem[]>('notes/replays/index.json', true)) ?? [];
export const loadReplay = (id: string) => getJson<CuratedReplay>(`notes/replays/${id}.json`, true);

export async function loadAiForecasts(): Promise<Forecast[]> {
  const list = await getJson<Forecast[]>('notes/forecasts.json', true);
  return (list ?? []).map((f) => ({ ...f, by: 'ai' as const }));
}

const barsCache = new Map<string, Promise<Bars | null>>();
export function loadBars(entry: Pick<Instrument, 'id' | 'file'>): Promise<Bars | null> {
  let p = barsCache.get(entry.id);
  if (!p) {
    p = getJson<Bars>(entry.file, true);
    barsCache.set(entry.id, p);
  }
  return p;
}
