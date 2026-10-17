import { SAMPLE } from './data/load';
import { AccountPage } from './pages/Account';
import { ForecastsPage } from './pages/Forecasts';
import { HomePage } from './pages/Home';
import { ReplayPage } from './pages/Replay';
import { SettingsPage } from './pages/Settings';
import { StockPage } from './pages/Stock';
import { AppProvider, link, useApp, useRoute } from './state';
import { Chg } from './ui/bits';
import { price, shortDate } from './ui/format';

function TopBar({ route }: { route: string[] }) {
  const { index, cardById } = useApp();
  const here = route[0] ?? '';
  const tabs: [string, string, string][] = [
    ['', link.home, '오늘'],
    ['account', link.account, '계좌'],
    ['forecasts', link.forecasts, '예측 성적'],
    ['replay', link.replay, '리플레이'],
    ['settings', link.settings, '설정'],
  ];
  const indices = (index?.entries ?? []).filter((e) => e.kind === 'index');
  return (
    <header className="topbar">
      <div className="topbar-row">
        <a className="brand" href={link.home} aria-label="gam 홈">감</a>
        <nav className="tabs" aria-label="화면">
          {tabs.map(([key, href, label]) => (
            <a key={key} href={href} aria-current={here === key || (key === '' && here === 's') ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </div>
      {indices.length > 0 && (
        <ul className="ticker" aria-label="시장 지수">
          {indices.map((e) => {
            const c = cardById[e.id];
            return (
              <li key={e.id}>
                <span className="ticker-name">{e.name}</span>
                <span className="num">{c ? c.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}</span>
                <Chg x={c?.chg1d} />
              </li>
            );
          })}
        </ul>
      )}
    </header>
  );
}

function Rail({ current }: { current?: string }) {
  const { index, cardById, cards, noteById } = useApp();
  const stocks = (index?.entries ?? []).filter((e) => e.kind === 'stock');
  const groups: [string, typeof stocks, string | undefined][] = [
    ['국내', stocks.filter((e) => e.currency === 'KRW'), cards?.asOf.KR],
    ['해외', stocks.filter((e) => e.currency === 'USD'), cards?.asOf.US],
  ];
  return (
    <aside className="rail" aria-label="관심 종목">
      <div className="pane-bar"><h2>관심 종목</h2></div>
      <table className="rail-table">
        <colgroup><col /><col className="c-price" /><col className="c-chg" /></colgroup>
        <tbody>
          {groups.map(([label, list, asOf]) => list.length > 0 && [
            <tr key={label} className="rail-group"><th colSpan={3}>{label}<span>{shortDate(asOf)} 종가</span></th></tr>,
            ...list.map((e) => {
              const c = cardById[e.id];
              const stale = c && asOf && c.date < asOf;
              return (
                <tr key={e.id} className={e.id === current ? 'selected' : ''} onClick={() => { location.hash = link.stock(e.id); }}>
                  <td className="rail-name">
                    <a href={link.stock(e.id)}>{e.name}</a>
                    {noteById[e.id]?.changed && <span className="note-mark" title="오늘 AI 노트 있음">노트</span>}
                  </td>
                  <td className="r num">{stale && <span className="stale" title="최신 일봉이 아직 없습니다">{shortDate(c.date)}</span>}{c ? price(c.close, e.currency) : '–'}</td>
                  <td className="r"><Chg x={c?.chg1d} /></td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </aside>
  );
}

function Banner() {
  const { index, cards, loading, saved } = useApp();
  if (loading) return null;
  const msgs: string[] = [];
  if (SAMPLE || index?.sample) msgs.push('샘플 데이터입니다. 합성한 가격이며 실제 시세가 아닙니다.');
  if (!index && !SAMPLE) msgs.push('아직 시세 데이터가 없습니다. GitHub Actions에서 Update data를 실행해 첫 수집을 하세요.');
  if (index && !cards) msgs.push('요약 카드가 없습니다. 수집 작업의 로그를 확인하세요.');
  if (!saved) msgs.push('이 브라우저에 기록을 저장할 수 없습니다. 설정에서 기록을 내보내 보관하세요.');
  return <>{msgs.map((m) => <div key={m} className="banner">{m}</div>)}</>;
}

function Pages() {
  const route = useRoute();
  const { loading, error } = useApp();
  let page;
  if (loading) page = <p className="pad muted">불러오는 중</p>;
  else if (error) page = <p className="pad">불러오지 못했습니다: {error}</p>;
  else if (route[0] === 's' && route[1]) page = <StockPage id={route[1]} />;
  else if (route[0] === 'account') page = <AccountPage />;
  else if (route[0] === 'forecasts') page = <ForecastsPage />;
  else if (route[0] === 'replay') page = <ReplayPage />;
  else if (route[0] === 'settings') page = <SettingsPage />;
  else page = <HomePage />;
  const isReplay = route[0] === 'replay';
  return (
    <>
      <TopBar route={route} />
      <Banner />
      <div className={`desk${isReplay ? ' no-rail' : ''}`}>
        {!isReplay && <Rail current={route[0] === 's' ? route[1] : undefined} />}
        <main>{page}</main>
      </div>
      <footer className="foot">연습용 모의투자 도구입니다. 실제 주문은 없으며, 화면의 노트와 예측은 투자 권유가 아닙니다.</footer>
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Pages />
    </AppProvider>
  );
}
