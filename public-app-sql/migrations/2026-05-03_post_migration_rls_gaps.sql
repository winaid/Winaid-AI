-- ──────────────────────────────────────────────────────────────────
-- 2026-05-03: 서울 이전 후 RLS 정책 누락 보강
--
-- 깊은 정찰 (4 agent 병렬) 결과 발견된 정책 누락:
--   1. user_credits — INSERT 정책 없음 → 회원가입 시 0 credits → 모든 생성 잠김
--   2. generated_posts — DELETE 정책 service_role only → 마이페이지 글 삭제 실패
--   3. diagnostic_history — RLS 자체 미활성 → 보안 구멍 (anon DELETE 가능)
--   4. diagnostic_stream_cache — 동일
--
-- 이 마이그레이션은 멱등 (DROP POLICY IF EXISTS → CREATE POLICY 패턴).
-- ──────────────────────────────────────────────────────────────────

-- ── 1. user_credits: 본인 row INSERT 허용 ──
-- 회원가입 흐름 (lib/auth.ts:76) 이 user_credits.upsert 시도 →
-- 기존 정책은 SELECT/UPDATE 만 → INSERT 차단 → 회원가입 후 0 credits.
DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
CREATE POLICY "Users can insert own credits"
  ON public.user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 2. generated_posts: 본인 글 DELETE 허용 ──
-- lib/postStorage.ts:226 의 deletePost 가 anon 으로는 service_role 정책에 차단됨.
-- 본인 글에 한해 DELETE 허용.
DROP POLICY IF EXISTS "Users can delete own posts" ON public.generated_posts;
CREATE POLICY "Users can delete own posts"
  ON public.generated_posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 3. diagnostic_history: RLS 활성화 + service_role 정책 ──
-- 현재 RLS 비활성 = 누구나 read/write/delete 가능 (보안 구멍).
-- 라우트는 PR #60 에서 supabaseAdmin 으로 처리 → service_role 정책만 두면 충분.
ALTER TABLE public.diagnostic_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic_history service all" ON public.diagnostic_history;
CREATE POLICY "diagnostic_history service all"
  ON public.diagnostic_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. diagnostic_stream_cache: 동일 ──
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
--
-- SELECT policyname FROM pg_policies WHERE schemaname='public'
--   AND tablename IN ('user_credits','generated_posts','diagnostic_history','diagnostic_stream_cache')
--   ORDER BY tablename, policyname;
