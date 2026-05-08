# `_archive/seoul/` — 아카이브된 legacy 스키마 (재적용 금지)

본 폴더는 과거 winaid-internal-seoul Supabase 프로젝트의 1회성 시드/legacy
SQL 들을 보존만을 위해 보관한다. **운영 DB 에 절대 다시 적용하지 말 것.**

## 자동화 차단 가드

각 `.sql` 파일 최상단에 다음 가드가 prepend 되어 있어, 운영자 또는 자동화 도구가
실수로 적용하더라도 차단된다:

```sql
\echo 'ERROR: archived legacy schema, do not apply'
\q
DO $$ BEGIN RAISE EXCEPTION 'archived legacy schema — do not apply'; END $$;
```

- `\echo` / `\q` — psql 클라이언트가 즉시 stdout 메시지 출력 후 종료.
- `DO $$ ... RAISE EXCEPTION` — Supabase Dashboard SQL Editor 등 backslash
  meta-command 를 무시하는 클라이언트에서도 첫 statement 가 RAISE EXCEPTION
  으로 실행 → 트랜잭션 abort.

두 라인 모두 있어야 어떤 클라이언트에서도 적용을 막을 수 있다.

## 파일 목록 (참고용)

| 파일 | 원래 의도 |
|---|---|
| `internal/01_setup.sql` | winaid-internal-seoul 초기 부트스트랩 (구버전). 현행은 `sql/bootstrap_new_supabase.sql` 참고. |
| `internal/02_legacy.sql` | RPC / RLS / 트리거 일괄 — 다수가 이미 후속 마이그레이션으로 대체됨. |
| `internal/03_2026-03.sql` | 2026-03 누적 변경. 마이그레이션으로 분해되어 `sql/migrations/` 에 흡수됨. |
| `internal/04_2026-04.sql` | 2026-04 누적 변경. 동일. |

## 왜 보존하나

- 회귀 분석 시 "예전엔 이랬다" 비교용.
- 일부 운영 환경 history 가 본 파일들 기반이라, 운영 DB pg_proc dump 와 비교할
  근거 자료.

## 정말 적용해야 한다면

상단 가드를 임시로 주석 처리한 후 운영자 책임으로 적용. 하지만 99% 의 경우는
신환경 부트스트랩 (`sql/bootstrap_new_supabase.sql`) + 정식 마이그레이션
(`sql/migrations/`) 만으로 충분하다. 본 폴더 적용은 사실상 사고 복구 외에는
필요 없다.
