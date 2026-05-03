-- ============================================
-- 2026-05-01 — Post-migration schema drift 정식화 (public-app)
-- ============================================
-- 배경:
--   2026-05-01 Mumbai → Seoul 마이그레이션 중 발견된 production schema drift 를
--   migration 파일로 정식화. 향후 fresh setup 시 자동 적용되어 동일 drift 재발 방지.
--
-- 발견된 drift (public-app, Mumbai 기준):
--   1. hospital_images.user_id : schema 선언 uuid → 운영 TEXT
--      ('guest' 사용자 INSERT 허용 위해 어느 시점에 외부 변경)
--      → ALTER COLUMN TYPE TEXT 로 정식화
--
-- 모든 변경은 idempotent (IF NOT EXISTS / 조건부 ALTER).
-- ============================================

-- hospital_images.user_id : uuid → TEXT (운영 정합)
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
