-- ──────────────────────────────────────────────────────────────────
-- 2026-05-03: 서울 이전 후 RLS 정책 누락 보강 (next-app)
--
-- 깊은 정찰 결과 발견된 정책 누락:
--   1. diagnostic_history — RLS 자체 미활성 → 보안 구멍 (anon DELETE 가능)
--   2. diagnostic_stream_cache — 동일
--
-- next-app 은 user_credits / generated_posts.delete 가 코드 흐름상 동작 (admin RPC 사용
-- 또는 본인 row 한정 정책 이미 존재), 진단 테이블만 보강 대상.
--
-- 멱등 (DROP POLICY IF EXISTS → CREATE POLICY 패턴).
-- ──────────────────────────────────────────────────────────────────

-- ── 1. diagnostic_history: RLS 활성화 + service_role 정책 ──
-- 현재 RLS 비활성 = 누구나 read/write/delete 가능 (보안 구멍).
-- 라우트는 supabaseAdmin 으로 처리 → service_role 정책만 두면 충분.
ALTER TABLE public.diagnostic_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic_history service all" ON public.diagnostic_history;
CREATE POLICY "diagnostic_history service all"
  ON public.diagnostic_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. diagnostic_stream_cache: 동일 ──
ALTER TABLE public.diagnostic_stream_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic_stream_cache service all" ON public.diagnostic_stream_cache;
CREATE POLICY "diagnostic_stream_cache service all"
  ON public.diagnostic_stream_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 검증 (실행 후 수동 확인) ──
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
--   AND tablename IN ('diagnostic_history','diagnostic_stream_cache');
-- 기대: 둘 다 rowsecurity=true.
