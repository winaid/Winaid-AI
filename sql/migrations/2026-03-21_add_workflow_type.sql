-- ============================================
-- workflow_type 컬럼 추가 + post_type에서 'refine' 제거
-- Supabase 대시보드 > SQL Editor에서 실행
-- ============================================
--
-- 배경: post_type='refine'은 콘텐츠 유형(blog/card_news/press_release)과
-- 작업 방식(generate/refine)을 혼합한 잘못된 설계였음.
-- workflow_type 컬럼으로 분리하여 데이터 정합성을 복구함.
--
-- 실행 순서: 반드시 이 파일 전체를 순서대로 실행할 것.

-- 1. workflow_type 컬럼 추가 (기본값: 'generate')
ALTER TABLE public.generated_posts
  ADD COLUMN IF NOT EXISTS workflow_type TEXT NOT NULL DEFAULT 'generate';

-- 2. 기존 post_type='refine' 행을 workflow_type='refine', post_type='blog'로 보정
UPDATE public.generated_posts
SET workflow_type = 'refine',
    post_type = 'blog'
WHERE post_type = 'refine';

-- 3. post_type CHECK 제약을 원래 3종으로 복원
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release'));

-- 4. workflow_type CHECK 제약 추가
ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_workflow_type_check
  CHECK (workflow_type IN ('generate', 'refine'));

-- 5. admin 통계 함수 업데이트 — refine_count를 workflow_type 기준으로 변경
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
  IF admin_password != current_setting('app.settings.admin_password', true) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE workflow_type = 'refine')::BIGINT AS refine_count,
    COUNT(DISTINCT user_id)::BIGINT AS total_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::BIGINT AS recent_posts
  FROM public.generated_posts;
END;
$$;

-- 6. 검증 쿼리 (실행 후 확인용 — 문제없으면 결과 0행이어야 함)
-- SELECT * FROM public.generated_posts WHERE post_type = 'refine';
-- → 0행이면 마이그레이션 성공
