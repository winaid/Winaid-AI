/**
 * Generation Contracts — 생성 파이프라인의 정책 상수와 타입 계약
 *
 * 이 파일이 생성 정책의 single source of truth다.
 * blogPipelineService.ts, useContentGeneration.ts, image/* 등은 여기서 import한다.
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

/**
 * Stage C 교정 정책:
 *   STAGE_C_USE_PRO = true  → PRO 시도 (20s) → 실패 시 FLASH (12s) → 실패 시 rawHtml
 *   STAGE_C_USE_PRO = false → FLASH 단일 시도 (12s) → 실패 시 rawHtml
 *
 * PRO 복원 시 이 플래그만 true로 변경하면 된다.
 */
export const STAGE_C_USE_PRO = false;
export const STAGE_C_PRO_TIMEOUT_MS = 20_000;      // PRO 교정 타임아웃
export const STAGE_C_FLASH_TIMEOUT_MS = 12_000;     // FLASH 교정 타임아웃
export const STAGE_C_POLISH_TIMEOUT_MS = 12_000;    // 호환용 alias (= FLASH timeout)
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

/** UI hard timeout — 무한 로딩 방지
 * 텍스트 생성(~120s) + 이미지 wall cap(~50s) + 저장(~10s) = ~180s
 * 여유 30s 포함하여 210s. 이보다 짧으면 정상 완료 전 강제 해제 위험. */
export const GENERATION_HARD_TIMEOUT_MS = 210_000;

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

// ══════════════════════════════════════════════
// ContentArtifact — 생성 1회의 제품 단위 결과물
// ══════════════════════════════════════════════

/**
 * ContentArtifact: 블로그/보도자료 생성 결과를 SaaS 제품 관점에서 래핑한다.
 *
 * GeneratedContent는 렌더링/편집 전용 payload이고,
 * ContentArtifact는 그 위에 저장·히스토리·재열기·재생성에 필요한
 * 메타데이터를 붙인 제품 단위 shape이다.
 *
 * runContentJob()이 이 shape를 반환한다.
 */

import type { GeneratedContent, PostType, ContentCategory } from '../../types';

export interface ArtifactImageMeta {
  /** 생성 성공한 이미지 수 */
  successCount: number;
  /** 생성 실패한 이미지 수 */
  failCount: number;
  /** 재생성용 프롬프트 */
  prompts: string[];
}

export interface ContentArtifact {
  // ── 식별 ──
  postType: PostType;
  createdAt: string;         // ISO 8601

  // ── 콘텐츠 ──
  title: string;
  content: GeneratedContent; // 렌더링/편집 전용 payload (기존 shape 그대로)

  // ── 분류 ──
  category?: ContentCategory;
  keywords?: string;

  // ── 품질 지표 ──
  seoTotal?: number;         // seoScore.total
  aiSmellScore?: number;     // factCheck.ai_smell_score

  // ── 이미지 ──
  imageMeta: ArtifactImageMeta;

  // ── 경고 ──
  warnings: string[];
}
