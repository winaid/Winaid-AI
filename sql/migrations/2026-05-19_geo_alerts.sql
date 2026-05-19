-- ============================================
-- 2026-05-19 · geo_alert_subscriptions + geo_alert_history (PR GEO-8 — 14 기능 8번)
-- ============================================
--
-- 목적: AI 인용률 변동 자동 감지 + 알림 발송.
--   geo_citations (PR #225 / GEO-1.1) 데이터가 며칠 쌓이면 우리 인용 비율 변동
--   추세가 보임. 운영자가 매일 diagnostic 들어가서 확인할 필요 없도록 임계 변동
--   자동 감지 → Slack / Email / 카카오톡 발송.
--
-- 적용 DB: 양 앱 lockstep (winaid-internal-seoul + winaid-public 둘 다 RUN).
--   회귀 가드 invariant 가 두 SQL 파일 본문 diff=0 강제.
--
-- 멱등성: 모든 DDL IF NOT EXISTS / DROP POLICY IF EXISTS. 두 번 RUN 해도 에러 0.

-- ── 1. geo_alert_subscriptions 테이블 ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 병원 식별자 — geo_citations.hospital_name 과 같은 키
  hospital_name TEXT NOT NULL,
  -- 변동 감지 기준 도메인 list — geo_citations.our_domains 와 동일 의미
  our_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- 변동 임계 % (default 20 — ±20% 이상 시 알림)
  threshold_pct INT NOT NULL DEFAULT 20 CHECK (threshold_pct > 0 AND threshold_pct <= 100),
  -- 비교 기간 (default 7일)
  compare_window_days INT NOT NULL DEFAULT 7 CHECK (compare_window_days > 0 AND compare_window_days <= 90),
  -- 발송 채널 — { email: '...', slack_webhook: '...', kakao_token: '...' }
  channels JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 활성/일시중지 토글
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. geo_alert_history 테이블 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.geo_alert_subscriptions(id) ON DELETE SET NULL,
  hospital_name TEXT NOT NULL,
  -- 알림 종류 — application 레벨 enum + DB CHECK 이중
  alert_type TEXT NOT NULL CHECK (alert_type IN ('cite_drop', 'cite_rise', 'new_competitor', 'sentiment_drop')),
  -- 변동 수치 + 비교 기간 + 새 경쟁사 list 등 — { current, previous, deltaPct, ... }
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 실제 발송 성공 채널 list — ['slack', 'email'] 등
  sent_to TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. 인덱스 ──────────────────────────────────────────────────────

-- 구독 조회 (hospital_name 으로 활성 구독 list)
CREATE INDEX IF NOT EXISTS idx_geo_alert_subs_hospital_enabled
  ON public.geo_alert_subscriptions (hospital_name, enabled, created_at DESC);

-- 히스토리 — 최근 N건 (hospital_name 기준)
CREATE INDEX IF NOT EXISTS idx_geo_alert_history_hospital_sent
  ON public.geo_alert_history (hospital_name, sent_at DESC);

-- 구독별 히스토리
CREATE INDEX IF NOT EXISTS idx_geo_alert_history_subscription
  ON public.geo_alert_history (subscription_id, sent_at DESC);

-- 알림 종류별 통계 (운영자 대시보드 후속 PR)
CREATE INDEX IF NOT EXISTS idx_geo_alert_history_type_sent
  ON public.geo_alert_history (alert_type, sent_at DESC);

-- ── 4. RLS (geo_citations 기존 패턴 답습) ──────────────────────────

ALTER TABLE public.geo_alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_alert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_alert_subs_service_all" ON public.geo_alert_subscriptions;
DROP POLICY IF EXISTS "geo_alert_history_service_all" ON public.geo_alert_history;

-- service_role 만 허용 (anon/authenticated 자동 차단)
CREATE POLICY "geo_alert_subs_service_all"
  ON public.geo_alert_subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "geo_alert_history_service_all"
  ON public.geo_alert_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 5. updated_at 자동 갱신 trigger ────────────────────────────────

CREATE OR REPLACE FUNCTION public.geo_alert_subs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geo_alert_subs_updated_at ON public.geo_alert_subscriptions;
CREATE TRIGGER trg_geo_alert_subs_updated_at
  BEFORE UPDATE ON public.geo_alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.geo_alert_subs_set_updated_at();


-- ── 검증 SQL (운영자가 RUN) ────────────────────────────────────────
--
-- 1. 두 테이블 + RLS 활성:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('geo_alert_subscriptions', 'geo_alert_history')
--    AND relnamespace = 'public'::regnamespace;
-- 기대: 2 rows, relrowsecurity = t 모두
--
-- 2. CHECK 제약:
-- INSERT INTO geo_alert_subscriptions (hospital_name, threshold_pct) VALUES ('test', 0);
-- 기대: ERROR — CHECK 'threshold_pct > 0' 위반
-- INSERT INTO geo_alert_history (hospital_name, alert_type) VALUES ('test', 'invalid');
-- 기대: ERROR — CHECK 'alert_type IN (cite_drop, cite_rise, new_competitor, sentiment_drop)' 위반
--
-- 3. 정책 각 1개씩 (service_role):
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename IN ('geo_alert_subscriptions', 'geo_alert_history');
-- 기대: 2 rows, cmd='ALL', roles='{service_role}'
--
-- 4. 인덱스 4개:
-- SELECT tablename, indexname FROM pg_indexes
--  WHERE tablename IN ('geo_alert_subscriptions', 'geo_alert_history')
--    AND indexname LIKE 'idx_geo_alert%';
-- 기대: 4 rows (subs_hospital_enabled + history_hospital_sent + history_subscription + history_type_sent)


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시)
-- ============================================
-- DROP TRIGGER IF EXISTS trg_geo_alert_subs_updated_at ON public.geo_alert_subscriptions;
-- DROP FUNCTION IF EXISTS public.geo_alert_subs_set_updated_at;
-- DROP POLICY IF EXISTS "geo_alert_history_service_all" ON public.geo_alert_history;
-- DROP POLICY IF EXISTS "geo_alert_subs_service_all" ON public.geo_alert_subscriptions;
-- DROP INDEX IF EXISTS public.idx_geo_alert_history_type_sent;
-- DROP INDEX IF EXISTS public.idx_geo_alert_history_subscription;
-- DROP INDEX IF EXISTS public.idx_geo_alert_history_hospital_sent;
-- DROP INDEX IF EXISTS public.idx_geo_alert_subs_hospital_enabled;
-- DROP TABLE IF EXISTS public.geo_alert_history;
-- DROP TABLE IF EXISTS public.geo_alert_subscriptions;
--
-- ⚠️ 롤백 시 구독 + 알림 이력 모두 손실.
