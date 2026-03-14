-- ============================================
-- hospital_crawled_posts: source_blog_id 컬럼 추가 + 트리거를 URL별 10개로 변경
-- Supabase Dashboard > SQL Editor에서 실행
-- ============================================

-- 1. source_blog_id 컬럼 추가 (없으면)
ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS source_blog_id TEXT;

-- 2. 기존 데이터 backfill: url에서 blogId 파싱
-- blog.naver.com/{blogId}/... → blogId 추출
UPDATE public.hospital_crawled_posts
SET source_blog_id = (regexp_match(url, 'blog\.naver\.com/([^/?#]+)'))[1]
WHERE source_blog_id IS NULL
  AND url LIKE '%blog.naver.com%';

-- url이 네이버 블로그가 아닌 경우 'unknown'으로 설정
UPDATE public.hospital_crawled_posts
SET source_blog_id = 'unknown'
WHERE source_blog_id IS NULL;

-- 3. 인덱스 추가 (hospital_name + source_blog_id 복합)
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital_source
  ON public.hospital_crawled_posts(hospital_name, source_blog_id);

-- 4. 트리거 함수 교체: 병원 전체 10개 → 병원 + 출처 블로그별 10개
CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
RETURNS TRIGGER AS $$
BEGIN
  -- NEW.source_blog_id가 NULL이면 url에서 파싱
  IF NEW.source_blog_id IS NULL THEN
    NEW.source_blog_id := coalesce(
      (regexp_match(NEW.url, 'blog\.naver\.com/([^/?#]+)'))[1],
      'unknown'
    );
  END IF;

  -- 같은 병원 + 같은 출처 블로그에서 10개 초과 시 오래된 것 삭제
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 트리거를 BEFORE INSERT로 변경 (source_blog_id 자동 설정 위해)
DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
CREATE TRIGGER trg_limit_crawled_posts
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();

-- ============================================
-- 검증 쿼리 (실행 후 결과 확인용)
-- ============================================

-- 컬럼 존재 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hospital_crawled_posts'
  AND column_name = 'source_blog_id';

-- backfill 결과 확인
SELECT source_blog_id, COUNT(*) AS cnt
FROM public.hospital_crawled_posts
GROUP BY source_blog_id
ORDER BY cnt DESC;

-- 트리거 확인
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'hospital_crawled_posts';
