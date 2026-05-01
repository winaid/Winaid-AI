# Seoul migration — next-app (internal) chunks

Tokyo (ap-northeast-1) → Seoul (ap-northeast-2) winaid-internal-seoul.

## Target: 16 tables (Tokyo 18 - 2 dead)

api_rate_limit, api_usage_logs, diagnostic_history, diagnostic_public_shares,
diagnostic_stream_cache, generated_posts, hospital_crawled_posts, hospital_images,
hospital_style_profiles, hospitals, internal_feedbacks, llm_batches, profiles,
subscriptions, teams, user_credits

## 적용 순서

| # | 파일 | 동작 |
|---|---|---|
| 1 | `01_setup.sql` | bootstrap (sections 0/1-6/9/10) + hospital-images + feedback-images 버킷 |
| 2 | `02_legacy.sql` | legacy 11개 (admin RPC 포함, blog_history/medical_law_cache 제외) |
| 3 | `03_2026-03.sql` | dated 2026-03 12개 (teams/hospitals/internal_feedbacks 포함) |
| 4 | `04_2026-04.sql` | dated 2026-04 13개 (image_library_team_share 포함, influencer_outreach 제외) |

## 분류 결과

총 source 파일 42개 중:
- INCLUDE 37개 (1 bootstrap + 11 legacy + 12 dated 2026-03 + 13 dated 2026-04)
- SKIP 5개 (DEAD):
  - `supabase_migration_blog_history.sql`
  - `supabase_migration_blog_history_fixed.sql`
  - `supabase_migration_medical_law_cache.sql`
  - `2026-04-08_influencer_outreach.sql`
  - `supabase_check_style_profiles_integrity.sql` (check script, not migration)
- SKIP setup overlap (1):
  - `sql/setup/supabase_FULL_SETUP.sql` (bootstrap_new_supabase.sql 와 겹침)

## Idempotency 가드 (자동 주입)

| chunk | fn DROPs | policy DROPs | INDEX rewrites | tables reconciled | cols added |
|---|---|---|---|---|---|
| A setup | 10 | 36 | 0 | 6 | 76 |
| B legacy | 21 | 22 | 0 | 4 | 53 |
| C 2026-03 | 10 | 11 | 0 | 4 | 25 |
| D 2026-04 | 3 | 21 | 0 | 6 | 63 |
| **합계** | **44** | **90** | **0** | **20** | **217** |

## 처리한 패턴 (외부 작업과 동일)

1. CREATE FUNCTION → DROP FUNCTION IF EXISTS sig CASCADE 직전 주입
2. CREATE POLICY → DROP POLICY IF EXISTS name ON table 직전 주입
3. bare CREATE INDEX → CREATE INDEX IF NOT EXISTS rewrite (내부엔 0건)
4. CREATE TABLE → 직후 ALTER ADD COLUMN IF NOT EXISTS 컬럼 reconciliation
