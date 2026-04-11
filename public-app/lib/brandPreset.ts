/**
 * 병원 브랜드 비주얼 프리셋
 *
 * 저장 위치: Supabase `hospital_style_profiles.brand_preset` JSONB 컬럼
 * (마이그레이션: `public-app-sql/migrations/2026-04-11_add_brand_preset.sql`)
 *
 * 설계 의도:
 *   - 기존 `style_profile` JSONB 는 "말투 학습" 전용 (tone, sentenceEndings 등)
 *   - 이 `brand_preset` 는 "시각 브랜드" 전용 (컬러, 폰트, 로고, 카드뉴스 톤)
 *   - 한 row 안에 두 필드가 공존하며 용도별로 분리
 *
 * 카드뉴스 생성 시:
 *   - `getBrandPreset(hospitalName)` 으로 로드
 *   - `brandPresetToTheme(preset)` 으로 `CardNewsTheme` 부분 객체로 변환
 *   - `CardNewsProRenderer` 의 `theme` prop 에 머지해 전달
 */

import type { CardNewsTheme } from './cardNewsLayouts';

// ── 타입 ──

export interface BrandColors {
  /** 메인 색상 — 카드뉴스 제목 색으로 매핑 */
  primary: string;
  /** 보조 색상 — 카드뉴스 부제/서브 타이틀 색으로 매핑 */
  secondary: string;
  /** 카드 배경 색상 */
  background: string;
  /** 강조색 — CTA 버튼, 하이라이트 등 */
  accent: string;
  /** 본문 텍스트 색상 */
  text: string;
}

export type BrandTone = 'empathy' | 'expert' | 'friendly' | 'premium';

export interface BrandPreset {
  colors: BrandColors;
  typography: {
    /** CSS font-family 문자열. 예: 'Pretendard', 'Noto Sans KR' */
    fontFamily: string;
  };
  /** 병원 로고. null 이면 로고 미사용. */
  logo: {
    /** base64 dataUrl (200KB 이하 권장 — row 크기 고려) */
    dataUrl: string;
  } | null;
  /** 브랜드 톤 — 카드뉴스 writingStyle 선택에 힌트로 사용 가능 */
  tone: BrandTone;
  /** 선호 레이아웃 ID 목록 — 생성 시 우선 순위로 반영 (선택) */
  defaultLayoutIds?: string[];
  /** ISO 시각 문자열 — 서비스 레이어가 저장 시 자동으로 채움 */
  updatedAt?: string;
}

// ── 기본값 ──

/**
 * 신규 프리셋 초기값. 사용자가 "기본값으로 초기화" 를 눌렀을 때나
 * getBrandPreset 가 null 을 반환했을 때 fallback 으로 사용.
 *
 * 파란색 계열 — 의료 카테고리에서 가장 안전하고 신뢰감 있는 톤으로 선택.
 */
export const DEFAULT_BRAND_PRESET: BrandPreset = {
  colors: {
    primary: '#2563EB',
    secondary: '#60A5FA',
    background: '#FFFFFF',
    accent: '#F59E0B',
    text: '#1F2937',
  },
  typography: {
    fontFamily: 'Pretendard',
  },
  logo: null,
  tone: 'expert',
};

// ── 변환 헬퍼 ──

/**
 * `BrandPreset` 을 `CardNewsProRenderer` 가 소비하는 `CardNewsTheme` 부분 객체로 매핑.
 *
 * 호출부에서는 `setProTheme(prev => ({ ...prev, ...brandPresetToTheme(preset) }))`
 * 패턴으로 기존 테마와 머지하는 것을 권장한다.
 *
 * 매핑 규칙:
 *   - colors.background → backgroundColor
 *   - colors.primary    → titleColor
 *   - colors.secondary  → subtitleColor
 *   - colors.text       → bodyColor
 *   - colors.accent     → accentColor
 *   - typography.fontFamily → fontFamily
 *   - logo.dataUrl      → hospitalLogo (존재 시에만)
 *
 * 의도적으로 매핑하지 않는 필드:
 *   - backgroundGradient: 프리셋에 없음. 기존 값 유지.
 *   - cardBgColor: 내부 카드 배경은 브랜드 색과 별개로 흰색 유지하는 게 일반적.
 *     사용자가 명시적으로 수정하도록 UI 에서 별도 처리.
 *   - fontId: fontFamily 와 중복. 폰트 선택기에서 직접 설정.
 *   - hospitalName: 프리셋과 별개로 관리 (유저 메타데이터).
 *
 * @returns Partial — 기존 테마에 머지해 사용할 것. 전체 교체 금지.
 */
export function brandPresetToTheme(preset: BrandPreset): Partial<CardNewsTheme> {
  const patch: Partial<CardNewsTheme> = {
    backgroundColor: preset.colors.background,
    titleColor: preset.colors.primary,
    subtitleColor: preset.colors.secondary,
    bodyColor: preset.colors.text,
    accentColor: preset.colors.accent,
    fontFamily: preset.typography.fontFamily,
  };
  if (preset.logo?.dataUrl) {
    patch.hospitalLogo = preset.logo.dataUrl;
  }
  return patch;
}
