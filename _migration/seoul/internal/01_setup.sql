-- ============================================
-- Chunk A: bootstrap (sections 0,1-6,9,10) + extra storage buckets
-- SKIPPED: section 7 (usage_logs DEAD) + section 8 (blog_history DEAD)
-- ============================================

-- ============================================
-- WINAID 새 Supabase 프로젝트 Bootstrap SQL
-- 생성일: 2026-03-24
-- ============================================
-- 적용 방법:
--   1. Supabase Dashboard > SQL Editor
--   2. 이 파일 전체를 붙여넣기
--   3. RUN 클릭
--   4. 맨 아래 smoke test 3개로 검증
--
-- 포함 범위 (next-app 코드 기준):
--   - profiles (auth.ts)
--   - subscriptions (auth.ts)
--   - generated_posts + workflow_type (postStorage.ts, admin/page.tsx)
--   - hospital_style_profiles (styleService.ts)
--   - hospital_crawled_posts (styleService.ts)
--   - api_usage_logs (creditService — old에서 이식 예정)
--   - usage_logs (old에서 이식 예정)
--   - Admin RPC 4개 (admin/page.tsx)
--   - deduct_credits RPC (creditService)
--   - Storage: blog-images 버킷 (이미지 생성)
--   - pgvector: blog_history + match_blog_posts (유사도 검사)
--
-- 제외:
--   - medical_law_cache (next-app 미사용, old 전용)
--   - error_logs (old 전용, next-app 미사용)
--   - ip_usage / usage_history / payments (schema.sql 정의만 있고 next-app 미사용)
-- ============================================


-- ============================================
-- 0. Extensions
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================
-- 1. profiles 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  name TEXT,
  avatar_url TEXT,
  team_id INTEGER,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'standard', 'premium')),
  remaining_credits INTEGER DEFAULT 3,
  plan_expires_at TIMESTAMPTZ,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'standard', 'premium'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS remaining_credits INTEGER DEFAULT 3;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile" ON public.profiles
  FOR DELETE USING (auth.uid() = id);
-- anon: admin 페이지에서 프로필 목록 조회용
DROP POLICY IF EXISTS "Anon can view profiles" ON public.profiles;
CREATE POLICY "Anon can view profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON public.profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);

-- 새 사용자 가입 시 프로필 자동 생성 트리거
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at 자동 갱신 (공용)
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


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
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'standard', 'premium'));
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS credits_total INT NOT NULL DEFAULT 3;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS credits_used INT NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
-- anon: auth.ts에서 upsert 시 필요
DROP POLICY IF EXISTS "Anon can insert subscription" ON public.subscriptions;
CREATE POLICY "Anon can insert subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can update subscription" ON public.subscriptions;
CREATE POLICY "Anon can update subscription" ON public.subscriptions
  FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);


-- ============================================
-- 3. generated_posts 테이블
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
  workflow_type TEXT NOT NULL DEFAULT 'generate' CHECK (workflow_type IN ('generate', 'refine')),
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
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS doctor_title TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL CHECK (post_type IN ('blog', 'card_news', 'press_release'));
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS workflow_type TEXT NOT NULL DEFAULT 'generate' CHECK (workflow_type IN ('generate', 'refine'));
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS title TEXT NOT NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS content TEXT NOT NULL;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS plain_text TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS image_style TEXT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS slide_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS char_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS word_count INT;
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.generated_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own posts" ON public.generated_posts;
CREATE POLICY "Users can insert own posts" ON public.generated_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
DROP POLICY IF EXISTS "Users can view own posts" ON public.generated_posts;
CREATE POLICY "Users can view own posts" ON public.generated_posts
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can view all posts" ON public.generated_posts;
CREATE POLICY "Service role can view all posts" ON public.generated_posts
  FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can delete posts" ON public.generated_posts;
CREATE POLICY "Service role can delete posts" ON public.generated_posts
  FOR DELETE USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Anon can insert posts" ON public.generated_posts;
CREATE POLICY "Anon can insert posts" ON public.generated_posts
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can view posts" ON public.generated_posts;
CREATE POLICY "Anon can view posts" ON public.generated_posts
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON public.generated_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_post_type ON public.generated_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_generated_posts_hospital ON public.generated_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON public.generated_posts(created_at DESC);

DROP FUNCTION IF EXISTS public.update_generated_posts_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION update_generated_posts_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_generated_posts_timestamp ON public.generated_posts;
CREATE TRIGGER update_generated_posts_timestamp
  BEFORE UPDATE ON public.generated_posts
  FOR EACH ROW EXECUTE FUNCTION update_generated_posts_updated_at();


-- ============================================
-- 4. hospital_style_profiles 테이블
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
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS hospital_name TEXT NOT NULL;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS naver_blog_url TEXT;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS crawled_posts_count INTEGER DEFAULT 0;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS style_profile JSONB DEFAULT '{}';
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS raw_sample_text TEXT;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ;
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hospital_style_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.hospital_style_profiles ENABLE ROW LEVEL SECURITY;

-- authenticated
DROP POLICY IF EXISTS "Authenticated users can view style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Authenticated users can view style profiles" ON public.hospital_style_profiles
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can insert style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Authenticated users can insert style profiles" ON public.hospital_style_profiles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can update style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Authenticated users can update style profiles" ON public.hospital_style_profiles
  FOR UPDATE USING (auth.role() = 'authenticated');
-- anon (admin 비밀번호 접근)
DROP POLICY IF EXISTS "Anon can view style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can view style profiles" ON public.hospital_style_profiles
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon can insert style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can insert style profiles" ON public.hospital_style_profiles
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can update style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can update style profiles" ON public.hospital_style_profiles
  FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anon can delete style profiles" ON public.hospital_style_profiles;
CREATE POLICY "Anon can delete style profiles" ON public.hospital_style_profiles
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_hospital_style_hospital_name ON public.hospital_style_profiles(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hospital_style_team_id ON public.hospital_style_profiles(team_id);

DROP TRIGGER IF EXISTS update_hospital_style_profiles_updated_at ON public.hospital_style_profiles;
CREATE TRIGGER update_hospital_style_profiles_updated_at
  BEFORE UPDATE ON public.hospital_style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================
-- 5. hospital_crawled_posts 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.hospital_crawled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  source_blog_id TEXT,
  title TEXT,
  published_at TIMESTAMPTZ,
  summary TEXT,
  thumbnail TEXT,
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
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS hospital_name TEXT NOT NULL;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS url TEXT NOT NULL;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS source_blog_id TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_typo INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_medical_law INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS score_total INTEGER;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS typo_issues JSONB DEFAULT '[]';
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS law_issues JSONB DEFAULT '[]';
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS corrected_content TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS crawled_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

ALTER TABLE public.hospital_crawled_posts ENABLE ROW LEVEL SECURITY;

-- authenticated
DROP POLICY IF EXISTS "Authenticated users can view crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can update crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (auth.role() = 'authenticated');
-- anon
DROP POLICY IF EXISTS "Anon can view crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon can insert crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can update crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anon can delete crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anon can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital ON public.hospital_crawled_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_crawled_at ON public.hospital_crawled_posts(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source ON public.hospital_crawled_posts(hospital_name, source_blog_id);

-- source_blog_id 자동 설정 트리거
DROP FUNCTION IF EXISTS public.set_crawled_post_source_blog_id() CASCADE;
CREATE OR REPLACE FUNCTION set_crawled_post_source_blog_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_blog_id IS NULL THEN
    NEW.source_blog_id := coalesce(
      (regexp_match(NEW.url, 'blog\.naver\.com/([^/?#]+)'))[1],
      'unknown'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 출처 블로그별 10개 초과 시 오래된 것 삭제
DROP FUNCTION IF EXISTS public.limit_crawled_posts_per_hospital() CASCADE;
CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.hospital_crawled_posts
  WHERE hospital_name = NEW.hospital_name
    AND source_blog_id = NEW.source_blog_id
    AND id NOT IN (
      SELECT id FROM public.hospital_crawled_posts
      WHERE hospital_name = NEW.hospital_name
        AND source_blog_id = NEW.source_blog_id
      ORDER BY crawled_at DESC
      LIMIT 10
    );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_source_blog_id ON public.hospital_crawled_posts;
CREATE TRIGGER trg_set_source_blog_id
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION set_crawled_post_source_blog_id();

DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();


-- ============================================
-- 6. api_usage_logs 테이블
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
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_calls INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_input_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_output_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]';
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own api usage" ON public.api_usage_logs;
CREATE POLICY "Users can view own api usage" ON public.api_usage_logs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own api usage" ON public.api_usage_logs;
CREATE POLICY "Users can insert own api usage" ON public.api_usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Anon can insert api usage" ON public.api_usage_logs;
CREATE POLICY "Anon can insert api usage" ON public.api_usage_logs
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON public.api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage_logs(created_at DESC);


-- ============================================
-- 9. Admin RPC 함수 (비밀번호: winaid)
-- ============================================

-- 9-1. get_admin_stats
DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
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
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
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
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$fn$;

-- 9-2. get_all_generated_posts
DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
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
  workflow_type TEXT,
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
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gp.id, gp.user_id, gp.user_email, gp.ip_hash,
    gp.hospital_name, gp.category, gp.doctor_name, gp.doctor_title,
    gp.post_type, gp.workflow_type, gp.title, gp.content, gp.plain_text,
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

-- 9-3. delete_generated_post (파라미터: target_post_id — next-app admin/page.tsx 기준)
DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  target_post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = target_post_id;
  RETURN FOUND;
END;
$fn$;

-- 9-4. delete_all_generated_posts
DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

-- 9-5. deduct_credits
DROP FUNCTION IF EXISTS public.deduct_credits(UUID, integer) CASCADE;
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
-- 10. Storage: blog-images 버킷
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read blog-images" ON storage.objects;
CREATE POLICY "Public read blog-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "Authenticated upload blog-images" ON storage.objects;
CREATE POLICY "Authenticated upload blog-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'blog-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anon upload blog-images" ON storage.objects;
CREATE POLICY "Anon upload blog-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'blog-images' AND auth.role() = 'anon');


-- ============================================
-- 완료!
-- ============================================


-- ============================================
-- SMOKE TEST (실행 후 아래 3개를 각각 실행하여 검증)
-- ============================================

-- TEST 1: 모든 테이블 존재 확인 (7개 expected)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('profiles','subscriptions','generated_posts',
--       'hospital_style_profiles','hospital_crawled_posts',
--       'api_usage_logs','usage_logs','blog_history')
-- ORDER BY table_name;

-- TEST 2: Admin RPC 동작 확인 (빈 결과 = 정상, 에러 = 비정상)
-- SELECT * FROM get_admin_stats('winaid');

-- TEST 3: blog-images 버킷 존재 확인
-- SELECT id, name, public FROM storage.buckets WHERE id = 'blog-images';

-- ============================================
-- 11. Storage: hospital-images bucket (private)
--     Internal staff image library
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hospital-images', 'hospital-images', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 12. Storage: feedback-images bucket (public)
--     internal_feedbacks 의 첨부 이미지
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-images', 'feedback-images', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "feedback-images authenticated insert" ON storage.objects;
CREATE POLICY "feedback-images authenticated insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'feedback-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "feedback-images public read" ON storage.objects;
CREATE POLICY "feedback-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-images');

