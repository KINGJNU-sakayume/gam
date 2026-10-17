import type { ReactNode } from 'react';
import type { PatternStats } from '../data/load';
import { pct, tone } from './format';

/** Korean quote style: ▲ 2.62% in red, ▼ 1.80% in blue. */
export function Chg({ x, digits = 2 }: { x: number | null | undefined; digits?: number }) {
  if (x === null || x === undefined || !Number.isFinite(x)) return <span className="num flat">–</span>;
  const t = tone(x);
  const mark = t === 'up' ? '▲' : t === 'down' ? '▼' : '';
  return <span className={`num chg ${t}`}>{mark && <i aria-hidden="true">{mark}</i>}{pct(Math.abs(x), digits, false)}</span>;
}

export function Panel({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pane ${className}`}>
      {(title || aside) && (
        <header className="pane-bar">
          {title && <h2>{title}</h2>}
          {aside && <div className="pane-aside">{aside}</div>}
        </header>
      )}
      <div className="pane-body">{children}</div>
    </section>
  );
}

/** Compact key–value pairs, like the quote header of a trading terminal. */
export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/** A p10–p90 band with the median, on a shared scale. */
export function RangeBar({ stats, scale, label }: { stats: PatternStats; scale: number; label: string }) {
  const x = (r: number) => Math.max(0, Math.min(100, 50 + (r / scale) * 50));
  return (
    <div className="rangebar">
      <div className="rangebar-label">{label}</div>
      <div className="rangebar-track" role="img" aria-label={`${label}: 10% ${pct(stats.p10)}, 중앙값 ${pct(stats.median)}, 90% ${pct(stats.p90)}`}>
        <div className="rangebar-zero" />
        <div className="rangebar-band" style={{ left: `${x(stats.p10)}%`, width: `${x(stats.p90) - x(stats.p10)}%` }} />
        <div className={`rangebar-mid ${tone(stats.median)}`} style={{ left: `${x(stats.median)}%` }} />
      </div>
      <div className="rangebar-nums num">
        <span>하위 10% {pct(stats.p10)}</span>
        <span>중앙 {pct(stats.median)}</span>
        <span>상위 10% {pct(stats.p90)}</span>
        <span>상승 {Math.round(stats.upShare * 100)}%</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
