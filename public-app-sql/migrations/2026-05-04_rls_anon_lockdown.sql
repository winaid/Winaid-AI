-- ============================================
-- 2026-05-04 · anon RLS 잠금 (CR-2 — PII 누설 차단)
-- ============================================
--
-- 배경 (audit Agent D — CRITICAL):
--   sql/bootstrap_new_supabase.sql:174-177 · 124-132 의 anon 정책이 너무 광범위.
--   - generated_posts: anon SELECT USING(true), INSERT WITH CHECK(true)
--   - subscriptions:    anon INSERT/UPDATE WITH CHECK(true)
--
--   → NEXT_PUBLIC_SUPABASE_ANON_KEY (client 노출) 를 가진 누구나
--     · generated_posts 의 모든 PII (hospital_name / doctor_name / user_email /
--       ip_hash / content) 전수 SELECT
--     · 임의 user_id 의 subscription plan / credits_used 변조 (premium 무료 승급)
--   → PIPA 1차 위반 + 매출 누수 surface.
--
-- caller 사전 점검 결과 (next-app/lib/postStorage.ts, public-app/lib/postStorage.ts,
-- next-app/lib/auth.ts, public-app/lib/auth.ts, mypage/page.tsx, admin/adminTypes.ts):
--   · generated_posts INSERT/SELECT — client (anon supabase + 사용자 JWT) 흐름.
--     auth.uid() = user_id 매칭으로 통과 가능 → 인증 사용자 정상 ✓
--     게스트는 postStorage 의 try/catch fallback (localStorage) 으로 자연 동작 ✓
--   · admin adminTypes.ts:101 의 anon SELECT fallback — RPC 우선 흐름이라 영향 미미
--   · subscriptions upsert (auth.ts:125) — client + 사용자 JWT.
--     'Service role manages FOR ALL' 잠금 시 가입 직후 free plan row 부재 →
--     credit 0 회귀 위험. 따라서 옵션 B 채택 — 본인 row INSERT/UPDATE 허용
--     (auth.uid() = user_id). 다른 user 변조 차단 → CRITICAL 해소.
--     본인 plan 변조 risk 는 후속 PR (CHECK constraint 또는 trigger) 영역.
--
-- 적용 절차:
--   1. PR 머지 (이 SQL 파일이 git 에 추가됨)
--   2. Supabase SQL Editor (winaid-internal-seoul + winaid-public-seoul) 양쪽
--      에 paste + RUN
--   3. anon key curl 검증 (PR 본문 시나리오)


-- ════════════════════════════════════════════════════════════════════
-- 1. generated_posts — anon SELECT/INSERT 정책 폐기
-- ════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anon can insert posts" ON public.generated_posts;
DROP POLICY IF EXISTS "Anon can view posts" ON public.generated_posts;

-- 기존 본인 row 정책 ("Users can insert own posts" / "Users can view own posts")
-- 은 이미 존재 (bootstrap line 166-169). 추가 변경 없음.
-- service_role 정책 ("Service role can view all posts" / "delete posts")
-- 도 이미 존재 → server route 가 supabaseAdmin 으로 우회 가능.


-- ════════════════════════════════════════════════════════════════════
-- 2. subscriptions — anon INSERT/UPDATE 정책 폐기 (옵션 B)
-- ════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anon can insert subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Anon can update subscription" ON public.subscriptions;

-- 기존 본인 row 정책 ("Users can view/insert/update own subscription")
-- 은 이미 존재 (bootstrap line 122-127). 따라서 client 의 auth.ts:125 upsert 는
-- 사용자 JWT 통해 auth.uid() = user_id 매칭 → 정상 작동.
-- 다른 user_id 변조는 본인 row 정책으로 차단됨 → CRITICAL 해소.

-- 후속 PR 후보 (옵션 C):
--   plan_type 변경은 결제 webhook (service_role) 만 허용:
--   CHECK constraint OR BEFORE UPDATE trigger 로 plan_type/credits_total 변경
--   막고 INSERT 시 'free' plan + 10 credits 강제. 본인 변조 risk 추가 차단.


-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 직후)
-- ════════════════════════════════════════════════════════════════════
--
-- 1) anon SELECT generated_posts 시도 — 빈 배열:
--    SET ROLE anon;
--    SELECT hospital_name FROM public.generated_posts LIMIT 5;
--    기대: 0 rows (이전: 전체 PII)
--
-- 2) anon INSERT generated_posts 시도 — 거부:
--    INSERT INTO public.generated_posts (user_id, post_type, title, content)
--    VALUES (NULL, 'blog', 'x', 'x');
--    기대: ERROR new row violates row-level security
--
-- 3) authenticated user 본인 row INSERT — 통과:
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<test_uuid>';
--    INSERT INTO public.generated_posts (user_id, post_type, title, content)
--    VALUES ('<test_uuid>', 'blog', 'x', 'x');
--    기대: 1 row inserted
--
-- 4) anon UPDATE subscriptions 시도 — 거부:
--    UPDATE public.subscriptions SET plan_type = 'premium' WHERE user_id = '<any>';
--    기대: 0 rows updated
--
-- 5) authenticated user 본인 subscription upsert — 통과 (가입 흐름):
--    INSERT INTO public.subscriptions (user_id, plan_type, credits_total)
--    VALUES ('<self_uuid>', 'free', 10)
--    ON CONFLICT (user_id) DO UPDATE SET credits_total = 10;
--    기대: 1 row affected


-- ════════════════════════════════════════════════════════════════════
-- 롤백 SQL (필요 시)
-- ════════════════════════════════════════════════════════════════════
--
-- CREATE POLICY "Anon can insert posts" ON public.generated_posts
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Anon can view posts" ON public.generated_posts
--   FOR SELECT USING (true);
-- CREATE POLICY "Anon can insert subscription" ON public.subscriptions
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Anon can update subscription" ON public.subscriptions
--   FOR UPDATE USING (true);
--
-- ⚠️ 롤백 시 PII 누설 surface 즉시 재발 — production 운영 회귀 발견 시에만 사용.
