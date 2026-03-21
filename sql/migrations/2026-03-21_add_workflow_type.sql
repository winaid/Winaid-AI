-- ============================================
-- workflow_type 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행
-- ============================================
--
-- 배경: 기존에는 AI 보정 결과를 제목/주제 prefix([AI 보정])로만 구분하고,
-- 저장상으로는 post_type='blog'로 처리하고 있었음.
-- 콘텐츠 유형(post_type)과 작업 방식(workflow_type)을 분리하여
-- 서버 데이터만으로 AI 보정 여부를 식별 가능하게 함.
--
-- 실행 순서: 반드시 이 파일 전체를 순서대로 실행할 것.

-- 1. workflow_type 컬럼 추가 (기본값: 'generate')
ALTER TABLE public.generated_posts
  ADD COLUMN IF NOT EXISTS workflow_type TEXT NOT NULL DEFAULT 'generate';

-- 2. workflow_type CHECK 제약 추가
ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_workflow_type_check
  CHECK (workflow_type IN ('generate', 'refine'));

-- 3. (선택) 기존 데이터 백필 — 실제 데이터 패턴 확인 후 최소 범위만 적용
-- 아래는 예시. 실행 전 SELECT로 대상 행을 먼저 확인할 것.
--
-- 확인 쿼리:
-- SELECT id, title, topic FROM public.generated_posts
-- WHERE title LIKE '[AI 보정]%' OR topic LIKE '[AI 보정%';
--
-- 백필 쿼리 (확인 후 실행):
-- UPDATE public.generated_posts
-- SET workflow_type = 'refine'
-- WHERE title LIKE '[AI 보정]%' OR topic LIKE '[AI 보정%';

-- 4. 검증 쿼리
-- SELECT workflow_type, COUNT(*) FROM public.generated_posts GROUP BY workflow_type;
