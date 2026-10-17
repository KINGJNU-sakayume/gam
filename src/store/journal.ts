// The journal lives in this browser (localStorage) and leaves it only as a JSON export (docs/02_DATA.md).
import { DEFAULT_SETTINGS, emptyJournal, type Journal } from '../engine/types';

const KEY = 'gam.journal.v1';
const GH_KEY = 'gam.github.v1';

export function readJournal(): Journal {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyJournal();
    return normalize(JSON.parse(raw));
  } catch {
    return emptyJournal();
  }
}

export function writeJournal(j: Journal): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
    return true;
  } catch {
    return false;
  }
}

/** Accepts an imported or stored journal and fills anything missing, so old exports keep working. */
export function normalize(data: unknown): Journal {
  if (!data || typeof data !== 'object') throw new Error('기록 파일 형식이 아닙니다.');
  const d = data as Partial<Journal>;
  if (d.version !== undefined && d.version !== 1) throw new Error(`지원하지 않는 기록 버전: ${String(d.version)}`);
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(d.settings ?? {}),
      startCash: { ...DEFAULT_SETTINGS.startCash, ...(d.settings?.startCash ?? {}) },
      fees: {
        KR: { ...DEFAULT_SETTINGS.fees.KR, ...(d.settings?.fees?.KR ?? {}) },
        US: { ...DEFAULT_SETTINGS.fees.US, ...(d.settings?.fees?.US ?? {}) },
      },
    },
    orders: arr(d.orders),
    cancels: arr(d.cancels),
    forecasts: arr<Journal['forecasts'][number]>(d.forecasts).map((f) => ({ ...f, by: 'me' as const })),
    memos: arr(d.memos),
    replays: arr(d.replays),
  };
}

export function exportText(j: Journal): string {
  return JSON.stringify({ ...j, exportedAt: new Date().toISOString() }, null, 1);
}

export function downloadJournal(j: Journal): void {
  const blob = new Blob([exportText(j)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'journal.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

// ---- Optional: commit journal/journal.json with a fine-grained personal access token (Settings screen) ----

export interface GitHubTarget { owner: string; repo: string; branch: string; token: string }

export function readGitHub(): GitHubTarget | null {
  try {
    const raw = localStorage.getItem(GH_KEY);
    return raw ? (JSON.parse(raw) as GitHubTarget) : null;
  } catch {
    return null;
  }
}

export function writeGitHub(t: GitHubTarget | null): void {
  try {
    if (t) localStorage.setItem(GH_KEY, JSON.stringify(t));
    else localStorage.removeItem(GH_KEY);
  } catch {
    /* storage unavailable: the token is simply not remembered */
  }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function pushJournal(j: Journal, t: GitHubTarget): Promise<string> {
  const path = 'journal/journal.json';
  const api = `https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${path}`;
  const headers = { Authorization: `Bearer ${t.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  let sha: string | undefined;
  const head = await fetch(`${api}?ref=${encodeURIComponent(t.branch)}`, { headers });
  if (head.ok) sha = ((await head.json()) as { sha: string }).sha;
  else if (head.status !== 404) throw new Error(`GitHub ${head.status}: ${await head.text()}`);
  const res = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message: `journal: update ${new Date().toISOString().slice(0, 10)}`, content: toBase64(exportText(j)), branch: t.branch, sha }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { commit?: { html_url?: string } };
  return body.commit?.html_url ?? '';
}
