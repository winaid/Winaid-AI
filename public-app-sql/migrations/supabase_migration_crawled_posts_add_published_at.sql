-- ============================================
-- hospital_crawled_posts: published_at 등 메타데이터 컬럼 추가
-- 기존 테이블에 ALTER TABLE로 추가 (이미 테이블이 있는 경우)
-- ============================================

-- 새 컬럼 추가
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.hospital_crawled_posts ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- published_at 기준 인덱스 (최신순 정렬용)
CREATE INDEX IF NOT EXISTS idx_crawled_posts_published_at
  ON public.hospital_crawled_posts(published_at DESC NULLS LAST);
