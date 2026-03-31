-- ============================================
-- hospital_crawled_posts: source_blog_id 컬럼 추가 + 트리거를 URL별 10개로 변경
-- Supabase Dashboard > SQL Editor에서 실행
-- ============================================
-- ⚠️ 주의: 트리거를 BEFORE + AFTER 2개로 분리
--   BEFORE INSERT: source_blog_id 자동 설정 (NEW 수정 가능)
--   AFTER INSERT:  출처별 LIMIT 10 삭제 (upsert 충돌 시 미발동 → 데이터 유실 방지)
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

-- 4-A. BEFORE INSERT 함수: source_blog_id 자동 설정만 담당
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

-- 4-B. AFTER INSERT 함수: 출처 블로그별 10개 초과 시 오래된 것 삭제
--      AFTER INSERT는 upsert 충돌(ON CONFLICT DO UPDATE) 시 발동하지 않으므로
--      기존 행 갱신 시 불필요한 삭제가 발생하지 않음
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
  RETURN NULL;  -- AFTER 트리거는 반환값 무시됨
END;
$$ LANGUAGE plpgsql;

-- 5. 기존 트리거 제거 후 2개 생성
DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
DROP TRIGGER IF EXISTS trg_set_source_blog_id ON public.hospital_crawled_posts;

-- BEFORE INSERT: source_blog_id 자동 설정
CREATE TRIGGER trg_set_source_blog_id
  BEFORE INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION set_crawled_post_source_blog_id();

-- AFTER INSERT: 출처별 10개 보관 정책
CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
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

-- 트리거 2개 확인 (BEFORE + AFTER)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'hospital_crawled_posts'
ORDER BY action_timing;

-- 병원별 + 출처별 보관 현황 확인
SELECT hospital_name, source_blog_id, COUNT(*) AS cnt
FROM public.hospital_crawled_posts
GROUP BY hospital_name, source_blog_id
ORDER BY hospital_name, source_blog_id;
