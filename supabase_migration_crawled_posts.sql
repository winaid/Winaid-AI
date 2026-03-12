-- ============================================
-- hospital_crawled_posts 테이블 마이그레이션
-- 병원별 크롤링 글 최대 10개 보관 + 채점 결과 저장
-- ============================================

CREATE TABLE IF NOT EXISTS public.hospital_crawled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  score_typo INTEGER,                     -- 오타/맞춤법 점수 (0~100, 높을수록 좋음)
  score_medical_law INTEGER,              -- 의료광고법 준수 점수 (0~100)
  score_total INTEGER,                    -- 종합 점수
  typo_issues JSONB DEFAULT '[]',         -- [{original, correction, context}]
  law_issues JSONB DEFAULT '[]',          -- [{word, severity, replacement, context}]
  corrected_content TEXT,                 -- 사용자가 수정한 본문
  title TEXT,                             -- 블로그 글 제목
  published_at TIMESTAMPTZ,              -- 블로그 글 실제 작성일 (og:createdate)
  summary TEXT,                           -- 본문 요약 (200자)
  thumbnail TEXT,                         -- 대표 이미지 URL
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  scored_at TIMESTAMPTZ,
  UNIQUE(hospital_name, url)
);

-- RLS 활성화
ALTER TABLE public.hospital_crawled_posts ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 조회 허용
CREATE POLICY "Authenticated users can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (auth.role() = 'authenticated');

-- 인증된 사용자 생성/수정 허용
CREATE POLICY "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (auth.role() = 'authenticated');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_crawled_posts_hospital ON public.hospital_crawled_posts(hospital_name);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_published_at ON public.hospital_crawled_posts(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crawled_posts_crawled_at ON public.hospital_crawled_posts(crawled_at DESC);

-- 병원별 10개 초과 시 오래된 것 자동 삭제 트리거
CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.hospital_crawled_posts
  WHERE hospital_name = NEW.hospital_name
    AND id NOT IN (
      SELECT id FROM public.hospital_crawled_posts
      WHERE hospital_name = NEW.hospital_name
      ORDER BY crawled_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_limit_crawled_posts ON public.hospital_crawled_posts;
CREATE TRIGGER trg_limit_crawled_posts
  AFTER INSERT ON public.hospital_crawled_posts
  FOR EACH ROW EXECUTE FUNCTION limit_crawled_posts_per_hospital();
