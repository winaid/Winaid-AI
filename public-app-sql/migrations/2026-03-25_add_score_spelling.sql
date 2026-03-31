-- hospital_crawled_posts: score_spelling 컬럼 추가
-- upsert 시 score_spelling 필드가 없어 400 에러 발생

ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS score_spelling INTEGER;
