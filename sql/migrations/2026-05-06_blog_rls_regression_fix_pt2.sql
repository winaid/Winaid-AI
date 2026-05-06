-- ============================================
-- 2026-05-06 · 블로그 도메인 RLS 회귀 fix — Part 2 (잔존 묶음)
-- baseline ID 매핑: DB-002, DB-029, DB-037, BL-D-011, BL-D-012
-- ============================================
--
-- 배경:
--   PR #125 (2026-05-06_blog_rls_regression_fix.sql) 가 DB-001 / DB-018(extension only) /
--   DB-027 을 처리. 본 PR 은 동일 사이클(2B-β1) 의 잔존 회귀를 추가 수습한다.
--
--   docs/AUDIT_REPORT.md High 4건 + docs/audits/blog/_findings_BL-D.md 2건 재확인.
--   회귀 (이전 정책의 빠진 분기) 만 복원 — 신규 RLS 정책은 도입하지 않는다.
--
-- 적용 절차:
--   1. PR 머지
--   2. winaid-internal-seoul + winaid-public-seoul Supabase 양쪽 SQL Editor 에 paste + RUN
--   3. 검증 쿼리 (파일 하단) 로 회귀 재발 여부 확인
--
-- 범위 밖 (별도 PR):
--   · DB-022 hospital_images.user_id TEXT → UUID — 'guest' literal row + ::text 캐스팅이
--     12개 이상 정책·함수에 confirmed dependency. 파괴적 schema 변경이라 본 PR 미포함.
--     별도 PR (`fix/db-022-hospital-images-uuid-migration`) 에서 4단계 (1) is_guest 컬럼,
--     (2) guest user_id → 'guest:<hash>' 차별화, (3) 정책·함수 일괄 재선언, (4) 컬럼 타입
--     변환 + FK 추가 권장.
--   · DB-018 컬럼 암호화 (user_email / ip_hash / doctor_name) — schema migration + app
--     코드 변경 (read/write 경로) 동반.
--   · DB-022 보고: 본 PR 에서는 컬럼 추가도 보류 — 별도 PR 의 (1) 단계에 포함시켜
--     단일 atomic migration 으로 수행하는 편이 회귀 risk 낮음.


-- ════════════════════════════════════════════════════════════════════
-- 1. DB-002 — subscriptions plan_type / credits_total 본인 변조 차단
-- ════════════════════════════════════════════════════════════════════
-- 기존 (sql/setup/supabase_FULL_SETUP.sql:101-103, sql/bootstrap_new_supabase.sql 동일):
--   CREATE POLICY "Users can update own subscription" ON public.subscriptions
--     FOR UPDATE USING (auth.uid() = user_id);
-- → WITH CHECK 절 부재 → JS 콘솔 1줄로 plan_type='premium' / credits_total=99999 변조.
--
-- 회귀 복원: 동일 정책 이름으로 USING + WITH CHECK 양쪽에 본인 매칭만 허용하고,
-- service_role (결제 webhook / admin) 은 별도 정책으로 우회.
--
-- 정책 문법상 USING/WITH CHECK 만으로는 컬럼 단위 freeze 가 불가하므로 BEFORE
-- UPDATE 트리거로 plan_type / credits_total 변경 시도를 service_role 외 차단.
-- (rls_anon_lockdown.sql 옵션 C 후속으로 명시된 흐름 그대로.)

DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role bypass 정책 (없으면 생성 — 결제 webhook 흐름 보존)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='subscriptions' AND policyname='Service role full access subscriptions'
  ) THEN
    CREATE POLICY "Service role full access subscriptions" ON public.subscriptions
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 컬럼 단위 freeze 트리거 — service_role 외 plan_type / credits_total 변경 시도 거부
CREATE OR REPLACE FUNCTION public.subscriptions_freeze_admin_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    RAISE EXCEPTION 'forbidden: plan_type can only be changed by service_role (DB-002)';
  END IF;
  IF NEW.credits_total IS DISTINCT FROM OLD.credits_total THEN
    RAISE EXCEPTION 'forbidden: credits_total can only be changed by service_role (DB-002)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_freeze_admin_columns ON public.subscriptions;
CREATE TRIGGER subscriptions_freeze_admin_columns
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_freeze_admin_columns();


-- ════════════════════════════════════════════════════════════════════
-- 2. DB-029 — deduct_credits caller 검증 추가
-- ════════════════════════════════════════════════════════════════════
-- 기존 (sql/setup/supabase_FULL_SETUP.sql:400-430):
--   SECURITY DEFINER 함수에 caller 검증 부재.
--   anon API key 만으로 임의 user_id 의 credits_used 를 +99999 로 burn 가능.
--
-- 회귀 복원: 2026-05-04_credit_rpc_unify_bypass.sql 의 use_credit / refund_credit /
-- get_credits 와 동일 패턴 (auth.role() = 'service_role' 또는 auth.uid() = p_user_id) 적용.
-- 시그니처 / 반환값 / 비즈니스 로직은 그대로 유지 — caller 검증만 prepend.

CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_total INT;
  v_used INT;
  v_expires TIMESTAMPTZ;
BEGIN
  -- caller 검증 — use_credit 패턴 (audit DB-029 / CR2-1 통일).
  -- SECURITY DEFINER 안에선 current_user 가 owner 이므로 사용 불가 → auth.role() 만 신뢰.
  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: caller mismatch (DB-029)';
  END IF;

  SELECT plan_type, credits_total, credits_used, expires_at
  INTO v_plan, v_total, v_used, v_expires
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_plan = 'premium' THEN
    UPDATE public.subscriptions SET credits_used = credits_used + p_amount WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  IF v_expires IS NOT NULL AND v_expires < NOW() THEN RETURN FALSE; END IF;
  IF (v_total - v_used) < p_amount THEN RETURN FALSE; END IF;

  UPDATE public.subscriptions SET credits_used = credits_used + p_amount WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;


-- ════════════════════════════════════════════════════════════════════
-- 3. DB-037 — profiles anon SELECT 전체 허용 정책 DROP (PIPA 위반 회귀)
-- ════════════════════════════════════════════════════════════════════
-- 기존 (_migration/seoul/internal/01_setup.sql:85-87,
--       sql/bootstrap_new_supabase.sql:64,
--       public-app-sql/bootstrap_new_supabase.sql:64):
--   CREATE POLICY "Anon can view profiles" ON public.profiles
--     FOR SELECT USING (true);
-- → anon API key 노출 시 전 사용자 email / full_name / team_id 노출.
--   admin 흐름은 server route 에서 supabaseAdmin (service_role) 으로 처리되므로
--   anon SELECT 정책은 운영상 불필요.
--
-- 회귀 복원: anon SELECT 정책만 DROP. 본인 row SELECT 정책 ("Users can view own profile")
-- 은 bootstrap 에 그대로 존재 → 본인 데이터 접근 보존.
-- service_role 은 RLS bypass 권한이므로 admin RPC / server route 흐름 영향 없음.

DROP POLICY IF EXISTS "Anon can view profiles" ON public.profiles;


-- ════════════════════════════════════════════════════════════════════
-- 4. BL-D-011 / BL-D-012 — hospital_style_profiles anon 정책 DROP
-- ════════════════════════════════════════════════════════════════════
-- 기존 (sql/bootstrap_new_supabase.sql:218-226,
--       public-app-sql/bootstrap_new_supabase.sql 동일):
--   CREATE POLICY "Anon can view style profiles"   FOR SELECT USING (true);
--   CREATE POLICY "Anon can insert style profiles" FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Anon can update style profiles" FOR UPDATE USING (true);
--   CREATE POLICY "Anon can delete style profiles" FOR DELETE USING (true);
-- → anon API key 만으로 모든 병원 hospital_name / naver_blog_url / 학습본 SELECT/DELETE.
--   특히 DELETE 는 authenticated 정책이 부재 → anon-only DELETE policy 가 단독 존재 →
--   anon 키 노출 시 모든 병원 학습본 삭제 가능 (운영 회귀).
--
-- 회귀 복원: anon 4정책 모두 DROP. authenticated 정책 (SELECT/INSERT/UPDATE) 은 bootstrap
-- 에 그대로 존재. authenticated DELETE 정책은 부재했으므로 본인 권한 보존을 위해 추가
-- (anon-only DELETE 가 사라진 후 authenticated 사용자도 못 지우게 되는 회귀 방지 — 기존
-- 운영에서 authenticated 가 anon 정책으로 인해 우연히 통과하던 경로 복원).

DROP POLICY IF EXISTS "Anon can view style profiles"   ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can insert style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can update style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can delete style profiles" ON public.hospital_style_profiles;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='hospital_style_profiles'
      AND policyname='Authenticated users can delete style profiles'
  ) THEN
    CREATE POLICY "Authenticated users can delete style profiles" ON public.hospital_style_profiles
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 직후)
-- ════════════════════════════════════════════════════════════════════
--
-- 1) DB-002 — 본인이 plan_type 변조 시도 거부:
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<self_uuid>';
--    UPDATE public.subscriptions SET plan_type = 'premium' WHERE user_id = '<self_uuid>';
--    기대: ERROR forbidden: plan_type can only be changed by service_role (DB-002)
--
--    UPDATE public.subscriptions SET credits_total = 99999 WHERE user_id = '<self_uuid>';
--    기대: ERROR forbidden: credits_total can only be changed by service_role (DB-002)
--
--    -- service_role 결제 webhook 흐름 보존:
--    SET ROLE service_role;
--    UPDATE public.subscriptions SET plan_type = 'premium', credits_total = 1000
--      WHERE user_id = '<self_uuid>';
--    기대: 1 row updated
--
-- 2) DB-029 — anon 의 victim deduct 시도 거부:
--    SET ROLE anon;
--    SELECT public.deduct_credits('<victim_uuid>'::uuid, 99999);
--    기대: ERROR forbidden: caller mismatch (DB-029)
--
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<self_uuid>';
--    SELECT public.deduct_credits('<self_uuid>'::uuid, 1);
--    기대: t (또는 잔액 부족 시 f) — 본인 호출 통과
--
-- 3) DB-037 — anon 의 profiles 전수 SELECT 빈 결과:
--    SET ROLE anon;
--    SELECT id, email, name FROM public.profiles LIMIT 5;
--    기대: 0 rows (이전: 전 사용자 PII)
--
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<self_uuid>';
--    SELECT id, email, name FROM public.profiles WHERE id = '<self_uuid>';
--    기대: 본인 row 1건 (Users can view own profile 정책 유지)
--
-- 4) BL-D-011 / BL-D-012 — anon 의 hospital_style_profiles SELECT/DELETE 거부:
--    SET ROLE anon;
--    SELECT hospital_name, naver_blog_url FROM public.hospital_style_profiles LIMIT 5;
--    기대: 0 rows (이전: 전수 조회)
--
--    DELETE FROM public.hospital_style_profiles WHERE hospital_name = 'X';
--    기대: 0 rows deleted (이전: 통과)
--
--    SET ROLE authenticated;
--    SELECT hospital_name FROM public.hospital_style_profiles LIMIT 5;
--    기대: rows visible (Authenticated users can view style profiles 유지)


-- ════════════════════════════════════════════════════════════════════
-- 롤백 SQL (필요 시 — 운영 회귀 발견 시 한정)
-- ════════════════════════════════════════════════════════════════════
--
-- DROP TRIGGER IF EXISTS subscriptions_freeze_admin_columns ON public.subscriptions;
-- DROP FUNCTION IF EXISTS public.subscriptions_freeze_admin_columns();
-- DROP POLICY IF EXISTS "Service role full access subscriptions" ON public.subscriptions;
-- DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
-- CREATE POLICY "Users can update own subscription" ON public.subscriptions
--   FOR UPDATE USING (auth.uid() = user_id);
--
-- CREATE POLICY "Anon can view profiles" ON public.profiles FOR SELECT USING (true);
--
-- CREATE POLICY "Anon can view style profiles"   ON public.hospital_style_profiles FOR SELECT USING (true);
-- CREATE POLICY "Anon can insert style profiles" ON public.hospital_style_profiles FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Anon can update style profiles" ON public.hospital_style_profiles FOR UPDATE USING (true);
-- CREATE POLICY "Anon can delete style profiles" ON public.hospital_style_profiles FOR DELETE USING (true);
-- DROP POLICY IF EXISTS "Authenticated users can delete style profiles" ON public.hospital_style_profiles;
--
-- (DB-029 deduct_credits 는 caller 검증 추가가 회귀 risk 매우 낮으므로 롤백 SQL 생략 —
--  필요 시 sql/setup/supabase_FULL_SETUP.sql:400-430 본 정의로 CREATE OR REPLACE.)
--
-- 주의: 롤백 시 PIPA 위반 / 영업비밀 누설 / plan_type 변조 surface 즉시 재발 →
-- production 운영 회귀 발견 시에만 사용.
