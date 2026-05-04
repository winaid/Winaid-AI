-- ============================================
-- 2026-05-04: Admin RPC 빠른 복구 (Seoul Supabase)
-- ============================================
--
-- 문제:
--   새 Seoul Supabase 환경에서 next-app /admin 페이지가 RPC 호출 400.
--   - bootstrap_new_supabase.sql 만 깔려있는 경우, delete_generated_post 인자명이
--     `target_post_id` 인데 next-app adminTypes.ts:144 는 `post_id` 키로 호출.
--   - get_admin_stats / get_all_generated_posts 함수 자체가 미배포면 400.
--   - 이전 시그니처가 잔존하면 PostgREST 가 모호한 호출로 400.
--
-- 해결:
--   1) 알려진 모든 변형 시그니처를 DROP (모호성 제거).
--   2) next-app adminTypes.ts 호출과 정확히 일치하는 시그니처로 재생성.
--      - get_admin_stats(admin_password TEXT)               → 10 컬럼 (image_count 포함)
--      - get_all_generated_posts(admin_password, filter_post_type, filter_hospital,
--                                limit_count, offset_count) → SETOF generated_posts
--      - delete_generated_post(admin_password, post_id)     → BOOLEAN
--      - delete_all_generated_posts(admin_password)         → BIGINT
--   3) 비밀번호: GUC `app.admin_password` 가 설정돼 있으면 그것, 없으면 fallback 'winaid'.
--
-- 전제:
--   - generated_posts 테이블 존재.
--   - bootstrap 또는 unified 마이그레이션 중 하나는 적용된 상태.
--   - generated_posts 의 컬럼 (workflow_type, post_type='image' 허용) 은
--     bootstrap_new_supabase.sql 또는 2026-03-24_unified_admin_rpc.sql 에 의해
--     이미 보정돼 있다고 가정. 안 됐으면 0번 보정 블록이 처리.
--
-- 실행:
--   Supabase Dashboard > SQL Editor 에 통째로 붙여 실행.
--   idempotent (반복 실행 안전).
-- ============================================

-- ═══════════════════════════════════════════════
-- 0. 테이블 스키마 보정 (혹시 누락됐을 수 있어 방어적으로)
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
-- 1. 알려진 변형 시그니처 모두 DROP (모호성 제거)
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT);
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT);
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, INT, INT);

-- delete_generated_post 의 두 가지 인자명 (post_id / target_post_id) 모두 제거
DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID);
-- 인자명이 다른 경우에도 동일 시그니처로 매칭되므로 위 한 줄로 충분하지만,
-- 명시적으로 한 번 더 (idempotent):
DROP FUNCTION IF EXISTS public.delete_generated_post(admin_password TEXT, post_id UUID);
DROP FUNCTION IF EXISTS public.delete_generated_post(admin_password TEXT, target_post_id UUID);

DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT);

-- ═══════════════════════════════════════════════
-- 2. get_admin_stats — 10 컬럼 (image_count 포함)
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_admin_stats(admin_password TEXT)
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
$fn$;

-- ═══════════════════════════════════════════════
-- 3. get_all_generated_posts — SETOF generated_posts
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS SETOF public.generated_posts
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
    (filter_hospital IS NULL OR hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY created_at DESC
  LIMIT limit_count OFFSET offset_count;
END;
$fn$;

-- ═══════════════════════════════════════════════
-- 4. delete_generated_post — 인자명 post_id (next-app 호환)
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_generated_post(
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
-- 5. delete_all_generated_posts
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_all_generated_posts(
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

-- ═══════════════════════════════════════════════
-- 검증 (실행 후 수동 확인)
-- ═══════════════════════════════════════════════

-- 함수 시그니처 확인:
-- SELECT proname, pg_get_function_arguments(oid) AS args, pg_get_function_result(oid) AS returns
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('get_admin_stats','get_all_generated_posts','delete_generated_post','delete_all_generated_posts')
-- ORDER BY proname;

-- 동작 확인 (비번 winaid 가정):
-- SELECT * FROM public.get_admin_stats('winaid');
-- SELECT id, post_type, title FROM public.get_all_generated_posts('winaid', NULL, NULL, 5, 0);
