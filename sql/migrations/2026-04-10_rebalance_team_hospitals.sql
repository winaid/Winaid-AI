-- ============================================
-- 2026-04-10: 팀/병원 재배치 — 김소영 매니저 제거 + 병원 이관
-- ============================================
-- 배경:
--   next-app/lib/teamData.ts (런타임 소스) 를 2026-04-10 에 업데이트하여
--   김소영 매니저님을 제거하고 소속 병원 4개를 재배치했다.
--   이 마이그레이션은 2026-03-24_dynamic_team_hospitals.sql 로 seed 된
--   DB 를 동일한 상태로 동기화한다.
--
-- 변경 내용:
--   · 닥터신치과        → 1팀 최휘원 매니저님
--   · 검단일등치과      → 1팀 최휘원 매니저님
--   · 코랄치과 (김소영) → 1팀 최휘원 매니저님 (이름도 "코랄치과 (최휘원)" 로 변경)
--   · 아산베스트치과    → 3팀 김태광 팀장님
--
-- ⚠️  경고: 이 마이그레이션 적용 후에는 2026-03-24_dynamic_team_hospitals.sql
--    을 다시 실행하지 마세요. 원본 seed 의 ON CONFLICT DO UPDATE 절이 위
--    변경을 되돌립니다. 신규 환경이라면 이 파일까지 순차 적용해 주세요.
--
-- 모든 UPDATE 는 idempotent — 여러 번 실행해도 결과 동일.

BEGIN;

-- 닥터신치과 → 최휘원 매니저님
UPDATE public.hospitals
SET manager = '최휘원 매니저님', updated_at = now()
WHERE name = '닥터신치과';

-- 검단일등치과 → 최휘원 매니저님
UPDATE public.hospitals
SET manager = '최휘원 매니저님', updated_at = now()
WHERE name = '검단일등치과';

-- 아산베스트치과 → 3팀 김태광 팀장님
UPDATE public.hospitals
SET team_id = 3, manager = '김태광 팀장님', updated_at = now()
WHERE name = '아산베스트치과';

-- 코랄치과 (김소영) → 이름 변경 + 최휘원 매니저님
-- 참고: 1팀 김주열 팀장님에게 이미 "코랄치과" 가 있어 suffix 로 구분
UPDATE public.hospitals
SET name = '코랄치과 (최휘원)', manager = '최휘원 매니저님', updated_at = now()
WHERE name = '코랄치과 (김소영)';

-- 안전장치: 김소영 매니저님 소속 병원이 남아있으면 경고 출력
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.hospitals
  WHERE manager = '김소영 매니저님';

  IF remaining > 0 THEN
    RAISE WARNING '[rebalance] 김소영 매니저님 소속 병원이 아직 %건 남아있습니다. 수동 확인이 필요합니다.', remaining;
  ELSE
    RAISE NOTICE '[rebalance] 김소영 매니저님 매핑 정리 완료 (0건 남음).';
  END IF;
END $$;

COMMIT;
