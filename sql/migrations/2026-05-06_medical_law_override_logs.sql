-- ============================================
-- 2026-05-06 · 의료광고법 위반 override 운영 로그
-- baseline ID: BL-B-Critical-1 (= BL-B-009)
-- ADR: docs/decisions/CARDNEWS_HARDBLOCK_UX.md (Option B 채택)
-- ============================================
--
-- 배경:
--   카드뉴스 4개 다운로드 경로(PNG/JPG/ZIP/PDF) + Shorts API 가 의료광고법
--   §56 위반을 검출해도 "상단 빨간 배너" 만 노출, 다운로드는 그대로 진행 중.
--   ADR-2 Option B (warn + override + 운영 로깅) 채택에 따라 사용자가
--   "위반 가능성 인지 후 동의" 한 사실을 운영 로그로 남긴다.
--
--   해당 로그는:
--     1) 약관/면책 + 사용자 명시 동의 결합으로 방조 책임 방어선 (법무 검토)
--     2) override 빈도/패턴 모니터링 → 룰셋 강화 PR (2B-β2) 의 직접 피드백
--     3) Option A (hard-block) 격상 시점 판단 데이터 (FP 률 추정)
--
-- 적용 절차:
--   1. PR 머지
--   2. winaid-public-seoul Supabase 양 환경 SQL Editor 에 paste + RUN
--   3. 검증 쿼리 (파일 하단) 로 RLS / INSERT 권한 확인
--
-- 범위 밖 (별도 PR):
--   · admin 전용 SELECT 정책 — 본 PR 은 service_role 만 사용
--     (admin RLS 정책은 후속 PR — admin role / claim 체계 정렬 후)
--   · 검증기 룰셋 강화 (2B-β2) — FN-001~011 해소
--   · hard-block 격상 (Option A) — 검증기 등급 B+ 도달 후


-- ════════════════════════════════════════════════════════════════════
-- 1. medical_law_override_logs — 사용자 명시 동의 로그
-- ════════════════════════════════════════════════════════════════════
-- 컬럼 설계 원칙:
--   · violation_text 길이 200자 제한 — PII (환자 정보) 누설 방지
--     검증기는 짧은 키워드 매칭이라 200자면 위반 컨텍스트 충분
--   · ip_hash — 원본 IP 저장 금지 (PIPA 준수). 호출부에서 SHA-256 + salt 후 저장
--   · download_path CHECK — 4 다운로드 경로 + shorts 만 허용
--   · content_id — 카드뉴스 post id (있으면 추적, 없으면 NULL — 게스트/저장 전)
CREATE TABLE IF NOT EXISTS public.medical_law_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id TEXT,
  download_path TEXT NOT NULL CHECK (download_path IN ('png', 'jpg', 'zip', 'pdf', 'shorts')),
  violation_type TEXT NOT NULL,
  violation_text TEXT CHECK (violation_text IS NULL OR length(violation_text) <= 200),
  violations_count INTEGER NOT NULL DEFAULT 0 CHECK (violations_count >= 0),
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT
);

-- 인덱스: 운영자 분석용 (user_id 별, 다운로드 경로별, 시계열)
CREATE INDEX IF NOT EXISTS idx_medical_law_override_logs_user_id
  ON public.medical_law_override_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_medical_law_override_logs_agreed_at
  ON public.medical_law_override_logs(agreed_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_law_override_logs_download_path
  ON public.medical_law_override_logs(download_path);


-- ════════════════════════════════════════════════════════════════════
-- 2. RLS — 본인만 INSERT, SELECT 는 service_role 만 (admin 정책 후속 PR)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.medical_law_override_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: 사용자 본인만 (auth.uid() = user_id)
DROP POLICY IF EXISTS "user can insert own override log" ON public.medical_law_override_logs;
CREATE POLICY "user can insert own override log"
  ON public.medical_law_override_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SELECT 본인 조회 — 사용자가 자기 동의 이력 확인 가능 (후속 admin 정책과 분리)
DROP POLICY IF EXISTS "user can select own override log" ON public.medical_law_override_logs;
CREATE POLICY "user can select own override log"
  ON public.medical_law_override_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- service_role 은 RLS 우회 (Supabase 기본 동작) — admin 분석용
-- ※ admin RLS 정책은 본 PR 범위 밖 (admin role/claim 체계 정렬 후 후속 PR)


-- ════════════════════════════════════════════════════════════════════
-- 3. 검증 쿼리 (적용 후 SQL Editor 에서 수동 확인)
-- ════════════════════════════════════════════════════════════════════
--
-- -- (1) 테이블/RLS 활성 여부 확인
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'medical_law_override_logs';
-- -- 기대: relrowsecurity = true
--
-- -- (2) 정책 목록
-- SELECT policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename = 'medical_law_override_logs'
-- ORDER BY policyname;
-- -- 기대: 2건 (insert / select), roles = {authenticated}
--
-- -- (3) CHECK 제약 동작 확인 (실패해야 정상)
-- INSERT INTO public.medical_law_override_logs
--   (user_id, download_path, violation_type, violations_count)
-- VALUES (auth.uid(), 'invalid_path', 'superlative', 1);
-- -- 기대: ERROR — check constraint "medical_law_override_logs_download_path_check"
