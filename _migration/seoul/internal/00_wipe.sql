-- ============================================
-- next-app Seoul wipe SQL
-- 유지: pgvector 확장, blog-images / hospital-images / feedback-images 버킷
-- 손실: 모든 public.* 테이블/함수/정책/트리거 + 데이터 (이전 부분 적용본 청소)
-- ============================================

-- WINAID + 잠재 cruft 테이블 모두 DROP CASCADE
DROP TABLE IF EXISTS public.api_rate_limit CASCADE;
DROP TABLE IF EXISTS public.api_usage_logs CASCADE;
DROP TABLE IF EXISTS public.blog_history CASCADE;
DROP TABLE IF EXISTS public.diagnostic_history CASCADE;
DROP TABLE IF EXISTS public.diagnostic_public_shares CASCADE;
DROP TABLE IF EXISTS public.diagnostic_stream_cache CASCADE;
DROP TABLE IF EXISTS public.feedback_images CASCADE;
DROP TABLE IF EXISTS public.generated_posts CASCADE;
DROP TABLE IF EXISTS public.hospital_crawled_posts CASCADE;
DROP TABLE IF EXISTS public.hospital_images CASCADE;
DROP TABLE IF EXISTS public.hospital_style_profiles CASCADE;
DROP TABLE IF EXISTS public.hospitals CASCADE;
DROP TABLE IF EXISTS public.influencer_outreach CASCADE;
DROP TABLE IF EXISTS public.internal_feedbacks CASCADE;
DROP TABLE IF EXISTS public.llm_batches CASCADE;
DROP TABLE IF EXISTS public.medical_law_cache CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.usage_logs CASCADE;
DROP TABLE IF EXISTS public.user_credits CASCADE;

-- 사용자 정의 public 함수만 DROP (pgvector extension 함수 보호)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, oidvectortypes(p.proargtypes) AS argtypes
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
  END LOOP;
END $$;

-- Storage 정책 정리 (next-app 가 만들었던 것들)
DROP POLICY IF EXISTS "Public read blog-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload blog-images" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload blog-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone read hospital-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload hospital-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth update hospital-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete hospital-images" ON storage.objects;
DROP POLICY IF EXISTS "feedback-images authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "feedback-images public read" ON storage.objects;

-- ── 검증 ──
SELECT * FROM (VALUES
  ('remaining_tables',
   (SELECT count(*)::text FROM information_schema.tables WHERE table_schema='public')),
  ('remaining_user_functions',
   (SELECT count(*)::text FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e'))),
  ('pgvector_intact',
   (SELECT extversion FROM pg_extension WHERE extname='vector')),
  ('buckets_count',
   (SELECT count(*)::text FROM storage.buckets WHERE id IN ('blog-images','hospital-images','feedback-images')))
) AS t(check_item, got);
