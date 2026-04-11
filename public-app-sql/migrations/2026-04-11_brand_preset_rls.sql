-- 2026-04-11 · hospital_style_profiles RLS 강화
--
-- 문제:
--   기존 정책이 anon 역할에게 INSERT/UPDATE/DELETE 를 전부 허용했음.
--     Anon can insert/update/delete style profiles (USING true / WITH CHECK true)
--   즉 로그인하지 않은 누구나 임의 병원의 style_profile·brand_preset 을
--   덮어쓰거나 지울 수 있었음. 브랜드 프리셋 기능을 출시하기 전에 반드시
--   봉쇄해야 하는 권한 누출.
--
-- 수정:
--   - 읽기(SELECT)는 그대로 모두에게 허용 — 병원 스타일·브랜드는 읽기 전용
--     공유 데이터로 간주.
--   - 쓰기(INSERT/UPDATE/DELETE)는 `auth.role() = 'authenticated'` 로 제한.
--     Supabase 세션이 있는 로그인 사용자만 수정 가능.
--
-- 후속(차기 단계):
--   진짜 완전한 방어는 "각 로그인 사용자가 자기 소속 병원만 수정" 수준으로
--   조여야 함. 그러려면 profiles.team_id ↔ hospital_style_profiles.team_id
--   매칭 기반의 row-level policy 가 필요. 이 마이그레이션은 1단계 — 익명
--   공개 차단까지만 처리한다. user_id 기반 제한은 별도 마이그레이션.
--
-- 재실행 안전성: DROP IF EXISTS + CREATE POLICY (기존에 같은 이름 존재 시
--   먼저 DROP 하므로 반복 실행 가능).

-- ── 기존 위험 정책 제거 ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can view style profiles"   ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can insert style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can update style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anon can delete style profiles" ON public.hospital_style_profiles;

-- 기존 authenticated 정책도 이름 충돌 방지용으로 드롭 후 재생성.
DROP POLICY IF EXISTS "Authenticated users can view style profiles"   ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Authenticated users can insert style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Authenticated users can update style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Authenticated users can delete style profiles" ON public.hospital_style_profiles;
DROP POLICY IF EXISTS "Anyone can read style profiles"                ON public.hospital_style_profiles;

-- ── 새 정책 ─────────────────────────────────────────────────────────

-- 읽기: 모든 사용자 허용 (anon + authenticated).
-- 카드뉴스 생성 시 익명 게스트도 병원 브랜드 프리셋을 로드할 수 있어야 함.
CREATE POLICY "Anyone can read style profiles"
  ON public.hospital_style_profiles FOR SELECT
  USING (true);

-- 쓰기: 로그인한 사용자만.
CREATE POLICY "Authenticated users can insert style profiles"
  ON public.hospital_style_profiles FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update style profiles"
  ON public.hospital_style_profiles FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete style profiles"
  ON public.hospital_style_profiles FOR DELETE
  USING (auth.role() = 'authenticated');
