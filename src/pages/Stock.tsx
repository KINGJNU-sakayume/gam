import { useMemo, useState } from 'react';
import { scoreForecast } from '../engine/forecast';
import { adjusted, rsi as rsiOf, sma } from '../engine/indicators';
import { priceLimits, roundToTick, tickSize } from '../engine/market';
import { settle } from '../engine/settle';
import type { Bars, Instrument, Market, Order, OrderType, Side } from '../engine/types';
import { validateOrder } from '../engine/validate';
import { newId } from '../store/journal';
import { link, useApp, useBars } from '../state';
import { Chart } from '../ui/Chart';
import { Chg, Empty, Panel, RangeBar } from '../ui/bits';
import { FLAG_LABEL, money, pct, price, shortDate } from '../ui/format';

const SMA_COLORS = { 20: '#b8862b', 60: '#6b8f3a', 120: '#7a5ea8' } as const;

export function StockPage({ id }: { id: string }) {
  const { instruments, cardById, noteById, journal, aiForecasts } = useApp();
  const inst = instruments[id];
  const { bars, ready } = useBars(inst ? [id, ...journal.orders.map((o) => o.ticker)] : []);
  const b = bars[id];

  if (!inst) return <p className="pad">알 수 없는 종목입니다. <a href={link.home}>돌아가기</a></p>;
  if (!ready) return <p className="pad muted">불러오는 중…</p>;
  if (!b) return <p className="pad">시세 파일이 아직 없습니다.</p>;

  const card = cardById[id];
  const note = noteById[id];
  const currency = inst.currency;
  const fmt = (x: number) => price(x, currency);

  return (
    <div className="page">
      <header className="stock-head">
        <div>
          <h1>{inst.name} <span className="tick">{id.split(':')[1]} · {inst.market}</span></h1>
          <div className="stock-price">
            <span className="num big">{price(b.c[b.c.length - 1], currency)}</span>
            <Chg x={card?.chg1d} digits={2} />
            <span className="muted">{shortDate(b.d[b.d.length - 1])} 종가</span>
          </div>
        </div>
        <div className="chips">{card?.flags.map((f) => <span key={f} className="chip">{FLAG_LABEL[f] ?? f}</span>)}</div>
      </header>

      <StockChart b={b} instId={id} format={fmt} />

      <div className="grid-2">
        <div className="stack">
          <OrderPanel inst={inst} b={b} allBars={bars} />
          <ForecastPanel inst={inst} b={b} />
        </div>
        <div className="stack">
          <Panel title="AI 노트" aside={note ? null : undefined}>
            {note ? (
              <>
                <p className="note-text">{note.text}</p>
                {note.sources && note.sources.length > 0 && (
                  <ul className="sources">{note.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
                )}
              </>
            ) : <Empty>이 종목의 오늘 노트가 없습니다.</Empty>}
            {aiForecasts.filter((f) => f.ticker === id).slice(-1).map((f) => {
              const s = scoreForecast(f, b);
              return (
                <p key={f.id} className="ai-forecast">
                  AI 예측({f.madeAfter} 기준 {f.horizon}거래일): 상승 확률 <b>{Math.round(f.pUp * 100)}%</b>, 80% 구간 {pct(f.low)} ~ {pct(f.high)}
                  {s.status === 'open' ? <span className="muted"> · {s.remaining}일 남음</span> : s.status === 'scored' ? <span className="muted"> · 결과 {pct(s.ret)}</span> : null}
                  {f.why && <><br /><span className="muted">{f.why}</span></>}
                </p>
              );
            })}
            <p className="fine">AI 노트는 판단 재료이며 투자 권유가 아닙니다.</p>
          </Panel>
          {card && <StatsPanel card={card} currency={currency} />}
          <HistoryPanel id={id} b={b} currency={currency} allBars={bars} />
        </div>
      </div>
    </div>
  );
}

function StockChart({ b, instId, format }: { b: Bars; instId: string; format: (x: number) => string }) {
  const { journal, instruments } = useApp();
  const adj = useMemo(() => adjusted(b), [b]);
  const overlays = useMemo(() => ([20, 60, 120] as const).map((k) => ({ values: sma(adj.c, k), color: SMA_COLORS[k], label: `${k}일선` })), [adj]);
  const rsi = useMemo(() => rsiOf(adj.c), [adj]);
  const markers = useMemo(() => {
    const acc = settle(journal, { [instId]: b }, instruments);
    const at = new Map(b.d.map((d, i) => [d, i]));
    return acc.fills.filter((f) => f.ticker === instId).map((f) => {
      const i = at.get(f.date)!;
      return { i, side: f.side, price: f.price * b.f[i] };
    });
  }, [journal, b, instId, instruments]);
  return (
    <div className="panel chart-panel">
      <Chart o={adj.o} h={adj.h} l={adj.l} c={adj.c} v={b.v} labels={b.d} overlays={overlays} markers={markers} rsi={rsi} format={format} />
      <p className="fine">수정주가 기준 차트입니다. 휠·버튼으로 확대, 끌어서 이동. ▲매수 ▼매도</p>
    </div>
  );
}

function StatsPanel({ card, currency }: { card: NonNullable<ReturnType<typeof useApp>['cardById'][string]>; currency: Instrument['currency'] }) {
  const scale = Math.max(0.05, ...[card.pattern, card.baseRate].filter(Boolean).flatMap((s) => [Math.abs(s!.p10), Math.abs(s!.p90)]));
  return (
    <Panel title="지표와 확률">
      <dl className="stats">
        <div><dt>RSI(14)</dt><dd className="num">{card.rsi14?.toFixed(1) ?? '–'}</dd></div>
        <div><dt>일평균 변동(ATR)</dt><dd className="num">{pct(card.atrPct, 1, false)}</dd></div>
        <div><dt>거래량(20일 평균 대비)</dt><dd className="num">{card.volRatio20 ? `${card.volRatio20.toFixed(2)}배` : '–'}</dd></div>
        <div><dt>52주 고점 대비</dt><dd><Chg x={card.from52wHigh} /></dd></div>
        <div><dt>52주 저점 대비</dt><dd><Chg x={card.from52wLow} /></dd></div>
        <div><dt>20 · 60 · 120일선</dt><dd className="num">{(['20', '60', '120'] as const).map((k) => price(card.sma[k], currency)).join(' · ')}</dd></div>
      </dl>
      <h3 className="sub">앞으로 20거래일 수익률 분포</h3>
      {card.pattern
        ? <RangeBar stats={card.pattern} scale={scale} label={`비슷한 과거 ${card.pattern.matches}회`} />
        : <p className="muted small">유사 패턴: 데이터 부족(상장 {card.history}거래일)</p>}
      {card.baseRate && <RangeBar stats={card.baseRate} scale={scale} label={`기저율(지난 5년 ${card.baseRate.samples}일)`} />}
      <p className="fine">유사 패턴은 최근 40일 모양이 비슷했던 과거 구간(관심 종목 전체, 변동성 보정) 뒤의 결과입니다. 기저율과 함께 보세요. 막대는 10–90% 범위, 세로선은 중앙값입니다.</p>
    </Panel>
  );
}

function OrderPanel({ inst, b, allBars }: { inst: Instrument; b: Bars; allBars: Record<string, Bars> }) {
  const { journal, update, instruments } = useApp();
  const market = inst.market as Market;
  const last = b.c[b.c.length - 1];
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OrderType>('market');
  const [qty, setQty] = useState('1');
  const [priceText, setPrice] = useState(String(roundToTick(market, last, 'nearest')));
  const [validDays, setValidDays] = useState(String(journal.settings.validDays));
  const [reason, setReason] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [done, setDone] = useState<string | null>(null);

  const account = useMemo(() => settle(journal, allBars, instruments), [journal, allBars, instruments]);
  const held = account.positions.find((p) => p.ticker === inst.id)?.qty ?? 0;
  const pending = journal.orders.filter((o) => o.ticker === inst.id && o.side === 'sell' && account.outcomes[o.id]?.status === 'open').reduce((a, o) => a + o.qty, 0);
  const cash = account.cash[inst.currency];
  const q = Number(qty);
  const p = type === 'market' ? undefined : Number(priceText);
  const errors = validateOrder({ side, type, qty: q, price: p }, market, last, held - pending);
  const est = (p ?? last) * (Number.isFinite(q) ? q : 0);
  const rule = inst.currency === 'KRW' ? journal.settings.fees.KR : journal.settings.fees.US;
  const cost = est * rule.commission + (side === 'sell' ? est * rule.tax : 0);
  const lim = priceLimits(market, last);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length) return;
    const order: Order = {
      id: newId('o'), ticker: inst.id, side, type, qty: q, placedAt: new Date().toISOString(),
      ...(type !== 'market' ? { price: p, validDays: Number(validDays) || journal.settings.validDays } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      confidence,
    };
    update((j) => ({ ...j, orders: [...j.orders, order] }));
    setDone('주문을 넣었습니다. 다음 거래일 일봉이 들어오면 체결 여부가 정해집니다.');
    setReason('');
  };

  return (
    <Panel title="모의 주문" aside={<span className="muted small">보유 {held}주 · 현금 {money(cash, inst.currency)}</span>}>
      <form className="order" onSubmit={submit}>
        <div className="seg" role="group" aria-label="매수 매도">
          <button type="button" className={side === 'buy' ? 'on buy' : ''} onClick={() => { setSide('buy'); if (type === 'stop') setType('market'); }}>매수</button>
          <button type="button" className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>매도</button>
        </div>
        <div className="seg" role="group" aria-label="주문 종류">
          {(['market', 'limit', 'stop'] as const).map((t) => (
            <button key={t} type="button" className={type === t ? 'on' : ''} disabled={t === 'stop' && side === 'buy'} onClick={() => setType(t)}>
              {t === 'market' ? '시장가' : t === 'limit' ? '지정가' : '손절'}
            </button>
          ))}
        </div>
        <label>수량<input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} /></label>
        {type !== 'market' && (
          <>
            <label>
              가격 <span className="muted small">호가 {tickSize(market, Number(priceText) || last).toLocaleString()}{lim ? ` · 제한 ${lim.low.toLocaleString()}–${lim.high.toLocaleString()}` : ''}</span>
              <input inputMode="decimal" value={priceText} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
            </label>
            <label>유효 기간(거래일)<input inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/[^0-9]/g, ''))} /></label>
          </>
        )}
        <label>이유 <span className="muted small">(선택, 나중에 채점과 리뷰에 쓰입니다)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 60일선 지지 확인, 실적 발표 전 분할 매수" />
        </label>
        <label>확신
          <input type="range" min={1} max={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          <span className="muted small">{['', '거의 없음', '낮음', '보통', '높음', '매우 높음'][confidence]}</span>
        </label>
        <div className="est">예상 금액 {money(est, inst.currency)} · 비용 약 {money(cost, inst.currency)}</div>
        {errors.length > 0 && <ul className="errors">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        <button className={`primary ${side}`} type="submit" disabled={errors.length > 0}>{side === 'buy' ? '매수 주문' : '매도 주문'}</button>
        {done && <p className="ok">{done}</p>}
        <p className="fine">주문은 주문한 날(거래소 시간)의 다음 거래일부터 체결을 판정합니다. 시장가는 그날 시가에 슬리피지 {pct(journal.settings.slippage, 2, false)}를 더해 체결됩니다.</p>
      </form>
    </Panel>
  );
}

function ForecastPanel({ inst, b }: { inst: Instrument; b: Bars }) {
  const { journal, update, cardById } = useApp();
  const base = cardById[inst.id]?.baseRate;
  const [pUp, setPUp] = useState(50);
  const [low, setLow] = useState(String(Math.round((base?.p10 ?? -0.1) * 100)));
  const [high, setHigh] = useState(String(Math.round((base?.p90 ?? 0.1) * 100)));
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const madeAfter = b.d[b.d.length - 1];
  const already = journal.forecasts.find((f) => f.ticker === inst.id && f.madeAfter === madeAfter);
  const lo = Number(low) / 100, hi = Number(high) / 100;
  const invalid = !(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || already) return;
    update((j) => ({
      ...j,
      forecasts: [...j.forecasts, { id: newId('f'), by: 'me', ticker: inst.id, madeAfter, horizon: 20, pUp: pUp / 100, low: lo, high: hi, ...(why.trim() ? { why: why.trim() } : {}) }],
    }));
    setMsg('예측을 남겼습니다. 20거래일 뒤 자동으로 채점됩니다.');
  };

  return (
    <Panel title="내 예측" aside={<span className="muted small">{madeAfter} 종가 기준 · 20거래일 뒤</span>}>
      {already ? (
        <p>오늘 이미 예측했습니다: 상승 {Math.round(already.pUp * 100)}%, 구간 {pct(already.low)} ~ {pct(already.high)}. <a href={link.forecasts}>성적 보기 →</a></p>
      ) : (
        <form className="order" onSubmit={submit}>
          <label>오를 확률 <b className="num">{pUp}%</b>
            <input type="range" min={5} max={95} step={5} value={pUp} onChange={(e) => setPUp(Number(e.target.value))} />
          </label>
          <div className="row">
            <label>80% 구간 하단(%)<input inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} /></label>
            <label>상단(%)<input inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} /></label>
          </div>
          {base && <p className="fine">참고: 이 종목 기저율 10–90% 범위는 {pct(base.p10)} ~ {pct(base.p90)}, 상승 비율 {Math.round(base.upShare * 100)}%</p>}
          <label>한 줄 이유<input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          {invalid && <p className="errors">하단이 상단보다 작아야 합니다.</p>}
          <button className="primary" type="submit" disabled={invalid}>예측 남기기</button>
          {msg && <p className="ok">{msg}</p>}
        </form>
      )}
    </Panel>
  );
}

function HistoryPanel({ id, b, currency, allBars }: { id: string; b: Bars; currency: Instrument['currency']; allBars: Record<string, Bars> }) {
  const { journal, instruments } = useApp();
  const account = useMemo(() => settle(journal, allBars, instruments), [journal, allBars, instruments]);
  const orders = journal.orders.filter((o) => o.ticker === id).reverse();
  const forecasts = journal.forecasts.filter((f) => f.ticker === id).reverse();
  if (orders.length === 0 && forecasts.length === 0) return null;
  return (
    <Panel title="이 종목의 내 기록">
      <ul className="plain">
        {orders.map((o) => {
          const out = account.outcomes[o.id];
          const fill = account.fills.find((f) => f.orderId === o.id);
          return (
            <li key={o.id}>
              {o.side === 'buy' ? '매수' : '매도'} {o.qty}주 {o.type === 'market' ? '시장가' : `${o.type === 'limit' ? '지정가' : '손절'} ${price(o.price, currency)}`} ·{' '}
              <StatusText status={out?.status} />{fill && ` ${shortDate(fill.date)} @ ${price(fill.price, currency)}`}
              {out?.reason && <span className="muted"> ({out.reason})</span>}
              {o.reason && <div className="muted small">“{o.reason}”</div>}
            </li>
          );
        })}
        {forecasts.map((f) => {
          const s = scoreForecast(f, b);
          return (
            <li key={f.id}>
              예측 {f.madeAfter}: 상승 {Math.round(f.pUp * 100)}% ·{' '}
              {s.status === 'scored' ? <>결과 <Chg x={s.ret} /> (Brier {s.brier!.toFixed(3)})</> : <span className="muted">{s.remaining}거래일 남음</span>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function StatusText({ status }: { status?: string }) {
  const map: Record<string, string> = { open: '대기', filled: '체결', cancelled: '취소', expired: '만료', rejected: '거부', 'unknown-ticker': '시세 없음' };
  return <span className={`status s-${status}`}>{map[status ?? ''] ?? '–'}</span>;
}
