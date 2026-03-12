-- ============================================
-- Generated Posts 테이블 (모든 사용자 글 저장 - Admin 조회용)
-- Supabase 대시보드 > SQL Editor에서 실행
-- ============================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.generated_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 사용자 정보
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  ip_hash TEXT, -- 비로그인 사용자 식별용
  
  -- 병원 정보
  hospital_name TEXT,
  category TEXT, -- 진료과
  doctor_name TEXT,
  doctor_title TEXT,
  
  -- 콘텐츠 정보
  post_type TEXT NOT NULL CHECK (post_type IN ('blog', 'card_news', 'press_release')),
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- HTML 본문
  plain_text TEXT, -- 순수 텍스트 (검색용)
  keywords TEXT[], -- SEO 키워드 배열
  
  -- 메타 정보
  topic TEXT, -- 원본 주제
  image_style TEXT, -- 이미지 스타일
  slide_count INT, -- 카드뉴스 슬라이드 수
  
  -- 통계
  char_count INT, -- 글자수
  word_count INT, -- 단어수
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS 활성화
ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책 설정

-- 모든 인증된 사용자가 자신의 글 삽입 가능
CREATE POLICY "Users can insert own posts" ON public.generated_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 본인 글만 조회 가능 (일반 사용자)
CREATE POLICY "Users can view own posts" ON public.generated_posts
  FOR SELECT USING (auth.uid() = user_id);

-- ⚠️ Admin 조회용 - service_role로 모든 글 조회 가능
-- Supabase Edge Function 또는 서버에서 service_role 키로 접근 시 모든 데이터 조회
CREATE POLICY "Service role can view all posts" ON public.generated_posts
  FOR SELECT USING (auth.role() = 'service_role');

-- Admin 삭제 권한 (service_role)
CREATE POLICY "Service role can delete posts" ON public.generated_posts
  FOR DELETE USING (auth.role() = 'service_role');

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON public.generated_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_post_type ON public.generated_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_generated_posts_hospital ON public.generated_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_generated_posts_category ON public.generated_posts(category);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON public.generated_posts(created_at DESC);

-- 5. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_generated_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_generated_posts_timestamp ON public.generated_posts;
CREATE TRIGGER update_generated_posts_timestamp
  BEFORE UPDATE ON public.generated_posts
  FOR EACH ROW EXECUTE FUNCTION update_generated_posts_updated_at();

-- ============================================
-- Admin용 조회 함수 (anon key로도 admin 인증 시 조회 가능)
-- ============================================

-- Admin 비밀번호 확인 후 모든 글 조회하는 함수
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
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE'; -- Admin 비밀번호 (실제로는 환경변수로 관리)
BEGIN
  -- 비밀번호 확인
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  
  -- 모든 글 반환
  RETURN QUERY
  SELECT
    gp.id,
    gp.user_id,
    gp.user_email,
    gp.ip_hash,
    gp.hospital_name,
    gp.category,
    gp.doctor_name,
    gp.doctor_title,
    gp.post_type,
    gp.title,
    gp.content,
    gp.plain_text,
    gp.keywords,
    gp.topic,
    gp.image_style,
    gp.slide_count,
    gp.char_count,
    gp.word_count,
    gp.created_at,
    gp.updated_at
  FROM public.generated_posts gp
  WHERE
    (filter_post_type IS NULL OR gp.post_type = filter_post_type)
    AND (filter_hospital IS NULL OR gp.hospital_name ILIKE '%' || filter_hospital || '%')
  ORDER BY gp.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;

-- Admin 통계 함수
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
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
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
$$;

-- Admin 삭제 함수
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT := 'CHANGE_ME_IN_SUPABASE';
BEGIN
  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  
  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;

-- ============================================
-- 완료!
-- 이 SQL을 Supabase SQL Editor에서 실행 후
-- Admin 페이지에서 모든 사용자의 글을 조회할 수 있습니다.
-- ============================================
