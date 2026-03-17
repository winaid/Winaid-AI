-- HospitalAI Supabase Database Schema
-- 이 SQL을 Supabase 대시보드의 SQL Editor에서 실행하세요.

-- ============================================
-- 1. Users Profile Table (auth.users 확장)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'standard', 'premium')),
  remaining_credits INTEGER DEFAULT 3,
  plan_expires_at TIMESTAMPTZ,
  ip_hash TEXT, -- 첫 가입 시 IP 해시 저장 (맛보기 중복 방지용)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles 테이블 RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필만 조회/수정 가능
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- 2. IP Usage Table (IP 기반 맛보기 제한)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ip_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT UNIQUE NOT NULL, -- SHA256 해시된 IP
  free_credits_used INTEGER DEFAULT 0,
  first_used_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- ip_usage 테이블 RLS 활성화
ALTER TABLE public.ip_usage ENABLE ROW LEVEL SECURITY;

-- Service role만 접근 가능 (클라이언트에서 직접 접근 불가)
CREATE POLICY "Service role can access ip_usage" ON public.ip_usage
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 3. Usage History Table (사용량 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS public.usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('generate_blog', 'generate_cardnews', 'generate_image')),
  credits_used INTEGER DEFAULT 1,
  ip_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- usage_history 테이블 RLS 활성화
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;

-- 본인 사용 기록만 조회 가능
CREATE POLICY "Users can view own usage history" ON public.usage_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON public.usage_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4. Payments Table (결제 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'standard', 'premium')),
  amount INTEGER NOT NULL, -- 원화 금액
  credits_added INTEGER, -- 추가된 크레딧 수 (프리미엄은 NULL)
  payment_method TEXT,
  payment_provider TEXT, -- 'toss', 'kakaopay', 'naverpay' 등
  transaction_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  expires_at TIMESTAMPTZ, -- 크레딧/구독 만료일
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- payments 테이블 RLS 활성화
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 본인 결제 기록만 조회 가능
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 5. Triggers & Functions
-- ============================================

-- 새 사용자 가입 시 프로필 자동 생성
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

-- auth.users에 트리거 연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- profiles 테이블에 updated_at 트리거 연결
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 6. Helper Functions (Edge Functions에서 호출)
-- ============================================

-- IP 해시로 무료 크레딧 사용량 확인 함수
CREATE OR REPLACE FUNCTION public.check_ip_usage(p_ip_hash TEXT)
RETURNS INTEGER AS $$
DECLARE
  usage_count INTEGER;
BEGIN
  SELECT free_credits_used INTO usage_count
  FROM public.ip_usage
  WHERE ip_hash = p_ip_hash;
  
  IF usage_count IS NULL THEN
    RETURN 0;
  END IF;
  
  RETURN usage_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- IP 무료 크레딧 사용 기록 함수
CREATE OR REPLACE FUNCTION public.record_ip_usage(p_ip_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO public.ip_usage (ip_hash, free_credits_used)
  VALUES (p_ip_hash, 1)
  ON CONFLICT (ip_hash) 
  DO UPDATE SET 
    free_credits_used = public.ip_usage.free_credits_used + 1,
    last_used_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용자 크레딧 차감 함수
CREATE OR REPLACE FUNCTION public.use_credit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
  current_plan TEXT;
BEGIN
  SELECT remaining_credits, plan INTO current_credits, current_plan
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- 프리미엄은 무제한
  IF current_plan = 'premium' THEN
    RETURN TRUE;
  END IF;
  
  -- 크레딧 부족
  IF current_credits <= 0 THEN
    RETURN FALSE;
  END IF;
  
  -- 크레딧 차감
  UPDATE public.profiles
  SET remaining_credits = remaining_credits - 1,
      updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Indexes for Performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);
CREATE INDEX IF NOT EXISTS idx_ip_usage_ip_hash ON public.ip_usage(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_history_user_id ON public.usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_history_created_at ON public.usage_history(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- ============================================
-- 8. Blog History Table (유사도 검사용)
-- ============================================
CREATE TABLE IF NOT EXISTS public.blog_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- HTML 태그 제거된 순수 텍스트
  html_content TEXT, -- 원본 HTML
  keywords TEXT[], -- 키워드 배열
  embedding VECTOR(768), -- Gemini Embedding 벡터 (768차원)
  naver_url TEXT, -- 네이버 블로그 URL
  category TEXT, -- 진료과
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- blog_history 테이블 RLS 활성화
ALTER TABLE public.blog_history ENABLE ROW LEVEL SECURITY;

-- 본인 이력만 조회/추가/삭제 가능
CREATE POLICY "Users can view own blog history" ON public.blog_history
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Users can insert own blog history" ON public.blog_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "Users can delete own blog history" ON public.blog_history
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 9. Blog History Indexes & Functions
-- ============================================

-- 기본 인덱스
CREATE INDEX IF NOT EXISTS idx_blog_history_user_id ON public.blog_history(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_history_published_at ON public.blog_history(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_history_category ON public.blog_history(category);

-- 벡터 유사도 검색 인덱스 (pgvector 확장 필요)
-- Supabase에서 pgvector 확장이 활성화된 경우에만 작동
CREATE EXTENSION IF NOT EXISTS vector;

-- IVFFlat 인덱스 (빠른 유사도 검색)
CREATE INDEX IF NOT EXISTS idx_blog_history_embedding ON public.blog_history 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 유사도 검색 함수 (코사인 유사도 기반)
CREATE OR REPLACE FUNCTION match_blog_posts(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  html_content TEXT,
  keywords TEXT[],
  naver_url TEXT,
  category TEXT,
  published_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    blog_history.id,
    blog_history.title,
    blog_history.content,
    blog_history.html_content,
    blog_history.keywords,
    blog_history.naver_url,
    blog_history.category,
    blog_history.published_at,
    1 - (blog_history.embedding <=> query_embedding) AS similarity
  FROM public.blog_history
  WHERE 
    (filter_user_id IS NULL OR blog_history.user_id = filter_user_id)
    AND blog_history.embedding IS NOT NULL
    AND 1 - (blog_history.embedding <=> query_embedding) > match_threshold
  ORDER BY blog_history.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- 10. Hospital Style Profiles (병원별 말투 학습)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hospital_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL UNIQUE,       -- 병원명 (teamHospitals.ts와 매칭)
  team_id INTEGER,                          -- 팀 ID (1, 2, 3)
  naver_blog_url TEXT,                      -- 네이버 블로그 URL
  crawled_posts_count INTEGER DEFAULT 0,   -- 수집된 글 수
  style_profile JSONB DEFAULT '{}',         -- Gemini 분석 결과 (말투 프로파일)
  raw_sample_text TEXT,                     -- 크롤링된 샘플 텍스트 (최대 10000자)
  last_crawled_at TIMESTAMPTZ,              -- 마지막 크롤링 시각
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.hospital_style_profiles ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 조회 가능 (말투 적용은 로그인 사용자 전체)
CREATE POLICY "Authenticated users can view style profiles" ON public.hospital_style_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- 인증된 사용자가 생성/수정 가능 (어드민 화면에서 URL 저장 + 학습 실행)
CREATE POLICY "Authenticated users can insert style profiles" ON public.hospital_style_profiles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update style profiles" ON public.hospital_style_profiles
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 관리자(service_role)는 삭제 가능
CREATE POLICY "Service role can delete style profiles" ON public.hospital_style_profiles
  FOR DELETE USING (auth.role() = 'service_role');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_hospital_style_hospital_name ON public.hospital_style_profiles(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hospital_style_team_id ON public.hospital_style_profiles(team_id);

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS update_hospital_style_profiles_updated_at ON public.hospital_style_profiles;
CREATE TRIGGER update_hospital_style_profiles_updated_at
  BEFORE UPDATE ON public.hospital_style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 11. Hospital Crawled Posts (병원별 크롤링 글 보관 + 채점)
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

CREATE POLICY "Authenticated users can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital ON public.hospital_crawled_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_crawled_at ON public.hospital_crawled_posts(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source ON public.hospital_crawled_posts(hospital_name, source_blog_id);

-- BEFORE INSERT: source_blog_id 자동 설정
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

-- AFTER INSERT: 출처 블로그별 10개 초과 시 오래된 것 삭제
-- upsert 충돌(ON CONFLICT DO UPDATE) 시 AFTER INSERT는 발동하지 않아 데이터 유실 없음
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

DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
DROP TRIGGER IF EXISTS trg_set_source_blog_id ON public.hospital_crawled_posts;

CREATE TRIGGER trg_set_source_blog_id
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION set_crawled_post_source_blog_id();

CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();

-- ============================================
-- 완료!
-- ============================================
-- 다음 단계:
-- 1. Supabase Dashboard > Authentication > Providers에서 Google, Kakao, Naver OAuth 설정
-- 2. Edge Function 배포하여 결제 웹훅 처리
-- 3. 환경변수 설정: SUPABASE_URL, SUPABASE_ANON_KEY

-- ============================================
-- 11. Profiles에 team_id 컬럼 추가 (팀 내부 인증용)
-- ============================================
-- 기존 profiles 테이블에 team_id 컬럼 추가 (없으면)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
-- 기존 name -> full_name 마이그레이션 (이미 full_name이 없는 경우)
UPDATE public.profiles SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON public.profiles(team_id);

-- ============================================
-- 12. Supabase Storage — blog-images 버킷
-- 생성된 AI 이미지를 저장하고 public URL로 제공
-- base64 → URL 전환으로 payload 8MB → 수KB 축소
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,           -- public 접근 허용 (이미지 URL로 직접 접근)
  5242880,        -- 5MB per file
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: 누구나 읽기 가능 (public bucket)
CREATE POLICY "Public read blog-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

-- RLS: 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated upload blog-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'blog-images' AND auth.role() = 'authenticated');

-- RLS: anon 사용자도 업로드 가능 (비로그인 사용자 지원)
CREATE POLICY "Anon upload blog-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'blog-images' AND auth.role() = 'anon');
