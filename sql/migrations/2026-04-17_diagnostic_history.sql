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

CREATE INDEX IF NOT EXISTS idx_history_user
  ON diagnostic_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_url
  ON diagnostic_history (url, created_at DESC);
