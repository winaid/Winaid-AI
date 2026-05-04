-- ============================================
-- 2026-05-04 · use_credit / get_credits / refund_credit — service_role bypass (HOTFIX)
-- ============================================
--
-- 운영 회귀:
--   PR #72 가 use_credit/get_credits 에 caller 검증 추가:
--     IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE 'forbidden';
--   서버 라우트가 anon supabase 로 RPC 호출 → auth.uid() = NULL → forbidden →
--   라우트의 useCredit 이 success=false 받음 → 사용자 입장 "credits 있는데 부족 메시지"
--
-- 수정:
--   본문 첫 줄 caller 검증을 다음으로 변경 (양쪽 DB 적용):
--     - auth.role() = 'service_role': 통과 (서버 supabaseAdmin 호출 정상화)
--     - 그 외 (anon / authenticated): auth.uid() = p_user_id 강제 (보안 유지)
--   refund_credit 도 동일 패턴 적용 (PR #79 도 같은 회귀 risk 있음)
--
-- 왜 auth.role() 인가?
--   SECURITY DEFINER 안에선 current_user 가 함수 owner 라 caller 식별 불가.
--   Supabase 는 JWT claim 'role' (anon/authenticated/service_role) 을 auth.role()
--   helper 로 노출 — RPC 호출 시점의 실제 caller key 를 신뢰 가능.
--
-- 보안 영향:
--   - 클라이언트 직접 호출 (anon 또는 authenticated key): 여전히 caller 검증 통과해야
--     RPC 동작 → 다른 user_id 차감 차단 유지
--   - 서버 supabaseAdmin (service_role): 우회 — 서버 라우트가 인증 통과 후에만 호출하므로 OK
--
-- 멱등: CREATE OR REPLACE FUNCTION (시그니처 그대로 유지)
--
-- 적용 절차 (작업자):
--   1. PR 머지 → Vercel 재배포 (creditService.ts 가 supabaseAdmin 우선 사용 시작)
--   2. winaid-internal-seoul Dashboard SQL Editor 에 본 파일 paste + RUN
--   3. winaid-public-seoul 도 동일 SQL paste + RUN
--   ※ 순서 무관 — 양쪽 DB 독립적

-- ════════════════════════════════════════════════════════════════════
-- 1. use_credit — service_role bypass + auth.uid() 검증
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
  -- caller bypass: 서버 supabaseAdmin (service_role) 또는 dashboard (postgres) 우회.
  -- 그 외 (anon / authenticated key) 는 auth.uid() = p_user_id 강제.
  -- Supabase JWT claim 기반 role 체크. service_role 키 호출 시 auth.role()='service_role'.
  -- SECURITY DEFINER 안에선 current_user 가 owner 이므로 사용 불가 — auth.role() 만 신뢰.
  IF auth.role() = 'service_role' THEN
    NULL;  -- 서버 supabaseAdmin 호출 — 통과
  ELSIF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
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

-- ════════════════════════════════════════════════════════════════════
-- 2. get_credits — 동일 패턴
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_credits(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result RECORD;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    NULL;
  ELSIF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
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
-- 3. refund_credit — 동일 패턴 (PR #79)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.refund_credit(
  p_user_id UUID,
  p_amount  INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    NULL;
  ELSIF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: caller mismatch';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE public.user_credits
     SET credits    = credits + p_amount,
         total_used = GREATEST(0, total_used - p_amount),
         updated_at = NOW()
   WHERE user_id = p_user_id
   RETURNING credits INTO v_remaining;

  IF v_remaining IS NULL THEN
    INSERT INTO public.user_credits (user_id, credits, total_used)
    VALUES (p_user_id, 10 + p_amount, 0)
    ON CONFLICT (user_id) DO UPDATE
      SET credits = public.user_credits.credits + EXCLUDED.credits - 10,
          updated_at = NOW()
    RETURNING credits INTO v_remaining;
  END IF;

  RETURN json_build_object('success', true, 'remaining', v_remaining);
END;
$$;


-- ── 검증 SQL (적용 후) ──────────────────────────────────────
--
-- 1. anon role 호출 — forbidden:
--    SET ROLE anon;
--    SELECT public.use_credit('00000000-0000-0000-0000-000000000001'::uuid);
--    기대: ERROR forbidden
--
-- 2. service_role 호출 — 통과:
--    SET ROLE service_role;
--    SELECT public.use_credit('00000000-0000-0000-0000-000000000001'::uuid);
--    기대: { success: true, remaining: 9 } (또는 credits 부족 시 success:false)
--
-- 3. authenticated role + 본인 user_id — 통과:
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
--    SELECT public.use_credit('00000000-0000-0000-0000-000000000001'::uuid);
--    기대: success
--
-- 4. authenticated role + 다른 user_id — forbidden:
--    SELECT public.use_credit('99999999-9999-9999-9999-999999999999'::uuid);
--    기대: ERROR forbidden


-- ============================================
-- 롤백 SQL (필요 시)
-- ============================================
-- 단순 롤백은 이전 버전 (PR #72/#79) SQL 을 다시 RUN.
-- 단, anon 호출 회귀 risk 다시 발생 — 실제로는 코드 측 supabaseAdmin 보장이 더 안전.
