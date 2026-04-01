-- ============================================
-- profiles 테이블 team_id 복구
-- 문제: 기존 사용자의 team_id가 NULL (트리거/upsert 실패로 저장 안 됨)
-- 해결: 이메일 패턴 t{teamId}_xxx@winaid.kr에서 team_id 추출
-- ============================================

UPDATE public.profiles
SET team_id = (regexp_match(email, '^t(\d+)_'))[1]::INTEGER
WHERE team_id IS NULL
  AND email ~ '^t\d+_.*@winaid\.kr$';
