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
