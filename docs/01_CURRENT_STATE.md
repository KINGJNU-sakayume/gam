# 현재 상태

- 단계: **M1 구현 중**
- 시세 출처: Yahoo Finance(`yfinance`), 한국 종목은 FinanceDataReader를 예비로 둔다. 한국투자증권 계좌가 생기면 M4에서 교체한다.
- 공시·뉴스: 아직 수집하지 않는다. 매일 노트 작성 시 Claude가 큰 변화가 있는 종목만 웹에서 조사하고 URL을 단다(`docs/05`).
- 확인되지 않은 것: 실제 GitHub Actions에서의 첫 수집. 개발 환경에서는 외부 시세 사이트에 접속할 수 없어 합성 샘플 데이터로만 시험했다.

## 다음 할 일

1. GitHub에 레포를 올리고 Pages(Source: GitHub Actions)를 켠다.
2. **Actions → Update data → Run workflow**로 첫 수집을 확인한다.
3. Claude Code 예약 작업으로 `daily-note`를 매일 07:00(KST)에 돌린다.
