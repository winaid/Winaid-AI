-- 2026-05-12 PSI (PageSpeed Insights) 결과 24h 캐시
--
-- 배경: PSI 호출은 평균 30~50초 소요 (Google Lighthouse 자체 속도). 같은 사이트
-- 반복 진단 시 매번 30s+ 낭비. 운영자가 같은 병원 URL 을 여러 번 테스트하는
-- 패턴이 흔해 캐시 효과 큼.
--
-- 정책:
--   - key: SHA-256(url)
--   - TTL: 24h (사이트 성능은 하루 단위로 거의 안 바뀜)
--   - hit 시 약 33s 절약
--   - miss 시 PSI 호출 후 upsert
--
-- 사용처:
--   /api/diagnostic/route.ts → fetchPsiCached(url) 우선 시도

CREATE TABLE IF NOT EXISTS diagnostic_psi_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url_hash text NOT NULL UNIQUE,        -- SHA-256(url)
  url text NOT NULL,                    -- 원문 (디버그용)
  score smallint,                       -- PSI score (0-100, null 가능)
  fcp double precision,                 -- First Contentful Paint (ms)
  lcp double precision,                 -- Largest Contentful Paint (ms)
  cls double precision,                 -- Cumulative Layout Shift
  tbt double precision,                 -- Total Blocking Time (ms)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psi_cache_url_hash ON diagnostic_psi_cache (url_hash);

-- RLS — service_role only (캐시 read/write 모두 server-side).
ALTER TABLE diagnostic_psi_cache ENABLE ROW LEVEL SECURITY;
-- 정책 추가 없음 → service_role 만 접근 가능. anon/authenticated 자동 거부.
