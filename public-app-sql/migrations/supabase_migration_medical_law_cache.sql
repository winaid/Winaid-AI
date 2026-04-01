-- =====================================================
-- Medical Law Cache Table for Daily Updates
-- =====================================================
-- 목적: 의료광고법 정보를 하루 1회 크롤링하여 캐시
-- 업데이트: 매일 첫 글 작성 시 자동 갱신

-- 1. 테이블 생성
DROP TABLE IF EXISTS medical_law_cache CASCADE;

CREATE TABLE IF NOT EXISTS medical_law_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  last_crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prohibitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  raw_content TEXT,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_medical_law_cache_last_crawled 
  ON medical_law_cache(last_crawled_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_law_cache_active 
  ON medical_law_cache(is_active) 
  WHERE is_active = true;

-- 3. RLS (Row Level Security) 설정
ALTER TABLE medical_law_cache ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (공개 데이터)
DROP POLICY IF EXISTS "Anyone can read medical law cache" ON medical_law_cache;
CREATE POLICY "Anyone can read medical law cache"
  ON medical_law_cache
  FOR SELECT
  USING (true);

-- 시스템/관리자만 쓰기 가능 (실제로는 서버사이드에서 service role로 처리)
DROP POLICY IF EXISTS "System can insert medical law cache" ON medical_law_cache;
CREATE POLICY "System can insert medical law cache"
  ON medical_law_cache
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "System can update medical law cache" ON medical_law_cache;
CREATE POLICY "System can update medical law cache"
  ON medical_law_cache
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. 주석 추가
COMMENT ON TABLE medical_law_cache IS '의료광고법 캐시 - 하루 1회 자동 업데이트';
COMMENT ON COLUMN medical_law_cache.source_url IS '크롤링 출처 URL (법제처 등)';
COMMENT ON COLUMN medical_law_cache.last_crawled_at IS '마지막 크롤링 시간';
COMMENT ON COLUMN medical_law_cache.prohibitions IS '금지사항 JSON 배열 [{category, description, examples, severity}]';
COMMENT ON COLUMN medical_law_cache.summary IS '요약 정보';
COMMENT ON COLUMN medical_law_cache.raw_content IS '원본 HTML/텍스트 (디버깅용)';
COMMENT ON COLUMN medical_law_cache.version IS '버전 번호 (변경 추적)';
COMMENT ON COLUMN medical_law_cache.is_active IS '활성 상태 (최신 버전만 true)';

-- 5. 초기 데이터 삽입 (하드코딩된 기본 규칙)
INSERT INTO medical_law_cache (
  source_url,
  last_crawled_at,
  prohibitions,
  summary,
  version,
  is_active
) VALUES (
  'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=230993#0000',
  NOW(),
  '[
    {
      "category": "guarantee",
      "severity": "critical",
      "description": "치료 효과 보장 금지",
      "examples": ["완치", "100%", "확실히 치료", "반드시 낫", "완전히 제거", "영구적 효과"],
      "legalBasis": "의료법 제56조 제2항"
    },
    {
      "category": "comparison",
      "severity": "high",
      "description": "비교 광고 금지",
      "examples": ["최고", "1위", "최상", "타 병원", "다른 병원보다"],
      "legalBasis": "의료법 제56조 제2항 제4호"
    },
    {
      "category": "exaggeration",
      "severity": "critical",
      "description": "과장 광고 금지",
      "examples": ["기적의", "특효약", "획기적", "혁신적"],
      "legalBasis": "의료법 제56조 제2항 제8호"
    },
    {
      "category": "urgency",
      "severity": "medium",
      "description": "긴급성 과장 금지",
      "examples": ["골든타임", "즉시", "지금 당장", "서둘러"],
      "legalBasis": "의료법 제56조"
    },
    {
      "category": "medical_law",
      "severity": "critical",
      "description": "의료법 위반 표현",
      "examples": ["의심", "진단", "판단"],
      "legalBasis": "의료법 제27조"
    }
  ]'::jsonb,
  '의료법 제56조에 따라 치료 효과 보장, 비교 광고, 과장 광고 등이 금지됩니다.',
  1,
  true
) ON CONFLICT DO NOTHING;

-- 6. 테이블 구조 확인 쿼리
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'medical_law_cache'
ORDER BY ordinal_position;
