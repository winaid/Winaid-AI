-- 2026-05-12 PSI (PageSpeed Insights) 결과 24h 캐시
-- (next-app 의 sql/migrations/2026-05-12_diagnostic_psi_cache.sql 과 동일)
--
-- 배경: PSI 호출은 평균 30~50초 소요 (Google Lighthouse 자체 속도). 같은 사이트
-- 반복 진단 시 매번 30s+ 낭비.

CREATE TABLE IF NOT EXISTS diagnostic_psi_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url_hash text NOT NULL UNIQUE,
  url text NOT NULL,
  score smallint,
  fcp double precision,
  lcp double precision,
  cls double precision,
  tbt double precision,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psi_cache_url_hash ON diagnostic_psi_cache (url_hash);

ALTER TABLE diagnostic_psi_cache ENABLE ROW LEVEL SECURITY;
