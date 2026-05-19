/**
 * GEO-UX-1 — 디자인 토큰 (양 앱 lockstep).
 *
 * 9 GEO 컴포넌트 공통 색상 / 카드 / 간격 / 폰트 scale.
 * 신규 디자인 시스템 도입 X — 기존 Tailwind class 통일만.
 *
 * 양 앱 diff=0 — geoActionDashboard.test 가 invariant 강제.
 */

// ── 색상 system ──────────────────────────────────────────────

export const GEO_COLORS = {
  primary: 'indigo-600',
  primaryHover: 'indigo-700',
  primaryLight: 'indigo-50',
  primaryBorder: 'indigo-200',
  success: 'emerald-500',
  successLight: 'emerald-50',
  warning: 'amber-500',
  warningLight: 'amber-50',
  danger: 'rose-500',
  dangerLight: 'rose-50',
  dangerBorder: 'rose-200',
  neutral: 'slate-700',
  neutralLight: 'slate-50',
  neutralBorder: 'slate-200',
} as const;

// ── 카드 스타일 통일 ──────────────────────────────────────────

export const GEO_CARD = {
  /** 8 GEO 섹션 + Dashboard 공통 카드. */
  base: 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm',
  /** hover 효과 (action 카드용 — Dashboard 의 3 카드). */
  interactive: 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
  /** 보조 카드 (탭 안 내부). */
  inner: 'rounded-lg border border-slate-200 bg-white p-3',
} as const;

// ── 폰트 size scale ──────────────────────────────────────────

export const GEO_TEXT = {
  /** 섹션 헤더 (h2 등급). */
  h2: 'text-sm font-bold text-slate-700',
  /** 섹션 헤더 부제 1줄. */
  h2Sub: 'text-[11px] text-slate-500 mt-1 leading-relaxed',
  /** 카드 안 sub-header. */
  h3: 'text-[12px] font-bold text-slate-700',
  /** body — 본문. */
  body: 'text-[11px] text-slate-700',
  /** caption — 보조 라벨. */
  caption: 'text-[10px] text-slate-500',
  /** chip — 짧은 라벨. */
  chip: 'text-[10px] px-2 py-0.5 rounded-full border',
} as const;

// ── 간격 통일 ─────────────────────────────────────────────────

export const GEO_SPACING = {
  /** 섹션 사이 (DiagnosticResult 의 space-y). */
  sectionGap: 'space-y-5',
  /** 카드 내부 padding (기본). */
  cardPad: 'p-5',
  /** chip 간격. */
  chipGap: 'gap-1.5',
} as const;

// ── 임팩트 배지 색상 ─────────────────────────────────────────

export const IMPACT_BADGE = {
  high: 'bg-rose-100 text-rose-700 border-rose-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  low: 'bg-slate-100 text-slate-600 border-slate-300',
} as const;
