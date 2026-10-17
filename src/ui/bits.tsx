import type { ReactNode } from 'react';
import type { PatternStats } from '../data/load';
import { pct, tone } from './format';

export function Chg({ x, digits = 1 }: { x: number | null | undefined; digits?: number }) {
  return <span className={`num ${tone(x)}`}>{pct(x, digits)}</span>;
}

export function Panel({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || aside) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="panel-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Spark({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((x - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`);
  const cls = v[v.length - 1] >= v[0] ? 'spark up' : 'spark down';
  return (
    <svg className={cls} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" strokeWidth="1.5" />
    </svg>
  );
}

/** A p10–p90 band with the median, on a shared scale. */
export function RangeBar({ stats, scale, label }: { stats: PatternStats; scale: number; label: string }) {
  const x = (r: number) => 50 + (r / scale) * 50;
  const clamp = (r: number) => Math.max(0, Math.min(100, x(r)));
  return (
    <div className="rangebar">
      <div className="rangebar-label">{label}</div>
      <div className="rangebar-track" role="img" aria-label={`${label}: 10% ${pct(stats.p10)}, 중앙값 ${pct(stats.median)}, 90% ${pct(stats.p90)}`}>
        <div className="rangebar-zero" />
        <div className="rangebar-band" style={{ left: `${clamp(stats.p10)}%`, width: `${clamp(stats.p90) - clamp(stats.p10)}%` }} />
        <div className={`rangebar-mid ${tone(stats.median)}`} style={{ left: `${clamp(stats.median)}%` }} />
      </div>
      <div className="rangebar-nums">
        <span>{pct(stats.p10)}</span>
        <span>중앙 <Chg x={stats.median} /></span>
        <span>{pct(stats.p90)}</span>
        <span className="muted">상승 {Math.round(stats.upShare * 100)}%</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
