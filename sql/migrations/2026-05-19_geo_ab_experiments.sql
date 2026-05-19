-- ============================================
-- 2026-05-19 · geo_ab_experiments 테이블 군 (PR GEO-13 — A/B 테스트 인프라)
-- ============================================
--
-- 목적: 동일 주제·다른 콘텐츠 형식 variant 들을 실제 운영하면서 4주간 AI 인용률·
--   네이버 노출률 차이를 측정·비교. 결과는 GEO-3 (쿼리-콘텐츠 룰북) 의 데이터 소스.
--
-- 적용 DB: next-app DB only (winaid-internal-seoul) — 어드민 도구.
--   public-app 미접촉 (geo_citations 와 동일 정책).
--
-- 멱등성: 모든 DDL IF NOT EXISTS / DROP POLICY IF EXISTS. 두 번 RUN 해도 에러 0.

-- ── 1. 실험 정의 ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  hypothesis TEXT,
  hypothesis_dimension TEXT,                           -- 'hook_type' / 'faq_block' / 'list_style' 등
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','running','completed','cancelled')),
  -- collectMetrics 가 매 cron 호출 시 쿼리 list 로 ChatGPT/Gemini 답변 받음
  queries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- our_domains — 분석 시점의 is_ours 매칭 기준 (시점 보존)
  our_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin'
);

-- ── 2. 실험 variant ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.geo_ab_experiments(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,                          -- 'A' / 'B' / 자유
  format_config JSONB NOT NULL,                        -- {"hook_type":"question","faq_block":true,...}
  -- 생성된 블로그 post FK — generated_posts.id (soft reference: 강제 FK X)
  post_id UUID,
  -- 발행된 URL — collectMetrics 가 isOursUrl 매칭에 활용
  post_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_id, variant_name)
);

-- ── 3. 시계열 메트릭 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_ab_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.geo_ab_variants(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('chatgpt','gemini','naver','organic')),
  -- 본 측정에서 query 실행한 횟수 (= 분모)
  queries_run INT NOT NULL DEFAULT 0,
  -- 그 중 variant.post_url 이 인용된 횟수 (= 분자)
  citation_count INT NOT NULL DEFAULT 0,
  citation_rate NUMERIC(5,4),                          -- citation_count / queries_run (옵션 — DB 가 계산하지 않음, app 측 저장)
  naver_rank INT,                                       -- 네이버 검색 순위 (nullable)
  visit_count INT,                                      -- 트래픽 (옵션 — 4주 후 GA 연동 가능)
  raw_payload JSONB,                                    -- 원본 응답 보관 (audit)
  CHECK (queries_run >= 0),
  CHECK (citation_count >= 0),
  CHECK (citation_count <= queries_run)
);

-- ── 4. 인덱스 ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_geo_ab_exp_hospital_created
  ON public.geo_ab_experiments (hospital_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_geo_ab_exp_status
  ON public.geo_ab_experiments (status)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_geo_ab_variants_exp
  ON public.geo_ab_variants (experiment_id);

CREATE INDEX IF NOT EXISTS idx_geo_ab_metrics_variant_time
  ON public.geo_ab_metrics (variant_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_geo_ab_metrics_source_time
  ON public.geo_ab_metrics (source, measured_at DESC);

-- ── 5. RLS (geo_citations 패턴 동일) ────────────────────────────────

ALTER TABLE public.geo_ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_ab_metrics ENABLE ROW LEVEL SECURITY;

-- service_role 만 허용. anon/authenticated 정책 없음 → 자동 차단.
-- 모든 API 라우트가 supabaseAdmin (service_role) 으로 접근 강제.

DROP POLICY IF EXISTS "geo_ab_experiments_service_all"
  ON public.geo_ab_experiments;
CREATE POLICY "geo_ab_experiments_service_all"
  ON public.geo_ab_experiments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "geo_ab_variants_service_all"
  ON public.geo_ab_variants;
CREATE POLICY "geo_ab_variants_service_all"
  ON public.geo_ab_variants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "geo_ab_metrics_service_all"
  ON public.geo_ab_metrics;
CREATE POLICY "geo_ab_metrics_service_all"
  ON public.geo_ab_metrics
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 검증 SQL (작업자가 RUN) ────────────────────────────────────────
--
-- 1. 3 테이블 + RLS 켜짐:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('geo_ab_experiments','geo_ab_variants','geo_ab_metrics')
--    AND relnamespace = 'public'::regnamespace;
-- 기대: 3 row, 모두 relrowsecurity = t
--
-- 2. CHECK 제약:
-- INSERT INTO geo_ab_experiments (hospital_name, topic, status)
--   VALUES ('test', 'x', 'invalid');
-- 기대: ERROR — CHECK status 위반
--
-- 3. 정책 정확히 3개 (각 테이블 service_role 1개씩):
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename LIKE 'geo_ab_%';
-- 기대: 3 row — 각 *_service_all, cmd='ALL', roles='{service_role}'
--
-- 4. metrics CHECK 정합:
-- INSERT INTO geo_ab_metrics (variant_id, source, queries_run, citation_count)
--   VALUES (gen_random_uuid(), 'chatgpt', 5, 10);
-- 기대: ERROR — citation_count > queries_run 위반 (제약 + FK 도 위반)


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시)
-- ============================================
-- DROP POLICY IF EXISTS "geo_ab_metrics_service_all" ON public.geo_ab_metrics;
-- DROP POLICY IF EXISTS "geo_ab_variants_service_all" ON public.geo_ab_variants;
-- DROP POLICY IF EXISTS "geo_ab_experiments_service_all" ON public.geo_ab_experiments;
-- DROP TABLE IF EXISTS public.geo_ab_metrics;
-- DROP TABLE IF EXISTS public.geo_ab_variants;
-- DROP TABLE IF EXISTS public.geo_ab_experiments;
