-- 2026-05-12 RLS 응급 — 매출/구독 자가-승격 차단
--
-- 배경 (외부 리뷰 agent 보고, public-app 전용):
--   1) public.subscriptions: `Anon can insert/update subscription USING(true)` 정책으로
--      anon key 만 있으면 누구나 임의 user_id 의 plan/credits 컬럼 변조 가능
--      → 자기를 premium 으로 승격 + credits 무한 부여 시나리오.
--   2) public.user_credits: `Users can update own credits` 정책으로 사용자가 본인 row 의
--      credits 컬럼을 직접 UPDATE 가능 → use_credit/refund_credit RPC (SECURITY DEFINER)
--      를 우회해 결제 모델 무력화.
--
-- 정책:
--   - subscriptions UPDATE/INSERT 는 본인 row (`auth.uid() = user_id`) 만 — 기존 "Users can ..."
--     정책 그대로 유지. Anon override 만 제거.
--   - user_credits UPDATE 경로는 SECURITY DEFINER RPC (use_credit / refund_credit) 만 허용.
--     사용자 직접 UPDATE 정책 제거.
--   - user_credits INSERT 는 본인 row 만 허용 (가입 흐름에서 row 생성용). 기존엔 INSERT
--     정책이 명시되지 않아 가입 흐름이 어떻게 통과했는지는 별도 확인 필요 — 명시적 추가로
--     동작 보장.
--
-- 영향 범위:
--   - public-app 만. next-app DB 와는 별도 인스턴스.
--   - 정상 가입/사용 흐름은 그대로 동작. 비정상 (직접 SQL 또는 anon key 로 변조) 만 차단.
--
-- 롤백:
--   - 본 마이그레이션의 DROP POLICY 문을 CREATE POLICY 로 다시 만들면 원복 가능.
--     단 정상 동작과는 무관한 결함 정책이므로 롤백 시 반드시 사유 명시.

BEGIN;

-- 1) subscriptions: anon override 제거
DROP POLICY IF EXISTS "Anon can insert subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Anon can update subscription" ON public.subscriptions;

-- 2) user_credits: 사용자 직접 UPDATE 제거 (RPC SECURITY DEFINER 만 경로)
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;

-- 3) user_credits: 본인 row INSERT 허용 (가입 흐름에서 row 생성). 누락 시 신규
--    회원가입에서 user_credits upsert 가 RLS 거절 가능 — 명시적 추가로 보장.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_credits' AND policyname='Users can insert own credits'
  ) THEN
    CREATE POLICY "Users can insert own credits" ON public.user_credits
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4) RPC SECURITY DEFINER 확인 (정보용 SELECT — DDL 변경 X)
--    이미 SECURITY DEFINER 면 본 마이그레이션은 동작 변경 없음.
--    아니면 후속 마이그레이션에서 ALTER FUNCTION ... SECURITY DEFINER 필요.
DO $$
DECLARE
  use_credit_secdef BOOLEAN;
  refund_credit_secdef BOOLEAN;
BEGIN
  SELECT prosecdef INTO use_credit_secdef FROM pg_proc
    WHERE proname = 'use_credit' AND pronamespace = 'public'::regnamespace LIMIT 1;
  SELECT prosecdef INTO refund_credit_secdef FROM pg_proc
    WHERE proname = 'refund_credit' AND pronamespace = 'public'::regnamespace LIMIT 1;
  RAISE NOTICE '[RLS-FIX] use_credit SECURITY DEFINER = %, refund_credit SECURITY DEFINER = %',
    COALESCE(use_credit_secdef::TEXT, 'NULL'),
    COALESCE(refund_credit_secdef::TEXT, 'NULL');
  IF use_credit_secdef IS NOT TRUE OR refund_credit_secdef IS NOT TRUE THEN
    RAISE WARNING '[RLS-FIX] 결제 RPC 가 SECURITY DEFINER 아님 — 후속 마이그레이션에서 ALTER 필요';
  END IF;
END $$;

COMMIT;
