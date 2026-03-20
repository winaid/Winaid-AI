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
