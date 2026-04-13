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
    CREATE POLICY "llm_batches_service_only"
      ON llm_batches FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
