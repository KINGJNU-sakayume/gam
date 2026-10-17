# gam · 감

혼자 쓰는 **스윙 매매 연습장**입니다. 실제 돈과 실제 주문은 없습니다.

- **모의 매매**: 한국·미국 관심 종목을 일봉 기준으로 체결합니다. 호가 단위, 가격 제한폭, 수수료, 거래세, 슬리피지를 반영합니다.
- **블라인드 리플레이**: 종목명과 날짜를 가린 과거 차트를 하루씩 넘기며 매매합니다. 끝나면 정체를 공개합니다.
- **예측과 채점**: 나와 AI가 같은 형식으로 20거래일 뒤를 예측하고, 같은 규칙으로 채점됩니다(Brier, 80% 구간 적중률, 보정표).
- **AI 노트**: Claude Code가 매일 요약 카드를 읽고 노트·예측을 씁니다. 주말에는 내 기록을 리뷰합니다. API 결제는 없습니다.

> 연습용 도구입니다. 화면의 노트와 예측은 투자 권유가 아닙니다.

주소: `https://kingjnu-sakayume.github.io/gam/` (아래 처음 설정 후)

## 처음 설정 (한 번)

1. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
2. **Settings → Actions → General → Workflow permissions**를 **Read and write**로 바꿉니다. 수집 작업이 데이터를 커밋해야 합니다.
3. **Actions → Update data → Run workflow**로 첫 수집을 돌립니다. 끝나면 사이트가 배포됩니다.

이후에는 평일 16:10(한국장 마감 후)과 06:30(미국장 마감 후, KST)에 자동으로 수집합니다.

## 쓰는 흐름

1. **오늘**: 시장 지도, AI 시장 노트, 관심 종목 표(유사 패턴 상승 비율과 기저율을 나란히)를 봅니다.
2. **종목**: 차트를 보고 모의 주문과 내 예측을 남깁니다. 주문은 다음 거래일 일봉으로 체결이 정해집니다.
3. **계좌 / 예측 성적**: 다시 계산된 잔고, 손익, 나 vs AI 성적을 봅니다.
4. **리플레이**: 무작위 회차나 해설이 있는 회차로 연습합니다.
5. **설정 → 기록 내보내기**: `journal/journal.json`을 레포에 올리면 Claude가 리뷰합니다. 개인 토큰을 넣으면 버튼 한 번으로 올라갑니다.

기록은 브라우저(localStorage)에만 있으니 가끔 내보내기로 보관하세요.

## 관심 종목 바꾸기

`config/watchlist.json`을 고치고 커밋한 뒤 **Update data**를 실행합니다. `yahoo`에는 Yahoo Finance 심볼을 씁니다. 한국은 `005930.KS`(코스피), `035720.KQ`(코스닥) 형식입니다.

## Claude와 함께

이 레포를 Claude Code에서 열고 말하면 됩니다.

- "오늘 노트 써줘" → `daily-note`
- "이번 주 내 매매 리뷰해줘" → `weekly-review`
- "실적 쇼크 리플레이 회차 만들어줘" → `make-replay`

매일 자동으로 돌리려면 Claude 예약 작업으로 "gam 레포에서 daily-note 스킬 실행"을 평일 아침에 걸어 둡니다.

## 개발

```bash
npm install
npm run sample      # 합성 샘플 데이터 → sample-data/ (배포되지 않음)
npm run preview     # http://127.0.0.1:4173/?sample
npm test            # 체결·예측·리플레이 엔진 (Bun)
npm run test:pipeline
npm run typecheck
```

| 폴더 | 내용 |
|---|---|
| `docs/` | 설계 정본: 데이터 형식, 체결 규칙, 채점 규칙, AI 규칙 |
| `config/` | 관심 종목, 수집·노트 설정 |
| `pipeline/` | Python 수집·지표·유사 패턴·요약 카드 |
| `public/data/` | 수집 결과와 AI 노트 (사이트가 그대로 읽음) |
| `src/engine/` | 체결 정산, 호가 단위, 예측 채점 (순수 함수) |
| `src/replay/` | 블라인드 리플레이 |
| `scripts/` | 빌드, 노트 검사, Claude용 요약 스크립트 |
| `.claude/skills/` | Claude 스킬 |

시세는 Yahoo Finance(`yfinance`)를 쓰고, 한국 종목은 FinanceDataReader를 예비로 둡니다. 둘 다 비공식 출처라서, 한국투자증권 계좌가 생기면 그 API로 바꿀 계획입니다(`docs/00_VISION.md` M4).
