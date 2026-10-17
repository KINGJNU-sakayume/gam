import { useEffect, useMemo, useState } from 'react';
import { loadReview, type ReviewFile } from '../data/load';
import { closeOn, equityCurve, settle } from '../engine/settle';
import type { Currency } from '../engine/types';
import { link, useApp, useBars } from '../state';
import { Chg, Empty, Panel } from '../ui/bits';
import { money, price, shortDate } from '../ui/format';
import { StatusText } from './Stock';

function EquityLine({ points }: { points: { date: string; krw: number }[] }) {
  if (points.length < 2) return <Empty>체결이 생기면 날마다의 평가액이 그려집니다.</Empty>;
  const w = 640, h = 160;
  const vals = points.map((p) => p.krw);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * (w - 8) + 4).toFixed(1)},${(h - 6 - ((p.krw - lo) / (hi - lo || 1)) * (h - 12)).toFixed(1)}`);
  return (
    <figure className="equity">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="평가액 추이">
        <polyline points={xy.join(' ')} fill="none" strokeWidth="1.6" />
      </svg>
      <figcaption className="muted small">
        {shortDate(points[0].date)} {money(points[0].krw, 'KRW')}에서 {shortDate(points[points.length - 1].date)} {money(points[points.length - 1].krw, 'KRW')}까지
      </figcaption>
    </figure>
  );
}

function ReviewPanel() {
  const [review, setReview] = useState<ReviewFile | null | undefined>(undefined);
  useEffect(() => { loadReview().then(setReview); }, []);
  if (review === undefined) return null;
  return (
    <Panel title="Claude의 기록 리뷰" aside={review ? <span className="muted small">{review.period ?? review.date}</span> : null}>
      {!review ? <Empty>아직 리뷰가 없습니다. 설정에서 기록을 GitHub에 올리면 주말 리뷰가 여기에 나옵니다.</Empty> : (
        <>
          <p className="prose">{review.summary}</p>
          {review.sections.map((s) => (
            <div key={s.title} className="commentary"><h3>{s.title}</h3><p className="prose">{s.text}</p></div>
          ))}
        </>
      )}
    </Panel>
  );
}

export function AccountPage() {
  const { journal, instruments, update } = useApp();
  const tickers = [...new Set(journal.orders.map((o) => o.ticker))];
  const { bars, ready } = useBars([...tickers, 'FX:USDKRW']);
  const account = useMemo(() => settle(journal, bars, instruments), [journal, bars, instruments]);
  const curve = useMemo(() => equityCurve(journal, account, bars), [journal, account, bars]);
  const fx = bars['FX:USDKRW'];
  const rate = fx ? fx.c[fx.c.length - 1] : null;

  const rows = account.positions.map((p) => {
    const b = bars[p.ticker];
    const last = b ? closeOn(b, '9999-12-31') ?? 0 : 0;
    const value = last * p.qty;
    return { ...p, last, value, pnl: value - p.cost, ret: p.cost ? value / p.cost - 1 : 0 };
  });
  const posValue = (cur: Currency) => rows.filter((r) => r.currency === cur).reduce((a, r) => a + r.value, 0);
  const totalKrw = rate !== null
    ? account.cash.KRW + posValue('KRW') + (account.cash.USD + posValue('USD')) * rate
    : null;
  const startKrw = rate !== null ? journal.settings.startCash.KRW + journal.settings.startCash.USD * rate : null;

  const cancel = (orderId: string) => update((j) => ({ ...j, cancels: [...j.cancels, { orderId, at: new Date().toISOString() }] }));

  if (!ready) return <p className="pad muted">불러오는 중…</p>;

  return (
    <div className="page">
      <div className="summary">
        <div><span className="muted">총평가(원화 환산)</span><b className="num total">{money(totalKrw, 'KRW')}</b>
          {totalKrw !== null && startKrw ? <Chg x={totalKrw / startKrw - 1} digits={2} /> : null}</div>
        <div><span className="muted">원화 현금</span><b className="num">{money(account.cash.KRW, 'KRW')}</b></div>
        <div><span className="muted">달러 현금</span><b className="num">{money(account.cash.USD, 'USD')}</b></div>
        <div><span className="muted">실현 손익</span><b className="num">{money(account.realized.KRW, 'KRW')}</b><b className="num">{money(account.realized.USD, 'USD')}</b></div>
        <div><span className="muted">수수료·세금</span><b className="num">{money(account.fees.KRW, 'KRW')}</b><b className="num">{money(account.fees.USD, 'USD')}</b></div>
      </div>
      {rate !== null && <p className="fine">원/달러 {rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} (최근 종가) 기준. 시작 금액 대비 수익률은 같은 환율로 계산합니다.</p>}

      <Panel title="평가액 추이"><EquityLine points={curve} /></Panel>

      <ReviewPanel />

      <Panel title="보유 종목">
        {rows.length === 0 ? <Empty>보유 종목이 없습니다.</Empty> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>종목</th><th className="r">수량</th><th className="r">평균 단가</th><th className="r">현재가</th><th className="r">평가액</th><th className="r">평가 손익</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <td><a href={link.stock(r.ticker)}>{instruments[r.ticker]?.name ?? r.ticker}</a></td>
                    <td className="r num">{r.qty}</td>
                    <td className="r num">{price(r.cost / r.qty, r.currency)}</td>
                    <td className="r num">{price(r.last, r.currency)}</td>
                    <td className="r num">{money(r.value, r.currency)}</td>
                    <td className="r"><span className="num">{money(r.pnl, r.currency)}</span> <Chg x={r.ret} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="주문 내역">
        {journal.orders.length === 0 ? <Empty>주문이 없습니다.</Empty> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>주문일</th><th>종목</th><th>내용</th><th>상태</th><th>체결</th><th>이유</th><th /></tr></thead>
              <tbody>
                {[...journal.orders].reverse().map((o) => {
                  const out = account.outcomes[o.id];
                  const fill = account.fills.find((f) => f.orderId === o.id);
                  const cur = instruments[o.ticker]?.currency ?? 'KRW';
                  return (
                    <tr key={o.id}>
                      <td className="num">{new Date(o.placedAt).toLocaleDateString('ko-KR')}</td>
                      <td><a href={link.stock(o.ticker)}>{instruments[o.ticker]?.name ?? o.ticker}</a></td>
                      <td>{o.side === 'buy' ? '매수' : '매도'} {o.qty}주 {o.type === 'market' ? '시장가' : `${o.type === 'limit' ? '지정가' : '손절'} ${price(o.price, cur)}`}</td>
                      <td><StatusText status={out?.status} />{out?.reason && <span className="muted small"> {out.reason}</span>}</td>
                      <td className="num">{fill ? `${shortDate(fill.date)} @ ${price(fill.price, cur)}` : ''}</td>
                      <td className="small">{o.reason ?? ''}</td>
                      <td>{out?.status === 'open' && !journal.cancels.some((c) => c.orderId === o.id) && <button className="link" onClick={() => cancel(o.id)}>취소</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
