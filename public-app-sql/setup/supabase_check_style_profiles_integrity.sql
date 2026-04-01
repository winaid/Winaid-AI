-- ============================================
-- hospital_style_profiles 데이터 무결성 점검 SQL
-- 운영 DB(Supabase Dashboard > SQL Editor)에서 실행
-- ⚠️ 읽기 전용 — 삭제/수정 쿼리 없음
-- ============================================

-- 1) 특정 병원의 row 개수 확인
-- 사용법: 'XXX병원'을 실제 병원명으로 교체
SELECT hospital_name, COUNT(*) AS row_count
FROM public.hospital_style_profiles
WHERE hospital_name = 'XXX병원'
GROUP BY hospital_name;

-- 2) 전체 중복 점검: hospital_name 기준 2행 이상인 병원 목록
SELECT hospital_name, COUNT(*) AS row_count
FROM public.hospital_style_profiles
GROUP BY hospital_name
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- 3) UNIQUE constraint 존재 여부 확인
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'hospital_style_profiles'
  AND tc.table_schema = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
ORDER BY tc.constraint_type, kcu.column_name;

-- 4) RLS 정책 확인
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'hospital_style_profiles'
  AND schemaname = 'public'
ORDER BY policyname;

-- 5) 전체 행 수 + hospital_name별 분포 요약
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT hospital_name) AS unique_hospitals,
  CASE
    WHEN COUNT(*) = COUNT(DISTINCT hospital_name) THEN '✅ 중복 없음'
    ELSE '⚠️ 중복 존재 (' || (COUNT(*) - COUNT(DISTINCT hospital_name)) || '개 초과 행)'
  END AS integrity_status
FROM public.hospital_style_profiles;
