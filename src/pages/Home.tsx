import { useMemo } from 'react';
import { settle } from '../engine/settle';
import { link, useApp, useBars } from '../state';
import { Chg, Empty, Panel, Spark } from '../ui/bits';
import { FLAG_LABEL, price, shortDate } from '../ui/format';

export function HomePage() {
  const { index, cards, cardById, notes, noteById, instruments, journal } = useApp();
  const entries = index?.entries ?? [];
  const indices = entries.filter((e) => e.kind === 'index');
  const stocks = entries.filter((e) => e.kind === 'stock');
  const orderTickers = [...new Set(journal.orders.map((o) => o.ticker))];
  const { bars } = useBars([...indices.map((e) => e.id), ...orderTickers]);

  const account = useMemo(() => settle(journal, bars, instruments), [journal, bars, instruments]);
  const open = journal.orders.filter((o) => account.outcomes[o.id]?.status === 'open');
  const recent = [...account.fills].reverse().slice(0, 5);

  return (
    <div className="page">
      <div className="asof">
        기준일 한국 {shortDate(cards?.asOf.KR)} · 미국 {shortDate(cards?.asOf.US)}
        {cards && <span className="muted"> · 계산 {new Date(cards.generatedAt).toLocaleString('ko-KR')}</span>}
      </div>

      <section className="market-map" aria-label="시장 지도">
        {indices.map((e) => {
          const c = cardById[e.id];
          const b = bars[e.id];
          return (
            <div className="index-card" key={e.id}>
              <div className="index-name">
                {e.name}
                {c && !e.id.startsWith('FX:') && c.date < (cards?.asOf[e.currency === 'KRW' ? 'KR' : 'US'] ?? '') && (
                  <span className="stale-inline" title="최신 일봉이 아직 없습니다"> · {shortDate(c.date)}</span>
                )}
              </div>
              <div className="index-close num">{c ? c.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}</div>
              <div className="index-chg"><Chg x={c?.chg1d} /> <span className="muted">20일</span> <Chg x={c?.chg20d} /></div>
              {b && <Spark values={b.c.slice(-60)} />}
            </div>
          );
        })}
      </section>

      <div className="grid-2">
        <Panel title="AI 시장 노트" aside={notes ? <span className="muted">{notes.date}{notes.sample ? ' · 샘플' : ''}</span> : null}>
          {notes ? <p className="note-text">{notes.market}</p> : <Empty>아직 AI 노트가 없습니다. 예약 작업이 처음 실행되면 여기에 나옵니다.</Empty>}
          <p className="fine">AI 노트는 판단 재료이며 투자 권유가 아닙니다.</p>
        </Panel>
        <Panel title="내 주문" aside={<a href={link.account}>계좌 →</a>}>
          {open.length === 0 && recent.length === 0 && <Empty>주문이 없습니다. 종목을 눌러 주문해 보세요.</Empty>}
          {open.length > 0 && (
            <ul className="plain">
              {open.map((o) => (
                <li key={o.id}>
                  대기 · <a href={link.stock(o.ticker)}>{instruments[o.ticker]?.name ?? o.ticker}</a>{' '}
                  {o.side === 'buy' ? '매수' : '매도'} {o.qty}주 {o.type === 'market' ? '시장가' : `${o.type === 'limit' ? '지정가' : '손절'} ${o.price}`}
                </li>
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <ul className="plain">
              {recent.map((f) => (
                <li key={f.orderId}>
                  {shortDate(f.date)} 체결 · {instruments[f.ticker]?.name ?? f.ticker} {f.side === 'buy' ? '매수' : '매도'} {f.qty}주 @ {price(f.price, f.currency)}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="관심 종목">
        <div className="table-wrap">
          <table className="watch">
            <thead>
              <tr>
                <th>종목</th><th className="r">종가</th><th className="r">1일</th><th className="r">5일</th><th className="r">20일</th>
                <th className="r">RSI</th><th className="r">거래량</th><th className="r">52주 고점</th>
                <th className="r" title="최근 40일과 비슷했던 과거 구간 뒤 20일 상승 비율 / 같은 종목 아무 날 20일 상승 비율">유사 / 기저</th>
                <th>신호</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((e) => {
                const c = cardById[e.id];
                const note = noteById[e.id];
                return (
                  <tr key={e.id} onClick={() => { location.hash = link.stock(e.id); }}>
                    <td>
                      <a href={link.stock(e.id)}>{e.name}</a>
                      <span className="tick">{e.id.split(':')[1]}</span>
                      {note?.changed && <span className="dot" title="오늘 AI 노트 있음" />}
                    </td>
                    <td className="r num">
                      {c ? price(c.close, e.currency) : '–'}
                      {c && cards?.asOf[e.currency === 'KRW' ? 'KR' : 'US'] && c.date < cards.asOf[e.currency === 'KRW' ? 'KR' : 'US'] && (
                        <span className="stale" title="이 종목은 아직 최신 일봉이 들어오지 않았습니다">{shortDate(c.date)}</span>
                      )}
                    </td>
                    <td className="r"><Chg x={c?.chg1d} /></td>
                    <td className="r"><Chg x={c?.chg5d} /></td>
                    <td className="r"><Chg x={c?.chg20d} /></td>
                    <td className="r num">{c?.rsi14?.toFixed(0) ?? '–'}</td>
                    <td className="r num">{c?.volRatio20 ? `${c.volRatio20.toFixed(1)}배` : '–'}</td>
                    <td className="r"><Chg x={c?.from52wHigh} /></td>
                    <td className="r num">
                      {c?.pattern ? `${Math.round(c.pattern.upShare * 100)}%` : <span className="muted">부족</span>}
                      <span className="muted"> / {c?.baseRate ? `${Math.round(c.baseRate.upShare * 100)}%` : '–'}</span>
                    </td>
                    <td>{c?.flags.map((f) => <span key={f} className="chip">{FLAG_LABEL[f] ?? f}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!cards && <Empty>요약 카드가 아직 없습니다.</Empty>}
      </Panel>
    </div>
  );
}
