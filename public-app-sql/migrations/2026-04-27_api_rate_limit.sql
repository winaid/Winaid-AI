-- API rate limit (key 기반 fixed window)
-- 키 패턴: "share:m:1.2.3.4" / "share:h:1.2.3.4" / "diagnostic:m:1.2.3.4"
-- /api/diagnostic/share 의 IP 당 분당 5 / 시간당 20 제한 (게스트 spam 방지).

CREATE TABLE IF NOT EXISTS api_rate_limit (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON api_rate_limit(window_start);

ALTER TABLE api_rate_limit ENABLE ROW LEVEL SECURITY;

-- service_role 만 접근 (API route 에서 service key 사용)
CREATE POLICY rate_limit_service ON api_rate_limit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
