---
name: daily-note
description: gam의 매일 AI 노트를 쓸 때 사용한다. "오늘 노트 써줘", "daily note", 예약 작업의 매일 실행. 요약 카드를 읽고, 변화가 있는 종목만 웹에서 짧게 조사하고, 시장·종목 노트와 AI 예측을 써서 커밋한다.
---

# 매일 노트

규칙의 정본은 `docs/05_AI_RULES.md`다. 이 스킬은 순서만 정한다.

## 0. 준비

1. `git pull --ff-only`로 최신 데이터를 받는다.
2. `config/settings.json`의 `ai.cadence`를 본다.
   - `daily`: 매일 쓴다.
   - `tue-thu`: 오늘이 화·목·토(KST)가 아니면 "오늘은 쉬는 날"이라고 보고하고 끝낸다.
   - `weekly`: 토요일이 아니면 끝낸다.
3. `public/data/status.json`을 본다. 실패한 종목이 있으면 노트의 시장 글 끝에 한 줄로 밝힌다("SPCX 시세 수집 실패").

## 1. 읽기 (원본 일봉 파일을 통째로 읽지 않는다)

1. `public/data/cards/latest.json`: 모든 카드
2. `npx tsx scripts/review-input.ts --ai-only`: AI 예측의 지난 성적과 진행 중인 예측
3. 이전 노트 `public/data/notes/latest.json`이 있으면 읽는다(어제와 같은 말 반복 금지).

## 2. 종목 분류

- **changed**: `flags`가 하나라도 있거나, `|chg1d| ≥ atrPct`인 종목
- 나머지: `changed: false`, 노트는 한 문장(예: "특별한 신호 없음. 20일선 위 유지.")

## 3. 조사 (최대 `ai.maxWebResearchPerDay`종목, 기본 3)

1. changed 종목 중 변동이 큰 순서로 고른다.
2. 종목마다 WebSearch 1–2번으로 그날의 이유를 찾는다(실적, 공시, 업종 뉴스, 지수 움직임).
3. 찾은 사실만 쓰고 URL을 `sources`에 단다.
4. 이유를 못 찾으면 "뚜렷한 뉴스는 확인하지 못함"이라고 쓴다. 짐작으로 이유를 만들지 않는다.

## 4. 쓰기

`public/data/notes/latest.json`을 아래 형식으로 덮어쓰고, 같은 내용을 `public/data/notes/daily/<오늘 KST 날짜>.json`에도 쓴다.

```json
{ "date": "YYYY-MM-DD", "written": "<ISO, +09:00>", "model": "claude",
  "market": "한·미 시장 3–5문장. 지수 카드 숫자 인용.",
  "notes": [{ "id": "US:NVDA", "changed": true, "text": "3–5문장", "sources": [{ "title": "…", "url": "https://…" }] }] }
```

종목 노트 한 편의 순서:
1. 무슨 일이 있었나(숫자)
2. 왜(출처가 있을 때만)
3. 오를 이유 한 가지와 내릴 이유 한 가지
4. 이 시나리오가 틀렸다고 볼 신호

유사 패턴을 말할 때는 기저율과 표본 수를 함께 쓴다.

## 5. AI 예측

`public/data/notes/forecasts.json`(목록, 없으면 `[]`로 만든다)에 **진행 중인 AI 예측이 없는 종목만** 새 예측을 덧붙인다. 진행 중인지는 1-2의 `open` 목록으로 안다.

```json
{ "id": "ai-<YYYYMMDD>-<ticker코드>", "by": "ai", "ticker": "US:NVDA", "madeAfter": "<카드의 date>", "horizon": 20,
  "pUp": 0.55, "low": -0.09, "high": 0.12, "why": "한 줄" }
```

- 시작점은 카드의 `baseRate`이고, 유사 패턴·추세·뉴스로 조금만 조정한다. `pUp`은 보통 0.35–0.65다.
- `low`/`high`는 80% 구간이다. 기저율 p10/p90에서 크게 벗어나지 않는다.
- 지난 성적의 `coverage80`이 0.7 미만이면 구간을 넓히고, 0.9를 넘으면 좁힌다. Brier가 0.25보다 나쁘면 확률을 0.5 쪽으로 당긴다. 이 조정은 시장 글에 한 줄로 밝힌다.
- 종목 노트에 그 예측을 한 문장으로 언급한다.

## 6. 확인과 커밋

1. `node scripts/check-notes.mjs`가 통과해야 한다.
2. 커밋 메시지는 `notes: daily YYYY-MM-DD`로 하고 `main`에 푸시한다(Pages 배포가 따라 돈다).
   - `main` 푸시가 막히면 브랜치로 푸시하고 PR을 연다.
3. 사용자에게 보고한다: changed 종목 수, 조사한 종목, 새 AI 예측 수, 확인하지 못한 것.
