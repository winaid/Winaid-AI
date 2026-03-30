-- ============================================
-- user_credits 테이블 + RPC 함수
-- Supabase SQL Editor에서 실행
-- ============================================

-- 크레딧 테이블
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 10,
  total_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS 정책
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- 크레딧 차감 RPC (원자적)
CREATE OR REPLACE FUNCTION use_credit(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits INTO current_credits
  FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

  IF current_credits <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_credits', 'remaining', 0);
  END IF;

  UPDATE user_credits
  SET credits = credits - 1, total_used = total_used + 1, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'remaining', current_credits - 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 크레딧 조회 RPC
CREATE OR REPLACE FUNCTION get_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result RECORD;
BEGIN
  INSERT INTO user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits, total_used INTO result
  FROM user_credits WHERE user_id = p_user_id;

  RETURN json_build_object('credits', result.credits, 'total_used', result.total_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
