-- ============================================
-- 2026-05-19 · competitor_contents + competitor_domains (PR GEO-9 — 14 기능 9번)
-- ============================================
--
-- 목적: 경쟁사 신규 콘텐츠 자동 감지. GEO-1.1 의 geo_citations 에서 우리 사이트
--   외 hostname = 경쟁사 도메인 추출 → 그 도메인의 신규 콘텐츠 fetch (RSS / sitemap /
--   네이버 검색) → GEO-1.2 패턴 분류 → 우리 대응 콘텐츠 초안 자동 생성 trigger.
--
-- 적용 DB: 양 앱 lockstep (winaid-internal-seoul + winaid-public 둘 다 RUN).
--   회귀 가드 invariant 가 두 SQL 파일 본문 diff=0 강제.
--
-- 멱등성: 모든 DDL IF NOT EXISTS / DROP POLICY IF EXISTS. 두 번 RUN 에러 0.

-- ── 1. competitor_domains 테이블 (추적 대상 list) ─────────────────

CREATE TABLE IF NOT EXISTS public.competitor_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 우리 병원 식별자 — geo_citations.hospital_name 과 동일 키
  hospital_name TEXT NOT NULL,
  -- 경쟁사 hostname (normalized — lowercase, www 제거)
  domain TEXT NOT NULL,
  -- 발견 출처 — 'auto_citation' (geo_citations 에서 자동 추출) / 'manual' (운영자 수동 추가)
  source TEXT NOT NULL DEFAULT 'auto_citation'
    CHECK (source IN ('auto_citation', 'manual')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- UNIQUE 제약 — 같은 병원에서 같은 도메인 중복 추가 방지
  UNIQUE (hospital_name, domain)
);

-- ── 2. competitor_contents 테이블 (감지된 신규 콘텐츠) ─────────────

CREATE TABLE IF NOT EXISTS public.competitor_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  -- 경쟁사 hostname (competitor_domains.domain 과 동일 정규화)
  competitor_domain TEXT NOT NULL,
  -- 신규 콘텐츠 URL (절대)
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  -- 우리 시스템이 발견한 시간 (감지 trigger 시점)
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 콘텐츠 자체 발행일 (page meta 에서 추출, nullable — 추출 실패 시 NULL)
  published_at TIMESTAMPTZ,
  -- GEO-1.2 contentPatternClassifier 결과 (FAQ / 비교표 / 의료진 등)
  pattern_type TEXT,
  -- 발견 출처 채널
  source TEXT NOT NULL CHECK (source IN ('citation', 'naver_blog', 'naver_cafe', 'website')),
  -- 운영자가 대응 콘텐츠 만들었는지 (UI 의 "✨ 대응 콘텐츠 초안" 클릭 시 true)
  responded BOOLEAN NOT NULL DEFAULT false,
  -- 대응 콘텐츠 blog post ID (응답 시 연결, blog_posts.id FK — 본 PR 은 FK 없이 nullable)
  response_post_id UUID,
  -- UNIQUE — 같은 병원 시점에서 같은 URL 중복 insert 방지
  UNIQUE (hospital_name, url)
);

-- ── 3. 인덱스 ──────────────────────────────────────────────────────

-- 추적 도메인 조회 (hospital_name 으로 활성)
CREATE INDEX IF NOT EXISTS idx_competitor_domains_hospital_enabled
  ON public.competitor_domains (hospital_name, enabled, added_at DESC);

-- 신규 콘텐츠 — 최근 N건 (hospital_name 기준)
CREATE INDEX IF NOT EXISTS idx_competitor_contents_hospital_discovered
  ON public.competitor_contents (hospital_name, discovered_at DESC);

-- 도메인별 콘텐츠 (드릴다운)
CREATE INDEX IF NOT EXISTS idx_competitor_contents_domain_discovered
  ON public.competitor_contents (competitor_domain, discovered_at DESC);

-- 미응답 콘텐츠 (responded=false 필터 — 운영자 작업 list)
CREATE INDEX IF NOT EXISTS idx_competitor_contents_hospital_responded
  ON public.competitor_contents (hospital_name, responded, discovered_at DESC)
  WHERE responded = false;

-- ── 4. RLS (geo_citations 기존 패턴 답습) ──────────────────────────

ALTER TABLE public.competitor_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competitor_domains_service_all" ON public.competitor_domains;
DROP POLICY IF EXISTS "competitor_contents_service_all" ON public.competitor_contents;

CREATE POLICY "competitor_domains_service_all"
  ON public.competitor_domains
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "competitor_contents_service_all"
  ON public.competitor_contents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 검증 SQL (운영자가 RUN) ────────────────────────────────────────
--
-- 1. 두 테이블 + RLS 활성:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('competitor_domains', 'competitor_contents')
--    AND relnamespace = 'public'::regnamespace;
-- 기대: 2 rows, relrowsecurity = t 모두
--
-- 2. CHECK 제약:
-- INSERT INTO competitor_contents (hospital_name, competitor_domain, url, source)
--   VALUES ('test', 'x.com', 'https://x.com/a', 'invalid_source');
-- 기대: ERROR — CHECK 'source IN (citation, naver_blog, naver_cafe, website)' 위반
--
-- 3. UNIQUE 제약:
-- INSERT INTO competitor_contents (hospital_name, competitor_domain, url, source)
--   VALUES ('test', 'x.com', 'https://x.com/a', 'citation');
-- 같은 INSERT 다시 RUN 기대: ERROR — UNIQUE 'hospital_name, url' 위반
--
-- 4. 인덱스 4개:
-- SELECT tablename, indexname FROM pg_indexes
--  WHERE tablename IN ('competitor_domains', 'competitor_contents')
--    AND indexname LIKE 'idx_competitor%';
-- 기대: 4 rows


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시)
-- ============================================
-- DROP POLICY IF EXISTS "competitor_contents_service_all" ON public.competitor_contents;
-- DROP POLICY IF EXISTS "competitor_domains_service_all" ON public.competitor_domains;
-- DROP INDEX IF EXISTS public.idx_competitor_contents_hospital_responded;
-- DROP INDEX IF EXISTS public.idx_competitor_contents_domain_discovered;
-- DROP INDEX IF EXISTS public.idx_competitor_contents_hospital_discovered;
-- DROP INDEX IF EXISTS public.idx_competitor_domains_hospital_enabled;
-- DROP TABLE IF EXISTS public.competitor_contents;
-- DROP TABLE IF EXISTS public.competitor_domains;
--
-- ⚠️ 롤백 시 추적 도메인 list + 발견된 콘텐츠 이력 모두 손실.
