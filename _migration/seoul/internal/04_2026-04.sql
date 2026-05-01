-- ============================================
-- File: sql/migrations/2026-04-10_rebalance_team_hospitals.sql
-- ============================================
-- ============================================
-- 2026-04-10: 팀/병원 재배치 — 김소영 매니저 제거 + 병원 이관
-- ============================================
-- 배경:
--   next-app/lib/teamData.ts (런타임 소스) 를 2026-04-10 에 업데이트하여
--   김소영 매니저님을 제거하고 소속 병원 4개를 재배치했다.
--   이 마이그레이션은 2026-03-24_dynamic_team_hospitals.sql 로 seed 된
--   DB 를 동일한 상태로 동기화한다.
--
-- 변경 내용:
--   · 닥터신치과        → 1팀 최휘원 매니저님
--   · 검단일등치과      → 1팀 최휘원 매니저님
--   · 코랄치과 (김소영) → 1팀 최휘원 매니저님 (이름도 "코랄치과 (최휘원)" 로 변경)
--   · 아산베스트치과    → 3팀 김태광 팀장님
--
-- ⚠️  경고: 이 마이그레이션 적용 후에는 2026-03-24_dynamic_team_hospitals.sql
--    을 다시 실행하지 마세요. 원본 seed 의 ON CONFLICT DO UPDATE 절이 위
--    변경을 되돌립니다. 신규 환경이라면 이 파일까지 순차 적용해 주세요.
--
-- 모든 UPDATE 는 idempotent — 여러 번 실행해도 결과 동일.

BEGIN;

-- 닥터신치과 → 최휘원 매니저님
UPDATE public.hospitals
SET manager = '최휘원 매니저님', updated_at = now()
WHERE name = '닥터신치과';

-- 검단일등치과 → 최휘원 매니저님
UPDATE public.hospitals
SET manager = '최휘원 매니저님', updated_at = now()
WHERE name = '검단일등치과';

-- 아산베스트치과 → 3팀 김태광 팀장님
UPDATE public.hospitals
SET team_id = 3, manager = '김태광 팀장님', updated_at = now()
WHERE name = '아산베스트치과';

-- 코랄치과 (김소영) → 이름 변경 + 최휘원 매니저님
-- 참고: 1팀 김주열 팀장님에게 이미 "코랄치과" 가 있어 suffix 로 구분
UPDATE public.hospitals
SET name = '코랄치과 (최휘원)', manager = '최휘원 매니저님', updated_at = now()
WHERE name = '코랄치과 (김소영)';

-- 안전장치: 김소영 매니저님 소속 병원이 남아있으면 경고 출력
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.hospitals
  WHERE manager = '김소영 매니저님';

  IF remaining > 0 THEN
    RAISE WARNING '[rebalance] 김소영 매니저님 소속 병원이 아직 %건 남아있습니다. 수동 확인이 필요합니다.', remaining;
  ELSE
    RAISE NOTICE '[rebalance] 김소영 매니저님 매핑 정리 완료 (0건 남음).';
  END IF;
END $$;

COMMIT;

-- ============================================
-- File: sql/migrations/2026-04-11_crawled_posts_rls.sql
-- Idempotency injections: 4 policy DROPs
-- ============================================
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
DROP POLICY IF EXISTS "Anyone can read crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Anyone can read crawled posts"
  ON public.hospital_crawled_posts FOR SELECT
  USING (true);

-- 쓰기: 로그인한 사용자만.
DROP POLICY IF EXISTS "Authenticated users can insert crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can insert crawled posts"
  ON public.hospital_crawled_posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can update crawled posts"
  ON public.hospital_crawled_posts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete crawled posts" ON public.hospital_crawled_posts;
CREATE POLICY "Authenticated users can delete crawled posts"
  ON public.hospital_crawled_posts FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================
-- File: sql/migrations/2026-04-13_llm_batches.sql
-- Idempotency injections: 1 policy DROPs, 1 tables / 16 cols reconciled
-- ============================================
-- llm_batches: Anthropic Message Batches API 제출 이력.
-- queueLLMBatch 시 insert, pollLLMBatch 시 update.
--
-- 접근은 service_role 만 허용. 관리자 UI 는 별도 RPC 로 노출 예정.

CREATE TABLE IF NOT EXISTS llm_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_batch_id  TEXT UNIQUE NOT NULL,
  provider            TEXT NOT NULL,
  task                TEXT NOT NULL,
  model               TEXT NOT NULL,
  item_count          INT  NOT NULL,
  custom_ids          JSONB NOT NULL,              -- string[]
  status              TEXT NOT NULL,               -- in_progress | canceling | ended
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  succeeded_count     INT DEFAULT 0,
  errored_count       INT DEFAULT 0,
  expired_count       INT DEFAULT 0,
  total_cost_usd      NUMERIC(10, 6) DEFAULT 0,
  created_by          UUID,                        -- auth.users(id), nullable
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS anthropic_batch_id TEXT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS task TEXT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS model TEXT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS item_count INT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS custom_ids JSONB NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS succeeded_count INT DEFAULT 0;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS errored_count INT DEFAULT 0;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS expired_count INT DEFAULT 0;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(10, 6) DEFAULT 0;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE llm_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_llm_batches_status_submitted
  ON llm_batches(status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_batches_task
  ON llm_batches(task, submitted_at DESC);

ALTER TABLE llm_batches ENABLE ROW LEVEL SECURITY;

-- service_role 전용. 일반 anon/authenticated 는 차단.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'llm_batches' AND policyname = 'llm_batches_service_only'
  ) THEN
DROP POLICY IF EXISTS "llm_batches_service_only" ON llm_batches;
    CREATE POLICY "llm_batches_service_only"
      ON llm_batches FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- File: sql/migrations/2026-04-13_llm_provider_tracking.sql
-- ============================================
-- LLM provider 추적 컬럼 + 인덱스 추가.
-- Phase 0: Claude/Gemini 공용 레이어 (lib/llm) 에서 insert 하는 필드.
--
-- 기존 api_usage_logs 의 total_* 컬럼은 그대로 유지하고, 새 컬럼을 ADD IF NOT EXISTS 로 추가.
-- 배포 순서: 이 마이그레이션을 먼저 실행한 뒤 public-app 을 Vercel 에 배포해야
-- lib/llm/logUsage.ts 의 insert 가 실패하지 않음.

ALTER TABLE api_usage_logs
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS task TEXT,
  ADD COLUMN IF NOT EXISTS cache_read_tokens INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_batch BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS batch_id TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms INT;

CREATE INDEX IF NOT EXISTS idx_api_usage_task_created
  ON api_usage_logs(task, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_provider_model_created
  ON api_usage_logs(provider, model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_batch
  ON api_usage_logs(batch_id) WHERE batch_id IS NOT NULL;

-- ============================================
-- File: sql/migrations/2026-04-17_diagnostic_history.sql
-- Idempotency injections: 1 tables / 10 cols reconciled
-- ============================================
-- AEO/GEO 진단 히스토리
-- 같은 URL 의 점수 추이(바 차트) 표시용.

CREATE TABLE IF NOT EXISTS diagnostic_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,                    -- 로그인 사용자 (게스트면 NULL)
  url text NOT NULL,
  site_name text,
  overall_score smallint NOT NULL,
  categories jsonb NOT NULL,
  ai_visibility jsonb,
  hero_summary text,
  analyzed_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS url text NOT NULL;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS site_name text;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS overall_score smallint NOT NULL;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS ai_visibility jsonb;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS hero_summary text;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS analyzed_at timestamptz NOT NULL;
ALTER TABLE diagnostic_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_history_user
  ON diagnostic_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_url
  ON diagnostic_history (url, created_at DESC);

-- ============================================
-- File: sql/migrations/2026-04-17_diagnostic_stream_cache.sql
-- Idempotency injections: 1 tables / 10 cols reconciled
-- ============================================
-- AEO/GEO 실측 결과 30일 캐시
-- 동일 platform + query 에 대해 30일 이내 결과가 있으면 재사용 (fake-stream).
-- 30일 이후 자동 무시 (application 레벨 TTL, DB 만료 아님).

CREATE TABLE IF NOT EXISTS diagnostic_stream_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,          -- 'ChatGPT' | 'Gemini'
  query_hash text NOT NULL,        -- SHA-256(query text)
  query_text text NOT NULL,        -- 원문 (디버그용)
  answer_text text NOT NULL,
  sources jsonb DEFAULT '[]',
  self_included boolean NOT NULL DEFAULT false,
  self_rank smallint,
  truncated boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform, query_hash)
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS platform text NOT NULL;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS query_hash text NOT NULL;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS query_text text NOT NULL;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS answer_text text NOT NULL;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]';
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS self_included boolean NOT NULL DEFAULT false;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS self_rank smallint;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;
ALTER TABLE diagnostic_stream_cache ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cache_lookup
  ON diagnostic_stream_cache (platform, query_hash);

-- ============================================
-- File: sql/migrations/2026-04-17_hospital_images.sql
-- Idempotency injections: 1 tables / 15 cols reconciled
-- ============================================
-- 병원별 이미지 라이브러리 (블로그 이미지 템플릿용)
-- Supabase Dashboard 에서 bucket 'hospital-images' (public: false) 수동 생성 필요.

CREATE TABLE IF NOT EXISTS hospital_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  hospital_name text,
  storage_path text NOT NULL,
  original_filename text,
  file_size integer,
  mime_type text,
  width smallint,
  height smallint,
  tags text[] DEFAULT '{}',
  alt_text text DEFAULT '',
  ai_description text,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS hospital_name text;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS storage_path text NOT NULL;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS original_filename text;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS width smallint;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS height smallint;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS alt_text text DEFAULT '';
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS ai_description text;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_hospital_images_user
  ON hospital_images (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hospital_images_tags
  ON hospital_images USING GIN (tags);

-- auto-injected: schema gap fix (production Tokyo drift)
-- hospital_images.user_id 는 운영에서 TEXT ('guest' INSERT 허용용 out-of-band 변경).
-- 후속 RLS / soft_delete / image_library 모든 파일이 TEXT 가정.
ALTER TABLE public.hospital_images ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- ============================================
-- File: sql/migrations/2026-04-24_hospital_images_rls.sql
-- Idempotency injections: 4 policy DROPs
-- ============================================
-- hospital_images RLS 활성화 + 사용자 격리 정책
-- 2026-04-17 마이그레이션 당시 RLS 미설정으로 타 user 이미지 열람/수정/삭제 가능했던 문제 보완.
-- 주의: user_id 컬럼은 text 타입 ('guest' 값 지원 위해). auth.uid() 는 uuid 반환 → ::text 캐스팅 필수.

ALTER TABLE hospital_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own images" ON hospital_images;
DROP POLICY IF EXISTS "Users can view own images" ON hospital_images;
CREATE POLICY "Users can view own images" ON hospital_images
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert own images" ON hospital_images;
DROP POLICY IF EXISTS "Users can insert own images" ON hospital_images;
CREATE POLICY "Users can insert own images" ON hospital_images
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update own images" ON hospital_images;
DROP POLICY IF EXISTS "Users can update own images" ON hospital_images;
CREATE POLICY "Users can update own images" ON hospital_images
  FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete own images" ON hospital_images;
DROP POLICY IF EXISTS "Users can delete own images" ON hospital_images;
CREATE POLICY "Users can delete own images" ON hospital_images
  FOR DELETE USING (auth.uid()::text = user_id);

-- Storage bucket 'hospital-images' 는 public URL 으로 사용 중이므로 별도 정책 변경 없음.
-- 추후 private 으로 전환하려면 signed URL + storage.objects RLS 추가 필요 (별도 작업).

-- ============================================
-- File: sql/migrations/2026-04-24_hospital_images_usage_soft_delete.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- hospital_images: soft delete + usage_count 증가 RPC
-- 2026-04-24 작업. 기존 블로그 src 깨짐 방지 (hard delete → soft delete)
-- + 라이브러리 이미지 사용 통계 자동 증가 (dead column 활성화).
-- 주의: user_id 컬럼은 text 타입 → owner_id 파라미터도 text 로 받음.

-- 1) soft delete 컬럼
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_hospital_images_active ON hospital_images(user_id, is_deleted) WHERE is_deleted = false;

-- 2) usage_count 증가 RPC (SECURITY DEFINER + owner 검증)
--    클라이언트가 여러 이미지 사용 시 단일 호출로 증가. RLS 우회 안전:
--    owner_id 파라미터 검증으로 본인 이미지만 증가 가능.
DROP FUNCTION IF EXISTS public.increment_image_usage(uuid[], text) CASCADE;
CREATE OR REPLACE FUNCTION increment_image_usage(image_ids uuid[], owner_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE hospital_images
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = ANY(image_ids) AND user_id = owner_id AND is_deleted = false;
  SELECT 1;
$$;

REVOKE ALL ON FUNCTION increment_image_usage(uuid[], text) FROM public;
GRANT EXECUTE ON FUNCTION increment_image_usage(uuid[], text) TO authenticated;

-- 참고: 이전 시그니처 (uuid[], uuid) 가 존재하면 제거 (함수 시그니처 충돌 방지)
DROP FUNCTION IF EXISTS increment_image_usage(uuid[], uuid);

-- ============================================
-- File: sql/migrations/2026-04-27_api_rate_limit.sql
-- Idempotency injections: 1 policy DROPs, 1 tables / 4 cols reconciled
-- ============================================
-- API rate limit (key 기반 fixed window)
-- 키 패턴: "share:m:1.2.3.4" / "share:h:1.2.3.4" / "diagnostic:m:1.2.3.4"
-- /api/diagnostic/share 의 IP 당 분당 5 / 시간당 20 제한 (게스트 spam 방지).

CREATE TABLE IF NOT EXISTS api_rate_limit (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE api_rate_limit ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE api_rate_limit ADD COLUMN IF NOT EXISTS count integer NOT NULL DEFAULT 0;
ALTER TABLE api_rate_limit ADD COLUMN IF NOT EXISTS window_start timestamptz NOT NULL DEFAULT now();
ALTER TABLE api_rate_limit ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON api_rate_limit(window_start);

ALTER TABLE api_rate_limit ENABLE ROW LEVEL SECURITY;

-- service_role 만 접근 (API route 에서 service key 사용)
DROP POLICY IF EXISTS "rate_limit_service" ON api_rate_limit;
CREATE POLICY rate_limit_service ON api_rate_limit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- File: sql/migrations/2026-04-27_diagnostic_public_shares.sql
-- Idempotency injections: 3 policy DROPs, 1 tables / 8 cols reconciled
-- ============================================
-- AEO/GEO 진단 공유 토큰
-- POST /api/diagnostic/share → 생성, GET /api/diagnostic/public/[token] → 조회
-- /check/[token] 공개 페이지에서 로그인 없이 결과 열람 가능.

CREATE TABLE IF NOT EXISTS diagnostic_public_shares (
  token text PRIMARY KEY,           -- 12자 URL-safe base64 (randomBytes(9))
  user_id uuid,                     -- 발급 사용자 (게스트면 NULL)
  history_url text NOT NULL,        -- 원본 진단 URL
  history_analyzed_at timestamptz,  -- 원본 진단 시각
  snapshot jsonb NOT NULL,          -- PublicDiagnosticView 스냅샷
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,           -- NULL = 무기한
  is_revoked boolean DEFAULT false
);
-- auto-injected: column reconciliation (CREATE TABLE IF NOT EXISTS no-op safety)
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS history_url text NOT NULL;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS history_analyzed_at timestamptz;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE diagnostic_public_shares ADD COLUMN IF NOT EXISTS is_revoked boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shares_user
  ON diagnostic_public_shares (user_id, created_at DESC);

-- anon SELECT: token + is_revoked=false + expires_at 조건은 API 레이어에서 처리
ALTER TABLE diagnostic_public_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shares_anon_select" ON diagnostic_public_shares;
CREATE POLICY shares_anon_select ON diagnostic_public_shares
  FOR SELECT TO anon USING (is_revoked = false);

DROP POLICY IF EXISTS "shares_authed_insert" ON diagnostic_public_shares;
CREATE POLICY shares_authed_insert ON diagnostic_public_shares
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shares_authed_select" ON diagnostic_public_shares;
CREATE POLICY shares_authed_select ON diagnostic_public_shares
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- File: sql/migrations/2026-04-27_usage_rpc_auth_uid.sql
-- Idempotency injections: 1 fn DROPs
-- ============================================
-- Migration: increment_image_usage RPC — auth.uid() 직접 사용 (클라이언트 owner_id 신뢰 제거)
--
-- 기존: increment_image_usage(image_ids uuid[], owner_id text)
--       → 클라이언트가 owner_id를 전달. 조작 위험.
--
-- 신규: increment_image_usage(image_ids uuid[])
--       → auth.uid() 로 소유자 검증. 클라이언트 파라미터 신뢰 안 함.
--
-- ⚠️  Supabase SQL Editor에서 직접 실행 필요 (자동 마이그레이션 아님).

DROP FUNCTION IF EXISTS increment_image_usage(uuid[], text);

DROP FUNCTION IF EXISTS public.increment_image_usage(uuid[]) CASCADE;
CREATE OR REPLACE FUNCTION increment_image_usage(image_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hospital_images
  SET usage_count = COALESCE(usage_count, 0) + 1,
      updated_at  = NOW()
  WHERE id        = ANY(image_ids)
    AND user_id   = auth.uid()::text
    AND is_deleted = false;
END;
$$;

-- 기존 public 권한 제거 후 authenticated 만 허용
REVOKE ALL ON FUNCTION increment_image_usage(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION increment_image_usage(uuid[]) TO authenticated;

-- ============================================
-- File: sql/migrations/2026-04-29_image_library_team_share.sql
-- Idempotency injections: 1 fn DROPs, 8 policy DROPs
-- ============================================
-- ============================================
-- 2026-04-29 · hospital_images 팀 공유 전환 (next-app)
-- ============================================
-- 목표:
--   같은 team_id 의 사용자는 다른 팀원 이미지를 조회·사용 가능 (SELECT)
--   업로드·수정·삭제는 업로더 본인만 (INSERT/UPDATE/DELETE 는 user_id = owner 를
--   API 라우트 server-side filter 가 강제).
--
-- 아키텍처 메모:
--   본 코드베이스는 글로벌 anon Supabase client (`@winaid/blog-core` 의
--   `supabase` 싱글톤) + API 라우트 server-side filter 패턴.
--   anon 호출이라 auth.uid() 는 항상 NULL — 따라서 user-scope 격리는
--   server-side filter 가 primary gate. 본 마이그레이션의 RLS 는 코드베이스
--   다른 RLS (예: 2026-04-11_crawled_posts_rls.sql) 와 동일한 패턴:
--     · SELECT  · USING (true)  — permissive (server-side filter 가 gate)
--     · WRITE   · auth.role() = 'authenticated'
--   anon key 직접 호출 차단(=request-scoped supabase client 도입) 은 별도 PR.
--
-- 운영 DB 사전 검증 (2026-04-29 시점):
--   pg_policies WHERE tablename='hospital_images' 결과 12개 정책 발견:
--     [A] public-app PR #20 패턴 4개:
--         "Anyone can read hospital images" / "Authenticated can {insert,update,delete} hospital images"
--         (public-app-sql/ 마이그레이션이지만 운영자가 양쪽 DB 에 모두 실행한 것으로 보임)
--     [B] 2026-04-24_hospital_images_rls.sql 의 strict 4개:
--         "Users can {view,insert,update,delete} own images" — auth.uid()::text=user_id
--     [C] 출처 불명 wildcard 4개 (이 레포 SQL grep 0 hit):
--         allow_all_{select,insert,update,delete} — 모두 USING true
--   PostgreSQL multiple PERMISSIVE policies 는 OR 조합 → [C] 의 'true' 가 [B] 의
--   strict 정책을 무력화 → RLS 가 켜져있어도 격리 효과 0. 본 PR 가 12개 모두
--   DROP IF EXISTS 후 [A] 4개만 재생성하여 코드베이스 일관 패턴으로 통일.
--
-- 데이터 분포 (2026-04-29, is_deleted=false 기준):
--   user A · team_id=3 · 60장
--   user B · team_id=0 · 24장 (본부장 단일팀)
--   user C · team_id=3 · 21장
--   → 본 PR 적용 후: A·C 가 서로 81장 공유, B 는 본인 24장 단독 (자연스러움).
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
--
-- ⚠️ 타입 정합성 메모:
--   2026-04-17_hospital_images.sql 의 schema 선언은 user_id uuid 였으나, 운영
--   DB 는 게스트 사용자의 user_id='guest' (string literal) INSERT 를 허용하기
--   위해 어느 시점에 TEXT 로 변경됨 (2026-04-24_hospital_images_rls.sql:3
--   주석 참고: "user_id 컬럼은 text 타입 — auth.uid() 는 uuid 반환 → ::text 캐스팅 필수").
--   profiles.id 는 여전히 uuid → 비교 시 type mismatch (operator does not exist:
--   text = uuid). 따라서 p.id::text 로 명시 캐스트.
--   schema 선언과 운영 컬럼 타입 정합성은 별도 PR 에서 정리 필요.
UPDATE public.hospital_images h
   SET team_id = p.team_id
  FROM public.profiles p
 WHERE h.user_id = p.id::text
   AND h.team_id IS NULL;


-- ── 3. 인덱스 ─────────────────────────────────────────────────────
-- 팀별 최근 업로드 정렬 쿼리용 (image-library 페이지 GET).
CREATE INDEX IF NOT EXISTS idx_hospital_images_team_id
  ON public.hospital_images (team_id, created_at DESC);


-- ── 4. INSERT 시 team_id 자동 채움 트리거 ──────────────────────────
-- API 라우트가 team_id 를 explicit 하게 넘기지만, DB 레벨에서도 backup.
-- API 가 명시적으로 team_id 를 지정하면 그 값을 우선 (의도적 override 가능).
DROP FUNCTION IF EXISTS public.set_hospital_image_team_id() CASCADE;
CREATE OR REPLACE FUNCTION public.set_hospital_image_team_id()
RETURNS TRIGGER AS $$
BEGIN
  -- hospital_images.user_id 는 운영 DB 에서 TEXT (위 "타입 정합성 메모" 참고).
  -- profiles.id 는 uuid → 비교 시 ::text 캐스트 필수.
  IF NEW.team_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT team_id INTO NEW.team_id
      FROM public.profiles
     WHERE id::text = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hospital_images_set_team_id ON public.hospital_images;
CREATE TRIGGER trg_hospital_images_set_team_id
  BEFORE INSERT ON public.hospital_images
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hospital_image_team_id();


-- ── 5. RLS 활성화 + 정책 정리 ──────────────────────────────────────
-- 운영 DB 의 12개 정책 (위 "운영 DB 사전 검증" 참고) 를 모두 정리하고
-- 코드베이스 일관 4개로 통일.
ALTER TABLE public.hospital_images ENABLE ROW LEVEL SECURITY;

-- [B] 2026-04-24_hospital_images_rls.sql 의 strict 정책 4개 정리
DROP POLICY IF EXISTS "Users can view own images"   ON public.hospital_images;
DROP POLICY IF EXISTS "Users can insert own images" ON public.hospital_images;
DROP POLICY IF EXISTS "Users can update own images" ON public.hospital_images;
DROP POLICY IF EXISTS "Users can delete own images" ON public.hospital_images;

-- [A] public-app PR #20 패턴이 이미 있는 경우 정리 (재실행 안전)
DROP POLICY IF EXISTS "Anyone can read hospital images"           ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can insert hospital images"  ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can update hospital images"  ON public.hospital_images;
DROP POLICY IF EXISTS "Authenticated can delete hospital images"  ON public.hospital_images;

-- [C] 출처 불명 wildcard 정책 정리 — 본 PR 의 보안 회복 가치
DROP POLICY IF EXISTS "allow_all_select" ON public.hospital_images;
DROP POLICY IF EXISTS "allow_all_insert" ON public.hospital_images;
DROP POLICY IF EXISTS "allow_all_update" ON public.hospital_images;
DROP POLICY IF EXISTS "allow_all_delete" ON public.hospital_images;

-- 정상 정책 4개만 재생성
DROP POLICY IF EXISTS "Anyone can read hospital images" ON public.hospital_images;
CREATE POLICY "Anyone can read hospital images"
  ON public.hospital_images FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can insert hospital images"
  ON public.hospital_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can update hospital images"
  ON public.hospital_images FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete hospital images" ON public.hospital_images;
CREATE POLICY "Authenticated can delete hospital images"
  ON public.hospital_images FOR DELETE
  USING (auth.role() = 'authenticated');


-- ── 6. Storage RLS (hospital-images 버킷) ─────────────────────────
-- Storage 경로 패턴: {user_id}/{uuid}.{ext}  (upload/route.ts 참고).
-- 본 PR 는 코드베이스 일관 패턴(2026-04-11_crawled_posts_rls.sql 참고):
--   · SELECT  · 버킷 단위 read (server-side filter + getPublicUrl 패턴 유지)
--   · WRITE   · authenticated 만
-- 본인 폴더 enforce(=업로드 경로 = auth.uid()) 는 storage 경로가 server 에서
-- 결정되므로 (upload/route.ts) DB 레벨에서 추가로 안 강제. anon key 직접
-- 호출 차단은 별도 PR (signed URL 패턴 도입과 함께).
DROP POLICY IF EXISTS "Anyone read hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth upload hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth update hospital-images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth delete hospital-images"  ON storage.objects;

DROP POLICY IF EXISTS "Anyone read hospital-images" ON storage.objects;
CREATE POLICY "Anyone read hospital-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hospital-images');

DROP POLICY IF EXISTS "Auth upload hospital-images" ON storage.objects;
CREATE POLICY "Auth upload hospital-images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hospital-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Auth update hospital-images" ON storage.objects;
CREATE POLICY "Auth update hospital-images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'hospital-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Auth delete hospital-images" ON storage.objects;
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
--        FROM public.hospital_images
--       WHERE is_deleted = false;
--      예상: null_team=0, with_team=105 (A 60 + B 24 + C 21).
--
-- 2) 정책 등록 확인 — 12개 → 4개로 정리됐는지:
--      SELECT policyname, cmd FROM pg_policies WHERE tablename = 'hospital_images';
--      SELECT policyname FROM pg_policies WHERE tablename = 'objects'
--        AND policyname LIKE '%hospital-images%';
--      예상: hospital_images 4개, storage.objects 4개.
--
-- 3) 시나리오 검증 (사용자 A·B·C):
--    - A·C 같은 team_id=3, B team_id=0 (본부장 단일팀).
--    - A 로 이미지 업로드 → DB 에 team_id=3 채워짐 확인.
--    - C 가 GET /api/hospital-images (mine 미지정) 호출 시 A 의 이미지 보임.
--    - B 가 GET /api/hospital-images (mine 미지정) 호출 시 본인 24장만 보임.
--    - C 가 PATCH/DELETE A 의 이미지 시도 → API 라우트의 server-side filter
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
--
-- 주의: 롤백은 strict RLS 정책을 복원하지 않음. 필요시
--       2026-04-24_hospital_images_rls.sql 을 직접 재실행.

