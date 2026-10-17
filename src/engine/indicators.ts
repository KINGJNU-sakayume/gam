// Chart overlays. Same definitions as pipeline/gam/indicators.py (NaN where there is not enough data).

export function sma(x: number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= n) sum -= x[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function rsi(close: number[], n = 14): number[] {
  const out = new Array<number>(close.length).fill(NaN);
  if (close.length <= n) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= n; i++) {
    const d = close[i] - close[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= n; al /= n;
  const value = () => (al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al));
  out[n] = value();
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = value();
  }
  return out;
}

/** Adjusted OHLC (price × adjustment factor) for charts and indicators. */
export function adjusted(b: { o: number[]; h: number[]; l: number[]; c: number[]; f: number[] }) {
  return {
    o: b.o.map((x, i) => x * b.f[i]),
    h: b.h.map((x, i) => x * b.f[i]),
    l: b.l.map((x, i) => x * b.f[i]),
    c: b.c.map((x, i) => x * b.f[i]),
  };
}
