-- ============================================
-- 2026-04-29 · hospital_images 팀 공유 전환
-- ============================================
-- 목표:
--   같은 team_id 의 사용자는 다른 팀원 이미지를 조회·사용 가능 (SELECT)
--   업로드·수정·삭제는 업로더 본인만 (INSERT/UPDATE/DELETE 는 user_id = owner 를
--   API 라우트 server-side filter 가 강제).
--
-- 아키텍처 메모:
--   본 코드베이스는 글로벌 anon Supabase client + API 라우트 server-side filter
--   패턴 (auth.uid() 는 anon 호출이라 항상 NULL). 따라서 user-scope 격리는
--   server-side filter 가 primary gate. 본 마이그레이션의 RLS 는 코드베이스
--   다른 RLS (예: 2026-04-11_crawled_posts_rls.sql) 와 동일한 패턴:
--     · SELECT  · USING (true)  — permissive (server-side filter 가 gate)
--     · WRITE   · auth.role() = 'authenticated'
--   anon key 직접 호출 차단(=request-scoped supabase client 도입) 은 별도 PR.
--
-- 재실행 안전 (idempotent):
--   ADD COLUMN IF NOT EXISTS · DROP POLICY IF EXISTS → CREATE POLICY 패턴.
--   백필 UPDATE 도 idempotent (team_id IS NULL 인 row 만 갱신).
--
-- 롤백: 파일 맨 아래 "롤백 SQL" 블록 참고.


-- ── 1. team_id 컬럼 추가 ───────────────────────────────────────────
-- profiles.team_id 와 동일하게 INTEGER. NOT NULL 강제하지 않음
-- (팀 미배정 사용자가 있을 수 있음 — 그 경우 본인만 보임).
ALTER TABLE public.hospital_images
  ADD COLUMN IF NOT EXISTS team_id INTEGER;


-- ── 2. 기존 row 백필 ───────────────────────────────────────────────
-- profiles.team_id 가 NULL 이면 hospital_images.team_id 도 NULL 유지.
-- 본 PR 의 SELECT 필터는 team_id NULL 을 "팀 공유 안 됨" 으로 해석함.
UPDATE public.hospital_images h
   SET team_id = p.team_id
  FROM public.profiles p
 WHERE h.user_id = p.id
   AND h.team_id IS NULL;


-- ── 3. 인덱스 ─────────────────────────────────────────────────────
-- 팀별 최근 업로드 정렬 쿼리용 (image-library 페이지 GET).
CREATE INDEX IF NOT EXISTS idx_hospital_images_team_id
  ON public.hospital_images (team_id, created_at DESC);


-- ── 4. INSERT 시 team_id 자동 채움 트리거 ──────────────────────────
-- API 라우트가 team_id 를 explicit 하게 넘기지만, DB 레벨에서도 backup.
-- API 가 명시적으로 team_id 를 지정하면 그 값을 우선 (의도적 override 가능).
CREATE OR REPLACE FUNCTION public.set_hospital_image_team_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT team_id INTO NEW.team_id
      FROM public.profiles
     WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hospital_images_set_team_id ON public.hospital_images;
CREATE TRIGGER trg_hospital_images_set_team_id
  BEFORE INSERT ON public.hospital_images
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hospital_image_team_id();


-- ── 5. RLS 활성화 + 정책 ──────────────────────────────────────────
-- 현재 hospital_images 테이블엔 RLS 자체가 없음 (2026-04-17 마이그레이션 누락).
-- 이번 PR 에서 활성화 + 코드베이스 일관 정책 추가.
ALTER TABLE public.hospital_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hospital images"           ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can insert hospital images"  ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can update hospital images"  ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can delete hospital images"  ON public.hospital_images;

CREATE POLICY "Anyone can read hospital images"
  ON public.hospital_images FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert hospital images"
  ON public.hospital_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update hospital images"
  ON public.hospital_images FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete hospital images"
  ON public.hospital_images FOR DELETE
  USING (auth.role() = 'authenticated');


-- ── 6. Storage RLS (hospital-images 버킷) ─────────────────────────
-- Storage 경로 패턴: {user_id}/{uuid}.{ext}  (upload/route.ts:38 참고).
-- 본 PR 는 코드베이스 일관 패턴(2026-04-11_crawled_posts_rls.sql 참고):
--   · SELECT  · 버킷 단위 read (server-side filter + getPublicUrl 패턴 유지)
--   · WRITE   · authenticated 만
-- 본인 폴더 enforce(=업로드 경로 = auth.uid()) 는 storage 경로가 server 에서
-- 결정되므로 (upload/route.ts:38) DB 레벨에서 추가로 안 강제. anon key 직접
-- 호출 차단은 별도 PR (signed URL 패턴 도입과 함께).
DROP POLICY IF EXISTS "Anyone read hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth upload hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth update hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth delete hospital-images"  ON storage.objects;

CREATE POLICY "Anyone read hospital-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hospital-images');

CREATE POLICY "Auth upload hospital-images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hospital-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth update hospital-images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'hospital-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth delete hospital-images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hospital-images'
    AND auth.role() = 'authenticated'
  );


-- ── 검증 쿼리 (실행 후 수동 확인 권장) ────────────────────────────
-- 1) team_id 백필 결과:
--      SELECT count(*) FILTER (WHERE team_id IS NULL)     AS null_team,
--             count(*) FILTER (WHERE team_id IS NOT NULL) AS with_team
--        FROM public.hospital_images;
--
-- 2) 정책 등록 확인:
--      SELECT policyname FROM pg_policies WHERE tablename = 'hospital_images';
--      SELECT policyname FROM pg_policies WHERE tablename = 'objects'
--        AND policyname LIKE '%hospital-images%';
--
-- 3) 시나리오 검증 (사용자 A/B/C):
--    - A · B 같은 team_id, C 다른 team_id 로 가정.
--    - A 로 이미지 업로드 → DB 에 team_id = A.team_id 채워짐 확인.
--    - B 가 GET /api/hospital-images?mine=0 호출 시 A 의 이미지 보임.
--    - C 가 GET /api/hospital-images?mine=0 호출 시 A 의 이미지 안 보임.
--    - B 가 PATCH/DELETE A 의 이미지 시도 → API 라우트의 server-side filter
--      (`.eq('user_id', owner)`) 가 차단 → 404 반환.


-- ============================================
-- 롤백 SQL (운영 적용 후 문제 발생 시 SQL Editor 에 붙여 실행)
-- ============================================
-- DROP POLICY IF EXISTS "Anyone read hospital-images"  ON storage.objects;
-- DROP POLICY IF EXISTS "Auth upload hospital-images"  ON storage.objects;
-- DROP POLICY IF EXISTS "Auth update hospital-images"  ON storage.objects;
-- DROP POLICY IF EXISTS "Auth delete hospital-images"  ON storage.objects;
-- DROP POLICY IF EXISTS "Anyone can read hospital images"           ON public.hospital_images;
-- DROP POLICY IF EXISTS "Authenticated can insert hospital images"  ON public.hospital_images;
-- DROP POLICY IF EXISTS "Authenticated can update hospital images"  ON public.hospital_images;
-- DROP POLICY IF EXISTS "Authenticated can delete hospital images"  ON public.hospital_images;
-- ALTER TABLE public.hospital_images DISABLE ROW LEVEL SECURITY;
-- DROP TRIGGER  IF EXISTS trg_hospital_images_set_team_id ON public.hospital_images;
-- DROP FUNCTION IF EXISTS public.set_hospital_image_team_id();
-- DROP INDEX    IF EXISTS idx_hospital_images_team_id;
-- ALTER TABLE   public.hospital_images DROP COLUMN IF EXISTS team_id;
