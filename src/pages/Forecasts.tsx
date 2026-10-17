import { useMemo } from 'react';
import { headToHead, scoreboard, scoreForecast, type Scoreboard } from '../engine/forecast';
import { link, useApp, useBars } from '../state';
import { Chg, Empty, Panel } from '../ui/bits';
import { pct } from '../ui/format';

function Board({ title, b }: { title: string; b: Scoreboard }) {
  return (
    <Panel title={title}>
      <dl className="stats">
        <div><dt>채점된 예측</dt><dd className="num">{b.count} <span className="muted small">(진행 중 {b.open})</span></dd></div>
        <div><dt>Brier 점수 <span className="muted small">낮을수록 좋음. 늘 50%라고 하면 0.25</span></dt><dd className="num">{b.brier?.toFixed(3) ?? '–'}</dd></div>
        <div><dt>방향 적중률</dt><dd className="num">{pct(b.hitRate, 0, false)}</dd></div>
        <div><dt>80% 구간 적중률 <span className="muted small">80% 근처가 정직함</span></dt><dd className="num">{pct(b.coverage, 0, false)}</dd></div>
      </dl>
      <table className="grid calib">
        <thead><tr><th>말한 확률</th><th className="r">횟수</th><th className="r">실제 상승</th></tr></thead>
        <tbody>
          {b.calibration.filter((c) => c.n > 0).map((c) => (
            <tr key={c.from}><td>{Math.round(c.from * 100)}–{Math.round(c.to * 100)}%</td><td className="r num">{c.n}</td><td className="r num">{pct(c.upShare, 0, false)}</td></tr>
          ))}
        </tbody>
      </table>
      {b.count === 0 && <Empty>아직 채점된 예측이 없습니다. 예측은 20거래일 뒤 채점됩니다.</Empty>}
    </Panel>
  );
}

export function ForecastsPage() {
  const { journal, aiForecasts, instruments } = useApp();
  const all = useMemo(() => [...journal.forecasts, ...aiForecasts], [journal.forecasts, aiForecasts]);
  const { bars, ready } = useBars(all.map((f) => f.ticker));
  const scored = useMemo(() => all.map((f) => scoreForecast(f, bars[f.ticker])), [all, bars]);
  const mine = scoreboard(scored.filter((s) => s.forecast.by === 'me'));
  const ai = scoreboard(scored.filter((s) => s.forecast.by === 'ai'));
  const pairs = headToHead(scored);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

  if (!ready) return <p className="pad muted">불러오는 중…</p>;
  return (
    <div className="page">
      <div className="grid-2">
        <Board title="나" b={mine} />
        <Board title="AI" b={ai} />
      </div>
      <Panel title="맞대결" aside={<span className="muted small">같은 종목·같은 날·같은 기간 예측만</span>}>
        {pairs.length === 0 ? <Empty>같은 날 같은 종목을 함께 예측한 기록이 채점되면 여기에 나옵니다.</Empty> : (
          <p>{pairs.length}번 맞대결, 평균 Brier 나 <b className="num">{mean(pairs.map((p) => p.me.brier!)).toFixed(3)}</b> vs AI <b className="num">{mean(pairs.map((p) => p.ai.brier!)).toFixed(3)}</b></p>
        )}
      </Panel>
      <Panel title="모든 예측">
        {scored.length === 0 ? <Empty>종목 화면에서 첫 예측을 남겨 보세요.</Empty> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>누가</th><th>종목</th><th>기준일</th><th className="r">상승 확률</th><th className="r">80% 구간</th><th>결과</th><th>이유</th></tr></thead>
              <tbody>
                {[...scored].sort((a, b) => (a.forecast.madeAfter < b.forecast.madeAfter ? 1 : -1)).map((s) => (
                  <tr key={`${s.forecast.by}-${s.forecast.id}`}>
                    <td>{s.forecast.by === 'me' ? '나' : 'AI'}</td>
                    <td><a href={link.stock(s.forecast.ticker)}>{instruments[s.forecast.ticker]?.name ?? s.forecast.ticker}</a></td>
                    <td className="num">{s.forecast.madeAfter}</td>
                    <td className="r num">{Math.round(s.forecast.pUp * 100)}%</td>
                    <td className="r num">{pct(s.forecast.low, 0)} ~ {pct(s.forecast.high, 0)}</td>
                    <td>
                      {s.status === 'scored' ? <><Chg x={s.ret} /> {s.inRange ? '구간 안' : '구간 밖'}, Brier {s.brier!.toFixed(3)}</>
                        : s.status === 'open' ? <span className="muted">{s.remaining}거래일 남음</span> : <span className="muted">시세 없음</span>}
                    </td>
                    <td className="small">{s.forecast.why ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
