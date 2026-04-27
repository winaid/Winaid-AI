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

CREATE INDEX IF NOT EXISTS idx_shares_user
  ON diagnostic_public_shares (user_id, created_at DESC);

-- anon SELECT: token + is_revoked=false + expires_at 조건은 API 레이어에서 처리
ALTER TABLE diagnostic_public_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY shares_anon_select ON diagnostic_public_shares
  FOR SELECT TO anon USING (is_revoked = false);

CREATE POLICY shares_authed_insert ON diagnostic_public_shares
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY shares_authed_select ON diagnostic_public_shares
  FOR SELECT TO authenticated USING (true);
