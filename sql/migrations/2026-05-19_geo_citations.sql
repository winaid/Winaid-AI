-- ============================================
-- 2026-05-19 · geo_citations 테이블 (PR GEO-1.1 — ChatGPT + Gemini MVP)
-- ============================================
--
-- 목적: AI 인용 출처 역추적기.
--   "어떤 게시물을 써야 AI 검색에서 인용되는지" 에 직접 답하는 어드민 도구.
--   ChatGPT (OpenAI web search) + Gemini (Google Search grounding) 두 모델 병렬 호출
--   → 모델별로 row 1건씩 저장. 추후 PR GEO-1.2 (자동 cron + 패턴 분류) 위한 base.
--
-- 적용 DB: next-app DB only (winaid-internal-seoul).
--   public-app 미접촉 (어드민 전용 도구).
--
-- 멱등성: 모든 DDL IF NOT EXISTS / DROP POLICY IF EXISTS.
--   두 번 RUN 해도 에러 0.

-- ── 1. geo_citations 테이블 ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 캠페인 단위 분석 (옵션) — 본 MVP 에선 nullable, 후속 PR 에서 캠페인 entity 도입 가능
  campaign_id UUID,
  -- 병원 식별자 — 기존 influencer_outreach 와 동일 키 컨벤션 (hospital_name TEXT)
  hospital_name TEXT NOT NULL,
  -- 운영자가 입력한 자연어 쿼리 (sanitizePromptInput 500자 cap 통과 후 저장)
  query TEXT NOT NULL,
  -- 'chatgpt' 또는 'gemini' — application-level whitelist + DB CHECK 이중.
  -- 후속 PR 에서 추가 모델 (perplexity 제외 — 사용자 결정) 도입 시 CHECK ALTER 마이그레이션.
  ai_model TEXT NOT NULL CHECK (ai_model IN ('chatgpt', 'gemini')),
  -- 전체 답변 (stripPromptLeakage 통과 후 저장)
  answer_text TEXT NOT NULL,
  -- citations 배열: [{ url, title?, snippet?, paragraph_index?, is_ours? }, ...]
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 분석 시점의 "우리 도메인 list" — is_ours 매칭 기준 (시점 보존)
  our_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin'
);

-- ── 2. 인덱스 ────────────────────────────────────────────────────────

-- "최근 분석 50건" 쿼리 — UI history 패널
CREATE INDEX IF NOT EXISTS idx_geo_citations_hospital_created
  ON public.geo_citations (hospital_name, created_at DESC);

-- 캠페인별 조회 (후속 PR 캠페인 entity 도입 시)
CREATE INDEX IF NOT EXISTS idx_geo_citations_campaign_created
  ON public.geo_citations (campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

-- 모델별 비교 — "ChatGPT 와 Gemini 의 인용 정답률 분포" 분석용
CREATE INDEX IF NOT EXISTS idx_geo_citations_model_created
  ON public.geo_citations (ai_model, created_at DESC);

-- GIN on citations — jsonb path queries (예: 특정 도메인 인용 사례 검색)
CREATE INDEX IF NOT EXISTS idx_geo_citations_citations_gin
  ON public.geo_citations USING GIN (citations);

-- ── 3. RLS (influencer_rls.sql 기존 패턴 답습) ───────────────────────

ALTER TABLE public.geo_citations ENABLE ROW LEVEL SECURITY;

-- 방어적 — 동일 이름 정책이 이미 있으면 정리
DROP POLICY IF EXISTS "geo_citations_service_all"
  ON public.geo_citations;

-- service_role 만 허용. anon/authenticated 는 정책 없음 → 자동 차단.
-- 모든 API 라우트가 supabaseAdmin (service_role) 으로 접근 강제.
CREATE POLICY "geo_citations_service_all"
  ON public.geo_citations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 검증 SQL (작업자가 RUN) ────────────────────────────────────────
--
-- 1. 테이블 + RLS:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname = 'geo_citations' AND relnamespace = 'public'::regnamespace;
-- 기대: 1 row, relrowsecurity = t
--
-- 2. CHECK 제약:
-- INSERT INTO geo_citations (hospital_name, query, ai_model, answer_text)
--   VALUES ('test', 'q', 'perplexity', 'a');
-- 기대: ERROR — CHECK 'ai_model IN (chatgpt, gemini)' 위반
--
-- 3. 정책 정확히 1개 (service_role):
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE tablename = 'geo_citations';
-- 기대: 1 row — 'geo_citations_service_all', cmd='ALL', roles='{service_role}'
--
-- 4. 인덱스 4개:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'geo_citations';
-- 기대: hospital_created + campaign_created + model_created + citations_gin


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시)
-- ============================================
-- DROP POLICY IF EXISTS "geo_citations_service_all" ON public.geo_citations;
-- DROP INDEX IF EXISTS public.idx_geo_citations_citations_gin;
-- DROP INDEX IF EXISTS public.idx_geo_citations_model_created;
-- DROP INDEX IF EXISTS public.idx_geo_citations_campaign_created;
-- DROP INDEX IF EXISTS public.idx_geo_citations_hospital_created;
-- DROP TABLE IF EXISTS public.geo_citations;
--
-- ⚠️ 롤백 시 모든 인용 분석 이력 손실.
