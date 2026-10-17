---
name: weekly-review
description: gam에서 내 모의 매매·예측·리플레이 기록을 리뷰할 때 사용한다. "주간 리뷰", "내 매매 리뷰해줘", "이번 주 돌아봐줘", 토요일 예약 실행. journal/journal.json을 요약 스크립트로 읽고 잘한 점·실수·패턴·다음 주 초점을 쓴다.
---

# 기록 리뷰

규칙의 정본은 `docs/05_AI_RULES.md`다.

## 0. 준비

1. `git pull --ff-only`
2. `journal/journal.json`이 없거나 7일 넘게 바뀌지 않았으면(`git log -1 --format=%cs -- journal/journal.json`), 리뷰 대신 "사이트 설정 → 기록 내보내기로 올려 주세요"라고 보고하고 끝낸다.

## 1. 읽기

- `npx tsx scripts/review-input.ts --since <7일 전 날짜>`: 이번 주 주문, 체결, 예측, 리플레이
- `npx tsx scripts/review-input.ts`: 전체 누적 성적(맥락용)
- 원본 journal을 직접 읽어 계산하지 않는다. 숫자는 스크립트 출력에서만 쓴다.

## 2. 볼 것

1. **주문 이유와 결과**: 이유를 적은 주문과 안 적은 주문의 성적, 확신도별 승률(`byBuyConfidence`)
2. **손절과 익절**: 거부·만료된 주문, 손절 주문 없이 들고 간 포지션의 낙폭
3. **예측 보정**: 내 Brier·구간 적중률과 AI의 비교, 맞대결 결과
4. **리플레이**: 보유만 했을 때보다 나았나, 메모에 쓴 생각이 매매와 맞았나
5. **반복되는 습관**: 같은 실수가 두 번 이상이면 패턴으로 이름 붙인다(예: "신고가 추격 후 첫 음봉에 매도")

## 3. 쓰기

`public/data/notes/reviews/latest.json`(덮어쓰기)과 `public/data/notes/reviews/<오늘 날짜>.json`:

```json
{ "date": "YYYY-MM-DD", "period": "MM/DD–MM/DD",
  "summary": "3–4문장 총평",
  "sections": [
    { "title": "잘한 점", "text": "…" },
    { "title": "실수와 패턴", "text": "…" },
    { "title": "예측 보정", "text": "나 vs AI 숫자" },
    { "title": "리플레이", "text": "…" },
    { "title": "다음 주 한 가지", "text": "구체적이고 확인 가능한 한 가지 연습" }
  ] }
```

- 칭찬도 비판도 숫자와 해당 주문을 들어서 쓴다.
- "사라/팔아라" 같은 종목 권유는 하지 않는다. 습관과 과정에 대해서만 쓴다.
- 데이터가 적으면(체결 3건 미만) 결론을 내리지 않고 그렇다고 쓴다.

## 4. 확인과 커밋

`node scripts/check-notes.mjs` 통과 → `notes: weekly review YYYY-MM-DD` 커밋 → `main` 푸시. 사이트의 계좌 화면에 나온다.
