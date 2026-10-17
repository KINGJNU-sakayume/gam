// Shared helpers for the command-line scripts Claude runs (tsx). Reads the same files the site reads.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Bars, Forecast, Instrument, Journal } from '../src/engine/types';
import { normalize } from '../src/store/journal';

export const ROOT = resolve(import.meta.dirname, '..');
export const DATA = join(ROOT, process.env.GAM_DATA ?? 'public/data');

export function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

export function instruments(): Record<string, Instrument> {
  const index = readJson<{ entries: Instrument[] }>(join(DATA, 'index.json'));
  if (!index) throw new Error(`no ${DATA}/index.json — run the data workflow first`);
  return Object.fromEntries(index.entries.map((e) => [e.id, e]));
}

export function bars(id: string): Bars | null {
  return readJson<Bars>(join(DATA, 'prices', id.replace(':', '-') + '.json'));
}

export function allBars(ids: Iterable<string>): Record<string, Bars> {
  const out: Record<string, Bars> = {};
  for (const id of ids) {
    const b = bars(id);
    if (b) out[id] = b;
  }
  return out;
}

export function journal(): Journal | null {
  const raw = readJson<unknown>(join(ROOT, 'journal/journal.json'));
  return raw ? normalize(raw) : null;
}

export function aiForecasts(): Forecast[] {
  return (readJson<Forecast[]>(join(DATA, 'notes/forecasts.json')) ?? []).map((f) => ({ ...f, by: 'ai' as const }));
}

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export const r = (x: number | null | undefined, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
