import { SAMPLE } from './data/load';
import { AccountPage } from './pages/Account';
import { ForecastsPage } from './pages/Forecasts';
import { HomePage } from './pages/Home';
import { ReplayPage } from './pages/Replay';
import { SettingsPage } from './pages/Settings';
import { StockPage } from './pages/Stock';
import { AppProvider, link, useApp, useRoute } from './state';

function Nav({ route }: { route: string[] }) {
  const here = route[0] ?? '';
  const items: [string, string, string][] = [
    ['', link.home, '오늘'],
    ['account', link.account, '계좌'],
    ['forecasts', link.forecasts, '예측 성적'],
    ['replay', link.replay, '리플레이'],
    ['settings', link.settings, '설정'],
  ];
  return (
    <header className="top">
      <a className="brand" href={link.home}>gam<span>감</span></a>
      <nav>
        {items.map(([key, href, label]) => (
          <a key={key} href={href} aria-current={here === key || (key === '' && here === 's') ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
    </header>
  );
}

function Banner() {
  const { index, cards, loading, saved } = useApp();
  if (loading) return null;
  return (
    <>
      {(SAMPLE || index?.sample) && (
        <div className="banner warn">샘플 데이터입니다. 합성한 가격이며 실제 시세가 아닙니다.</div>
      )}
      {!index && !SAMPLE && (
        <div className="banner warn">
          아직 시세 데이터가 없습니다. GitHub의 <b>Actions → Update data → Run workflow</b>로 첫 수집을 실행하세요.
        </div>
      )}
      {index && !cards && <div className="banner warn">요약 카드가 없습니다. 수집 작업의 로그를 확인하세요.</div>}
      {!saved && <div className="banner warn">이 브라우저에 기록을 저장할 수 없습니다. 설정에서 내보내기로 보관하세요.</div>}
    </>
  );
}

function Pages() {
  const route = useRoute();
  const { loading, error } = useApp();
  let page;
  if (loading) page = <p className="muted pad">불러오는 중…</p>;
  else if (error) page = <p className="pad">불러오지 못했습니다: {error}</p>;
  else if (route[0] === 's' && route[1]) page = <StockPage id={route[1]} />;
  else if (route[0] === 'account') page = <AccountPage />;
  else if (route[0] === 'forecasts') page = <ForecastsPage />;
  else if (route[0] === 'replay') page = <ReplayPage />;
  else if (route[0] === 'settings') page = <SettingsPage />;
  else page = <HomePage />;
  return (
    <>
      <Nav route={route} />
      <Banner />
      <main>{page}</main>
      <footer className="foot">
        연습용 모의투자 도구입니다. 실제 주문은 없으며, 화면의 노트와 예측은 투자 권유가 아닙니다.
      </footer>
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
