-- ============================================
-- WINAID 전체 DB 설정 (한 번에 실행)
-- Supabase Dashboard > SQL Editor에서 붙여넣기 후 RUN
--
-- 포함 내용:
--   1. generated_posts 테이블
--   2. subscriptions 테이블
--   3. api_usage_logs 테이블
--   4. Admin RPC 함수 (비밀번호: winaid)
--   5. anon RLS 정책 (관리자 페이지용)
--   6. hospital_style_profiles / hospital_crawled_posts
-- ============================================


-- ============================================
-- 1. generated_posts 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.generated_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  ip_hash TEXT,
  hospital_name TEXT,
  category TEXT,
  doctor_name TEXT,
  doctor_title TEXT,
  post_type TEXT NOT NULL CHECK (post_type IN ('blog', 'card_news', 'press_release')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  plain_text TEXT,
  keywords TEXT[],
  topic TEXT,
  image_style TEXT,
  slide_count INT,
  char_count INT,
  word_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (이미 있으면 무시)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generated_posts' AND policyname='Users can insert own posts') THEN
    CREATE POLICY "Users can insert own posts" ON public.generated_posts FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generated_posts' AND policyname='Users can view own posts') THEN
    CREATE POLICY "Users can view own posts" ON public.generated_posts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generated_posts' AND policyname='Service role can view all posts') THEN
    CREATE POLICY "Service role can view all posts" ON public.generated_posts FOR SELECT USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generated_posts' AND policyname='Service role can delete posts') THEN
    CREATE POLICY "Service role can delete posts" ON public.generated_posts FOR DELETE USING (auth.role() = 'service_role');
  END IF;
  -- anon도 INSERT 허용 (비로그인 사용자 글 저장)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generated_posts' AND policyname='Anon can insert posts') THEN
    CREATE POLICY "Anon can insert posts" ON public.generated_posts FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON public.generated_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_post_type ON public.generated_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_generated_posts_hospital ON public.generated_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON public.generated_posts(created_at DESC);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_generated_posts_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_generated_posts_timestamp ON public.generated_posts;
CREATE TRIGGER update_generated_posts_timestamp
  BEFORE UPDATE ON public.generated_posts
  FOR EACH ROW EXECUTE FUNCTION update_generated_posts_updated_at();


-- ============================================
-- 2. subscriptions 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'standard', 'premium')),
  credits_total INT NOT NULL DEFAULT 3,
  credits_used INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can view own subscription') THEN
    CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can insert own subscription') THEN
    CREATE POLICY "Users can insert own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can update own subscription') THEN
    CREATE POLICY "Users can update own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);


-- ============================================
-- 3. api_usage_logs 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_calls INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  details JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_usage_logs' AND policyname='Users can view own api usage') THEN
    CREATE POLICY "Users can view own api usage" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_usage_logs' AND policyname='Users can insert own api usage') THEN
    CREATE POLICY "Users can insert own api usage" ON public.api_usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON public.api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage_logs(created_at DESC);


-- ============================================
-- 4. hospital_style_profiles 테이블 (말투 학습)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hospital_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL UNIQUE,
  team_id INTEGER,
  naver_blog_url TEXT,
  crawled_posts_count INTEGER DEFAULT 0,
  style_profile JSONB DEFAULT '{}',
  raw_sample_text TEXT,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hospital_style_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- authenticated 사용자 정책
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Authenticated users can view style profiles') THEN
    CREATE POLICY "Authenticated users can view style profiles" ON public.hospital_style_profiles FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Authenticated users can insert style profiles') THEN
    CREATE POLICY "Authenticated users can insert style profiles" ON public.hospital_style_profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Authenticated users can update style profiles') THEN
    CREATE POLICY "Authenticated users can update style profiles" ON public.hospital_style_profiles FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  -- anon 사용자 정책 (비밀번호만으로 admin 접근 시)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Anon can view style profiles') THEN
    CREATE POLICY "Anon can view style profiles" ON public.hospital_style_profiles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Anon can insert style profiles') THEN
    CREATE POLICY "Anon can insert style profiles" ON public.hospital_style_profiles FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Anon can update style profiles') THEN
    CREATE POLICY "Anon can update style profiles" ON public.hospital_style_profiles FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_style_profiles' AND policyname='Anon can delete style profiles') THEN
    CREATE POLICY "Anon can delete style profiles" ON public.hospital_style_profiles FOR DELETE USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hospital_style_hospital_name ON public.hospital_style_profiles(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hospital_style_team_id ON public.hospital_style_profiles(team_id);


-- ============================================
-- 5. hospital_crawled_posts 테이블 (크롤링 글)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hospital_crawled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  source_blog_id TEXT,                   -- 출처 블로그 ID (blog.naver.com/{blogId})
  score_typo INTEGER,
  score_medical_law INTEGER,
  score_total INTEGER,
  typo_issues JSONB DEFAULT '[]',
  law_issues JSONB DEFAULT '[]',
  corrected_content TEXT,
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  scored_at TIMESTAMPTZ,
  UNIQUE(hospital_name, url)
);

ALTER TABLE public.hospital_crawled_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- authenticated 사용자 정책
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_crawled_posts' AND policyname='Authenticated users can view crawled posts') THEN
    CREATE POLICY "Authenticated users can view crawled posts" ON public.hospital_crawled_posts FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_crawled_posts' AND policyname='Authenticated users can insert crawled posts') THEN
    CREATE POLICY "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_crawled_posts' AND policyname='Authenticated users can update crawled posts') THEN
    CREATE POLICY "Authenticated users can update crawled posts" ON public.hospital_crawled_posts FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_crawled_posts' AND policyname='Authenticated users can delete crawled posts') THEN
    CREATE POLICY "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 2026-04-11 RLS 강화: 기존 anon 쓰기 정책을 모두 제거하고 읽기만 허용.
-- 하단의 DROP/CREATE 는 재실행 안전하며, 위 DO 블록의 authenticated 정책과
-- 함께 공존하게 설계됨(같은 authenticated 정책을 DROP→CREATE 로 재적용).
DROP POLICY IF EXISTS "Anon can view crawled posts"                  ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can insert crawled posts"                ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can update crawled posts"                ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can delete crawled posts"                ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can view crawled posts"   ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can update crawled posts" ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anyone can read crawled posts"                ON public.hospital_crawled_posts;

CREATE POLICY "Anyone can read crawled posts"
  ON public.hospital_crawled_posts FOR SELECT
  USING (true);
CREATE POLICY "Authenticated users can insert crawled posts"
  ON public.hospital_crawled_posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update crawled posts"
  ON public.hospital_crawled_posts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete crawled posts"
  ON public.hospital_crawled_posts FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital ON public.hospital_crawled_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_crawled_at ON public.hospital_crawled_posts(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source ON public.hospital_crawled_posts(hospital_name, source_blog_id);


-- ============================================
-- 6. Admin RPC 함수 (비밀번호: winaid)
--    ★ 이게 없으면 Admin 로그인 안 됨!
-- ============================================

-- 6-1. get_admin_stats: 통계 조회
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;  -- 빈 결과 반환 (예외 대신)
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$fn$;

-- 6-2. get_all_generated_posts: 모든 글 조회
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  ip_hash TEXT,
  hospital_name TEXT,
  category TEXT,
  doctor_name TEXT,
  doctor_title TEXT,
  post_type TEXT,
  title TEXT,
  content TEXT,
  plain_text TEXT,
  keywords TEXT[],
  topic TEXT,
  image_style TEXT,
  slide_count INT,
  char_count INT,
  word_count INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gp.id, gp.user_id, gp.user_email, gp.ip_hash,
    gp.hospital_name, gp.category, gp.doctor_name, gp.doctor_title,
    gp.post_type, gp.title, gp.content, gp.plain_text,
    gp.keywords, gp.topic, gp.image_style, gp.slide_count,
    gp.char_count, gp.word_count, gp.created_at, gp.updated_at
  FROM public.generated_posts gp
  WHERE
    (filter_post_type IS NULL OR gp.post_type = filter_post_type)
    AND (filter_hospital IS NULL OR gp.hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY gp.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$fn$;

-- 6-3. delete_generated_post: 글 삭제
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$fn$;

-- 6-3b. delete_all_generated_posts: 전체 콘텐츠 삭제 (admin 전용)
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
  deleted_count BIGINT;
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;  -- 인증 실패
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

-- 6-4. 크레딧 차감 함수
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
  SELECT plan_type, credits_total, credits_used, expires_at
  INTO v_plan, v_total, v_used, v_expires
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_plan = 'premium' THEN
    UPDATE public.subscriptions SET credits_used = credits_used + p_amount WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  IF v_expires IS NOT NULL AND v_expires < NOW() THEN RETURN FALSE; END IF;
  IF (v_total - v_used) < p_amount THEN RETURN FALSE; END IF;

  UPDATE public.subscriptions SET credits_used = credits_used + p_amount WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;


-- ============================================
-- 7. usage_logs 테이블 (일반 사용 로그)
-- ============================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='Users can view own logs') THEN
    CREATE POLICY "Users can view own logs" ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='Users can insert own logs') THEN
    CREATE POLICY "Users can insert own logs" ON public.usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='Users can delete own logs') THEN
    CREATE POLICY "Users can delete own logs" ON public.usage_logs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================
-- 완료!
-- ============================================
-- 이 SQL 실행 후 Admin 로그인 (비밀번호: winaid) 가능
-- 말투 학습, 크롤링, 콘텐츠 관리 모두 작동
-- ============================================
