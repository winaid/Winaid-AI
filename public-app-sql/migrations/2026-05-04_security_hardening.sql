-- ============================================
-- 2026-05-04 · DB 보안 강화 일괄 마이그레이션 (public-app DB · winaid-public-seoul)
-- ============================================
--
-- 목적:
--   사전 감사에서 발견된 Critical / High 봉쇄. public-app DB 에 적용 가능한
--   영역 (next-app 전용 항목 제외).
--
-- 본 SQL 의 변경 분류:
--   A. admin RPC 4개 'winaid' fallback 제거 (CR-1)
--   B. SECURITY DEFINER 함수 SET search_path 일괄 적용 (H3)
--   C. use_credit / get_credits 호출자 검증 추가 (CR-2)
--   D. hospital_images RLS owner 검증 추가 (H1)
--   E. diagnostic_public_shares anon SELECT expires_at 체크 (H2)
--   F. handle_new_user team_id 신뢰 제거 (CR-5)
--
-- 미포함 (public-app 에 해당 없음):
--   G. hospitals / teams write 정책 — public-app 은 동적 팀/병원 테이블 미사용
--   H. influencer_outreach — public-app 에 테이블 없음
--
-- 멱등성:
--   모든 변경이 CREATE OR REPLACE FUNCTION / DROP POLICY IF EXISTS → CREATE POLICY /
--   ALTER FUNCTION SET 패턴. 두 번 RUN 해도 동일 결과.
--
-- 적용 절차 (작업자):
--   1. winaid-public-seoul Supabase Dashboard > SQL Editor 에 본 파일 paste + RUN
--   2. 하단 검증 SQL 5개 RUN 후 결과 보고
--
-- ============================================


-- ════════════════════════════════════════════════════════════════════
-- A. admin RPC 4개 'winaid' fallback 제거 (CR-1)
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- C. use_credit / get_credits 호출자 검증 (CR-2)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.use_credit(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: caller mismatch';
  END IF;

  INSERT INTO public.user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits INTO current_credits
  FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;

  IF current_credits <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_credits', 'remaining', 0);
  END IF;

  UPDATE public.user_credits
  SET credits = credits - 1, total_used = total_used + 1, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'remaining', current_credits - 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_credits(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: caller mismatch';
  END IF;

  INSERT INTO public.user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits, total_used INTO result
  FROM public.user_credits WHERE user_id = p_user_id;

  RETURN json_build_object('credits', result.credits, 'total_used', result.total_used);
END;
$$;


-- ════════════════════════════════════════════════════════════════════
-- F. handle_new_user team_id 신뢰 제거 (CR-5)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, full_name, team_id, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULL,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════════════
-- D. hospital_images RLS owner 검증 (H1)
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated can insert hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can insert hospital images"
  ON public.hospital_images FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Authenticated can update hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can update hospital images"
  ON public.hospital_images FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Authenticated can delete hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can delete hospital images"
  ON public.hospital_images FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════
-- E. diagnostic_public_shares anon SELECT expires_at 체크 (H2)
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS shares_anon_select ON public.diagnostic_public_shares;
CREATE POLICY shares_anon_select
  ON public.diagnostic_public_shares
  FOR SELECT TO anon, authenticated
  USING (
    is_revoked = false
    AND (expires_at IS NULL OR expires_at > now())
  );


-- ════════════════════════════════════════════════════════════════════
-- B. SECURITY DEFINER 함수 SET search_path 일괄 적용 (H3)
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
           ))
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      r.nspname, r.proname, r.args
    );
    RAISE NOTICE 'SET search_path applied: %.%(%s)', r.nspname, r.proname, r.args;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 검증 SQL (적용 후 작업자가 RUN)
-- ════════════════════════════════════════════════════════════════════
--
-- 1. SECURITY DEFINER 함수 모두 search_path 설정됐는지:
-- SELECT proname, proconfig FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace AND prosecdef = true ORDER BY proname;
--
-- 2. admin RPC 본문에 평문 password 잔존? (assignment 패턴):
-- SELECT proname, position($$valid_password := '$$ IN pg_get_functiondef(oid)) AS literal_assign_pos
--   FROM pg_proc
--  WHERE proname IN ('get_admin_stats','get_all_generated_posts',
--                    'delete_generated_post','delete_all_generated_posts');
--
-- 3. hospital_images 정책 owner 검증 포함:
-- SELECT policyname, qual, with_check FROM pg_policies
--  WHERE tablename = 'hospital_images'
--    AND policyname IN ('Authenticated can insert hospital images',
--                       'Authenticated can update hospital images',
--                       'Authenticated can delete hospital images');
--
-- 4. diagnostic_public_shares anon SELECT expires_at 포함:
-- SELECT policyname, qual FROM pg_policies
--  WHERE tablename = 'diagnostic_public_shares' AND policyname = 'shares_anon_select';
--
-- 5. handle_new_user 본문에 team_id 신뢰 제거:
-- SELECT pg_get_functiondef('public.handle_new_user'::regproc);


-- ============================================
-- 롤백 SQL — next-app 동일 패턴. 원본 마이그레이션 직접 RUN 으로 복원.
-- ============================================
