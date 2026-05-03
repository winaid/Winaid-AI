-- ============================================
-- 2026-05-04 · influencer_outreach RLS 좁힘 (next-app DB only)
-- ============================================
--
-- 목적:
--   2026-04-08_influencer_outreach.sql 의 정책 1개 —
--     CREATE POLICY "influencer_outreach_all_access"
--       FOR ALL USING (true) WITH CHECK (true);
--   인증된 누구든 임의 hospital_name 으로 upsert / read / delete 가능 →
--   타 병원 인플루언서 데이터 위변조 + DM 발송 이력 탈취 risk.
--
--   본 마이그레이션은 anon / authenticated 모두 차단 — 라우트가
--   supabaseAdmin (service_role) 으로만 접근하도록 강제.
--   호환 코드 변경: next-app/app/api/influencer/status/route.ts 가 이미
--   supabaseAdmin 으로 전환됨 (본 PR 의 코드 변경분).
--
--   public-app 에는 influencer_outreach 테이블이 없음 → 본 마이그레이션 미적용.
--
-- 적용 순서 (작업자):
--   1. 본 PR 머지 → Vercel 자동 재배포 (코드가 supabaseAdmin 사용 시작)
--   2. winaid-internal-seoul Dashboard SQL Editor 에 본 파일 paste + RUN
--   3. 검증 SQL (하단) 결과 확인
--   ※ 순서 반대로 (SQL 먼저) 적용하면 라우트가 차단되어 5xx 발생.
--
-- 멱등성: DROP POLICY IF EXISTS / CREATE POLICY 패턴.

-- ── 기존 정책 제거 ──
DROP POLICY IF EXISTS "influencer_outreach_all_access" ON public.influencer_outreach;

-- 혹시 다른 이름으로 다시 만든 정책이 있다면 정리 (방어적)
DROP POLICY IF EXISTS "influencer_outreach_authenticated_all" ON public.influencer_outreach;
DROP POLICY IF EXISTS "influencer_outreach_anon_all" ON public.influencer_outreach;
DROP POLICY IF EXISTS "influencer_outreach_service_all" ON public.influencer_outreach;

-- ── 새 정책 — service_role 만 허용 ──
-- service_role 은 RLS 우회되지만, 명시 정책을 두면 의도가 코드/감사로그에서
-- 명확. authenticated/anon 은 정책 없음 → 자동 차단 (RLS 활성).
CREATE POLICY "influencer_outreach_service_all"
  ON public.influencer_outreach
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS 활성 보장 (이미 켜져있으면 no-op)
ALTER TABLE public.influencer_outreach ENABLE ROW LEVEL SECURITY;


-- ── 검증 SQL (작업자가 RUN) ────────────────────────────────────
--
-- 1. 정책 정확히 1개 (service_role) 만 남았는지:
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE tablename = 'influencer_outreach';
-- 기대: 1 row — 'influencer_outreach_service_all', cmd='ALL', roles='{service_role}'
--
-- 2. RLS 활성 확인:
-- SELECT relrowsecurity FROM pg_class
--  WHERE relname = 'influencer_outreach' AND relnamespace = 'public'::regnamespace;
-- 기대: t (true)
--
-- 3. authenticated 가 차단되는지 — 운영 staging 에서:
--   3-A. anon key + 임의 hospital_name 으로 upsert 시도 → 정책 없어서 거부
--   3-B. service_role key (라우트 supabaseAdmin) → 정상 upsert
--   ※ Dashboard SQL Editor 는 service_role 컨텍스트라 직접 SELECT 통과 — 정상.


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시 SQL Editor 에 paste 후 RUN)
-- ============================================
-- DROP POLICY IF EXISTS "influencer_outreach_service_all" ON public.influencer_outreach;
-- CREATE POLICY "influencer_outreach_all_access"
--   ON public.influencer_outreach
--   FOR ALL USING (true) WITH CHECK (true);
--
-- ⚠️ 롤백 시 anon/authenticated 가 다시 임의 hospital_name 변조 가능 — 보안 회귀.
--    가능하면 코드 측 supabaseAdmin 사용을 유지한 채 정책만 복원하지 말 것.
