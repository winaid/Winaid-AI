-- hospital_images 에 exclude_keywords 컬럼 추가 (confusable 쌍 분리용).
--
-- 배경: packages/blog-core/src/imageMatcher.ts 의 매칭 로직이 excludeKeywords 필드를 사용한다.
-- 예: 사랑니 이미지에 exclude_keywords=['임플란트'] 설정 → "임플란트 식립" 글에서 영구 배제.
--
-- 양 Supabase 프로젝트 (winaid-internal-seoul / winaid-public-seoul) 모두 적용 필요.
-- Supabase Dashboard → SQL Editor 에서 직접 실행. Idempotent (IF NOT EXISTS).

ALTER TABLE hospital_images
  ADD COLUMN IF NOT EXISTS exclude_keywords text[] NOT NULL DEFAULT '{}';

-- 기존 행은 모두 빈 배열로 초기화됨 (DEFAULT '{}').
-- 후속 보강은 scripts/migrate-image-exclusions.ts 가 confusable 쌍 자동 제안 →
-- 운영자가 docs/image-library-exclusion-suggestions.md 검토 후 image-library
-- 페이지에서 수동 보강 (또는 직접 UPDATE SQL).

-- 예시 UPDATE (운영자 수동 보강):
--   UPDATE hospital_images
--      SET exclude_keywords = ARRAY['임플란트']::text[]
--    WHERE id = '<사랑니 이미지 id>';

-- 회귀 가드: packages/blog-core/src/__tests__/imageMatcher.test.ts 의 confusable 분리
-- 테스트가 본 컬럼 활용을 invariant 로 강제.
