import { useRef, useState } from 'react';
import { DEFAULT_SETTINGS, emptyJournal, type Settings } from '../engine/types';
import { downloadJournal, normalize, pushJournal, readGitHub, writeGitHub, type GitHubTarget } from '../store/journal';
import { useApp } from '../state';
import { Panel } from '../ui/bits';

function NumField({ label, value, onChange, step = 'any', suffix }: { label: string; value: number; onChange: (n: number) => void; step?: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  return (
    <label>{label}
      <span className="with-suffix">
        <input inputMode="decimal" step={step} value={text}
          onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== '') onChange(n); }} />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  );
}

export function SettingsPage() {
  const { journal, update } = useApp();
  const s = journal.settings;
  const set = (patch: (s: Settings) => Settings) => update((j) => ({ ...j, settings: patch(j.settings) }));
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [gh, setGh] = useState<GitHubTarget>(() => readGitHub() ?? { owner: 'KINGJNU-sakayume', repo: 'gam', branch: 'main', token: '' });
  const [busy, setBusy] = useState(false);

  const onImport = async (f: File) => {
    try {
      const j = normalize(JSON.parse(await f.text()));
      if (!confirm(`주문 ${j.orders.length}개, 예측 ${j.forecasts.length}개를 가져옵니다. 지금 기록을 덮어씁니다.`)) return;
      update(() => j);
      setMsg('가져왔습니다.');
    } catch (e) {
      setMsg(`가져오지 못했습니다: ${String(e)}`);
    }
  };

  const push = async () => {
    setBusy(true);
    try {
      writeGitHub(gh);
      const url = await pushJournal(journal, gh);
      setMsg(`GitHub에 저장했습니다. ${url}`);
    } catch (e) {
      setMsg(`보내지 못했습니다: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // percent helpers
  const P = (x: number) => Number((x * 100).toFixed(4));
  return (
    <div className="page">
      {msg && <div className="banner">{msg}</div>}
      <div className="grid-2">
        <Panel title="기록 내보내기">
          <p>기록은 이 브라우저에만 있습니다. Claude가 리뷰하려면 <code>journal/journal.json</code>으로 레포에 올려야 합니다.</p>
          <div className="btn-row">
            <button className="primary" onClick={() => downloadJournal(journal)}>journal.json 받기</button>
            <button onClick={() => file.current?.click()}>가져오기</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
          <p className="fine">받은 파일을 GitHub 웹에서 레포의 <code>journal/</code> 폴더에 올리면 됩니다(같은 이름으로 덮어쓰기).</p>
          <h3 className="sub">버튼 한 번으로 보내기 (선택)</h3>
          <p className="fine">GitHub → Settings → Developer settings → Fine-grained tokens에서 <b>이 레포 하나</b>에 <b>Contents: Read and write</b>만 준 토큰을 만드세요. 토큰은 이 브라우저에만 저장되고 기록 파일에는 들어가지 않습니다.</p>
          <div className="row">
            <label>소유자<input value={gh.owner} onChange={(e) => setGh({ ...gh, owner: e.target.value })} /></label>
            <label>레포<input value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value })} /></label>
            <label>브랜치<input value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value })} /></label>
          </div>
          <label>토큰<input type="password" autoComplete="off" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value })} /></label>
          <div className="btn-row">
            <button className="primary" disabled={!gh.token || busy} onClick={push}>{busy ? '보내는 중…' : 'GitHub에 기록 보내기'}</button>
            <button onClick={() => { writeGitHub(null); setGh({ ...gh, token: '' }); setMsg('토큰을 지웠습니다.'); }}>토큰 지우기</button>
          </div>
        </Panel>

        <Panel title="모의 매매 설정">
          <p className="fine">체결은 기록에서 매번 다시 계산하므로, 여기서 바꾸면 <b>지난 체결과 잔고도 새 설정으로 다시 계산</b>됩니다.</p>
          <div className="row">
            <NumField label="시작 원화" value={s.startCash.KRW} suffix="원" onChange={(n) => set((x) => ({ ...x, startCash: { ...x.startCash, KRW: n } }))} />
            <NumField label="시작 달러" value={s.startCash.USD} suffix="$" onChange={(n) => set((x) => ({ ...x, startCash: { ...x.startCash, USD: n } }))} />
          </div>
          <div className="row">
            <NumField label="슬리피지" value={P(s.slippage)} suffix="%" onChange={(n) => set((x) => ({ ...x, slippage: n / 100 }))} />
            <NumField label="지정가 유효(거래일)" value={s.validDays} onChange={(n) => set((x) => ({ ...x, validDays: Math.max(1, Math.round(n)) }))} />
          </div>
          <div className="row">
            <NumField label="한국 수수료" value={P(s.fees.KR.commission)} suffix="%" onChange={(n) => set((x) => ({ ...x, fees: { ...x.fees, KR: { ...x.fees.KR, commission: n / 100 } } }))} />
            <NumField label="한국 거래세(매도)" value={P(s.fees.KR.tax)} suffix="%" onChange={(n) => set((x) => ({ ...x, fees: { ...x.fees, KR: { ...x.fees.KR, tax: n / 100 } } }))} />
          </div>
          <div className="row">
            <NumField label="미국 수수료" value={P(s.fees.US.commission)} suffix="%" onChange={(n) => set((x) => ({ ...x, fees: { ...x.fees, US: { ...x.fees.US, commission: n / 100 } } }))} />
          </div>
          <div className="btn-row">
            <button onClick={() => { if (confirm('설정을 기본값으로 되돌릴까요?')) set(() => structuredClone(DEFAULT_SETTINGS)); }}>기본값으로</button>
            <button className="danger" onClick={() => { if (confirm('모든 주문·예측·리플레이 기록을 지웁니다. 먼저 내보내기를 했나요?')) update(() => emptyJournal()); }}>기록 전부 지우기</button>
          </div>
          <p className="fine">기본값: 한국 수수료 0.015%, 거래세 0.20%(2026년 양도분부터 코스피·코스닥), 미국 수수료 0.25%, 슬리피지 0.1%. 실제 증권사 조건에 맞게 바꾸세요.</p>
        </Panel>
      </div>
    </div>
  );
}
