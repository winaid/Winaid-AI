-- ============================================================================
-- 2026-05-08 · Drop admin_password check from admin RPCs (S1 PR-2 / B1+B2)
--   target DB: winaid-internal-seoul (next-app)
-- ============================================================================
--
-- 배경:
--   PR-1 (`b5407931`) 에서 next-app admin UI 를 server-side dispatcher
--   (`/api/admin/rpc`) 로 옮겼다. dispatcher 는:
--     • `verifyAdminCookie` 로 admin_session HttpOnly 쿠키 검증
--     • `supabaseAdmin` (service_role) 클라이언트로 admin RPC 호출
--     • RPC 인자 `admin_password` 에 빈 문자열을 전달 (호환성용)
--
--   Supabase 호스팅 환경은 `app.*` GUC 설정을 SQL Editor 로 허용하지 않으므로
--   GUC 기반 admin password 검증 패턴 (`current_setting('app.admin_password')`)
--   은 영구히 폐기. 새 인증 모델:
--     1) PostgREST: REVOKE EXECUTE FROM anon/authenticated/public  ← 본 마이그레이션 끝부분
--     2) DB defense-in-depth: `auth.role() = 'service_role'` 가드  ← 각 RPC 본문
--     3) App layer: dispatcher 의 cookie 검증 + service_role 키 사용
--
--   `admin_password TEXT` 인자 시그니처는 PR-1 호환을 위해 유지하되 본문에서
--   완전 무시. dispatcher 가 빈 문자열을 보내든 NULL 을 보내든 동일하게 동작.
--
-- 적용 절차 (작업자):
--   1. Supabase Dashboard → winaid-internal-seoul → SQL Editor
--   2. 본 파일 전체 paste + RUN
--   3. 검증 SQL (본 파일 끝의 "-- 검증" 블록) 으로:
--        • 4 RPC 본문에 'winaid' 평문 0
--        • 4 RPC 가 anon/authenticated/public 에 EXECUTE 권한 0
--   4. dispatcher 경유로 admin UI 가 정상 작동하는지 1회 확인
--
-- 멱등성: 모든 작업이 CREATE OR REPLACE / DO $$ ... LOOP / IF EXISTS 기반.
--          반복 실행 안전.
--
-- 호환성: PR-1 dispatcher 가 사용하는 인자 이름·반환 타입과 1:1 일치.
-- ============================================================================


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
  PERFORM admin_password;  -- silence unused-parameter lint (intentional ignore)
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


-- ── E. REVOKE EXECUTE — 영구화 (PostgREST 차단 레이어) ──────────────────────
--
-- 운영자가 양 DB 에 수동으로 이미 적용했지만, 마이그레이션으로도 영구화하여
-- 신규 환경 부트스트랩 후 본 마이그레이션이 적용되면 자동 차단되도록 한다.
-- 멱등 (REVOKE 가 이미 적용된 상태에서도 noop).

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
        'get_admin_stats_v2'  -- 방어적 포함 (실존 4 + v2 후보)
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, authenticated, public',
      fn.proname, fn.args
    );
  END LOOP;
END $$;


-- ── 검증 SQL (작업자가 실행) ─────────────────────────────────────────────────
--
-- 1) 4 RPC 본문에 'winaid' 평문 잔존 0 (= 백도어 제거 확인)
--    SELECT proname,
--           position($lit$valid_password := '$lit$ IN pg_get_functiondef(oid)) AS literal_pos
--      FROM pg_proc
--     WHERE proname IN ('get_admin_stats','get_all_generated_posts',
--                       'delete_generated_post','delete_all_generated_posts');
--    기대: 모든 row 의 literal_pos = 0
--
-- 2) anon/authenticated/public 에 EXECUTE 권한 없음
--    SELECT routine_name, grantee, privilege_type
--      FROM information_schema.role_routine_grants
--     WHERE routine_schema = 'public'
--       AND routine_name IN ('get_admin_stats','get_all_generated_posts',
--                            'delete_generated_post','delete_all_generated_posts')
--       AND grantee IN ('anon','authenticated','public');
--    기대: 0 rows
--
-- 3) auth.role 가드 동작 확인 (anon 은 거절)
--    SET LOCAL request.jwt.claims = '{"role":"anon"}';
--    SELECT * FROM public.get_admin_stats();          -- ERROR: unauthorized... 기대
--    RESET request.jwt.claims;
--
-- 4) service_role 통과 확인 (Dashboard 의 Database → Functions → Test 또는
--    `curl -H "apikey: <service_role>" ...` 로 호출)

-- ============================================================================
-- 끝.
-- ============================================================================
