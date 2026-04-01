-- ============================================
-- ⚠ 폐기됨 — 이 파일은 적용하지 마세요
-- 대체: 2026-03-21_add_workflow_type.sql
-- ============================================
--
-- 이 마이그레이션은 post_type에 'refine'을 추가하는 방식이었으나,
-- 콘텐츠 유형(post_type)과 작업 방식(workflow_type)을 분리하는
-- 방향으로 변경되었습니다.
--
-- 아래 내용은 참고용으로만 남겨둡니다. 실행하지 마세요.

-- 1. 기존 CHECK 제약 제거 후 새 제약 추가
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release', 'refine'));

-- 2. (선택) 기존에 blog로 위장 저장된 AI 보정 데이터를 refine으로 수정
-- 이 쿼리는 [AI 보정] 접두사가 있는 기존 데이터만 대상으로 함
UPDATE public.generated_posts
SET post_type = 'refine',
    title = REGEXP_REPLACE(title, '^\[AI 보정\]\s*', ''),
    topic = REGEXP_REPLACE(topic, '^\[AI 보정[^]]*\]\s*', '')
WHERE post_type = 'blog'
  AND (title LIKE '[AI 보정]%' OR topic LIKE '[AI 보정%');

-- 3. admin 통계 함수에 refine_count 추가
-- get_admin_stats 반환 타입에 refine_count 추가
DROP FUNCTION IF EXISTS get_admin_stats(TEXT);

CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  refine_count BIGINT,
  total_users BIGINT,
  recent_posts BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 비밀번호 확인
  IF admin_password != current_setting('app.settings.admin_password', true) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE post_type = 'refine')::BIGINT AS refine_count,
    COUNT(DISTINCT user_id)::BIGINT AS total_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::BIGINT AS recent_posts
  FROM public.generated_posts;
END;
$$;
