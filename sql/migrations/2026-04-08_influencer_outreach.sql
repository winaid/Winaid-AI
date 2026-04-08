-- 인플루언서 아웃리치 관리 테이블
-- next-app(내부용) 전용

CREATE TABLE IF NOT EXISTS influencer_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name TEXT NOT NULL,
  username TEXT NOT NULL,
  full_name TEXT,
  follower_count INTEGER,
  engagement_rate DECIMAL(5,2),
  estimated_location TEXT,
  primary_category TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'replied', 'rejected', 'collaborating')),
  dm_message TEXT,
  dm_tone TEXT,
  sent_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hospital_name, username)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_influencer_outreach_hospital ON influencer_outreach(hospital_name);
CREATE INDEX IF NOT EXISTS idx_influencer_outreach_status ON influencer_outreach(status);
CREATE INDEX IF NOT EXISTS idx_influencer_outreach_created ON influencer_outreach(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE influencer_outreach ENABLE ROW LEVEL SECURITY;

-- 내부용이므로 인증된 사용자 + anon 모두 접근 허용
CREATE POLICY "influencer_outreach_all_access" ON influencer_outreach
  FOR ALL USING (true) WITH CHECK (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_influencer_outreach_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_influencer_outreach_updated_at
  BEFORE UPDATE ON influencer_outreach
  FOR EACH ROW EXECUTE FUNCTION update_influencer_outreach_updated_at();
