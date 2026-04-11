-- 2026-04-11 · 병원 브랜드 프리셋 컬럼 추가
--
-- hospital_style_profiles 테이블에 brand_preset JSONB 컬럼 추가.
-- 브랜드 비주얼 프리셋(컬러 팔레트, 폰트, 로고, 톤)을 병원 단위로 저장.
--
-- 기존 style_profile JSONB 는 "말투 학습" 결과를 저장하는 필드이고,
-- brand_preset JSONB 는 "시각 브랜드" 를 저장하는 필드. 의도적으로 분리.
--
-- 구조(lib/brandPreset.ts 의 BrandPreset 인터페이스와 매칭):
--   {
--     colors: { primary, secondary, background, accent, text },
--     typography: { fontFamily },
--     logo: { dataUrl } | null,
--     tone: 'empathy' | 'expert' | 'friendly' | 'premium',
--     defaultLayoutIds?: string[],
--     updatedAt?: ISO string
--   }
--
-- 마이그레이션 안전성:
--   - IF NOT EXISTS 로 재실행 안전
--   - DEFAULT '{}' 이므로 기존 row 에도 빈 객체가 자동 할당
--   - 기존 컬럼(style_profile 등) 과 독립, breaking change 없음

ALTER TABLE public.hospital_style_profiles
  ADD COLUMN IF NOT EXISTS brand_preset JSONB DEFAULT '{}';

COMMENT ON COLUMN public.hospital_style_profiles.brand_preset IS
  '브랜드 비주얼 프리셋: { colors, typography, logo, tone, defaultLayoutIds }';
