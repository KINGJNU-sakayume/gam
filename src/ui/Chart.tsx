import { useEffect, useRef, useState } from 'react';

export interface ChartOverlay { values: number[]; color: string; label: string }
export interface ChartMarker { i: number; side: 'buy' | 'sell'; price: number }

export interface ChartProps {
  o: number[]; h: number[]; l: number[]; c: number[]; v: number[];
  labels: string[];
  overlays?: ChartOverlay[];
  markers?: ChartMarker[];
  rsi?: number[];
  format: (x: number) => string;
  height?: number;
  initialVisible?: number;
  /** Index to draw a vertical guide at (for example D0 in a replay). */
  guide?: number;
}

const PAD_RIGHT = 64;
const PAD_BOTTOM = 22;

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

export function Chart(props: ChartProps) {
  const { o, h, l, c, v, labels, overlays = [], markers = [], rsi, format, height = 420, initialVisible = 120, guide } = props;
  const n = c.length;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [visible, setVisible] = useState(Math.min(initialVisible, n));
  const [end, setEnd] = useState(n - 1); // last visible index
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ x: number; end: number } | null>(null);
  const followEnd = useRef(true);

  // Keep following the newest bar when data grows (replay steps), unless the user has panned away.
  useEffect(() => {
    if (followEnd.current) setEnd(n - 1);
    setVisible((vis) => Math.min(Math.max(vis, 20), Math.max(n, 1)));
  }, [n]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const first = Math.max(0, end - visible + 1);
  const plotW = width - PAD_RIGHT;
  const step = plotW / visible;
  const xOf = (i: number) => (i - first + 0.5) * step;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || n === 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const root = cv;
    const col = {
      bg: cssVar(root, '--chart-bg', '#ffffff'),
      grid: cssVar(root, '--chart-grid', '#edf0f3'),
      text: cssVar(root, '--ink-3', '#7b8491'),
      up: cssVar(root, '--up', '#d3202a'),
      down: cssVar(root, '--down', '#1d5ad6'),
      ink: cssVar(root, '--ink', '#1c2430'),
      guide: cssVar(root, '--down', '#1d5ad6'),
    };
    g.fillStyle = col.bg;
    g.fillRect(0, 0, width, height);

    const rsiH = rsi ? Math.round(height * 0.18) : 0;
    const volH = Math.round(height * 0.14);
    const priceH = height - PAD_BOTTOM - volH - rsiH - (rsi ? 8 : 0);
    const last = Math.min(n - 1, end);

    let lo = Infinity, hi = -Infinity, vmax = 0;
    for (let i = first; i <= last; i++) {
      lo = Math.min(lo, l[i]);
      hi = Math.max(hi, h[i]);
      vmax = Math.max(vmax, v[i] || 0);
      for (const ov of overlays) if (Number.isFinite(ov.values[i])) { lo = Math.min(lo, ov.values[i]); hi = Math.max(hi, ov.values[i]); }
    }
    if (!Number.isFinite(lo)) return;
    const padP = (hi - lo) * 0.06 || hi * 0.01 || 1;
    lo -= padP; hi += padP;
    const yOf = (p: number) => 6 + ((hi - p) / (hi - lo)) * (priceH - 12);

    // grid + price axis
    g.font = '11px "IBM Plex Sans KR", system-ui, sans-serif';
    g.textBaseline = 'middle';
    const ticks = 5;
    for (let k = 0; k <= ticks; k++) {
      const p = lo + ((hi - lo) * k) / ticks;
      const y = yOf(p);
      g.strokeStyle = col.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(plotW, Math.round(y) + 0.5); g.stroke();
      g.fillStyle = col.text; g.textAlign = 'left';
      g.fillText(format(p), plotW + 6, y);
    }

    // date axis
    g.textAlign = 'center'; g.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(70 / step));
    for (let i = first; i <= last; i++) {
      if ((i - first) % every !== 0) continue;
      g.fillStyle = col.text;
      g.fillText(labels[i] ?? '', xOf(i), height - PAD_BOTTOM + 5);
    }

    if (guide !== undefined && guide >= first && guide <= last) {
      g.strokeStyle = col.guide; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(xOf(guide), 0); g.lineTo(xOf(guide), height - PAD_BOTTOM); g.stroke();
      g.setLineDash([]);
    }

    // candles
    const bodyW = Math.max(1, Math.min(14, step * 0.7));
    for (let i = first; i <= last; i++) {
      const x = xOf(i);
      const upBar = c[i] >= o[i];
      g.strokeStyle = g.fillStyle = upBar ? col.up : col.down;
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, yOf(h[i])); g.lineTo(Math.round(x) + 0.5, yOf(l[i])); g.stroke();
      const y1 = yOf(Math.max(o[i], c[i])), y2 = yOf(Math.min(o[i], c[i]));
      g.fillRect(x - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
    }

    // overlays
    for (const ov of overlays) {
      g.strokeStyle = ov.color; g.lineWidth = 1.4; g.beginPath();
      let started = false;
      for (let i = first; i <= last; i++) {
        const val = ov.values[i];
        if (!Number.isFinite(val)) { started = false; continue; }
        if (!started) { g.moveTo(xOf(i), yOf(val)); started = true; } else g.lineTo(xOf(i), yOf(val));
      }
      g.stroke();
    }
    g.lineWidth = 1;

    // trade markers
    for (const m of markers) {
      if (m.i < first || m.i > last) continue;
      const x = xOf(m.i), y = yOf(m.price);
      g.fillStyle = m.side === 'buy' ? col.up : col.down;
      g.strokeStyle = col.bg;
      g.beginPath();
      if (m.side === 'buy') { g.moveTo(x, y + 3); g.lineTo(x - 6, y + 13); g.lineTo(x + 6, y + 13); }
      else { g.moveTo(x, y - 3); g.lineTo(x - 6, y - 13); g.lineTo(x + 6, y - 13); }
      g.closePath(); g.fill(); g.stroke();
    }

    // volume
    const vTop = priceH + 4;
    for (let i = first; i <= last; i++) {
      if (!vmax) break;
      const hh = ((v[i] || 0) / vmax) * (volH - 6);
      g.fillStyle = c[i] >= o[i] ? col.up : col.down;
      g.globalAlpha = 0.35;
      g.fillRect(xOf(i) - bodyW / 2, vTop + volH - hh, bodyW, hh);
      g.globalAlpha = 1;
    }

    // RSI
    if (rsi) {
      const rTop = priceH + volH + 8;
      const ry = (x: number) => rTop + ((100 - x) / 100) * (rsiH - 4);
      g.strokeStyle = col.grid;
      for (const lvl of [30, 70]) { g.beginPath(); g.moveTo(0, ry(lvl) + 0.5); g.lineTo(plotW, ry(lvl) + 0.5); g.stroke(); }
      g.fillStyle = col.text; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('RSI', plotW + 6, rTop + rsiH / 2);
      g.strokeStyle = col.ink; g.beginPath();
      let started = false;
      for (let i = first; i <= last; i++) {
        const val = rsi[i];
        if (!Number.isFinite(val)) { started = false; continue; }
        if (!started) { g.moveTo(xOf(i), ry(val)); started = true; } else g.lineTo(xOf(i), ry(val));
      }
      g.stroke();
    }

    // crosshair
    if (hover !== null && hover >= first && hover <= last) {
      g.strokeStyle = col.text; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(xOf(hover), 0); g.lineTo(xOf(hover), height - PAD_BOTTOM); g.stroke();
      g.setLineDash([]);
    }
  }, [width, height, first, end, visible, n, o, h, l, c, v, labels, overlays, markers, rsi, hover, guide, format, plotW, step]);

  const indexAt = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const i = first + Math.floor((clientX - rect.left) / step);
    return Math.max(first, Math.min(Math.min(n - 1, end), i));
  };

  // Native listener so the page does not scroll while zooming (React wheel handlers are passive).
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setVisible((vis) => Math.round(Math.min(n, Math.max(20, vis * factor))));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [n]);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, end };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const shift = Math.round((drag.current.x - e.clientX) / step);
      const next = Math.min(n - 1, Math.max(visible - 1, drag.current.end + shift));
      followEnd.current = next === n - 1;
      setEnd(next);
    }
    setHover(indexAt(e.clientX));
  };
  const onPointerUp = () => { drag.current = null; };

  const hi = hover ?? Math.min(n - 1, end);
  const prev = hi > 0 ? c[hi - 1] : o[hi];
  const chg = prev ? c[hi] / prev - 1 : 0;

  return (
    <div className="chart" ref={wrap}>
      <div className="chart-legend">
        <span className="chart-date">{labels[hi]}</span>
        <span>시 {format(o[hi])}</span>
        <span>고 {format(h[hi])}</span>
        <span>저 {format(l[hi])}</span>
        <span>종 <b className={chg > 0 ? 'up' : chg < 0 ? 'down' : ''}>{format(c[hi])} ({chg > 0 ? '+' : ''}{(chg * 100).toFixed(2)}%)</b></span>
        {overlays.map((ov) => (
          <span key={ov.label} style={{ color: ov.color }}>{ov.label}</span>
        ))}
        <span className="chart-zoom">
          <button type="button" onClick={() => setVisible((x) => Math.max(20, Math.round(x / 1.5)))} aria-label="확대">＋</button>
          <button type="button" onClick={() => setVisible((x) => Math.min(n, Math.round(x * 1.5)))} aria-label="축소">－</button>
          <button type="button" onClick={() => { followEnd.current = true; setEnd(n - 1); }}>최신</button>
        </span>
      </div>
      <canvas
        ref={canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setHover(null); drag.current = null; }}
        style={{ touchAction: 'pan-y', cursor: drag.current ? 'grabbing' : 'crosshair' }}
        aria-label="가격 차트"
        role="img"
      />
    </div>
  );
}
