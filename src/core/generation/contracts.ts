/**
 * Generation Contracts — 생성 파이프라인의 정책 상수와 타입 계약
 *
 * 이 파일이 생성 정책의 single source of truth다.
 * geminiService.ts, useContentGeneration.ts, image/* 등은 여기서 import한다.
 *
 * 3/29 크레딧 부착 시 ACCESS_MODE 정책만 수정하면 된다.
 */

// ══════════════════════════════════════════════
// 생성 접근 모드 (Generation Access Mode)
// ══════════════════════════════════════════════

/**
 * anonymous_demo: 로그인 없이 사용 가능. 크레딧 차감 없음.
 * authenticated_metered: 로그인 필수. 생성 전 크레딧 차감.
 *
 * 3/29 전환 시: DEFAULT_ACCESS_MODE를 'authenticated_metered'로 변경.
 */
export type GenerationAccessMode = 'anonymous_demo' | 'authenticated_metered';

export const DEFAULT_ACCESS_MODE: GenerationAccessMode = 'anonymous_demo';

// ══════════════════════════════════════════════
// Stage 정책 (Pipeline Stage Policies)
// ══════════════════════════════════════════════

export const STAGE_A_TIMEOUT_MS = 30_000;         // 아웃라인 생성
export const STAGE_A_MAX_RETRIES = 2;

export const STAGE_B_SECTION_TIMEOUT_MS = 25_000;  // 섹션 생성 (개별)
export const STAGE_B_BATCH_SIZE = 2;               // 동시 생성 섹션 수
export const STAGE_B_INTRO_TIMEOUT_MS = 30_000;    // 인트로 생성
export const STAGE_B_CONCLUSION_TIMEOUT_MS = 30_000;

export const STAGE_C_POLISH_TIMEOUT_MS = 12_000;   // 폴리시 (비동기, 실패해도 진행)
export const STAGE_C_MAX_RETRIES = 1;
export const STAGE_C_NO_AUTO_FALLBACK = true;

export const SEARCH_TIMEOUT_MS = 90_000;           // 검색 (KDCA/병원)

// ══════════════════════════════════════════════
// Fallback 정책
// ══════════════════════════════════════════════

/** Stage C 실패 시: pre-polish HTML을 그대로 사용 */
export const STAGE_C_FALLBACK = 'use_raw_html' as const;

/** Stage B 섹션 실패 시: placeholder HTML */
export const STAGE_B_SECTION_FALLBACK = 'placeholder_html' as const;

/** Pipeline 전체 실패 시: legacy generateBlogPostText 호출 */
export const PIPELINE_FALLBACK = 'legacy_single_shot' as const;

// ══════════════════════════════════════════════
// 이미지 선택 계약
// ══════════════════════════════════════════════

export const DEFAULT_BLOG_IMAGE_COUNT = 1;
export const DEFAULT_CARD_NEWS_SLIDE_COUNT = 6;
export const BLOG_IMAGE_RATIO = '16:9';
export const CARD_NEWS_IMAGE_RATIO = '4:3';
export const DEFAULT_IMAGE_STYLE = 'illustration';

// ══════════════════════════════════════════════
// 생성 전체 타임아웃
// ══════════════════════════════════════════════

/** UI hard timeout — 무한 로딩 방지 */
export const GENERATION_HARD_TIMEOUT_MS = 150_000;

// ══════════════════════════════════════════════
// 섹션 재생성 / FAQ
// ══════════════════════════════════════════════

export const SECTION_REGEN_TIMEOUT_MS = 45_000;
export const SMART_BLOCK_FAQ_TIMEOUT_MS = 30_000;

// ══════════════════════════════════════════════
// 의료법 모드
// ══════════════════════════════════════════════

export type MedicalLawMode = 'strict' | 'relaxed';
export const DEFAULT_MEDICAL_LAW_MODE: MedicalLawMode = 'strict';
