-- 2026-04-11 · hospital_crawled_posts RLS 강화
--
-- 문제:
--   hospital_style_profiles 와 동일한 패턴으로 기존 정책이 anon 역할에게
--   INSERT/UPDATE/DELETE 를 전부 허용했음.
--     Anon can insert/update/delete crawled posts (USING true / WITH CHECK true)
--   즉 로그인하지 않은 누구나 임의 병원의 크롤링 글을 덮어쓰거나 지울 수 있었음.
--   말투 학습 데이터가 오염되거나 삭제되면 전체 사용자의 글 생성 품질이
--   훼손되므로 반드시 봉쇄해야 함.
--
-- 수정:
--   - 읽기(SELECT)는 그대로 모두에게 허용 — 크롤링 글은 읽기 전용 공유 데이터로
--     간주 (카드뉴스·블로그 생성 시 게스트도 참조 가능).
--   - 쓰기(INSERT/UPDATE/DELETE)는 `auth.role() = 'authenticated'` 로 제한.
--     Supabase 세션이 있는 로그인 사용자만 수정 가능.
--
-- 재실행 안전성: DROP IF EXISTS + CREATE POLICY. 기존 정책이 있든 없든 반복
--   실행 가능.
--
-- 적용 대상: public-app 용 Supabase + next-app 용 Supabase 둘 다 동일 내용.
--   (두 앱은 별도 DB 를 쓰지만 동일한 테이블 스키마·동일한 위협 모델)

-- ── 기존 위험 정책 제거 ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can view crawled posts"                   ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can insert crawled posts"                 ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can update crawled posts"                 ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anon can delete crawled posts"                 ON public.hospital_crawled_posts;

-- 기존 authenticated 정책도 이름 충돌 방지용으로 드롭 후 재생성.
DROP POLICY IF EXISTS "Authenticated users can view crawled posts"    ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can insert crawled posts"  ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can update crawled posts"  ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Authenticated users can delete crawled posts"  ON public.hospital_crawled_posts;
DROP POLICY IF EXISTS "Anyone can read crawled posts"                 ON public.hospital_crawled_posts;

-- ── 새 정책 ─────────────────────────────────────────────────────────

-- 읽기: 모든 사용자 허용 (anon + authenticated).
-- 카드뉴스/블로그 생성 시 게스트도 병원 크롤링 데이터를 참조할 수 있어야 함.
CREATE POLICY "Anyone can read crawled posts"
  ON public.hospital_crawled_posts FOR SELECT
  USING (true);

-- 쓰기: 로그인한 사용자만.
CREATE POLICY "Authenticated users can insert crawled posts"
  ON public.hospital_crawled_posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update crawled posts"
  ON public.hospital_crawled_posts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete crawled posts"
  ON public.hospital_crawled_posts FOR DELETE
  USING (auth.role() = 'authenticated');
