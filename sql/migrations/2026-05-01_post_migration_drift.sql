-- ============================================
-- 2026-05-01 — Post-migration schema drift 정식화 (next-app)
-- ============================================
-- 배경:
--   2026-05-01 Tokyo → Seoul 마이그레이션 중 발견된 production schema drift 를
--   migration 파일로 정식화. 향후 fresh setup 시 자동 적용.
--
-- 발견된 drift (next-app, Tokyo 기준):
--   1. hospital_images.user_id : schema uuid → 운영 TEXT ('guest' 호환)
--   2. hospital_crawled_posts.score_naver_seo : 운영 INTEGER (네이버 SEO 점수)
--   3. hospital_crawled_posts.seo_issues : 운영 JSONB (SEO 이슈 detail)
--
-- 위 3개 컬럼은 어느 시점에 Dashboard 에서 직접 추가됨, migration 파일에는
-- 누락. 본 마이그레이션이 정식 발자국.
-- ============================================

-- 1. hospital_images.user_id : uuid → TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hospital_images'
      AND column_name='user_id' AND data_type='uuid'
  ) THEN
    ALTER TABLE public.hospital_images
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    RAISE NOTICE 'hospital_images.user_id: uuid → TEXT 변환 완료';
  ELSE
    RAISE NOTICE 'hospital_images.user_id: 이미 TEXT 또는 컬럼 미존재 (skip)';
  END IF;
END $$;

-- 2. hospital_crawled_posts.score_naver_seo : 네이버 SEO 점수 (0-100)
ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS score_naver_seo INTEGER;

-- 3. hospital_crawled_posts.seo_issues : SEO 이슈 [{type, severity, suggestion}, ...]
ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS seo_issues JSONB DEFAULT '[]';

COMMENT ON COLUMN public.hospital_crawled_posts.score_naver_seo IS
  '네이버 SEO 점수 (0~100). 2026-05-01 post-migration drift 정식화.';
COMMENT ON COLUMN public.hospital_crawled_posts.seo_issues IS
  'SEO 이슈 detail [{type, severity, suggestion}]. 2026-05-01 post-migration drift 정식화.';
