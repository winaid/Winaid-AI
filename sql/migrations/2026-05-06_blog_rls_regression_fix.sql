-- ============================================
-- 2026-05-06 · 블로그 도메인 RLS 회귀 fix
-- baseline ID 매핑: DB-001, DB-018 (extension only), DB-027
-- ============================================
--
-- 배경:
--   docs/AUDIT_REPORT.md High 회귀 3건 + docs/audits/blog/_findings_BL-* 재확인.
--   PR #117 (rls_anon_lockdown) 가 anon 정책만 DROP — base 정책의 NULL 분기가
--   잔존하여 authenticated 사용자가 user_id=NULL 로 INSERT 가능. 또한 차후
--   match_blog_posts 가 SECURITY DEFINER 로 격상될 경우 caller 검증 부재로
--   타 user 임베딩 enumeration risk 가 활성화됨. PIPA 대비 pgcrypto extension
--   준비가 사전조건이라 본 마이그레이션에서 활성화만 수행 (컬럼 암호화는
--   별도 PR 영역).
--
-- 적용 절차:
--   1. PR 머지
--   2. winaid-internal-seoul + winaid-public-seoul Supabase 양쪽 SQL Editor 에 paste + RUN
--   3. 검증 쿼리 (파일 하단) 로 회귀 재발 여부 확인
--
-- 범위 밖 (별도 PR):
--   · DB-018 컬럼 암호화 (user_email / ip_hash / doctor_name) — schema migration + app 코드 변경 필요
--   · DB-002 subscriptions WITH CHECK (plan_type/credits_total 본인 변조 차단) — 옵션 C
--   · DB-022 hospital_images.user_id TEXT → UUID — schema 파괴적
--   · 의역 동의어 / PII 마스킹 / 카드뉴스 hard-block — ADR 선결


-- ════════════════════════════════════════════════════════════════════
-- 1. DB-001 — generated_posts INSERT 정책 NULL 분기 제거
-- ════════════════════════════════════════════════════════════════════
-- 기존 (bootstrap_new_supabase.sql:166-167, setup/supabase_FULL_SETUP.sql:46):
--   WITH CHECK (auth.uid() = user_id OR user_id IS NULL)
-- → authenticated user 가 user_id=NULL 로 INSERT 시 통과 (orphaned post 생성).
-- → 후속 SELECT 정책 (`auth.uid() = user_id`) 으로는 회수 불가 → service_role
--    조회·삭제만 가능한 dangling row 가 누적, 운영성·감사성 모두 훼손.
--
-- 본 마이그레이션은 NULL 분기를 제거하여 user_id 명시 강제.
-- service_role 은 별도 정책 ("Service role can view all posts" 외) 으로 우회.
DROP POLICY IF EXISTS "Users can insert own posts" ON public.generated_posts;
CREATE POLICY "Users can insert own posts" ON public.generated_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════
-- 2. DB-027 — match_blog_posts caller 검증 추가
-- ════════════════════════════════════════════════════════════════════
-- 기존 (bootstrap_new_supabase.sql:413-452):
--   filter_user_id NULL 허용 → SELECT 정책에 의존하던 모드.
--   현재 LANGUAGE plpgsql (SECURITY INVOKER 기본) 라 RLS 가 적용되어 큰 위험은
--   없으나, 향후 SECURITY DEFINER 격상 시 즉시 enumeration vector 가 됨
--   (filter_user_id NULL → 전체 임베딩 검색 가능).
--
-- 방어책: filter_user_id 가 NULL 이거나 caller(auth.uid()) 와 다르면 빈 결과.
-- service_role 은 auth.uid() = NULL 이지만 RLS bypass 권한이 있으므로 명시적
-- service_role 분기를 두어 admin 호출 흐름 보존.
CREATE OR REPLACE FUNCTION match_blog_posts(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  html_content TEXT,
  keywords TEXT[],
  naver_url TEXT,
  category TEXT,
  published_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  caller_role TEXT := COALESCE(auth.role(), '');
BEGIN
  -- service_role 외 호출자는 본인 user_id 만 조회 가능. NULL 또는 타인 user_id
  -- 이면 빈 결과 반환 (장래 SECURITY DEFINER 격상에 대비한 사전 차단).
  IF caller_role <> 'service_role' THEN
    IF filter_user_id IS NULL OR caller_uid IS NULL OR filter_user_id <> caller_uid THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    blog_history.id,
    blog_history.title,
    blog_history.content,
    blog_history.html_content,
    blog_history.keywords,
    blog_history.naver_url,
    blog_history.category,
    blog_history.published_at,
    1 - (blog_history.embedding <=> query_embedding) AS similarity
  FROM public.blog_history
  WHERE
    (filter_user_id IS NULL OR blog_history.user_id = filter_user_id)
    AND blog_history.embedding IS NOT NULL
    AND 1 - (blog_history.embedding <=> query_embedding) > match_threshold
  ORDER BY blog_history.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ════════════════════════════════════════════════════════════════════
-- 3. DB-018 — pgcrypto extension 활성화 (사전조건만)
-- ════════════════════════════════════════════════════════════════════
-- 본 PR 범위는 extension 활성화에 한정. 실제 user_email / ip_hash /
-- doctor_name 컬럼 암호화 (또는 단방향 hash 전환) 는 schema migration 과
-- app 측 read/write 경로 변경이 동반되므로 별도 PR (DB-018 column encryption).
--
-- 활성화만으로 운영 동작 변화 없음. supabase 환경은 보통 이미 설치되어 있어
-- IF NOT EXISTS 로 idempotent.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 직후)
-- ════════════════════════════════════════════════════════════════════
--
-- 1) DB-001 — authenticated user 가 user_id=NULL INSERT 시도 시 거부:
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<test_uuid>';
--    INSERT INTO public.generated_posts (user_id, post_type, title, content)
--    VALUES (NULL, 'blog', 'x', 'x');
--    기대: ERROR new row violates row-level security
--
-- 2) DB-027 — anon / 다른 user_id 호출 시 빈 결과:
--    SET ROLE anon;
--    SELECT * FROM match_blog_posts(
--      ARRAY_FILL(0.0, ARRAY[768])::VECTOR(768), 0.0, 5, NULL
--    );
--    기대: 0 rows
--
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<user_a_uuid>';
--    SELECT * FROM match_blog_posts(
--      ARRAY_FILL(0.0, ARRAY[768])::VECTOR(768), 0.0, 5, '<user_b_uuid>'::uuid
--    );
--    기대: 0 rows
--
-- 3) DB-018 — pgcrypto 함수 가용성:
--    SELECT digest('test', 'sha256') IS NOT NULL;
--    기대: t
