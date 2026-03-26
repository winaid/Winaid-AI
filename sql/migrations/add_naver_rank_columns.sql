-- hospital_crawled_posts에 네이버 순위 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS naver_rank INTEGER,
  ADD COLUMN IF NOT EXISTS naver_rank_keyword TEXT;

COMMENT ON COLUMN public.hospital_crawled_posts.naver_rank IS '네이버 블로그 검색 순위 (30위 이내, null=순위외)';
COMMENT ON COLUMN public.hospital_crawled_posts.naver_rank_keyword IS '순위 체크에 사용된 검색 키워드';
