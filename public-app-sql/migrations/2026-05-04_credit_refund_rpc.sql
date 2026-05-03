-- ============================================
-- 2026-05-04 · refund_credit RPC (양쪽 DB — winaid-internal-seoul)
-- ============================================
--
-- 목적:
--   /api/generate/blog 라인의 useCredit() 차감 후 LLM 실패 / generation throw /
--   부분 섹션 실패 시 자동 환불. 클라이언트 optimistic UI 차감 rollback 도 본 RPC
--   결과 (remaining) 로 동기화.
--
-- 호출 흐름:
--   1. route.ts catch 블록에서 refundCredit(userId, amount) 호출
--   2. RPC 가 user_credits.credits +amount, total_used -amount (>=0 cap)
--   3. 응답 { success, remaining } 반환
--
-- 보안:
--   - SECURITY DEFINER + SET search_path = public, pg_temp (PR #72 패턴)
--   - caller 검증: auth.uid() === p_user_id 만 허용 (use_credit 와 동일)
--     anon 의 임의 user_id 환불 차단
--   - amount 범위: 1~100 (음수/대량 환불 차단)
--
-- 멱등: CREATE OR REPLACE FUNCTION.
--
-- 적용 절차 (작업자):
--   1. 양쪽 Supabase Dashboard SQL Editor 에 paste + RUN
--   2. 검증 SQL (하단) 결과 확인

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
  -- caller 검증 (use_credit 동일 패턴) — anon 또는 다른 user_id 환불 차단
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: caller mismatch';
  END IF;

  -- amount 범위 검증 — 음수/0/과도 환불 차단
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- 환불: credits + amount, total_used - amount (0 이하 0 cap)
  UPDATE public.user_credits
     SET credits    = credits + p_amount,
         total_used = GREATEST(0, total_used - p_amount),
         updated_at = NOW()
   WHERE user_id = p_user_id
   RETURNING credits INTO v_remaining;

  -- row 없으면 신규 생성 (use_credit 가 일반적으로 row 보장하지만 방어)
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


-- ── 검증 SQL (작업자가 RUN) ──────────────────────────────────
--
-- 1. 함수 존재 + search_path 설정:
-- SELECT proname, proconfig FROM pg_proc
--  WHERE proname = 'refund_credit' AND pronamespace = 'public'::regnamespace;
-- 기대: proconfig 에 'search_path=public, pg_temp' 포함.
--
-- 2. caller 검증 — auth.uid() 미설정 호출:
-- SELECT public.refund_credit('00000000-0000-0000-0000-000000000001'::uuid, 1);
-- 기대: ERROR forbidden: caller mismatch (anon role + auth.uid()=NULL).
--
-- 3. amount 범위:
-- SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- SELECT public.refund_credit('00000000-0000-0000-0000-000000000001'::uuid, -1);
-- 기대: ERROR invalid_amount.
-- SELECT public.refund_credit('00000000-0000-0000-0000-000000000001'::uuid, 999);
-- 기대: ERROR invalid_amount.
--
-- 4. 정상 환불 round-trip:
-- INSERT INTO user_credits (user_id, credits, total_used)
--   VALUES ('00000000-0000-0000-0000-000000000001', 5, 5)
--   ON CONFLICT DO NOTHING;
-- SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- SELECT public.refund_credit('00000000-0000-0000-0000-000000000001'::uuid, 1);
-- 기대: { "success": true, "remaining": 6 }; total_used 4 로 감소.


-- ============================================
-- 롤백 SQL (필요 시 SQL Editor 에 paste + RUN)
-- ============================================
-- DROP FUNCTION IF EXISTS public.refund_credit(UUID, INTEGER);
-- ⚠️ 롤백 후엔 generation 실패 시 환불 동작 X (사용자 신뢰 회귀).
