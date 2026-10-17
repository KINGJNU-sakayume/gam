import type { Currency } from '../engine/types';

export function money(x: number | null | undefined, currency: Currency): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return currency === 'KRW'
    ? `${Math.round(x).toLocaleString('ko-KR')}원`
    : `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function price(x: number | null | undefined, currency: Currency): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return currency === 'KRW'
    ? Math.round(x).toLocaleString('ko-KR')
    : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(x: number | null | undefined, digits = 1, sign = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  const s = (x * 100).toFixed(digits);
  return `${sign && x > 0 ? '+' : ''}${s}%`;
}

/** Korean convention: rises are red, falls are blue. */
export function tone(x: number | null | undefined): 'up' | 'down' | 'flat' {
  if (x === null || x === undefined || !Number.isFinite(x) || Math.abs(x) < 1e-12) return 'flat';
  return x > 0 ? 'up' : 'down';
}

export function shortDate(d: string | null | undefined): string {
  if (!d) return '–';
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}

export const FLAG_LABEL: Record<string, string> = {
  'volume-spike': '거래량 급증',
  'big-move': '큰 변동',
  'new-52w-high': '52주 신고가',
  'new-52w-low': '52주 신저가',
  'cross-sma60-up': '60일선 돌파',
  'cross-sma60-down': '60일선 이탈',
  'rsi-overbought': 'RSI 과열',
  'rsi-oversold': 'RSI 침체',
};
