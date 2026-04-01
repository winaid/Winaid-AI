-- ============================================
-- 2026-03-24: Admin RPC 함수 통합 정합성 복구
-- ============================================
--
-- 목적:
--   현재 next-app 프론트엔드 코드가 기대하는 함수 시그니처와
--   DB 함수를 완전히 일치시킨다.
--
-- 이 SQL 하나만 실행하면 아래 4개 함수가 모두 최신 상태가 된다:
--   1. get_admin_stats        — image_count 포함 10개 컬럼 반환
--   2. get_all_generated_posts — SETOF generated_posts 반환
--   3. delete_generated_post   — post_id 인자
--   4. delete_all_generated_posts — BIGINT 반환
--
-- 전제:
--   - generated_posts 테이블이 존재
--   - post_type CHECK에 'image' 포함 (없으면 이 SQL에서 추가)
--   - workflow_type 컬럼 존재 (없으면 이 SQL에서 추가)
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- ═══════════════════════════════════════════════
-- 0. 테이블 스키마 보정 (이미 있으면 무시됨)
-- ═══════════════════════════════════════════════

-- 0-A. post_type CHECK: 'image' 허용
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release', 'image'));

-- 0-B. workflow_type 컬럼 (없으면 추가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generated_posts'
      AND column_name = 'workflow_type'
  ) THEN
    ALTER TABLE public.generated_posts
      ADD COLUMN workflow_type TEXT NOT NULL DEFAULT 'generate';
    ALTER TABLE public.generated_posts
      ADD CONSTRAINT generated_posts_workflow_type_check
      CHECK (workflow_type IN ('generate', 'refine'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 1. get_admin_stats — image_count 포함 10개 컬럼
-- ═══════════════════════════════════════════════

-- 반환 타입 변경이므로 기존 함수 먼저 DROP
DROP FUNCTION IF EXISTS get_admin_stats(TEXT);

CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  image_count BIGINT,
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
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE post_type = 'image')::BIGINT AS image_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$$;

-- ═══════════════════════════════════════════════
-- 2. get_all_generated_posts — SETOF 반환
-- ═══════════════════════════════════════════════

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
AS $$
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
$$;

-- ═══════════════════════════════════════════════
-- 3. delete_generated_post — 단일 삭제 (인자: post_id)
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ═══════════════════════════════════════════════
-- 4. delete_all_generated_posts — 전체 삭제
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ═══════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인용)
-- ═══════════════════════════════════════════════

-- 함수 존재 확인:
-- SELECT proname, pg_get_function_arguments(oid) AS args,
--        pg_get_function_result(oid) AS returns
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('get_admin_stats','get_all_generated_posts','delete_generated_post','delete_all_generated_posts');

-- post_type CHECK 확인:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.generated_posts'::regclass AND contype = 'c';

-- image_count 동작 확인:
-- SELECT * FROM get_admin_stats('winaid');
