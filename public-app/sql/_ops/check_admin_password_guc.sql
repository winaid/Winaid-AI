-- ============================================================================
-- S1 / Phase A — admin_password GUC 상태 + 'winaid' fallback 잔존 조사 (read-only)
-- ============================================================================
--
-- 목적: hardening 마이그레이션 적용 전에 운영자가 양 Supabase 프로젝트의
--       (1) `app.admin_password` GUC 설정 여부와
--       (2) admin RPC 본문에 'winaid' 평문 fallback이 살아있는지를 1쿼리로 확인.
--
-- 안전성:
--   - 순수 SELECT, 읽기 전용. 데이터 변경 없음.
--   - SECURITY DEFINER 미사용. 권한 상승 없음.
--
-- 노트: 함수명 IN-list는 코드베이스의 모든 admin RPC 이름 후보를 포함
--       (delete_generated_post 가 표준 4번째 RPC; get_admin_stats_v2 는
--        혹시 v2 변형이 있을 환경을 대비해 방어적으로 추가).
-- ============================================================================

SELECT
  current_database()                                              AS db,
  current_setting('app.admin_password', true) IS NOT NULL         AS guc_set,
  CASE
    WHEN current_setting('app.admin_password', true) IS NULL
      THEN '❌ UNSET — must be set before applying hardening'
    WHEN length(current_setting('app.admin_password', true)) < 16
      THEN '⚠️ SET but short (<16 chars) — recommend >=24 chars'
    ELSE '✅ SET'
  END                                                             AS guc_status,
  EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_admin_stats',
        'get_all_generated_posts',
        'delete_generated_post',
        'delete_all_generated_posts',
        'get_admin_stats_v2'
      )
      AND pg_get_functiondef(p.oid) ILIKE '%''winaid''%'
  )                                                               AS winaid_fallback_active;
