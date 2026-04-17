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

CREATE INDEX IF NOT EXISTS idx_cache_lookup
  ON diagnostic_stream_cache (platform, query_hash);
