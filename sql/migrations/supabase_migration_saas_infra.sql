-- ============================================
-- SaaS 인프라 마이그레이션 (2026-03)
-- 크레딧 시스템 + API 사용량 추적
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================


-- ============================================
-- 1. subscriptions 테이블 (크레딧/요금제 관리)
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'standard', 'premium')),
  credits_total INT NOT NULL DEFAULT 3,
  credits_used INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ, -- NULL = 무기한
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscriptions_updated_at();


-- ============================================
-- 2. 크레딧 차감 RPC 함수
-- ============================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_total INT;
  v_used INT;
  v_expires TIMESTAMPTZ;
BEGIN
  -- 현재 구독 정보 조회
  SELECT plan_type, credits_total, credits_used, expires_at
  INTO v_plan, v_total, v_used, v_expires
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  -- 구독 정보 없으면 실패
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 프리미엄은 무제한
  IF v_plan = 'premium' THEN
    -- 사용량만 기록 (차감은 안 함)
    UPDATE public.subscriptions
    SET credits_used = credits_used + p_amount
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- 만료 확인
  IF v_expires IS NOT NULL AND v_expires < NOW() THEN
    RETURN FALSE;
  END IF;

  -- 잔여 크레딧 확인
  IF (v_total - v_used) < p_amount THEN
    RETURN FALSE;
  END IF;

  -- 차감
  UPDATE public.subscriptions
  SET credits_used = credits_used + p_amount
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;


-- ============================================
-- 3. api_usage_logs 테이블 (API 호출 비용 추적)
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 요약 데이터
  total_calls INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,

  -- 상세 데이터 (JSON)
  details JSONB DEFAULT '[]',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api usage"
  ON public.api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api usage"
  ON public.api_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON public.api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage_logs(created_at DESC);


-- ============================================
-- 4. generated_posts에 누락된 RLS 정책 보완
--    (이미 있으면 무시됨)
-- ============================================
DO $$
BEGIN
  -- 본인 글 조회 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generated_posts' AND policyname = 'Users can view own posts'
  ) THEN
    CREATE POLICY "Users can view own posts" ON public.generated_posts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================
-- 5. 사용량 통계 뷰 (Admin 대시보드용)
-- ============================================
CREATE OR REPLACE VIEW public.user_usage_summary AS
SELECT
  s.user_id,
  s.plan_type,
  s.credits_total,
  s.credits_used,
  s.credits_total - s.credits_used AS credits_remaining,
  s.expires_at,
  COALESCE(a.total_api_calls, 0) AS total_api_calls,
  COALESCE(a.total_cost, 0) AS total_api_cost_usd,
  COALESCE(p.post_count, 0) AS total_posts
FROM public.subscriptions s
LEFT JOIN (
  SELECT user_id,
    SUM(total_calls) AS total_api_calls,
    SUM(total_cost_usd) AS total_cost
  FROM public.api_usage_logs
  GROUP BY user_id
) a ON s.user_id = a.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS post_count
  FROM public.generated_posts
  GROUP BY user_id
) p ON s.user_id = p.user_id;


-- ============================================
-- 완료!
-- ============================================
-- 실행 후 확인:
--   SELECT * FROM public.subscriptions LIMIT 5;
--   SELECT * FROM public.api_usage_logs LIMIT 5;
--   SELECT * FROM public.user_usage_summary LIMIT 5;
--
-- 테스트:
--   SELECT public.deduct_credits('YOUR_USER_UUID', 1);
