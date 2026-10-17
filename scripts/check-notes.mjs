// Validates everything Claude writes under public/data/notes/ (docs/05_AI_RULES.md). Exit 1 on any problem.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const notes = join(root, process.env.GAM_DATA ?? 'public/data', 'notes');
const watch = JSON.parse(readFileSync(join(root, 'config/watchlist.json'), 'utf8'));
const ids = new Set([...watch.stocks, ...watch.indices].map((e) => e.id));
const names = [...watch.stocks].flatMap((e) => [e.name, e.id.split(':')[1]]);
const problems = [];
const bad = (file, msg) => problems.push(`${file}: ${msg}`);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/.test(s);

function checkSources(file, sources, where) {
  if (sources === undefined) return;
  if (!Array.isArray(sources)) return bad(file, `${where}: sources must be a list`);
  for (const s of sources) if (!s || typeof s.title !== 'string' || !isUrl(s.url)) bad(file, `${where}: source needs title and http(s) url`);
}

function checkForecast(file, f, where) {
  if (!ids.has(f.ticker)) bad(file, `${where}: unknown ticker ${f.ticker}`);
  if (!isDate(f.madeAfter)) bad(file, `${where}: madeAfter must be YYYY-MM-DD`);
  if (!Number.isInteger(f.horizon) || f.horizon < 1) bad(file, `${where}: horizon must be a positive integer`);
  if (!(f.pUp >= 0.05 && f.pUp <= 0.95)) bad(file, `${where}: pUp must be within 0.05–0.95`);
  if (!(typeof f.low === 'number' && typeof f.high === 'number' && f.low < f.high)) bad(file, `${where}: need low < high`);
  if (typeof f.id !== 'string' || !f.id) bad(file, `${where}: id required`);
}

function checkDaily(file, n) {
  if (!isDate(n.date)) bad(file, 'date must be YYYY-MM-DD');
  if (typeof n.market !== 'string' || n.market.length < 10) bad(file, 'market note missing');
  if (!Array.isArray(n.notes)) return bad(file, 'notes must be a list');
  for (const [i, x] of n.notes.entries()) {
    if (!ids.has(x.id)) bad(file, `notes[${i}]: unknown id ${x.id}`);
    if (typeof x.text !== 'string' || !x.text.trim()) bad(file, `notes[${i}]: empty text`);
    if (x.text && x.text.length > 700) bad(file, `notes[${i}]: too long (${x.text.length} chars, keep to 3–5 sentences)`);
    if (/(사세요|파세요|매수하세요|매도하세요|추천합니다|무조건)/.test(x.text ?? '')) bad(file, `notes[${i}]: reads as a recommendation`);
    checkSources(file, x.sources, `notes[${i}]`);
  }
  for (const [i, f] of (n.forecasts ?? []).entries()) checkForecast(file, f, `forecasts[${i}]`);
}

// Words that leak the future or the identity of a blind replay.
const SPOILERS = [/이후/, /곧/, /결국/, /나중에/, /앞으로 (오를|내릴|급등|급락)/, /(급등|폭등|폭락|급락)할/, /20\d\d년/, /\b(19|20)\d\d\b/];

function checkReplay(file, rp) {
  for (const k of ['id', 'title', 'ticker', 'startDate']) if (!rp[k]) bad(file, `${k} required`);
  if (!ids.has(rp.ticker)) bad(file, `unknown ticker ${rp.ticker}`);
  if (!isDate(rp.startDate)) bad(file, 'startDate must be YYYY-MM-DD');
  const steps = rp.steps ?? 60;
  for (const [k, text] of Object.entries(rp.commentary ?? {})) {
    const step = Number(k);
    if (!Number.isInteger(step) || step < 0 || step > steps) bad(file, `commentary key ${k} outside 0–${steps}`);
    for (const re of SPOILERS) if (re.test(text)) bad(file, `commentary D+${k}: possible spoiler (${re})`);
    for (const nm of names) if (text.includes(nm)) bad(file, `commentary D+${k}: names the stock (${nm})`);
  }
  for (const nm of names) if (rp.title.includes(nm)) bad(file, `title names the stock (${nm})`);
  if (!rp.reveal || typeof rp.reveal.text !== 'string') bad(file, 'reveal.text required');
  else checkSources(file, rp.reveal.sources, 'reveal');
}

if (existsSync(join(notes, 'latest.json'))) checkDaily('notes/latest.json', read(join(notes, 'latest.json')));
if (existsSync(join(notes, 'daily'))) for (const f of readdirSync(join(notes, 'daily'))) checkDaily(`notes/daily/${f}`, read(join(notes, 'daily', f)));
if (existsSync(join(notes, 'forecasts.json'))) {
  const list = read(join(notes, 'forecasts.json'));
  const seen = new Set();
  for (const [i, f] of list.entries()) {
    checkForecast('notes/forecasts.json', f, `[${i}]`);
    if (seen.has(f.id)) bad('notes/forecasts.json', `duplicate id ${f.id}`);
    seen.add(f.id);
  }
}
if (existsSync(join(notes, 'replays'))) {
  const index = existsSync(join(notes, 'replays/index.json')) ? read(join(notes, 'replays/index.json')) : [];
  for (const item of index) {
    const p = join(notes, 'replays', `${item.id}.json`);
    if (!existsSync(p)) bad('notes/replays/index.json', `missing ${item.id}.json`);
    else checkReplay(`notes/replays/${item.id}.json`, read(p));
    for (const nm of names) if (item.title.includes(nm)) bad('notes/replays/index.json', `title names the stock (${nm})`);
  }
}
if (existsSync(join(notes, 'reviews'))) {
  for (const f of readdirSync(join(notes, 'reviews'))) {
    const rv = read(join(notes, 'reviews', f));
    if (!isDate(rv.date) || typeof rv.summary !== 'string') bad(`notes/reviews/${f}`, 'date and summary required');
  }
}
if (existsSync(join(root, 'journal/journal.json'))) {
  try { read(join(root, 'journal/journal.json')); } catch (e) { bad('journal/journal.json', `not JSON: ${e.message}`); }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('notes OK');
