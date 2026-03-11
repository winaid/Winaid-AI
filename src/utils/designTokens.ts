/**
 * designTokens.ts — 병원 템플릿 공통 디자인 토큰
 *
 * 모든 SVG 프리뷰 및 AI 생성 템플릿에서 공유하는
 * spacing, typography, color role, radius, stroke, badge 기준값.
 *
 * viewBox 기준: 120 × 160 (세로형 카드)
 */

// ─── Spacing ───
export const SP = {
  /** 외곽 여백 (카드 → 캔버스 가장자리) */
  edge: 14,
  /** 섹션 간 간격 */
  section: 12,
  /** 요소 간 간격 (제목↔부제 등) */
  gap: 6,
  /** 내부 패딩 (카드 안쪽) */
  inner: 10,
  /** 미세 간격 (태그 사이 등) */
  micro: 3,
} as const;

// ─── Typography hierarchy (SVG font-size 기준) ───
export const TYPO = {
  /** 초대형 숫자 (할인율 30%, 날짜 등) */
  hero: { size: 16, weight: 900 },
  /** 메인 제목 */
  title: { size: 8, weight: 800 },
  /** 부제목 / 카테고리 라벨 */
  subtitle: { size: 4.5, weight: 600 },
  /** 본문 텍스트 */
  body: { size: 3.5, weight: 400 },
  /** 보조 정보 (날짜, 전화번호) */
  caption: { size: 3, weight: 500 },
  /** 극소형 (법적 고지 등) */
  micro: { size: 2.5, weight: 400 },
  /** CTA 버튼 텍스트 */
  cta: { size: 4, weight: 700 },
} as const;

// ─── Color Roles (카테고리 템플릿의 c, a 에 매핑) ───
export const COLOR_ROLE = {
  /** 카테고리별 기본 역할 */
  primary: (c: string) => c,
  accent: (a: string) => a,

  /** 배경 영역 */
  bgSoft: (c: string) => ({ fill: c, opacity: 0.06 }),
  bgMedium: (c: string) => ({ fill: c, opacity: 0.12 }),
  bgStrong: (c: string) => ({ fill: c, opacity: 0.9 }),

  /** 텍스트 */
  textDark: '#1e293b',
  textMid: '#475569',
  textLight: '#94a3b8',
  textWhite: '#ffffff',

  /** 상태 */
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
} as const;

// ─── Radius ───
export const RADIUS = {
  card: 8,
  button: 7,
  badge: 12,
  circle: 999,
  subtle: 4,
} as const;

// ─── Shadow filter ID 생성 ───
export const shadowFilter = (id: string) => `shadow_${id}`;

// ─── Stroke / Border ───
export const STROKE = {
  /** 구분선 */
  divider: { width: 0.4, opacity: 0.15 },
  /** 카드 테두리 */
  cardBorder: { width: 0.5, opacity: 0.12 },
  /** 강조 테두리 */
  accentBorder: { width: 1, opacity: 0.3 },
} as const;

// ─── Badge / Chip ───
export const BADGE = {
  /** 기본 배지 높이 */
  height: 10,
  /** 라운드 필 */
  pillRx: 5,
  /** 작은 도트 */
  dotR: 2,
  /** 배지 폰트 */
  fontSize: 3,
  fontWeight: 600,
} as const;

// ─── CTA Button ───
export const CTA = {
  height: 14,
  rx: 7,
  fontSize: TYPO.cta.size,
  fontWeight: TYPO.cta.fontWeight,
} as const;

// ─── 카테고리별 기본 팔레트 ───
export const CATEGORY_PALETTE = {
  event: {
    hue: 'warm',
    pairs: [
      { c: '#e11d48', a: '#be123c', bg: '#fff1f2' },
      { c: '#ea580c', a: '#c2410c', bg: '#fff7ed' },
      { c: '#7c3aed', a: '#6d28d9', bg: '#faf5ff' },
    ],
  },
  doctor: {
    hue: 'cool',
    pairs: [
      { c: '#1e40af', a: '#1e3a8a', bg: '#eff6ff' },
      { c: '#0f766e', a: '#115e59', bg: '#f0fdfa' },
      { c: '#1e293b', a: '#0f172a', bg: '#f8fafc' },
    ],
  },
  notice: {
    hue: 'neutral',
    pairs: [
      { c: '#1e293b', a: '#0f172a', bg: '#f8fafc' },
      { c: '#1d4ed8', a: '#1e40af', bg: '#eff6ff' },
    ],
  },
  hiring: {
    hue: 'energetic',
    pairs: [
      { c: '#2563eb', a: '#1d4ed8', bg: '#eff6ff' },
      { c: '#dc2626', a: '#b91c1c', bg: '#fef2f2' },
    ],
  },
  caution: {
    hue: 'alert',
    pairs: [
      { c: '#dc2626', a: '#b91c1c', bg: '#fef2f2' },
      { c: '#ea580c', a: '#c2410c', bg: '#fff7ed' },
    ],
  },
  pricing: {
    hue: 'professional',
    pairs: [
      { c: '#0f766e', a: '#115e59', bg: '#f0fdfa' },
      { c: '#1e293b', a: '#0f172a', bg: '#f8fafc' },
    ],
  },
  greeting: {
    hue: 'seasonal',
    pairs: [
      { c: '#dc2626', a: '#991b1b', bg: '#fef2f2' },
      { c: '#ea580c', a: '#9a3412', bg: '#fff7ed' },
    ],
  },
} as const;

// ─── 공통 SVG 헬퍼 (프리뷰 내에서 재사용) ───

/** 이벤트 CTA 버튼 렌더링 좌표 계산 */
export function ctaY(baseY: number) {
  return { y: baseY, textY: baseY + CTA.height / 2 + 1.5 };
}

/** 가격 텍스트: 취소선 + 할인가 쌍 */
export function priceLayout(origY: number) {
  return { origY, discountY: origY + 14 };
}
