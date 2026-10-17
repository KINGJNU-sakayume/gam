# gam — Claude 작업 안내

혼자 쓰는 스윙 매매 연습 사이트. 정적 사이트(GitHub Pages) + 데이터 수집(GitHub Actions) + Claude 노트.

- 설계 정본은 `docs/`다. 바꿀 때는 문서를 먼저 고친다. 시작은 `docs/01_CURRENT_STATE.md`.
- AI 노트 규칙(사실, 권유 금지, 스포일러 금지, 토큰 절약): `docs/05_AI_RULES.md`
- 스킬:
  - `daily-note`: 매일 노트와 AI 예측
  - `weekly-review`: 내 기록 리뷰
  - `make-replay`: 해설 있는 리플레이 회차

## 명령

| 명령 | 용도 |
|---|---|
| `npm run build` | 사이트 빌드 → `dist/` |
| `npm run preview` | 샘플 데이터로 로컬 미리보기 (`npm run sample` 먼저) |
| `npm test` | 엔진 테스트(Bun) |
| `npm run test:pipeline` | 수집·계산 테스트(Python) |
| `npm run typecheck` | 타입 검사 |
| `node scripts/check-notes.mjs` | 노트 형식·스포일러 검사 |
| `npx tsx scripts/review-input.ts` | 내 기록·예측 성적 요약 |
| `npx tsx scripts/replay-window.ts` | 리플레이 한 시점의 가린 데이터 |

## 지킬 것

- `public/data/prices/`, `cards/`, `index.json`, `status.json`은 수집 작업만 쓴다. 손으로 고치지 않는다.
- 합성 샘플 데이터(`sample-data/`)는 절대 `public/data/`에 넣지 않는다.
- 체결·잔고·성적은 저장하지 않고 다시 계산한다. 그 결과를 파일로 저장하는 기능을 만들지 않는다.
