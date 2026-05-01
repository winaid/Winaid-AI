-- ============================================
-- File: sql/migrations/add_naver_rank_columns.sql
-- ============================================
-- hospital_crawled_posts에 네이버 순위 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS naver_rank INTEGER,
  ADD COLUMN IF NOT EXISTS naver_rank_keyword TEXT;

COMMENT ON COLUMN public.hospital_crawled_posts.naver_rank IS '네이버 블로그 검색 순위 (30위 이내, null=순위외)';
COMMENT ON COLUMN public.hospital_crawled_posts.naver_rank_keyword IS '순위 체크에 사용된 검색 키워드';

-- ============================================
-- File: sql/migrations/supabase_migration_admin_password_env.sql
-- Idempotency injections: 4 fn DROPs
-- ============================================
-- admin RPC 비밀번호를 하드코딩에서 Supabase 설정 기반으로 변경
--
-- 사용법:
--   1. Supabase Dashboard → SQL Editor에서 이 파일 실행
--   2. 실행 전에 먼저 비밀번호 설정:
--      ALTER DATABASE postgres SET app.admin_password = 'YOUR_NEW_SECURE_PASSWORD';
--   3. 설정 후 이 마이그레이션 실행
--   4. AdminPage에서 새 비밀번호로 로그인
--
-- 원리:
--   PostgreSQL current_setting('app.admin_password')로 런타임에 비밀번호를 읽는다.
--   SQL 소스코드에 평문 비밀번호가 포함되지 않는다.
--   Supabase Dashboard에서 비밀번호를 언제든 변경 가능하다.
--
-- 롤백:
--   이전 마이그레이션(supabase_migration_rpc_safe_auth.sql)을 다시 실행하면 된다.

-- ═══════════════════════════════════════════════
-- 1. get_admin_stats — 통계 조회 + 인증
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE(
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
BEGIN
  -- 환경 설정에서 비밀번호 읽기 (하드코딩 제거)
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid'; -- fallback: 설정 미완료 시 기존 비밀번호 유지
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN; -- 빈 결과 = 인증 실패
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(DISTINCT hospital_name)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$fn$;

-- ═══════════════════════════════════════════════
-- 2. get_all_generated_posts — 콘텐츠 목록 조회
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS SETOF generated_posts
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.generated_posts
  WHERE
    (filter_post_type IS NULL OR post_type = filter_post_type) AND
    (filter_hospital IS NULL OR hospital_name = filter_hospital)
  ORDER BY created_at DESC
  LIMIT limit_count OFFSET offset_count;
END;
$fn$;

-- ═══════════════════════════════════════════════
-- 3. delete_generated_post — 단일 삭제
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$fn$;

-- ═══════════════════════════════════════════════
-- 4. delete_all_generated_posts — 전체 삭제
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

-- ============================================
-- File: sql/migrations/supabase_migration_admin_password_update.sql
-- Idempotency injections: 3 fn DROPs
-- ============================================
-- ============================================
-- [DEPRECATED] 이 파일은 supabase_migration_rpc_safe_auth.sql로 대체되었습니다.
-- RAISE EXCEPTION 기반 인증은 Supabase JS 클라이언트 hang 문제를 유발합니다.
-- 새 마이그레이션을 사용하세요.
-- ============================================
-- (원본) Admin 비밀번호 변경 (비밀번호는 Supabase에서 직접 설정)
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- 1. get_all_generated_posts 함수 비밀번호 업데이트
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  ip_hash TEXT,
  hospital_name TEXT,
  category TEXT,
  doctor_name TEXT,
  doctor_title TEXT,
  post_type TEXT,
  title TEXT,
  content TEXT,
  plain_text TEXT,
  keywords TEXT[],
  topic TEXT,
  image_style TEXT,
  slide_count INT,
  char_count INT,
  word_count INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;

  RETURN QUERY
  SELECT
    gp.id,
    gp.user_id,
    gp.user_email,
    gp.ip_hash,
    gp.hospital_name,
    gp.category,
    gp.doctor_name,
    gp.doctor_title,
    gp.post_type,
    gp.title,
    gp.content,
    gp.plain_text,
    gp.keywords,
    gp.topic,
    gp.image_style,
    gp.slide_count,
    gp.char_count,
    gp.word_count,
    gp.created_at,
    gp.updated_at
  FROM public.generated_posts gp
  WHERE
    (filter_post_type IS NULL OR gp.post_type = filter_post_type)
    AND (filter_hospital IS NULL OR gp.hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY gp.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;

-- 2. get_admin_stats 함수 비밀번호 업데이트
DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$$;

-- 3. delete_generated_post 함수 비밀번호 업데이트
DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;

-- ============================================
-- 완료! 비밀번호는 Supabase SQL Editor에서 직접 확인/변경하세요.
-- ============================================

-- ============================================
-- File: sql/migrations/supabase_migration_anon_rls.sql
-- Idempotency injections: 8 policy DROPs
-- ============================================
-- ============================================
-- anon 역할 RLS 정책 추가
-- 관리자 페이지에서 Supabase Auth 로그인 없이
-- 비밀번호만으로 말투 학습/크롤링 기능 사용 가능하게 함
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- 1. hospital_style_profiles: anon 역할 허용
DROP POLICY IF EXISTS "Anon can view style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can view style profiles" ON public.hospital_style_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon can insert style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can insert style profiles" ON public.hospital_style_profiles
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can update style profiles" ON public.hospital_style_profiles
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anon can delete style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can delete style profiles" ON public.hospital_style_profiles
  FOR DELETE USING (true);

-- 2. hospital_crawled_posts: anon 역할 허용
DROP POLICY IF EXISTS "Anon can view crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon can insert crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anon can delete crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (true);

-- ============================================
-- 완료!
-- 이제 관리자 페이지에서 비밀번호만 입력하면
-- 말투 학습/크롤링 기능을 사용할 수 있습니다.
-- ============================================

-- ============================================
-- File: sql/migrations/supabase_migration_crawled_posts.sql
-- Idempotency injections: 2 fn DROPs, 4 policy DROPs, 1 tables / 17 cols reconciled
-- ============================================
-- ============================================
-- hospital_crawled_posts 테이블 마이그레이션
-- 출처 블로그별 최대 10개 보관 + 채점 결과 저장
-- ============================================

CREATE TABLE IF NOT EXISTS public.hospital_crawled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  source_blog_id TEXT,                    -- 출처 블로그 ID (blog.naver.com/{blogId})
  score_typo INTEGER,                     -- 오타/맞춤법 점수 (0~100, 높을수록 좋음)
  score_medical_law INTEGER,              -- 의료광고법 준수 점수 (0~100)
  score_total INTEGER,                    -- 종합 점수
  typo_issues JSONB DEFAULT '[]',         -- [{original, correction, context}]
  law_issues JSONB DEFAULT '[]',          -- [{word, severity, replacement, context}]
  corrected_content TEXT,                 -- 사용자가 수정한 본문
  title TEXT,                             -- 블로그 글 제목
  published_at TIMESTAMPTZ,              -- 블로그 글 실제 작성일 (og:createdate)
  summary TEXT,                           -- 본문 요약 (200자)
  thumbnail TEXT,                         -- 대표 이미지 URL
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  scored_at TIMESTAMPTZ,
  UNIQUE(hospital_name, url)
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS hospital_name TEXT NOT NULL;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS url TEXT NOT NULL;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS source_blog_id TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_typo INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_medical_law INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_total INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS typo_issues JSONB DEFAULT '[]';
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS law_issues JSONB DEFAULT '[]';
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS corrected_content TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS crawled_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- RLS 활성화
ALTER TABLE public.hospital_crawled_posts ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 조회 허용
DROP POLICY IF EXISTS "Authenticated users can view crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (auth.role() = 'authenticated');

-- 인증된 사용자 생성/수정 허용
DROP POLICY IF EXISTS "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (auth.role() = 'authenticated');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital ON public.hospital_crawled_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_published_at ON public.hospital_crawled_posts(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_crawled_at ON public.hospital_crawled_posts(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source ON public.hospital_crawled_posts(hospital_name, source_blog_id);

-- BEFORE INSERT: source_blog_id 자동 설정
DROP FUNCTION IF EXISTS public.set_crawled_post_source_blog_id() CASCADE;
CREATE OR REPLACE FUNCTION set_crawled_post_source_blog_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_blog_id IS NULL THEN
    NEW.source_blog_id := coalesce(
      (regexp_match(NEW.url, 'blog\.naver\.com/([^/?#]+)'))[1],
      'unknown'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER INSERT: 출처 블로그별 10개 초과 시 오래된 것 삭제
DROP FUNCTION IF EXISTS public.limit_crawled_posts_per_hospital() CASCADE;
CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.hospital_crawled_posts
  WHERE hospital_name = NEW.hospital_name
    AND source_blog_id = NEW.source_blog_id
    AND id NOT IN (
      SELECT id FROM public.hospital_crawled_posts
      WHERE hospital_name = NEW.hospital_name
        AND source_blog_id = NEW.source_blog_id
      ORDER BY crawled_at DESC
      LIMIT 10
    );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
DROP TRIGGER IF EXISTS trg_set_source_blog_id ON public.hospital_crawled_posts;

CREATE TRIGGER trg_set_source_blog_id
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION set_crawled_post_source_blog_id();

CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();

-- ============================================
-- File: sql/migrations/supabase_migration_crawled_posts_add_published_at.sql
-- ============================================
-- ============================================
-- hospital_crawled_posts: published_at 등 메타데이터 컬럼 추가
-- 기존 테이블에 ALTER TABLE로 추가 (이미 테이블이 있는 경우)
-- ============================================

-- 새 컬럼 추가
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- published_at 기준 인덱스 (최신순 정렬용)
CREATE INDEX IF NOT EXISTS idx_crawled_posts_published_at
  ON public.hospital_crawled_posts(published_at DESC NULLS LAST);

-- ============================================
-- File: sql/migrations/supabase_migration_delete_all_posts.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- delete_all_generated_posts: admin 전체 콘텐츠 삭제 RPC
-- generated_posts 테이블만 대상. 사용자/결제/설정 등 다른 테이블은 건드리지 않음.
-- 인증 실패 시 -1 반환, 성공 시 삭제 건수 반환.

DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
  deleted_count BIGINT;
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;  -- 인증 실패
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

-- ============================================
-- File: sql/migrations/supabase_migration_generated_posts.sql
-- Idempotency injections: 4 fn DROPs, 4 policy DROPs, 1 tables / 20 cols reconciled
-- ============================================
-- ============================================
-- Generated Posts 테이블 (모든 사용자 글 저장 - Admin 조회용)
-- Supabase 대시보드 > SQL Editor에서 실행
-- ============================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.generated_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 사용자 정보
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  ip_hash TEXT, -- 비로그인 사용자 식별용
  
  -- 병원 정보
  hospital_name TEXT,
  category TEXT, -- 진료과
  doctor_name TEXT,
  doctor_title TEXT,
  
  -- 콘텐츠 정보
  post_type TEXT NOT NULL CHECK (post_type IN ('blog', 'card_news', 'press_release')),
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- HTML 본문
  plain_text TEXT, -- 순수 텍스트 (검색용)
  keywords TEXT[], -- SEO 키워드 배열
  
  -- 메타 정보
  topic TEXT, -- 원본 주제
  image_style TEXT, -- 이미지 스타일
  slide_count INT, -- 카드뉴스 슬라이드 수
  
  -- 통계
  char_count INT, -- 글자수
  word_count INT, -- 단어수
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS doctor_title TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL CHECK (post_type IN ('blog', 'card_news', 'press_release'));
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS title TEXT NOT NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS content TEXT NOT NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS plain_text TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS image_style TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS slide_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS char_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS word_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. RLS 활성화
ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책 설정

-- 모든 인증된 사용자가 자신의 글 삽입 가능
DROP POLICY IF EXISTS "Users can insert own posts" ON public.generated_posts;
CREATE POLICY "Users can insert own posts" ON public.generated_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 본인 글만 조회 가능 (일반 사용자)
DROP POLICY IF EXISTS "Users can view own posts" ON public.generated_posts;
CREATE POLICY "Users can view own posts" ON public.generated_posts
  FOR SELECT USING (auth.uid() = user_id);

-- ⚠️ Admin 조회용 - service_role로 모든 글 조회 가능
-- Supabase Edge Function 또는 서버에서 service_role 키로 접근 시 모든 데이터 조회
DROP POLICY IF EXISTS "Service role can view all posts" ON public.generated_posts;
CREATE POLICY "Service role can view all posts" ON public.generated_posts
  FOR SELECT USING (auth.role() = 'service_role');

-- Admin 삭제 권한 (service_role)
DROP POLICY IF EXISTS "Service role can delete posts" ON public.generated_posts;
CREATE POLICY "Service role can delete posts" ON public.generated_posts
  FOR DELETE USING (auth.role() = 'service_role');

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON public.generated_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_post_type ON public.generated_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_generated_posts_hospital ON public.generated_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_generated_posts_category ON public.generated_posts(category);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON public.generated_posts(created_at DESC);

-- 5. updated_at 자동 업데이트 트리거
DROP FUNCTION IF EXISTS public.update_generated_posts_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION update_generated_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_generated_posts_timestamp ON public.generated_posts;
CREATE TRIGGER update_generated_posts_timestamp
  BEFORE UPDATE ON public.generated_posts
  FOR EACH ROW EXECUTE FUNCTION update_generated_posts_updated_at();

-- ============================================
-- Admin용 조회 함수 (anon key로도 admin 인증 시 조회 가능)
-- ============================================

-- Admin 비밀번호 확인 후 모든 글 조회하는 함수
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  ip_hash TEXT,
  hospital_name TEXT,
  category TEXT,
  doctor_name TEXT,
  doctor_title TEXT,
  post_type TEXT,
  title TEXT,
  content TEXT,
  plain_text TEXT,
  keywords TEXT[],
  topic TEXT,
  image_style TEXT,
  slide_count INT,
  char_count INT,
  word_count INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE'; -- Admin 비밀번호 (실제로는 환경변수로 관리)
BEGIN
  -- 비밀번호 확인
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  
  -- 모든 글 반환
  RETURN QUERY
  SELECT
    gp.id,
    gp.user_id,
    gp.user_email,
    gp.ip_hash,
    gp.hospital_name,
    gp.category,
    gp.doctor_name,
    gp.doctor_title,
    gp.post_type,
    gp.title,
    gp.content,
    gp.plain_text,
    gp.keywords,
    gp.topic,
    gp.image_style,
    gp.slide_count,
    gp.char_count,
    gp.word_count,
    gp.created_at,
    gp.updated_at
  FROM public.generated_posts gp
  WHERE
    (filter_post_type IS NULL OR gp.post_type = filter_post_type)
    AND (filter_hospital IS NULL OR gp.hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY gp.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;

-- Admin 통계 함수
DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$$;

-- Admin 삭제 함수
DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  
  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;

-- ============================================
-- 완료!
-- 이 SQL을 Supabase SQL Editor에서 실행 후
-- Admin 페이지에서 모든 사용자의 글을 조회할 수 있습니다.
-- ============================================

-- ============================================
-- File: sql/migrations/supabase_migration_rpc_safe_auth.sql
-- Idempotency injections: 3 fn DROPs
-- ============================================
-- ============================================
-- RPC 인증 실패 안전 수정
-- RAISE EXCEPTION → 빈 결과 반환 방식으로 변경
--
-- 목적: 틀린 비밀번호가 DB 예외를 발생시키지 않고
--        빈 결과를 반환하여 Supabase JS 클라이언트 hang 방지
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- 비밀번호 'winaid' 설정 완료 — 그대로 실행 가능
-- ============================================

-- 1. get_admin_stats: 틀린 비밀번호 → 빈 행 반환 (RAISE EXCEPTION 제거)
DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  -- 비밀번호 불일치 시 빈 결과 반환 (예외 대신)
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$fn$;

-- 2. get_all_generated_posts: 틀린 비밀번호 → 빈 행 반환
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  ip_hash TEXT,
  hospital_name TEXT,
  category TEXT,
  doctor_name TEXT,
  doctor_title TEXT,
  post_type TEXT,
  title TEXT,
  content TEXT,
  plain_text TEXT,
  keywords TEXT[],
  topic TEXT,
  image_style TEXT,
  slide_count INT,
  char_count INT,
  word_count INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gp.id,
    gp.user_id,
    gp.user_email,
    gp.ip_hash,
    gp.hospital_name,
    gp.category,
    gp.doctor_name,
    gp.doctor_title,
    gp.post_type,
    gp.title,
    gp.content,
    gp.plain_text,
    gp.keywords,
    gp.topic,
    gp.image_style,
    gp.slide_count,
    gp.char_count,
    gp.word_count,
    gp.created_at,
    gp.updated_at
  FROM public.generated_posts gp
  WHERE
    (filter_post_type IS NULL OR gp.post_type = filter_post_type)
    AND (filter_hospital IS NULL OR gp.hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY gp.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$fn$;

-- 3. delete_generated_post: 틀린 비밀번호 → FALSE 반환 (예외 대신)
DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$fn$;

-- ============================================
-- 완료!
-- 비밀번호가 이미 설정되어 있습니다. 그대로 실행하세요.
-- ============================================

-- ============================================
-- File: sql/migrations/supabase_migration_saas_infra.sql
-- Idempotency injections: 2 fn DROPs, 6 policy DROPs, 2 tables / 16 cols reconciled
-- ============================================
-- ============================================
-- SaaS 인프라 마이그레이션 (2026-03)
-- 크레딧 시스템 + API 사용량 추적
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================


-- ============================================
-- 1. subscriptions 테이블 (크레딧/요금제 관리)
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'standard', 'premium')),
  credits_total INT NOT NULL DEFAULT 3,
  credits_used INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ, -- NULL = 무기한
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'standard', 'premium'));
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS credits_total INT NOT NULL DEFAULT 3;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS credits_used INT NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
CREATE POLICY "Users can update own subscription"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- updated_at 자동 갱신 트리거
DROP FUNCTION IF EXISTS public.update_subscriptions_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscriptions_updated_at();


-- ============================================
-- 2. 크레딧 차감 RPC 함수
-- ============================================
DROP FUNCTION IF EXISTS public.deduct_credits(UUID, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_total INT;
  v_used INT;
  v_expires TIMESTAMPTZ;
BEGIN
  -- 현재 구독 정보 조회
  SELECT plan_type, credits_total, credits_used, expires_at
  INTO v_plan, v_total, v_used, v_expires
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  -- 구독 정보 없으면 실패
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 프리미엄은 무제한
  IF v_plan = 'premium' THEN
    -- 사용량만 기록 (차감은 안 함)
    UPDATE public.subscriptions
    SET credits_used = credits_used + p_amount
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- 만료 확인
  IF v_expires IS NOT NULL AND v_expires < NOW() THEN
    RETURN FALSE;
  END IF;

  -- 잔여 크레딧 확인
  IF (v_total - v_used) < p_amount THEN
    RETURN FALSE;
  END IF;

  -- 차감
  UPDATE public.subscriptions
  SET credits_used = credits_used + p_amount
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;


-- ============================================
-- 3. api_usage_logs 테이블 (API 호출 비용 추적)
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 요약 데이터
  total_calls INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,

  -- 상세 데이터 (JSON)
  details JSONB DEFAULT '[]',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_calls INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_input_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_output_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]';
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own api usage" ON public.api_usage_logs;
CREATE POLICY "Users can view own api usage"
  ON public.api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own api usage" ON public.api_usage_logs;
CREATE POLICY "Users can insert own api usage"
  ON public.api_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON public.api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage_logs(created_at DESC);


-- ============================================
-- 4. generated_posts에 누락된 RLS 정책 보완
--    (이미 있으면 무시됨)
-- ============================================
DO $$
BEGIN
  -- 본인 글 조회 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generated_posts' AND policyname = 'Users can view own posts'
  ) THEN
DROP POLICY IF EXISTS "Users can view own posts" ON public.generated_posts;
    CREATE POLICY "Users can view own posts" ON public.generated_posts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================
-- 5. 사용량 통계 뷰 (Admin 대시보드용)
-- ============================================
CREATE OR REPLACE VIEW public.user_usage_summary AS
SELECT
  s.user_id,
  s.plan_type,
  s.credits_total,
  s.credits_used,
  s.credits_total - s.credits_used AS credits_remaining,
  s.expires_at,
  COALESCE(a.total_api_calls, 0) AS total_api_calls,
  COALESCE(a.total_cost, 0) AS total_api_cost_usd,
  COALESCE(p.post_count, 0) AS total_posts
FROM public.subscriptions s
LEFT JOIN (
  SELECT user_id,
    SUM(total_calls) AS total_api_calls,
    SUM(total_cost_usd) AS total_cost
  FROM public.api_usage_logs
  GROUP BY user_id
) a ON s.user_id = a.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS post_count
  FROM public.generated_posts
  GROUP BY user_id
) p ON s.user_id = p.user_id;


-- ============================================
-- 완료!
-- ============================================
-- 실행 후 확인:
--   SELECT * FROM public.subscriptions LIMIT 5;
--   SELECT * FROM public.api_usage_logs LIMIT 5;
--   SELECT * FROM public.user_usage_summary LIMIT 5;
--
-- 테스트:
--   SELECT public.deduct_credits('YOUR_USER_UUID', 1);

-- ============================================
-- File: sql/migrations/supabase_migration_source_blog_id.sql
-- Idempotency injections: 2 fn DROPs
-- ============================================
-- ============================================
-- hospital_crawled_posts: source_blog_id 컬럼 추가 + 트리거를 URL별 10개로 변경
-- Supabase Dashboard > SQL Editor에서 실행
-- ============================================
-- ⚠️ 주의: 트리거를 BEFORE + AFTER 2개로 분리
--   BEFORE INSERT: source_blog_id 자동 설정 (NEW 수정 가능)
--   AFTER INSERT:  출처별 LIMIT 10 삭제 (upsert 충돌 시 미발동 → 데이터 유실 방지)
-- ============================================

-- 1. source_blog_id 컬럼 추가 (없으면)
ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS source_blog_id TEXT;

-- 2. 기존 데이터 backfill: url에서 blogId 파싱
-- blog.naver.com/{blogId}/... → blogId 추출
UPDATE public.hospital_crawled_posts
SET source_blog_id = (regexp_match(url, 'blog\.naver\.com/([^/?#]+)'))[1]
WHERE source_blog_id IS NULL
  AND url LIKE '%blog.naver.com%';

-- url이 네이버 블로그가 아닌 경우 'unknown'으로 설정
UPDATE public.hospital_crawled_posts
SET source_blog_id = 'unknown'
WHERE source_blog_id IS NULL;

-- 3. 인덱스 추가 (hospital_name + source_blog_id 복합)
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source
  ON public.hospital_crawled_posts(hospital_name, source_blog_id);

-- 4-A. BEFORE INSERT 함수: source_blog_id 자동 설정만 담당
DROP FUNCTION IF EXISTS public.set_crawled_post_source_blog_id() CASCADE;
CREATE OR REPLACE FUNCTION set_crawled_post_source_blog_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_blog_id IS NULL THEN
    NEW.source_blog_id := coalesce(
      (regexp_match(NEW.url, 'blog\.naver\.com/([^/?#]+)'))[1],
      'unknown'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4-B. AFTER INSERT 함수: 출처 블로그별 10개 초과 시 오래된 것 삭제
--      AFTER INSERT는 upsert 충돌(ON CONFLICT DO UPDATE) 시 발동하지 않으므로
--      기존 행 갱신 시 불필요한 삭제가 발생하지 않음
DROP FUNCTION IF EXISTS public.limit_crawled_posts_per_hospital() CASCADE;
CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.hospital_crawled_posts
  WHERE hospital_name = NEW.hospital_name
    AND source_blog_id = NEW.source_blog_id
    AND id NOT IN (
      SELECT id FROM public.hospital_crawled_posts
      WHERE hospital_name = NEW.hospital_name
        AND source_blog_id = NEW.source_blog_id
      ORDER BY crawled_at DESC
      LIMIT 10
    );
  RETURN NULL;  -- AFTER 트리거는 반환값 무시됨
END;
$$ LANGUAGE plpgsql;

-- 5. 기존 트리거 제거 후 2개 생성
DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
DROP TRIGGER IF EXISTS trg_set_source_blog_id ON public.hospital_crawled_posts;

-- BEFORE INSERT: source_blog_id 자동 설정
CREATE TRIGGER trg_set_source_blog_id
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION set_crawled_post_source_blog_id();

-- AFTER INSERT: 출처별 10개 보관 정책
CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();

-- ============================================
-- 검증 쿼리 (실행 후 결과 확인용)
-- ============================================

-- 컬럼 존재 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hospital_crawled_posts'
  AND column_name = 'source_blog_id';

-- backfill 결과 확인
SELECT source_blog_id, COUNT(*) AS cnt
FROM public.hospital_crawled_posts
GROUP BY source_blog_id
ORDER BY cnt DESC;

-- 트리거 2개 확인 (BEFORE + AFTER)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'hospital_crawled_posts'
ORDER BY action_timing;

-- 병원별 + 출처별 보관 현황 확인
SELECT hospital_name, source_blog_id, COUNT(*) AS cnt
FROM public.hospital_crawled_posts
GROUP BY hospital_name, source_blog_id
ORDER BY hospital_name, source_blog_id;

