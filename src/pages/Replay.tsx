import { useEffect, useMemo, useState } from 'react';
import { loadReplay, loadReplayIndex, type CuratedReplay, type ReplayIndexItem } from '../data/load';
import type { ReplayAction } from '../engine/types';
import { buyAndHold, createEpisode, episodeFromDate, episodeView, playReplay, REPLAY_CASH, type Episode } from '../replay/replay';
import { link, useApp, useBars } from '../state';
import { Chart } from '../ui/Chart';
import { Chg, Empty, KV, Panel } from '../ui/bits';
import { pct, shortDate } from '../ui/format';

interface Game { ep: Episode; actions: ReplayAction[]; step: number; curated?: CuratedReplay; saved: boolean; memo: string }

export function ReplayPage() {
  const { index, journal, update, instruments } = useApp();
  const stockIds = (index?.entries ?? []).filter((e) => e.kind === 'stock').map((e) => e.id);
  const { bars, ready } = useBars(stockIds);
  const [game, setGame] = useState<Game | null>(null);
  const [curatedList, setCuratedList] = useState<ReplayIndexItem[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => { loadReplayIndex().then(setCuratedList); }, []);

  const startRandom = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const ep = createEpisode(Object.values(bars), seed);
    if (!ep) { setProblem('리플레이를 만들 만큼 긴 시세가 없습니다.'); return; }
    setGame({ ep, actions: [], step: 0, saved: false, memo: '' });
  };

  const startCurated = async (id: string) => {
    const c = await loadReplay(id);
    const b = c ? bars[c.ticker] : undefined;
    const ep = c && b ? episodeFromDate(b, c.startDate, c.lookback, c.steps, c.id) : null;
    if (!c || !ep) { setProblem('이 회차의 시세가 없거나 기간이 맞지 않습니다.'); return; }
    setGame({ ep, actions: [], step: 0, curated: c, saved: false, memo: '' });
  };

  if (!ready) return <p className="pad muted">불러오는 중…</p>;
  if (game) return <Play game={game} setGame={setGame} onSave={(g) => {
    const b = bars[g.ep.sourceId];
    const s = playReplay(g.ep, b, g.actions, g.ep.steps);
    update((j) => ({
      ...j,
      replays: [...j.replays, {
        seed: g.ep.seed, ...(g.curated ? { curated: g.curated.id } : {}), sourceId: g.ep.sourceId,
        startDate: b.d[g.ep.start], endDate: b.d[g.ep.start + g.ep.steps], actions: g.actions,
        finalReturn: s.equity[s.equity.length - 1] / REPLAY_CASH - 1, buyHold: buyAndHold(g.ep, b),
        at: new Date().toISOString(), ...(g.memo.trim() ? { note: g.memo.trim() } : {}),
      }],
    }));
  }} bars={bars} />;

  return (
    <div className="page">
      <Panel title="블라인드 리플레이">
        <p>과거의 어느 구간을 종목 이름과 날짜를 가린 채 하루씩 넘기며 매매합니다. 가격은 시작일 종가를 100으로 바꿔 보여주고, 끝나면 정체를 공개합니다.</p>
        <button className="primary" onClick={startRandom} disabled={stockIds.length === 0}>무작위 회차 시작</button>
        {problem && <p className="errors">{problem}</p>}
      </Panel>
      <Panel title="해설이 있는 회차" aside={<span className="muted small">AI가 그 시점까지의 데이터만 보고 쓴 해설</span>}>
        {curatedList.length === 0 ? <Empty>아직 없습니다. Claude에게 “리플레이 회차 만들어줘”라고 하면 만들어집니다.</Empty> : (
          <ul className="plain">
            {curatedList.map((c) => (
              <li key={c.id}>
                <button className="link" onClick={() => startCurated(c.id)}>{c.title}</button>
                {c.level && <span className="flag">{c.level}</span>}
                {journal.replays.some((r) => r.curated === c.id) && <span className="muted small"> 해 봄</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="지난 기록">
        {journal.replays.length === 0 ? <Empty>아직 끝낸 회차가 없습니다.</Empty> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>날짜</th><th>정체</th><th>기간</th><th className="r">내 수익률</th><th className="r">보유만 했다면</th><th className="r">매매</th><th>메모</th></tr></thead>
              <tbody>
                {[...journal.replays].reverse().map((r) => (
                  <tr key={r.at}>
                    <td className="num">{new Date(r.at).toLocaleDateString('ko-KR')}</td>
                    <td><a href={link.stock(r.sourceId)}>{instruments[r.sourceId]?.name ?? r.sourceId}</a></td>
                    <td className="num">{r.startDate} ~ {r.endDate}</td>
                    <td className="r"><Chg x={r.finalReturn} /></td>
                    <td className="r"><Chg x={r.buyHold} /></td>
                    <td className="r num">{r.actions.length}</td>
                    <td className="small">{r.note ?? ''}</td>
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

function Play({ game, setGame, onSave, bars }: { game: Game; setGame: (g: Game | null) => void; onSave: (g: Game) => void; bars: Record<string, import('../engine/types').Bars> }) {
  const { instruments } = useApp();
  const { ep, actions, step, curated } = game;
  const b = bars[ep.sourceId];
  const view = useMemo(() => episodeView(ep, b, step), [ep, b, step]);
  const state = useMemo(() => playReplay(ep, b, actions, step), [ep, b, actions, step]);
  const done = step >= ep.steps;
  const equity = state.equity[state.equity.length - 1];
  const pendingHere = actions.filter((a) => a.step === step);
  const fmt = (x: number) => x.toFixed(2);

  const act = (side: 'buy' | 'sell', fraction: number) => {
    if (done) return;
    setGame({ ...game, actions: [...actions.filter((a) => a.step !== step), { step, side, fraction }] });
  };
  const advance = (k: number) => {
    const next = Math.min(ep.steps, step + k);
    const g = { ...game, step: next };
    setGame(g);
  };

  const commentary = curated
    ? Object.entries(curated.commentary).map(([k, v]) => [Number(k), v] as const).filter(([k]) => k <= step).sort((a, z) => z[0] - a[0])
    : [];

  const markers = state.trades.map((t) => ({ i: view.zero + t.step, side: t.side, price: t.price }));
  const bh = done ? buyAndHold(ep, b) : null;

  return (
    <div className="page">
      <div className="replay-head">
        <h1>{curated ? curated.title : '무작위 회차'} <span className="num replay-step">D+{step}<span>/{ep.steps}</span></span></h1>
        <button className="link" onClick={() => setGame(null)}>그만두기</button>
      </div>
      <div className="chart-pane">
        <Chart o={view.o} h={view.h} l={view.l} c={view.c} v={view.v} labels={view.labels} format={fmt} guide={view.zero} markers={markers} initialVisible={160} />
      </div>
      <div className="grid-2">
        <Panel title="매매" aside={<span className="muted small">결정은 오늘 종가 뒤, 체결은 다음 날 시가</span>}>
          <div className="summary compact">
            <div><span className="muted">평가액</span><b className="num">{Math.round(equity).toLocaleString()}</b> <Chg x={equity / REPLAY_CASH - 1} digits={2} /></div>
            <div><span className="muted">보유</span><b className="num">{state.shares.toLocaleString()}주</b></div>
            <div><span className="muted">현금</span><b className="num">{Math.round(state.cash).toLocaleString()}</b></div>
            <div><span className="muted">최대 낙폭</span><b className="num">{pct(state.maxDrawdown, 1)}</b></div>
          </div>
          {!done && (
            <>
              <div className="btn-row">
                <button className="buy" onClick={() => act('buy', 0.25)}>현금 25% 매수</button>
                <button className="buy" onClick={() => act('buy', 0.5)}>50%</button>
                <button className="buy" onClick={() => act('buy', 1)}>전부</button>
              </div>
              <div className="btn-row">
                <button className="sell" onClick={() => act('sell', 0.5)}>보유 50% 매도</button>
                <button className="sell" onClick={() => act('sell', 1)}>전부</button>
              </div>
              {pendingHere.map((a) => (
                <p key={a.side} className="ok">내일 시가에 {a.side === 'buy' ? `현금 ${Math.round(a.fraction * 100)}% 매수` : `보유 ${Math.round(a.fraction * 100)}% 매도`} 예정
                  {' '}<button className="link" onClick={() => setGame({ ...game, actions: actions.filter((x) => x !== a) })}>취소</button></p>
              ))}
              <div className="btn-row">
                <button className="primary" onClick={() => advance(1)}>다음 날</button>
                <button onClick={() => advance(5)}>5일 넘기기</button>
              </div>
            </>
          )}
        </Panel>
        {curated ? (
          <Panel title="해설">
            {commentary.length === 0 ? <Empty>아직 해설이 없는 구간입니다.</Empty> : commentary.map(([k, text]) => (
              <div key={k} className="commentary"><span className="step">D+{k}</span> {text}</div>
            ))}
          </Panel>
        ) : (
          <Panel title="팁">
            <p className="small">들어가기 전에 “어디서 틀렸다고 인정할지”를 먼저 정해 두세요. 끝나면 메모를 남기면, 다음 리뷰에서 Claude가 그 메모와 매매를 함께 봅니다.</p>
          </Panel>
        )}
      </div>

      {done && (
        <Panel title="정체 공개" className="reveal">
          <p className="big-reveal">{instruments[ep.sourceId]?.name ?? ep.sourceId}</p>
          <p className="num muted">{b.d[ep.start]} ~ {b.d[ep.start + ep.steps]}</p>
          <KV items={[['내 수익률', <Chg x={equity / REPLAY_CASH - 1} />], ['보유만 했다면', <Chg x={bh} />], ['매매', `${state.trades.length}회`], ['최대 낙폭', <span className="num">{pct(state.maxDrawdown)}</span>]]} />
          {state.trades.length > 0 && (
            <p className="small muted">{state.trades.map((t) => `D+${t.step} ${t.side === 'buy' ? '매수' : '매도'}`).join(', ')} (D0은 {shortDate(b.d[ep.start])})</p>
          )}
          {curated && (
            <div className="commentary">
              <p>{curated.reveal.text}</p>
              {curated.reveal.sources && <ul className="sources">{curated.reveal.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>}
            </div>
          )}
          {!game.saved ? (
            <div className="order">
              <label>메모 <span className="muted small">(무엇을 봤고 무엇을 놓쳤나)</span>
                <input value={game.memo} onChange={(e) => setGame({ ...game, memo: e.target.value })} />
              </label>
              <button className="primary" onClick={() => { onSave(game); setGame({ ...game, saved: true }); }}>기록에 저장</button>
            </div>
          ) : (
            <p className="ok">저장했습니다. <button className="link" onClick={() => setGame(null)}>목록으로</button></p>
          )}
        </Panel>
      )}
    </div>
  );
}
