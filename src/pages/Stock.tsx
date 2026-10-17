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
import { Chg, Empty, KV, Panel, RangeBar } from '../ui/bits';
import { FLAG_LABEL, money, pct, price, shortDate, tone } from '../ui/format';

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
  const n = b.d.length - 1;
  const chg = n > 0 ? (b.c[n] * b.f[n]) / (b.c[n - 1] * b.f[n - 1]) - 1 : null;
  const diff = n > 0 ? b.c[n] - b.c[n - 1] * (b.f[n - 1] / b.f[n]) : null;

  return (
    <div className="page">
      <header className="quote">
        <div className="quote-id">
          <h1>{inst.name}</h1>
          <span className="code">{id.split(':')[1]}</span>
          <span className="tag">{inst.market}</span>
        </div>
        <div className={`quote-price ${tone(chg)}`}>
          <span className="num quote-last">{price(b.c[n], currency)}</span>
          <span className="num">{diff !== null && Math.abs(diff) > 0 ? `${diff > 0 ? '▲' : '▼'} ${price(Math.abs(diff), currency)}` : ''}</span>
          <Chg x={chg} />
        </div>
        <KV items={[
          ['시가', <span className="num">{price(b.o[n], currency)}</span>],
          ['고가', <span className="num up">{price(b.h[n], currency)}</span>],
          ['저가', <span className="num down">{price(b.l[n], currency)}</span>],
          ['거래량', <span className="num">{Math.round(b.v[n]).toLocaleString('ko-KR')}</span>],
          ['기준일', <span className="num">{b.d[n]}</span>],
        ]} />
        {card && card.flags.length > 0 && <div className="flags">{card.flags.map((f) => <span key={f} className="flag">{FLAG_LABEL[f] ?? f}</span>)}</div>}
      </header>

      <StockChart b={b} instId={id} format={fmt} />

      <div className="grid-2">
        <div className="stack">
          <OrderPanel inst={inst} b={b} allBars={bars} />
          <ForecastPanel inst={inst} b={b} />
        </div>
        <div className="stack">
          <Panel title="노트" aside={note ? <span>Claude 작성</span> : undefined}>
            {note ? (
              <>
                <p className="prose">{note.text}</p>
                {note.sources && note.sources.length > 0 && (
                  <ul className="sources">{note.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
                )}
              </>
            ) : <Empty>이 종목의 오늘 노트가 없습니다.</Empty>}
            {aiForecasts.filter((f) => f.ticker === id).slice(-1).map((f) => {
              const s = scoreForecast(f, b);
              return (
                <div key={f.id} className="ai-forecast">
                  <KV items={[
                    ['AI 예측', `${f.madeAfter} 종가부터 ${f.horizon}거래일`],
                    ['오를 확률', <b className="num">{Math.round(f.pUp * 100)}%</b>],
                    ['80% 구간', <span className="num">{pct(f.low)} ~ {pct(f.high)}</span>],
                    ['상태', s.status === 'open' ? `${s.remaining}거래일 남음` : s.status === 'scored' ? <>결과 <Chg x={s.ret} /></> : '시세 없음'],
                  ]} />
                  {f.why && <p className="muted small">{f.why}</p>}
                </div>
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
    <div className="chart-pane">
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
        <div><dt>20일선</dt><dd className="num">{price(card.sma['20'], currency)}</dd></div>
        <div><dt>60일선</dt><dd className="num">{price(card.sma['60'], currency)}</dd></div>
        <div><dt>120일선</dt><dd className="num">{price(card.sma['120'], currency)}</dd></div>
      </dl>
      <h3 className="sub">앞으로 20거래일 수익률 분포</h3>
      {card.pattern
        ? <RangeBar stats={card.pattern} scale={scale} label={`비슷했던 과거 ${card.pattern.matches}번`} />
        : <p className="muted small">비슷한 과거 구간을 찾기에는 기록이 짧습니다(상장 후 {card.history}거래일).</p>}
      {card.baseRate && <RangeBar stats={card.baseRate} scale={scale} label={`평소(지난 5년 ${card.baseRate.samples}일)`} />}
      <p className="fine">위 막대는 최근 40일과 모양이 비슷했던 과거 구간(관심 종목 전체, 변동성 보정) 뒤의 결과, 아래 막대는 이 종목의 평소 20일 결과입니다. 둘을 함께 봐야 유사 구간이 정말 다른지 알 수 있습니다.</p>
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
    <section className={`ticket ticket-${side}`} aria-label="모의 주문">
      <div className="ticket-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={side === 'buy'} className="t-buy" onClick={() => { setSide('buy'); if (type === 'stop') setType('market'); }}>매수</button>
        <button type="button" role="tab" aria-selected={side === 'sell'} className="t-sell" onClick={() => setSide('sell')}>매도</button>
      </div>
      <form className="ticket-body" onSubmit={submit}>
        <div className="ticket-row">
          <span className="ticket-label">종류</span>
          <div className="seg" role="group" aria-label="주문 종류">
            {(['market', 'limit', 'stop'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} disabled={t === 'stop' && side === 'buy'} onClick={() => setType(t)}>
                {t === 'market' ? '시장가' : t === 'limit' ? '지정가' : '손절'}
              </button>
            ))}
          </div>
        </div>
        <label className="ticket-row">
          <span className="ticket-label">수량</span>
          <span className="with-suffix"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} /><span>주</span></span>
        </label>
        {type !== 'market' && (
          <>
            <label className="ticket-row">
              <span className="ticket-label">가격</span>
              <span className="with-suffix"><input inputMode="decimal" value={priceText} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} /><span>{inst.currency === 'KRW' ? '원' : '$'}</span></span>
            </label>
            <p className="ticket-hint">호가 단위 {tickSize(market, Number(priceText) || last).toLocaleString()}{lim ? `, 오늘 가능한 가격 ${lim.low.toLocaleString()}–${lim.high.toLocaleString()}` : ''}</p>
            <label className="ticket-row">
              <span className="ticket-label">유효 기간</span>
              <span className="with-suffix"><input inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/[^0-9]/g, ''))} /><span>거래일</span></span>
            </label>
          </>
        )}
        <label className="ticket-row">
          <span className="ticket-label">이유</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 60일선에서 받치는지 확인" />
        </label>
        <div className="ticket-row">
          <span className="ticket-label">확신</span>
          <div className="seg seg-wide" role="group" aria-label="확신">
            {[1, 2, 3, 4, 5].map((k) => (
              <button key={k} type="button" aria-pressed={confidence === k} onClick={() => setConfidence(k)} title={['', '거의 없음', '낮음', '보통', '높음', '매우 높음'][k]}>{k}</button>
            ))}
          </div>
        </div>
        <dl className="ticket-sum">
          <div><dt>주문 금액</dt><dd className="num">{money(est, inst.currency)}</dd></div>
          <div><dt>{side === 'sell' ? '수수료와 세금' : '수수료'}</dt><dd className="num">{money(cost, inst.currency)}</dd></div>
          <div><dt>{side === 'buy' ? '주문 가능 현금' : '매도 가능'}</dt><dd className="num">{side === 'buy' ? money(cash, inst.currency) : `${held - pending}주`}</dd></div>
        </dl>
        {errors.length > 0 && <ul className="errors">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        <button className="ticket-submit" type="submit" disabled={errors.length > 0}>{side === 'buy' ? '매수 주문' : '매도 주문'}</button>
        {done && <p className="ok">{done}</p>}
        <p className="fine">주문한 날(거래소 시간)의 다음 거래일 일봉으로 체결을 정합니다. 시장가는 그날 시가에 슬리피지 {pct(journal.settings.slippage, 2, false)}를 더합니다.</p>
      </form>
    </section>
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
    <Panel title="내 예측" aside={<span>{madeAfter} 종가에서 20거래일 뒤</span>}>
      {already ? (
        <p>오늘 이미 예측했습니다: 상승 {Math.round(already.pUp * 100)}%, 구간 {pct(already.low)} ~ {pct(already.high)}. <a href={link.forecasts}>예측 성적 보기</a></p>
      ) : (
        <form className="order" onSubmit={submit}>
          <label>오를 확률 <b className="num big-num">{pUp}%</b>
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
              <span className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '매수' : '매도'}</span> {o.qty}주 {o.type === 'market' ? '시장가' : `${o.type === 'limit' ? '지정가' : '손절'} ${price(o.price, currency)}`}{' '}
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
              예측 {f.madeAfter}, 오를 확률 {Math.round(f.pUp * 100)}%{' '}
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
