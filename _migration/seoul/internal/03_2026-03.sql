-- ============================================
-- File: sql/migrations/2026-03-20_fix_delete_all_generated_posts.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- ============================================
-- 2026-03-20: delete_all_generated_posts RPC 함수 재배포
-- ============================================
--
-- 배경:
--   어드민 페이지 "전체 삭제" 기능이 동작하지 않는 문제 발생.
--   원인: 운영 DB의 delete_all_generated_posts 함수가 구버전(하드코딩 비밀번호)이거나
--         다른 admin 함수(get_admin_stats 등)와 비밀번호 검증 로직이 불일치.
--   조치: current_setting('app.admin_password') + fallback 'winaid' 버전으로 통일.
--
-- 이 파일은 운영 Supabase SQL Editor에서 2026-03-20에 직접 실행한 SQL의 정확한 사본이다.
-- 프론트엔드 코드(postStorageService.ts)는 수정 없음 — 호출 시그니처가 이미 일치했기 때문.
--
-- 관련 파일:
--   - src/services/postStorageService.ts (deleteAllGeneratedPosts 함수)
--   - sql/migrations/supabase_migration_admin_password_env.sql (동일 로직의 전체 마이그레이션)
--   - sql/migrations/supabase_migration_delete_all_posts.sql (구버전 — 하드코딩 비밀번호)
--
-- 확인 방법:
--   SELECT pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname = 'public' AND p.proname = 'delete_all_generated_posts';
-- ============================================

DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  -- 비밀번호 검증: current_setting 우선, 미설정 시 fallback
  -- 다른 admin 함수(get_admin_stats, delete_generated_post, get_all_generated_posts)와 동일 패턴
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;  -- 인증 실패
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

-- ============================================
-- File: sql/migrations/2026-03-21_add_refine_post_type.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- ============================================
-- ⚠ 폐기됨 — 이 파일은 적용하지 마세요
-- 대체: 2026-03-21_add_workflow_type.sql
-- ============================================
--
-- 이 마이그레이션은 post_type에 'refine'을 추가하는 방식이었으나,
-- 콘텐츠 유형(post_type)과 작업 방식(workflow_type)을 분리하는
-- 방향으로 변경되었습니다.
--
-- 아래 내용은 참고용으로만 남겨둡니다. 실행하지 마세요.

-- 1. 기존 CHECK 제약 제거 후 새 제약 추가
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release', 'refine'));

-- 2. (선택) 기존에 blog로 위장 저장된 AI 보정 데이터를 refine으로 수정
-- 이 쿼리는 [AI 보정] 접두사가 있는 기존 데이터만 대상으로 함
UPDATE public.generated_posts
SET post_type = 'refine',
    title = REGEXP_REPLACE(title, '^\[AI 보정\]\s*', ''),
    topic = REGEXP_REPLACE(topic, '^\[AI 보정[^]]*\]\s*', '')
WHERE post_type = 'blog'
  AND (title LIKE '[AI 보정]%' OR topic LIKE '[AI 보정%');

-- 3. admin 통계 함수에 refine_count 추가
-- get_admin_stats 반환 타입에 refine_count 추가
DROP FUNCTION IF EXISTS get_admin_stats(TEXT);

DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  refine_count BIGINT,
  total_users BIGINT,
  recent_posts BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 비밀번호 확인
  IF admin_password != current_setting('app.settings.admin_password', true) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE post_type = 'refine')::BIGINT AS refine_count,
    COUNT(DISTINCT user_id)::BIGINT AS total_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::BIGINT AS recent_posts
  FROM public.generated_posts;
END;
$$;

-- ============================================
-- File: sql/migrations/2026-03-21_add_workflow_type.sql
-- ============================================
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

-- ============================================
-- File: sql/migrations/2026-03-24_add_image_post_type.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- ============================================
-- generated_posts에 'image' post_type 추가
-- Supabase 대시보드 > SQL Editor에서 실행
-- ============================================

-- 1. CHECK 제약 조건 변경: 'image' 허용
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release', 'image'));

-- 2. get_admin_stats RPC에 image_count 추가
DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  image_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  -- 환경변수 우선, 없으면 하드코딩 폴백
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password != valid_password THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE post_type = 'image')::BIGINT AS image_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$$;

-- 3. workflow_type에 'image' 허용 (image 저장 시 workflow_type도 'generate'로 저장할 수 있지만,
--    혹시 별도 제약이 있으면 대비)
-- 현재 CHECK: ('generate', 'refine') — 그대로 유지 (image는 workflow_type='generate' 사용)

-- ============================================
-- 완료! image 생성 기록이 generated_posts에 저장되고
-- Admin에서 image_count 통계를 볼 수 있습니다.
-- ============================================

-- ============================================
-- File: sql/migrations/2026-03-24_dynamic_team_hospitals.sql
-- Idempotency injections: 5 policy DROPs, 2 tables / 13 cols reconciled
-- ============================================
-- ============================================
-- 2026-03-24: 팀/병원 데이터 동적 관리 테이블
-- ============================================
-- 기존: teamHospitals.ts 하드코딩
-- 변경: DB에서 관리 → admin에서 추가/삭제 가능

-- 1) teams 테이블
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,           -- '본부장님', '1팀', '2팀', '3팀'
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS label TEXT NOT NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon can read teams" ON public.teams;
DROP POLICY IF EXISTS "Anon can read teams" ON public.teams;
CREATE POLICY "Anon can read teams" ON public.teams FOR SELECT USING (true);

-- 2) hospitals 테이블
CREATE TABLE IF NOT EXISTS public.hospitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id INT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- '맘애든어린이치과'
  manager TEXT NOT NULL DEFAULT '',    -- '김주열 팀장님'
  address TEXT DEFAULT '',             -- '충남 천안시 서북구 불당동'
  naver_blog_urls TEXT[] DEFAULT '{}', -- ARRAY['https://blog.naver.com/x577wqy3']
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name)
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS team_id INT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS manager TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS naver_blog_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon can read hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can insert hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can update hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can delete hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can read hospitals" ON public.hospitals;
CREATE POLICY "Anon can read hospitals" ON public.hospitals FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon can insert hospitals" ON public.hospitals;
CREATE POLICY "Anon can insert hospitals" ON public.hospitals FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can update hospitals" ON public.hospitals;
CREATE POLICY "Anon can update hospitals" ON public.hospitals FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anon can delete hospitals" ON public.hospitals;
CREATE POLICY "Anon can delete hospitals" ON public.hospitals FOR DELETE USING (true);

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_hospitals_team_id ON public.hospitals(team_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_is_active ON public.hospitals(is_active);

-- 4) Seed 데이터 — 기존 teamData.ts 이식
INSERT INTO public.teams (id, label, sort_order) VALUES
  (0, '본부장님', 0),
  (1, '1팀', 1),
  (2, '2팀', 2),
  (3, '3팀', 3)
ON CONFLICT (id) DO NOTHING;

-- 시퀀스 조정 (다음 auto-increment가 4부터)
SELECT setval('teams_id_seq', 4, false);

INSERT INTO public.hospitals (team_id, name, manager, address, naver_blog_urls) VALUES
  -- 본부장님
  (0, '광화문선치과', '본부장님', '서울 종로구 광화문', ARRAY['https://blog.naver.com/sundent21']),
  -- 1팀 김주열
  (1, '맘애든어린이치과', '김주열 팀장님', '충남 천안시 서북구 불당동', ARRAY['https://blog.naver.com/x577wqy3','https://blog.naver.com/ekttwj8518']),
  (1, '코랄치과', '김주열 팀장님', '서울 강동구 성내동', '{}'),
  (1, '미소모아치과', '김주열 팀장님', '전북 전주시 완산구 서신동', ARRAY['https://blog.naver.com/usmisomore','https://blog.naver.com/w02aqvujp','https://blog.naver.com/qwglfo4481']),
  (1, '에버유의원', '김주열 팀장님', '서울 마포구 도화동', ARRAY['https://blog.naver.com/eah8fsd9f8']),
  (1, '청주새롬탑치과', '김주열 팀장님', '충북 청주시 흥덕구 복대동', ARRAY['https://blog.naver.com/qwrtuipp184','https://blog.naver.com/qwrtuipp169']),
  (1, '서울삼성치과', '김주열 팀장님', '서울 관악구 봉천동', ARRAY['https://blog.naver.com/pagfoco0q3q','https://blog.naver.com/i0v5id9o']),
  -- 1팀 김소영
  (1, '닥터신치과', '김소영 매니저님', '경기 성남시 중원구 상대원동', ARRAY['https://blog.naver.com/hkyrsp9710']),
  (1, '아산베스트치과', '김소영 매니저님', '충남 아산시 용화동', ARRAY['https://blog.naver.com/soiidinmfve75174','https://blog.naver.com/czzhuy6104']),
  (1, '검단일등치과', '김소영 매니저님', '인천 서구 불로동', ARRAY['https://blog.naver.com/geomdan1stdental','https://blog.naver.com/o48j69omlwlnj6']),
  (1, '코랄치과 (김소영)', '김소영 매니저님', '서울 강동구 성내동', ARRAY['https://blog.naver.com/timber12502','https://blog.naver.com/ffpvksk4i','https://blog.naver.com/ran2hoho']),
  -- 1팀 최휘원
  (1, '부천그랜드치과', '최휘원 매니저님', '경기 부천시 원미구 중동', ARRAY['https://blog.naver.com/dnautmqq']),
  -- 2팀 신미정
  (2, '유성온치과', '신미정 팀장님', '대전 유성구 봉명동', ARRAY['https://blog.naver.com/yuseong_on']),
  (2, 'A플란트치과', '신미정 팀장님', '서울 성동구 도선동', ARRAY['https://blog.naver.com/aplant2020']),
  (2, '다대치과', '신미정 팀장님', '부산 사하구 다대동', ARRAY['https://blog.naver.com/guntj185r3']),
  (2, '최창수치과', '신미정 팀장님', '부산 동구 초량동', ARRAY['https://blog.naver.com/basket1992']),
  -- 2팀 오진희
  (2, '에이스플란트치과', '오진희 매니저님', '서울 강남구 역삼동', ARRAY['https://blog.naver.com/stfoaiatovc57525']),
  (2, '신사이사랑치과', '오진희 매니저님', '서울 강남구 논현동', ARRAY['https://blog.naver.com/pauls2001n']),
  (2, '동그라미치과', '오진희 매니저님', '경기 고양시 덕양구 화정동', ARRAY['https://blog.naver.com/evacuate14570']),
  (2, '청담클린치과', '오진희 매니저님', '서울 강남구 삼성동', ARRAY['https://blog.naver.com/melovenus']),
  -- 3팀 김태광
  (3, '루원퍼스트치과', '김태광 팀장님', '인천 서구 가정동', ARRAY['https://blog.naver.com/hance1978']),
  (3, '연세조이플란트치과', '김태광 팀장님', '서울 강동구 성내동', ARRAY['https://blog.naver.com/ii24h0um']),
  (3, '전주예일치과', '김태광 팀장님', '전북 전주시 완산구 효자동2가', ARRAY['https://blog.naver.com/zmkz4oeq']),
  (3, '연세하늘치과', '김태광 팀장님', '서울 중구 충무로2가', ARRAY['https://blog.naver.com/skydentalgreen']),
  -- 3팀 이도화
  (3, '오늘안치과', '이도화 선임님', '경기 성남시 수정구 태평동', ARRAY['https://blog.naver.com/spssmaster77']),
  (3, '라이프치과', '이도화 선임님', '서울 강서구 화곡동', ARRAY['https://blog.naver.com/bgfsdvyhd']),
  (3, '미도치과', '이도화 선임님', '서울 강남구 대치동', ARRAY['https://blog.naver.com/m02jgiaz6']),
  (3, '더착한치과', '이도화 선임님', '부산 강서구 명지동', ARRAY['https://blog.naver.com/mg2032875']),
  (3, '이고운치과', '이도화 선임님', '경기 파주시 목동동', ARRAY['https://blog.naver.com/tdhhnx5899']),
  -- 3팀 최소현
  (3, '오늘안치과 (최소현)', '최소현 매니저님', '경기 성남시 수정구 태평동', ARRAY['https://blog.naver.com/clinical641']),
  (3, '연세하늘치과 (최소현)', '최소현 매니저님', '서울 중구 충무로2가', ARRAY['https://blog.naver.com/jkj9799']),
  (3, '바른플란트치과', '최소현 매니저님', '서울 중랑구 망우동', ARRAY['https://blog.naver.com/brplant','https://blog.naver.com/wwwlsl123']),
  -- 3팀 이지안
  (3, '논산중앙치과', '이지안 매니저님', '충남 논산시 반월동', ARRAY['https://blog.naver.com/cha1636ndsu'])
ON CONFLICT (name) DO UPDATE SET
  team_id = EXCLUDED.team_id,
  manager = EXCLUDED.manager,
  address = EXCLUDED.address,
  naver_blog_urls = EXCLUDED.naver_blog_urls,
  updated_at = now();

-- ============================================
-- File: sql/migrations/2026-03-24_internal_feedbacks.sql
-- Idempotency injections: 3 policy DROPs, 1 tables / 6 cols reconciled
-- ============================================
-- internal_feedbacks: 내부용 피드백 (페이지 단위, 각 기록별 댓글이 아님)
-- 로그인한 사용자만 작성 가능, 작성자 이름 저장

CREATE TABLE IF NOT EXISTS internal_feedbacks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,                          -- auth.users.id
  user_name   text NOT NULL DEFAULT '',               -- 작성자 표시 이름
  content     text NOT NULL DEFAULT '',               -- 피드백 본문
  page        text NOT NULL DEFAULT 'history',        -- 어떤 화면에서 작성했는지
  created_at  timestamptz DEFAULT now() NOT NULL
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS user_name text NOT NULL DEFAULT '';
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS page text NOT NULL DEFAULT 'history';
ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;

-- 인덱스: 페이지별 최신순 조회
CREATE INDEX IF NOT EXISTS idx_internal_feedbacks_page
  ON internal_feedbacks (page, created_at DESC);

-- RLS
ALTER TABLE internal_feedbacks ENABLE ROW LEVEL SECURITY;

-- 조회: 인증된 사용자 모두
DROP POLICY IF EXISTS "Authenticated users can read feedbacks" ON internal_feedbacks;
CREATE POLICY "Authenticated users can read feedbacks"
  ON internal_feedbacks FOR SELECT
  TO authenticated
  USING (true);

-- 작성: 본인만
DROP POLICY IF EXISTS "Authenticated users can insert own feedbacks" ON internal_feedbacks;
CREATE POLICY "Authenticated users can insert own feedbacks"
  ON internal_feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 삭제: 본인만
DROP POLICY IF EXISTS "Users can delete own feedbacks" ON internal_feedbacks;
CREATE POLICY "Users can delete own feedbacks"
  ON internal_feedbacks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- File: sql/migrations/2026-03-24_unified_admin_rpc.sql
-- Idempotency injections: 4 fn DROPs
-- ============================================
-- ============================================
-- 2026-03-24: Admin RPC 함수 통합 정합성 복구
-- ============================================
--
-- 목적:
--   현재 next-app 프론트엔드 코드가 기대하는 함수 시그니처와
--   DB 함수를 완전히 일치시킨다.
--
-- 이 SQL 하나만 실행하면 아래 4개 함수가 모두 최신 상태가 된다:
--   1. get_admin_stats        — image_count 포함 10개 컬럼 반환
--   2. get_all_generated_posts — SETOF generated_posts 반환
--   3. delete_generated_post   — post_id 인자
--   4. delete_all_generated_posts — BIGINT 반환
--
-- 전제:
--   - generated_posts 테이블이 존재
--   - post_type CHECK에 'image' 포함 (없으면 이 SQL에서 추가)
--   - workflow_type 컬럼 존재 (없으면 이 SQL에서 추가)
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- ═══════════════════════════════════════════════
-- 0. 테이블 스키마 보정 (이미 있으면 무시됨)
-- ═══════════════════════════════════════════════

-- 0-A. post_type CHECK: 'image' 허용
ALTER TABLE public.generated_posts
  DROP CONSTRAINT IF EXISTS generated_posts_post_type_check;

ALTER TABLE public.generated_posts
  ADD CONSTRAINT generated_posts_post_type_check
  CHECK (post_type IN ('blog', 'card_news', 'press_release', 'image'));

-- 0-B. workflow_type 컬럼 (없으면 추가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generated_posts'
      AND column_name = 'workflow_type'
  ) THEN
    ALTER TABLE public.generated_posts
      ADD COLUMN workflow_type TEXT NOT NULL DEFAULT 'generate';
    ALTER TABLE public.generated_posts
      ADD CONSTRAINT generated_posts_workflow_type_check
      CHECK (workflow_type IN ('generate', 'refine'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 1. get_admin_stats — image_count 포함 10개 컬럼
-- ═══════════════════════════════════════════════

-- 반환 타입 변경이므로 기존 함수 먼저 DROP
DROP FUNCTION IF EXISTS get_admin_stats(TEXT);

DROP FUNCTION IF EXISTS public.get_admin_stats(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION get_admin_stats(admin_password TEXT)
RETURNS TABLE (
  total_posts BIGINT,
  blog_count BIGINT,
  card_news_count BIGINT,
  press_release_count BIGINT,
  image_count BIGINT,
  unique_hospitals BIGINT,
  unique_users BIGINT,
  posts_today BIGINT,
  posts_this_week BIGINT,
  posts_this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_posts,
    COUNT(*) FILTER (WHERE post_type = 'blog')::BIGINT AS blog_count,
    COUNT(*) FILTER (WHERE post_type = 'card_news')::BIGINT AS card_news_count,
    COUNT(*) FILTER (WHERE post_type = 'press_release')::BIGINT AS press_release_count,
    COUNT(*) FILTER (WHERE post_type = 'image')::BIGINT AS image_count,
    COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::BIGINT AS unique_hospitals,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_hash))::BIGINT AS unique_users,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT AS posts_today,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT AS posts_this_week,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT AS posts_this_month
  FROM public.generated_posts;
END;
$$;

-- ═══════════════════════════════════════════════
-- 2. get_all_generated_posts — SETOF 반환
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_all_generated_posts(TEXT, TEXT, TEXT, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION get_all_generated_posts(
  admin_password TEXT,
  filter_post_type TEXT DEFAULT NULL,
  filter_hospital TEXT DEFAULT NULL,
  limit_count INT DEFAULT 100,
  offset_count INT DEFAULT 0
)
RETURNS SETOF generated_posts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.generated_posts
  WHERE
    (filter_post_type IS NULL OR post_type = filter_post_type) AND
    (filter_hospital IS NULL OR hospital_name = filter_hospital)
  ORDER BY created_at DESC
  LIMIT limit_count OFFSET offset_count;
END;
$$;

-- ═══════════════════════════════════════════════
-- 3. delete_generated_post — 단일 삭제 (인자: post_id)
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.delete_generated_post(TEXT, UUID) CASCADE;
CREATE OR REPLACE FUNCTION delete_generated_post(
  admin_password TEXT,
  post_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.generated_posts WHERE id = post_id;
  RETURN FOUND;
END;
$$;

-- ═══════════════════════════════════════════════
-- 4. delete_all_generated_posts — 전체 삭제
-- ═══════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.delete_all_generated_posts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ═══════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인용)
-- ═══════════════════════════════════════════════

-- 함수 존재 확인:
-- SELECT proname, pg_get_function_arguments(oid) AS args,
--        pg_get_function_result(oid) AS returns
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('get_admin_stats','get_all_generated_posts','delete_generated_post','delete_all_generated_posts');

-- post_type CHECK 확인:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.generated_posts'::regclass AND contype = 'c';

-- image_count 동작 확인:
-- SELECT * FROM get_admin_stats('winaid');

-- ============================================
-- File: sql/migrations/2026-03-25_add_score_spelling.sql
-- ============================================
-- hospital_crawled_posts: score_spelling 컬럼 추가
-- upsert 시 score_spelling 필드가 없어 400 에러 발생

ALTER TABLE public.hospital_crawled_posts
  ADD COLUMN IF NOT EXISTS score_spelling INTEGER;

-- ============================================
-- File: sql/migrations/2026-03-30_credits_setup.sql
-- Idempotency injections: 2 fn DROPs, 2 policy DROPs, 1 tables / 6 cols reconciled
-- ============================================
-- ============================================
-- user_credits 테이블 + RPC 함수
-- Supabase SQL Editor에서 실행
-- ============================================

-- 크레딧 테이블
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 10,
  total_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 10;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS total_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- RLS 정책
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own credits" ON user_credits;
CREATE POLICY "Users can read own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own credits" ON user_credits;
CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- 크레딧 차감 RPC (원자적)
DROP FUNCTION IF EXISTS public.use_credit(UUID) CASCADE;
CREATE OR REPLACE FUNCTION use_credit(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits INTO current_credits
  FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

  IF current_credits <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_credits', 'remaining', 0);
  END IF;

  UPDATE user_credits
  SET credits = credits - 1, total_used = total_used + 1, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'remaining', current_credits - 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 크레딧 조회 RPC
DROP FUNCTION IF EXISTS public.get_credits(UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result RECORD;
BEGIN
  INSERT INTO user_credits (user_id, credits, total_used)
  VALUES (p_user_id, 10, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits, total_used INTO result
  FROM user_credits WHERE user_id = p_user_id;

  RETURN json_build_object('credits', result.credits, 'total_used', result.total_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- File: sql/migrations/2026-03-31_feedback_images.sql
-- ============================================
-- ============================================
-- 피드백 이미지 첨부 기능 추가
-- ============================================
--
-- ⚠️ Supabase Dashboard에서 수동으로 해야 할 것:
--
-- 1. Storage > Create new bucket > "feedback-images" (Public bucket)
-- 2. Policies 설정:
--    - INSERT: authenticated users만 허용
--      → (bucket_id = 'feedback-images' AND auth.role() = 'authenticated')
--    - SELECT: 모든 사용자 허용 (public)
--      → (bucket_id = 'feedback-images')
--    - DELETE: 본인 업로드만 삭제 가능
--      → (bucket_id = 'feedback-images' AND auth.uid()::text = (storage.foldername(name))[2])
--
-- ============================================

ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- ============================================
-- File: sql/migrations/2026-03-31_fix_profiles_fullname.sql
-- Idempotency injections: 1 fn DROPs, 1 policy DROPs
-- ============================================
-- ============================================
-- profiles 테이블 이름 표시 버그 수정
-- 문제: handle_new_user() 트리거가 name만 저장하고 full_name을 비워둠
--       + INSERT RLS 정책 없어서 클라이언트 upsert 실패
-- ============================================

-- 1. 기존 데이터 복구: name이 있는데 full_name이 없는 경우 복사
UPDATE public.profiles
SET full_name = name
WHERE full_name IS NULL AND name IS NOT NULL;

-- 2. handle_new_user() 트리거 수정: full_name + team_id도 저장
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, full_name, team_id, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    (NEW.raw_user_meta_data->>'team_id')::INTEGER,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. profiles INSERT 정책 추가 (본인 프로필 생성 허용)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert own profile') THEN
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
    CREATE POLICY "Users can insert own profile" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================
-- File: sql/migrations/2026-03-31_fix_profiles_team_id.sql
-- ============================================
-- ============================================
-- profiles 테이블 team_id 복구
-- 문제: 기존 사용자의 team_id가 NULL (트리거/upsert 실패로 저장 안 됨)
-- 해결: 이메일 패턴 t{teamId}_xxx@winaid.kr에서 team_id 추출
-- ============================================

UPDATE public.profiles
SET team_id = (regexp_match(email, '^t(\d+)_'))[1]::INTEGER
WHERE team_id IS NULL
  AND email ~ '^t\d+_.*@winaid\.kr$';

