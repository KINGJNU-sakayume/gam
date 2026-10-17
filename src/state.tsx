import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  loadAiForecasts, loadBars, loadCards, loadIndex, loadNotes, loadStatus,
  type Card, type CardsFile, type DataIndex, type NoteItem, type NotesFile, type StatusFile,
} from './data/load';
import type { Bars, Forecast, Instrument, Journal } from './engine/types';
import { readJournal, writeJournal } from './store/journal';

interface AppData {
  loading: boolean;
  error: string | null;
  index: DataIndex | null;
  cards: CardsFile | null;
  notes: NotesFile | null;
  status: StatusFile | null;
  aiForecasts: Forecast[];
  instruments: Record<string, Instrument>;
  cardById: Record<string, Card>;
  noteById: Record<string, NoteItem>;
  journal: Journal;
  saved: boolean;
  update: (fn: (j: Journal) => Journal) => void;
}

const Ctx = createContext<AppData | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [cards, setCards] = useState<CardsFile | null>(null);
  const [notes, setNotes] = useState<NotesFile | null>(null);
  const [status, setStatus] = useState<StatusFile | null>(null);
  const [aiForecasts, setAi] = useState<Forecast[]>([]);
  const [journal, setJournal] = useState<Journal>(() => readJournal());
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    Promise.all([loadIndex(), loadCards(), loadNotes(), loadStatus(), loadAiForecasts()])
      .then(([i, c, n, s, f]) => { setIndex(i); setCards(c); setNotes(n); setStatus(s); setAi(f); })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((fn: (j: Journal) => Journal) => {
    setJournal((prev) => {
      const next = fn(prev);
      setSaved(writeJournal(next));
      return next;
    });
  }, []);

  const value = useMemo<AppData>(() => ({
    loading, error, index, cards, notes, status, aiForecasts, journal, saved, update,
    instruments: Object.fromEntries((index?.entries ?? []).map((e) => [e.id, e])),
    cardById: Object.fromEntries((cards?.cards ?? []).map((c) => [c.id, c])),
    noteById: Object.fromEntries((notes?.notes ?? []).map((n) => [n.id, n])),
  }), [loading, error, index, cards, notes, status, aiForecasts, journal, saved, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Loads price files for the given ids (cached). Missing files are left out of the result. */
export function useBars(ids: string[]): { bars: Record<string, Bars>; ready: boolean } {
  const { instruments } = useApp();
  const key = [...new Set(ids)].sort().join(',');
  const [state, setState] = useState<{ key: string; bars: Record<string, Bars> }>({ key: '', bars: {} });
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(',') : [];
    Promise.all(list.map((id) => (instruments[id] ? loadBars(instruments[id]) : Promise.resolve(null))))
      .then((res) => {
        if (!alive) return;
        const bars: Record<string, Bars> = {};
        res.forEach((b, i) => { if (b) bars[list[i]] = b; });
        setState({ key, bars });
      });
    return () => { alive = false; };
  }, [key, instruments]);
  return { bars: state.bars, ready: state.key === key };
}

export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const link = {
  home: '#/',
  stock: (id: string) => `#/s/${encodeURIComponent(id)}`,
  account: '#/account',
  forecasts: '#/forecasts',
  replay: '#/replay',
  settings: '#/settings',
};
