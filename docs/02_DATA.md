# 데이터

모든 데이터는 `public/data/` 아래 JSON이다. 사이트는 같은 경로(`data/…`)로 읽는다.

## 종목 ID

`<시장>:<코드>` — `KR:005930`, `US:NVDA`, 지수는 `IX:KOSPI`, 환율은 `FX:USDKRW`. 파일 이름은 `:`를 `-`로 바꾼다(`KR-005930.json`).

## `config/watchlist.json`

```json
{
  "indices": [{ "id": "IX:KOSPI", "name": "코스피", "yahoo": "^KS11", "currency": "KRW" }],
  "stocks":  [{ "id": "KR:005930", "name": "삼성전자", "yahoo": "005930.KS", "market": "KOSPI", "currency": "KRW" }]
}
```
`market`은 `KOSPI | KOSDAQ | NASDAQ | NYSE`. 수수료·세금과 호가 단위가 여기서 갈린다.

## `public/data/prices/<id>.json` — 일봉 (열 형식)

```json
{ "id": "KR:005930", "asOf": "2026-10-16",
  "d": ["2016-10-17", …], "o": […], "h": […], "l": […], "c": […], "v": […],
  "f": [1, …] }
```
- `o h l c`는 **수정되지 않은** 실제 가격이다. 모의 체결은 이 가격으로 한다.
- `f`는 수정 계수(`수정 종가 / 종가`). 지표와 유사 패턴은 `가격 × f`로 계산한다(분할·배당으로 끊기지 않게).
- 약 10년치. 매 수집마다 전체를 다시 받는다(수정 계수가 바뀔 수 있으므로).

## `public/data/cards/latest.json` — 오늘의 요약 카드

수집 직후 계산한다. AI는 원본 대신 이 카드를 읽는다.

```json
{ "asOf": { "KR": "2026-10-16", "US": "2026-10-16" }, "generatedAt": "…",
  "cards": [{
    "id": "US:NVDA", "date": "2026-10-16", "close": 0, "chg1d": 0, "chg5d": 0, "chg20d": 0,
    "sma": { "20": 0, "60": 0, "120": 0 }, "rsi14": 0, "atrPct": 0, "volRatio20": 0,
    "from52wHigh": 0, "from52wLow": 0,
    "pattern": { "window": 40, "horizon": 20, "matches": 30, "upShare": 0, "median": 0, "p10": 0, "p90": 0 },
    "baseRate": { "horizon": 20, "samples": 0, "upShare": 0, "median": 0, "p10": 0, "p90": 0 },
    "flags": ["volume-spike", "new-52w-high"],
    "history": 0
  }] }
```
- 수익률은 소수(0.031 = 3.1%).
- `pattern`: 최근 40거래일의 모양과 가장 비슷한 과거 구간(같은 관심 종목 전체에서, 서로 겹치지 않게 30개) 뒤 20거래일 수익률 분포.
- `baseRate`: 같은 종목의 지난 5년 아무 날에서나 20거래일 수익률 분포. 유사 패턴은 **언제나 기저율과 나란히** 보여준다.
- 데이터가 부족하면(`history` < 260) `pattern`은 `null`이고 화면에 "데이터 부족"이라고 쓴다.
- `flags`: `volume-spike`(거래량 20일 평균의 2배 이상), `big-move`(일간 변동이 ATR의 2배 이상), `new-52w-high`, `new-52w-low`, `cross-sma60-up`, `cross-sma60-down`, `rsi-overbought`(70 이상), `rsi-oversold`(30 이하).

## `public/data/notes/` — AI 노트

Claude가 쓰고 커밋한다(`docs/05`).

- `latest.json`: 가장 최근 매일 노트 묶음
- `daily/<YYYY-MM-DD>.json`: 날짜별 보관
- `forecasts.json`: 모든 AI 예측의 누적 목록(`docs/04` 형식). 사이트가 이 파일로 AI 성적을 채점한다.
- `replays/index.json`, `replays/<id>.json`: 큐레이션 리플레이 회차
- `reviews/latest.json`, `reviews/<YYYY-MM-DD>.json`: 내 기록 리뷰 (`{ date, period, summary, sections: [{title, text}] }`)

유사 패턴의 미래 수익률은 변동성 보정한다: 과거 구간의 수익률에 (지금 40일 변동성 ÷ 그 구간의 40일 변동성)을 로그 수익률 기준으로 곱한다. 조용한 종목과 거친 종목의 같은 모양을 비교할 수 있게 하기 위해서다.

```json
{ "date": "2026-10-17", "model": "claude", "written": "2026-10-17T07:05:00+09:00",
  "market": "시장 전체 3–5문장",
  "notes": [{ "id": "US:NVDA", "changed": true, "text": "…", "sources": [{ "title": "…", "url": "…" }] }],
  "forecasts": [{ "id": "US:NVDA", "madeAfter": "2026-10-16", "horizon": 20, "pUp": 0.55, "low": -0.08, "high": 0.12, "why": "…" }] }
```

## `journal/journal.json` — 내 기록 (사이트에서 내보냄)

`src/engine/types.ts`의 `Journal` 형식. 주문, 취소, 예측, 메모, 리플레이 결과가 들어 있다. 체결과 잔고는 들어 있지 않다(다시 계산하므로).
