import { useMemo } from 'react';
import { settle } from '../engine/settle';
import { link, useApp, useBars } from '../state';
import { Chg, Empty, Panel } from '../ui/bits';
import { FLAG_LABEL, price, shortDate } from '../ui/format';

export function HomePage() {
  const { index, cards, cardById, notes, noteById, instruments, journal } = useApp();
  const stocks = (index?.entries ?? []).filter((e) => e.kind === 'stock');
  const orderTickers = [...new Set(journal.orders.map((o) => o.ticker))];
  const { bars } = useBars(orderTickers);
  const account = useMemo(() => settle(journal, bars, instruments), [journal, bars, instruments]);
  const open = journal.orders.filter((o) => account.outcomes[o.id]?.status === 'open');
  const recent = [...account.fills].reverse().slice(0, 5);

  return (
    <div className="page">
      <div className="split">
        <Panel title="시장 노트" aside={notes ? <span>{notes.date} 작성{notes.sample ? ', 샘플' : ''}</span> : null}>
          {notes ? <p className="prose">{notes.market}</p> : <Empty>아직 노트가 없습니다. 평일 아침 Claude 예약 작업이 처음 실행되면 여기에 나옵니다.</Empty>}
          <p className="fine">노트는 판단 재료이며 투자 권유가 아닙니다.</p>
        </Panel>
        <Panel title="내 주문" aside={<a href={link.account}>계좌 보기</a>}>
          {open.length === 0 && recent.length === 0 && <Empty>주문이 없습니다. 왼쪽 목록에서 종목을 골라 주문해 보세요.</Empty>}
          {(open.length > 0 || recent.length > 0) && (
            <table className="grid">
              <tbody>
                {open.map((o) => (
                  <tr key={o.id}>
                    <td><span className="status s-open">대기</span></td>
                    <td><a href={link.stock(o.ticker)}>{instruments[o.ticker]?.name ?? o.ticker}</a></td>
                    <td className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '매수' : '매도'}</td>
                    <td className="r num">{o.qty}주</td>
                    <td className="r num">{o.type === 'market' ? '시장가' : `${o.type === 'limit' ? '지정' : '손절'} ${o.price}`}</td>
                  </tr>
                ))}
                {recent.map((f) => (
                  <tr key={f.orderId}>
                    <td><span className="status s-filled">{shortDate(f.date)} 체결</span></td>
                    <td><a href={link.stock(f.ticker)}>{instruments[f.ticker]?.name ?? f.ticker}</a></td>
                    <td className={f.side === 'buy' ? 'up' : 'down'}>{f.side === 'buy' ? '매수' : '매도'}</td>
                    <td className="r num">{f.qty}주</td>
                    <td className="r num">{price(f.price, f.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="관심 종목 지표" aside={cards ? <span>{new Date(cards.generatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 계산</span> : null}>
        {!cards ? <Empty>요약 카드가 아직 없습니다.</Empty> : (
          <div className="table-wrap">
            <table className="grid watch">
              <thead>
                <tr>
                  <th>종목</th><th className="r">현재가</th><th className="r">전일 대비</th><th className="r">5일</th><th className="r">20일</th>
                  <th className="r">RSI</th><th className="r">거래량</th><th className="r">52주 고점 대비</th>
                  <th className="r" title="최근 40일과 비슷했던 과거 구간 뒤 20일 동안 오른 비율, 그리고 이 종목의 아무 날 20일 상승 비율">20일 상승 비율<br /><span>유사 구간 / 평소</span></th>
                  <th>신호</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((e) => {
                  const c = cardById[e.id];
                  return (
                    <tr key={e.id} onClick={() => { location.hash = link.stock(e.id); }}>
                      <td>
                        <a href={link.stock(e.id)}>{e.name}</a> <span className="code">{e.id.split(':')[1]}</span>
                        {noteById[e.id]?.changed && <span className="note-mark">노트</span>}
                      </td>
                      <td className="r num">{c ? price(c.close, e.currency) : '–'}</td>
                      <td className="r"><Chg x={c?.chg1d} /></td>
                      <td className="r"><Chg x={c?.chg5d} digits={1} /></td>
                      <td className="r"><Chg x={c?.chg20d} digits={1} /></td>
                      <td className={`r num ${c?.rsi14 != null && c.rsi14 >= 70 ? 'up' : c?.rsi14 != null && c.rsi14 <= 30 ? 'down' : ''}`}>{c?.rsi14?.toFixed(0) ?? '–'}</td>
                      <td className={`r num ${c?.volRatio20 != null && c.volRatio20 >= 2 ? 'hot' : ''}`}>{c?.volRatio20 ? `${c.volRatio20.toFixed(1)}배` : '–'}</td>
                      <td className="r"><Chg x={c?.from52wHigh} digits={1} /></td>
                      <td className="r num">
                        {c?.pattern ? `${Math.round(c.pattern.upShare * 100)}%` : <span className="muted">기록 부족</span>}
                        <span className="muted"> / {c?.baseRate ? `${Math.round(c.baseRate.upShare * 100)}%` : '–'}</span>
                      </td>
                      <td>{c?.flags.map((f) => <span key={f} className="flag">{FLAG_LABEL[f] ?? f}</span>)}</td>
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
