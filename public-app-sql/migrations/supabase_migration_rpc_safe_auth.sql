-- ============================================
-- RPC 인증 실패 안전 수정
-- RAISE EXCEPTION → 빈 결과 반환 방식으로 변경
--
-- 목적: 틀린 비밀번호가 DB 예외를 발생시키지 않고
--        빈 결과를 반환하여 Supabase JS 클라이언트 hang 방지
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- 비밀번호 'winaid' 설정 완료 — 그대로 실행 가능
-- ============================================

-- 1. get_admin_stats: 틀린 비밀번호 → 빈 행 반환 (RAISE EXCEPTION 제거)
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
  -- 비밀번호 불일치 시 빈 결과 반환 (예외 대신)
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

-- 2. get_all_generated_posts: 틀린 비밀번호 → 빈 행 반환
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
$fn$;

-- 3. delete_generated_post: 틀린 비밀번호 → FALSE 반환 (예외 대신)
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

-- ============================================
-- 완료!
-- 비밀번호가 이미 설정되어 있습니다. 그대로 실행하세요.
-- ============================================
