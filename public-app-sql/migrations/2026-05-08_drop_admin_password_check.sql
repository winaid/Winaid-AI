-- ============================================================================
-- 2026-05-08 · Drop admin_password check from admin RPCs (S1 PR-2 / B1+B2)
--   target DB: winaid-public-seoul (public-app)
-- ============================================================================
--
-- 배경 및 인증 모델: sql/migrations/2026-05-08_drop_admin_password_check.sql
-- (next-app DB 미러) 의 헤더 코멘트 참조. 본 파일은 public-app DB 용으로,
-- 코드와 의도는 동일. 차이점: 헤더에 IF EXISTS 가드를 추가했다 — public-app DB
-- 는 admin UI 호출자가 없어서 4개 admin RPC 중 일부가 누락된 환경 가능성이
-- 0 은 아니라고 보수적 가정.
--
-- 가드 동작:
--   • 4 admin RPC 중 하나라도 본 DB 에 없으면 마이그레이션 abort (RAISE EXCEPTION).
--     → 운영자는 에러 메시지로 어떤 RPC 가 빠졌는지 인지하고 선결 마이그레이션
--       (`2026-03-24_unified_admin_rpc.sql` 등) 적용 후 재시도.
--   • 4개 모두 있으면 정상 진행 → 본문 plain CREATE OR REPLACE.
--
--   이 패턴은 "없는 함수에 CREATE OR REPLACE 를 던져 새 함수를 추가하는 사고"
--   를 차단한다 (PR-2 트리거의 명시 요청).
--
-- 적용 절차 (작업자):
--   1. Supabase Dashboard → winaid-public-seoul → SQL Editor
--   2. 본 파일 전체 paste + RUN
--   3. 검증 SQL (sql/ 미러 헤더의 검증 SQL 동일)
--
-- 멱등성: 모든 작업이 CREATE OR REPLACE / DO LOOP 기반. 반복 실행 안전.
-- ============================================================================


-- ── 가드: 4개 admin RPC 모두 존재해야 함 ─────────────────────────────────────

DO $guard$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_admin_stats'
  ) THEN missing := array_append(missing, 'get_admin_stats'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_all_generated_posts'
  ) THEN missing := array_append(missing, 'get_all_generated_posts'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_generated_post'
  ) THEN missing := array_append(missing, 'delete_generated_post'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_all_generated_posts'
  ) THEN missing := array_append(missing, 'delete_all_generated_posts'); END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION
      'admin RPCs missing in this DB: %. Apply 2026-03-24_unified_admin_rpc.sql first, then retry.',
      array_to_string(missing, ', ');
  END IF;
END
$guard$;


-- ── A. get_admin_stats ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_stats(admin_password TEXT DEFAULT NULL)
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
SET search_path = public, pg_temp
AS $$
BEGIN
  -- DEPRECATED: admin_password is ignored. Caller authentication is enforced by:
  --   1) PostgREST REVOKE EXECUTE FROM anon/authenticated/public (this migration tail)
  --   2) DB defense-in-depth: auth.role() = 'service_role' check below
  --   3) App layer: next-app/app/api/admin/rpc dispatcher (verifyAdminCookie + supabaseAdmin)
  PERFORM admin_password;
  IF coalesce(auth.role(), '') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'unauthorized: admin RPC requires service_role';
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


-- ── B. get_all_generated_posts ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_generated_posts(
  admin_password TEXT DEFAULT NULL,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS SETOF public.generated_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM admin_password;
  IF coalesce(auth.role(), '') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'unauthorized: admin RPC requires service_role';
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


-- ── C. delete_generated_post ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_generated_post(
  admin_password TEXT DEFAULT NULL,
  post_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM admin_password;
  IF coalesce(auth.role(), '') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'unauthorized: admin RPC requires service_role';
  END IF;
  IF post_id IS NULL THEN
    RAISE EXCEPTION 'post_id required';
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;


-- ── D. delete_all_generated_posts ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_all_generated_posts(
  admin_password TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  PERFORM admin_password;
  IF coalesce(auth.role(), '') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'unauthorized: admin RPC requires service_role';
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- ── E. REVOKE EXECUTE — 영구화 ──────────────────────────────────────────────

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_admin_stats',
        'get_all_generated_posts',
        'delete_generated_post',
        'delete_all_generated_posts',
        'get_admin_stats_v2'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, authenticated, public',
      fn.proname, fn.args
    );
  END LOOP;
END $$;

-- ============================================================================
-- 끝. 검증 SQL 은 sql/migrations/2026-05-08_drop_admin_password_check.sql 동일.
-- ============================================================================
