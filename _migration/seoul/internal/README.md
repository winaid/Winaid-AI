# Seoul migration — next-app (internal) chunks v2

Tokyo (ap-northeast-1) → Seoul (ap-northeast-2) winaid-internal-seoul.

## v1 → v2 변경

v1 chunk A 적용 시 `generated_posts_workflow_type_check` constraint
duplicate 에러 발생. ADD COLUMN reconciliation 가 inline CHECK 까지
포함해서 CREATE TABLE 의 inline CHECK 와 같은 이름의 auto-named
constraint 충돌.

**v2 fix**: column reconciliation 이 ADD COLUMN 에서 다음 column-level
constraint 모두 strip:
- CHECK (...)
- PRIMARY KEY
- UNIQUE
- REFERENCES ... ON DELETE/UPDATE ...

기본 type + DEFAULT + NOT NULL 만 유지. constraint 는 CREATE TABLE 의
inline 정의로 충분히 보존됨.

## 적용 순서 (00 wipe → 01 setup → 02 → 03 → 04)

| # | 파일 | 동작 |
|---|---|---|
| 0 | `00_wipe.sql` | 부분 적용된 모든 테이블/함수/정책 청소 (재시도 안전) |
| 1 | `01_setup.sql` | bootstrap (sections 0/1-6/9/10) + 3 storage buckets |
| 2 | `02_legacy.sql` | legacy 11개 |
| 3 | `03_2026-03.sql` | dated 2026-03 12개 |
| 4 | `04_2026-04.sql` | dated 2026-04 13개 |

## 분류 결과

총 source 파일 42개 → INCLUDE 37 + SKIP 5 + overlap SKIP 1.
SKIP DEAD: blog_history×2 + medical_law_cache + influencer_outreach + check_style_profiles_integrity.
SKIP overlap: supabase_FULL_SETUP.sql (bootstrap 과 중복).

## Idempotency 가드 (v2 자동 주입)

| chunk | fn DROPs | policy DROPs | tables reconciled | cols added |
|---|---|---|---|---|
| A setup | 10 | 36 | 6 | 76 |
| B legacy | 21 | 22 | 4 | 53 |
| C 2026-03 | 10 | 11 | 4 | 25 |
| D 2026-04 | 3 | 21 | 6 | 63 |
| **합계** | **44** | **90** | 20 | **217** |
