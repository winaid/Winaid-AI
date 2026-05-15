-- hospital_images 에 exclude_keywords 컬럼 추가 (confusable 쌍 분리용).
--
-- 본 파일은 sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql 의
-- public-app (winaid-public-seoul) 미러. 양 Supabase 인스턴스 lockstep 유지.
--
-- 배경: packages/blog-core/src/imageMatcher.ts 의 매칭 로직이 excludeKeywords 필드를 사용한다.
-- 예: 사랑니 이미지에 exclude_keywords=['임플란트'] 설정 → "임플란트 식립" 글에서 영구 배제.
--
-- Supabase Dashboard (winaid-public-seoul) → SQL Editor 에서 직접 실행. Idempotent.

ALTER TABLE hospital_images
  ADD COLUMN IF NOT EXISTS exclude_keywords text[] NOT NULL DEFAULT '{}';

-- 기존 행은 모두 빈 배열로 초기화됨 (DEFAULT '{}').
-- 운영자 보강 가이드: docs/image-library-exclusion-todo.md
