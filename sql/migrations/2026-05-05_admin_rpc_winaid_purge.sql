-- ============================================
-- 2026-05-05 · admin RPC 'winaid' fallback 회귀 시교정 (DB-024)
-- ============================================
--
-- 배경:
--   `2026-05-04_security_hardening.sql` (블록 A) 가 admin RPC 4개에서 'winaid' 평문
--   fallback 을 `RAISE EXCEPTION 'admin_password_not_configured'` 로 교체했다.
--   그러나 같은 날짜의 `2026-05-04_admin_rpc_quick_recovery.sql` 이 동일 4개 RPC 를
--   `CREATE OR REPLACE` 로 재정의하면서 `valid_password := 'winaid';` fallback 을
--   다시 부활시켰다 (line 108-109, 152-153, 187-188, 217-218).
--
--   결과: 두 마이그레이션의 적용 순서에 따라 보안 상태가 비결정적 — quick_recovery 가
--   나중에 적용된 환경이면 'winaid' 패스워드로 admin 권한 획득 가능. 감사 ID DB-024.
--
-- 수정:
--   본 마이그레이션은 quick_recovery 가 마지막에 적용된 케이스를 보정. 동일 4개 RPC 를
--   security_hardening 본문(RAISE EXCEPTION + SET search_path) 정확히 재적용.
--   기존 마이그레이션 파일은 수정하지 않는다 (감사 trail 유지).
--
--   날짜 (2026-05-05) 가 quick_recovery (2026-05-04) 보다 뒤이므로 마이그레이션
--   순차 실행 시 본 파일이 마지막에 적용되어 회귀 차단.
--
-- 시그니처 / RETURN 타입 / 인자명: 정확 유지 (호출자 admin/adminTypes.ts 영향 없음).
-- 멱등성: CREATE OR REPLACE — 반복 실행 안전.
--
-- 적용 절차 (작업자):
--   winaid-internal-seoul Supabase Dashboard > SQL Editor 에 본 파일 paste + RUN
--   → 검증 SQL (security_hardening 의 검증 #2) 으로 평문 잔존 0 확인.
-- ============================================

-- A-1. get_admin_stats
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
SET search_path = public, pg_temp
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    -- DB-024 회귀 차단: 평문 'winaid' fallback 제거. 미설정 시 명시적 에러.
    RAISE EXCEPTION 'admin_password_not_configured';
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

-- A-2. get_all_generated_posts
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
SET search_path = public, pg_temp
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_password_not_configured';
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

-- A-3. delete_generated_post
CREATE OR REPLACE FUNCTION public.delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_password_not_configured';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;

-- A-4. delete_all_generated_posts
CREATE OR REPLACE FUNCTION public.delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_password_not_configured';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================
-- 검증 (security_hardening.sql 의 검증 #2 와 동일)
-- ============================================
-- SELECT proname, position($$valid_password := '$$ IN pg_get_functiondef(oid)) AS literal_assign_pos
--   FROM pg_proc
--  WHERE proname IN ('get_admin_stats','get_all_generated_posts',
--                    'delete_generated_post','delete_all_generated_posts');
-- 기대: 모든 row 의 literal_assign_pos = 0 (=평문 fallback 없음).
