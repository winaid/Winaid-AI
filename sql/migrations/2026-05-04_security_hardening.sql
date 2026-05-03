-- ============================================
-- 2026-05-04 · DB 보안 강화 일괄 마이그레이션 (next-app DB · winaid-internal-seoul)
-- ============================================
--
-- 목적:
--   사전 감사에서 발견된 Critical 7건 + High 다수 봉쇄. 코드 변경 없이 SQL 만으로
--   봉쇄 가능한 영역에 한정 — 코드 변경이 필요한 항목은 별도 PR 로 분리.
--
-- 본 SQL 의 변경 분류:
--   A. admin RPC 4개 'winaid' fallback 제거 (CR-1)
--   B. SECURITY DEFINER 함수 SET search_path 일괄 적용 (H3, search_path injection 차단)
--   C. use_credit / get_credits 호출자 검증 추가 (CR-2)
--   D. hospital_images RLS owner 검증 추가 (H1)
--   E. diagnostic_public_shares anon SELECT expires_at 체크 (H2)
--   F. handle_new_user team_id 신뢰 제거 (CR-5)
--   G. hospitals / teams RLS write 정책 제거 (CR-3 — next-app only)
--
-- ⚠️ 본 SQL 에 미포함 (별도 PR 권장):
--   H. influencer_outreach RLS 좁히기 — next-app/app/api/influencer/status/route.ts:62 가
--      anon supabase 사용 중. SQL 만 적용하면 라우트 즉시 차단 → 운영 영향.
--      후속 PR 에서 코드(supabaseAdmin 전환) + SQL 동시 적용 권장.
--
--   admin RPC 의 password 인자 자체 제거(시그니처 변경) — 호출자 코드 (admin/page.tsx)
--   가 PR #71 머지 후 cookie 기반이라 password 인자가 사실상 미사용이지만, 시그니처
--   변경은 호출 깨질 risk. 본 PR 은 RPC 본문에서 password 검증 + 'winaid' fallback
--   제거에 집중 (시그니처 유지). 시그니처 정리는 별도 후속 PR.
--
-- 멱등성:
--   모든 변경이 CREATE OR REPLACE FUNCTION / DROP POLICY IF EXISTS → CREATE POLICY /
--   ALTER FUNCTION SET 패턴. 두 번 RUN 해도 동일 결과.
--
-- 적용 절차 (작업자):
--   1. winaid-internal-seoul Supabase Dashboard > SQL Editor 에 본 파일 paste + RUN
--   2. 하단 검증 SQL 5개 RUN 후 결과 보고
--   3. 회귀 발견 시 파일 맨 아래 "롤백 SQL" 참고
--
-- ============================================


-- ════════════════════════════════════════════════════════════════════
-- A. admin RPC 4개 'winaid' fallback 제거 (CR-1)
-- ════════════════════════════════════════════════════════════════════
-- 변경 전: EXCEPTION WHEN OTHERS THEN valid_password := 'winaid';
-- 변경 후: EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'admin_password_not_configured';
--
-- 시그니처 (RETURN 타입, 인자) 정확 유지 → 호출자 (admin/adminTypes.ts) 영향 없음.
-- 본문도 password 검증 로직 외 변경 없음 (search_path 만 추가).

-- A-1. get_admin_stats — 반환 타입 변경 X, 본문만 hardening
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
    -- 평문 fallback 제거 — 미설정 시 명시적 에러 (silent allow 차단)
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


-- ════════════════════════════════════════════════════════════════════
-- C. use_credit / get_credits 호출자 검증 (CR-2)
-- ════════════════════════════════════════════════════════════════════
-- 기존: anon 이 임의 user_id 차감 / 조회 가능 (SECURITY DEFINER + 호출자 검증 X)
-- 수정: auth.uid() 가 NULL 이거나 p_user_id 와 다르면 forbidden 예외
--
-- 시그니처 / RETURN 타입 정확 유지 → creditService.ts 호출 영향 없음.

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
-- 기존: raw_user_meta_data->>'team_id' 를 그대로 INSERT → 회원가입 시 team_id=0
--       (본부장) 자가지정 가능
-- 수정: team_id 항상 NULL 강제 (admin 이 별도 UPDATE)
-- 시그니처: TRIGGER 함수 (RETURNS TRIGGER) — auth 트리거 영향 없음.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- team_id 는 신뢰하지 않고 NULL — admin 이 차후 UPDATE.
  -- raw_user_meta_data 의 team_id 값은 무시 (privilege escalation 차단).
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
-- 기존 INSERT/UPDATE/DELETE 정책: WITH CHECK (auth.role() = 'authenticated')
--   → 다른 사용자의 row 도 변조 가능
-- 수정: WITH CHECK (auth.uid()::text = user_id) — owner 본인만
--
-- 호환성 메모:
--   - supabaseAdmin (SERVICE_ROLE_KEY) 호출은 RLS 우회 → 영향 없음
--   - 사용자 세션 (auth.uid() 존재) 호출은 본인 row 만 가능 (의도된 동작)
--   - anon 호출은 기존에도 'authenticated' 체크로 차단됨 → 동작 유지
--
-- SELECT 정책은 USING (true) 유지 — 라이브러리 풀 공유 패턴 (server-side filter 가 gate).
-- Storage RLS 는 이번 PR 에서 변경 X (다른 PR 영역).

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
-- 기존: anon SELECT USING (is_revoked = false) — 만료 토큰도 열람 가능
-- 수정: expires_at IS NULL OR expires_at > now() 추가
-- 정책 이름 (shares_anon_select) 유지 — DROP + CREATE 멱등.

DROP POLICY IF EXISTS shares_anon_select ON public.diagnostic_public_shares;
CREATE POLICY shares_anon_select
  ON public.diagnostic_public_shares
  FOR SELECT TO anon, authenticated
  USING (
    is_revoked = false
    AND (expires_at IS NULL OR expires_at > now())
  );


-- ════════════════════════════════════════════════════════════════════
-- G. hospitals / teams RLS write 정책 제거 (CR-3) — next-app only
-- ════════════════════════════════════════════════════════════════════
-- 기존: hospitals 에 anon INSERT/UPDATE/DELETE 모두 허용 (USING true / WITH CHECK true)
--       → 매니저 실명 / 주소 / 블로그 URL 30+ 시드 + anon 가 자유 변조
-- 수정: SELECT 만 유지. INSERT/UPDATE/DELETE 정책 DROP — service_role (supabaseAdmin)
--       이 RLS 우회로 admin write 처리. PR #61 머지 후 admin 흐름은 supabaseAdmin
--       사용으로 전환됨.
--
-- teams 는 기존에도 SELECT 만 있어서 변경 없음 (멱등).

-- hospitals
DROP POLICY IF EXISTS "Anon can insert hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can update hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can delete hospitals" ON public.hospitals;
-- SELECT 정책 ("Anon can read hospitals") 유지 — 변경 없음.

-- teams — 기존에도 SELECT 만 있음. write 정책이 혹시 있다면 정리 (idempotent).
DROP POLICY IF EXISTS "Anon can insert teams" ON public.teams;
DROP POLICY IF EXISTS "Anon can update teams" ON public.teams;
DROP POLICY IF EXISTS "Anon can delete teams" ON public.teams;


-- ════════════════════════════════════════════════════════════════════
-- B. SECURITY DEFINER 함수 SET search_path 일괄 적용 (H3)
-- ════════════════════════════════════════════════════════════════════
-- search_path 미지정 SECURITY DEFINER 함수는 호출자 search_path 를 사용 →
-- 동일 이름 객체를 사용자 schema 에 만들어두면 함수 내부 reference 가 그쪽으로
-- 해석돼 권한 상승 가능 (search_path injection).
--
-- 본 블록은 public schema 의 모든 prosecdef=true 이면서 proconfig 에 search_path
-- 가 없는 함수에 대해 ALTER FUNCTION ... SET search_path = public, pg_temp 일괄 적용.
-- A/C/F 에서 CREATE OR REPLACE 로 재정의된 함수도 SET search_path 가 정의에
-- 포함됐으나, 본 블록은 그 외 함수 (image_count 등) 도 함께 처리하기 위해 RUN.
-- 이미 SET search_path 가 있는 함수는 ALTER 가 동일 값 재설정 (idempotent).

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
-- 검증 SQL (적용 후 작업자가 RUN 하여 결과 보고)
-- ════════════════════════════════════════════════════════════════════
--
-- 1. SECURITY DEFINER 함수 모두 search_path 설정됐는지:
-- SELECT proname, proconfig FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace AND prosecdef = true
--  ORDER BY proname;
-- 기대: 모든 row 의 proconfig 에 'search_path=public, pg_temp' 포함.
--
-- 2. admin RPC 본문에 평문 password 잔존? (assignment 패턴):
-- SELECT proname, position($$valid_password := '$$ IN pg_get_functiondef(oid)) AS literal_assign_pos
--   FROM pg_proc
--  WHERE proname IN ('get_admin_stats','get_all_generated_posts',
--                    'delete_generated_post','delete_all_generated_posts');
-- 기대: 모든 row 의 literal_assign_pos = 0 (=평문 fallback 없음).
--
-- 3. hospital_images 정책 owner 검증 포함 (pg_policies view 사용 — qual/with_check 컬럼명):
-- SELECT policyname, qual, with_check FROM pg_policies
--  WHERE tablename = 'hospital_images'
--    AND policyname IN ('Authenticated can insert hospital images',
--                       'Authenticated can update hospital images',
--                       'Authenticated can delete hospital images');
-- 기대: qual / with_check 에 'auth.uid()::text = user_id' 패턴 포함.
--
-- 4. diagnostic_public_shares anon SELECT expires_at 포함:
-- SELECT policyname, qual FROM pg_policies
--  WHERE tablename = 'diagnostic_public_shares'
--    AND policyname = 'shares_anon_select';
-- 기대: qual 에 'expires_at' 포함.
--
-- 5. hospitals 의 write 정책 제거 + SELECT 만 남음:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'hospitals';
-- 기대: 1 row — "Anon can read hospitals", cmd='SELECT' 만.
--
-- 6. handle_new_user 본문에 team_id 신뢰 제거:
-- SELECT pg_get_functiondef('public.handle_new_user'::regproc);
-- 기대: 'NEW.raw_user_meta_data->>''team_id''' INSERT 라인 없음 (team_id 위치에 NULL).


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시 SQL Editor 에 paste 후 RUN)
-- ============================================
-- ⚠️ 롤백은 admin RPC 의 'winaid' fallback 평문을 복원하지 않습니다.
--    원본 sql/migrations/2026-03-24_unified_admin_rpc.sql 을 직접 RUN 하여 복원.
-- ⚠️ hospital_images / hospitals / teams / diagnostic_public_shares 정책은
--    각 원본 마이그레이션 (2026-04-29 / 2026-03-24_dynamic_team_hospitals /
--    2026-04-27_diagnostic_public_shares) 을 직접 RUN 하여 복원.
-- ⚠️ search_path 일괄 ALTER 는 별도 롤백 불필요 (pg_temp 추가는 안전).
--    필요하면 ALTER FUNCTION <name>(<args>) RESET search_path; 로 개별 reset.

-- 예시 — handle_new_user 롤백:
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   INSERT INTO public.profiles (id, email, name, full_name, team_id, avatar_url)
--   VALUES (
--     NEW.id, NEW.email,
--     COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
--     COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
--     (NEW.raw_user_meta_data->>'team_id')::INTEGER,
--     NEW.raw_user_meta_data->>'avatar_url'
--   );
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
