-- ============================================
-- 2026-05-18 · influencer_searches 테이블 + influencer_outreach.starred 컬럼
-- ============================================
--
-- PR-A: 인플루언서 탐색 — 상태 영속 + 검색 이력 + 즐겨찾기
-- (docs/instagram-audit-2026-05-18.md §3 PR-A · §6 세부 1)
--
-- 추가 사항:
--   1. influencer_searches 테이블 신설 — 검색 이력 저장 (최근 5건 재실행)
--   2. influencer_outreach.starred 컬럼 추가 — ★ 즐겨찾기
--
-- 적용 DB: next-app DB only (winaid-internal-seoul).
--   public-app DB 에는 influencer_outreach 자체가 없음 → 본 마이그레이션 미적용.
--   public-app 인플루언서 신설(PR-E)은 별도 마이그레이션 (public-app-sql/).
--
-- 스키마 결정 (사용자 GO 사인 2026-05-18):
--   hospital_id 가 아니라 hospital_name TEXT 로 통일 — 기존 influencer_outreach
--   와 동일 키 사용. 양 테이블 hospital_name 으로 join 가능. 프론트는 이미
--   hospital_id 키에 hospital_name 값 담아 보내는 contract 그대로 사용.
--
-- 멱등성: 모든 DDL 에 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--   두 번 RUN 해도 에러 0.
--
-- 적용 순서 (작업자):
--   1. 본 PR 머지 → Vercel 자동 재배포
--   2. winaid-internal-seoul Dashboard SQL Editor 에 본 파일 paste + RUN
--   3. 검증 SQL (하단) 실행

-- ── 1. influencer_searches 테이블 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.influencer_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 기존 influencer_outreach 와 동일 키. join 가능.
  hospital_name TEXT NOT NULL,
  -- 검색 query·필터 전체 JSON (location, hashtags, follower_min/max,
  --   categories, min_engagement_rate). 클라이언트가 그대로 복원 사용.
  search_params JSONB NOT NULL,
  -- 검색 결과 카운트 — 사이드 패널 "결과 N명" 표시용
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스: 사이드 패널 "최근 5건" 쿼리 (hospital_name 필터 + created_at desc)
CREATE INDEX IF NOT EXISTS idx_influencer_searches_hospital_created
  ON public.influencer_searches (hospital_name, created_at DESC);

-- ── 2. influencer_outreach.starred 컬럼 추가 ─────────────────────────

ALTER TABLE public.influencer_outreach
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;

-- 인덱스: 즐겨찾기만 필터링 시 부분 인덱스 (대부분 row 가 false 라 가벼움)
CREATE INDEX IF NOT EXISTS idx_influencer_outreach_starred
  ON public.influencer_outreach (hospital_name, username)
  WHERE starred = true;

-- ── 3. RLS (influencer_rls.sql 기존 패턴 답습) ───────────────────────

ALTER TABLE public.influencer_searches ENABLE ROW LEVEL SECURITY;

-- 방어적 — 동일 이름 정책이 이미 있으면 정리
DROP POLICY IF EXISTS "influencer_searches_service_all"
  ON public.influencer_searches;

-- service_role 만 허용. anon/authenticated 는 정책 없음 → 자동 차단.
-- 모든 API 라우트가 supabaseAdmin (service_role) 으로 접근 강제.
CREATE POLICY "influencer_searches_service_all"
  ON public.influencer_searches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 검증 SQL (작업자가 RUN) ────────────────────────────────────────
--
-- 1. influencer_searches 테이블 + RLS:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname = 'influencer_searches' AND relnamespace = 'public'::regnamespace;
-- 기대: 1 row, relrowsecurity = t
--
-- 2. 정책 정확히 1개 (service_role):
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE tablename = 'influencer_searches';
-- 기대: 1 row — 'influencer_searches_service_all', cmd='ALL', roles='{service_role}'
--
-- 3. influencer_outreach.starred 컬럼:
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_name = 'influencer_outreach' AND column_name = 'starred';
-- 기대: starred / boolean / NO / false
--
-- 4. 인덱스 2개 추가됨:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('influencer_searches', 'influencer_outreach');
-- 기대: idx_influencer_searches_hospital_created + idx_influencer_outreach_starred 포함


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시)
-- ============================================
-- DROP POLICY IF EXISTS "influencer_searches_service_all" ON public.influencer_searches;
-- DROP TABLE IF EXISTS public.influencer_searches;
-- DROP INDEX IF EXISTS public.idx_influencer_outreach_starred;
-- ALTER TABLE public.influencer_outreach DROP COLUMN IF EXISTS starred;
--
-- ⚠️ 롤백 시 검색 이력 + 즐겨찾기 데이터 손실.
