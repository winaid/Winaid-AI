-- ============================================
-- 2026-05-04 · credit RPC caller 검증 통일 (CR2-1 — anon refund 우회 차단)
-- ============================================
--
-- 배경 (audit Agent D HIGH + 사용자 직접 검증):
--   2026-05-04_credit_rpc_service_bypass.sql:88, 120 의 get_credits / refund_credit 가
--   `current_user IN ('service_role','postgres','supabase_admin')` 으로 caller 우회 검증.
--
--   문제: SECURITY DEFINER 함수 안에서 current_user = 함수 owner (postgres) →
--         IN 체크 항상 통과 → caller 검증 사실상 무력화.
--   영향: anon API key 로 임의 user_id 의 refund_credit 호출 가능 →
--         credit 임의 부여 (revenue 누수).
--   증거: 같은 SQL 파일 line 50 자기 주석 명시
--         "SECURITY DEFINER 안에선 current_user 가 함수 owner 라 caller 식별 불가"
--         → use_credit (line 51) 만 auth.role() 사용. get_credits/refund_credit 누락.
--
-- 수정: 세 RPC 모두 use_credit 패턴 (auth.role()='service_role') 으로 통일.
--
-- 적용 절차:
--   1. PR 머지
--   2. winaid-internal-seoul Dashboard SQL Editor → paste + RUN
--   3. winaid-public-seoul 동일 SQL 적용
--   ※ 순서 무관 — 양쪽 DB 독립적
--
-- 멱등: CREATE OR REPLACE FUNCTION (시그니처 그대로 유지).


-- ════════════════════════════════════════════════════════════════════
-- 1. get_credits — current_user 체크 → auth.role() 통일
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
  -- caller 검증 — use_credit 패턴 (audit CR2-1).
  -- SECURITY DEFINER 안에선 current_user 가 owner 이므로 사용 불가 → auth.role() 만 신뢰.
  IF auth.role() = 'service_role' THEN
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
-- 2. refund_credit — 동일 통일
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
  -- caller 검증 — use_credit 패턴 (audit CR2-1).
  IF auth.role() = 'service_role' THEN
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


-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 후)
-- ════════════════════════════════════════════════════════════════════
--
-- 1) anon role + 다른 user_id 의 refund_credit 호출 — forbidden:
--    SET ROLE anon;
--    SELECT public.refund_credit('00000000-0000-0000-0000-000000000999'::uuid, 5);
--    기대: ERROR forbidden (이전: 통과 + credit 부여)
--
-- 2) authenticated 본인 user_id refund — 통과 (PR #79 흐름):
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<self_uuid>';
--    SELECT public.refund_credit('<self_uuid>'::uuid, 1);
--    기대: { success: true, remaining: N+1 }
--
-- 3) service_role refund (server route 환불 흐름) — 통과:
--    SET ROLE service_role;
--    SELECT public.refund_credit('<any_uuid>'::uuid, 1);
--    기대: 정상 환불
--
-- 4) get_credits 도 동일 3 시나리오 검증


-- ════════════════════════════════════════════════════════════════════
-- 롤백 SQL (필요 시)
-- ════════════════════════════════════════════════════════════════════
-- 2026-05-04_credit_rpc_service_bypass.sql 의 line 88, 120 분기를 다시 RUN
-- (current_user IN 체크). 단 anon refund 우회 surface 즉시 재발생.
