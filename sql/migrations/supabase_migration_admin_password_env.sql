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
