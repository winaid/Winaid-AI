/**
 * cardNewsConfig.ts — 카드뉴스 생성 정책의 Single Source of Truth
 *
 * 모든 card_news 실행 경로(hook, service, job)는 이 파일에서 정책을 import한다.
 * 여기서 정의하지 않은 정책을 개별 파일에서 하드코딩하면 drift가 발생한다.
 *
 * 변경 시 영향 범위:
 *   - useCardNewsWorkflow.ts (UI 3단계 워크플로우)
 *   - generateContentJob.ts → _orchestrateCardNews (1-shot 경로)
 *   - cardNewsOrchestrator.ts (공통 실행 계층)
 */

// ══════════════════════════════════════════════
// 슬라이드 수 정책
// ══════════════════════════════════════════════

/** 기본 슬라이드 수 (UI 기본값) */
export const DEFAULT_SLIDE_COUNT = 6;

/** 최대 슬라이드 수 — UX wall time 기준
 *
 * 근거:
 * - 이미지 모델 응답 시간: 17~29s (compact prompt 적용 후)
 * - batch=2 병렬, per-card timeout=90s
 * - 7장 = 4 batches × 90s = 최대 360s + late-arrival 30s ≈ 390s
 * - 8장 이상은 UX wall time 5분 초과 위험
 */
export const MAX_SLIDE_COUNT = 7;

// ══════════════════════════════════════════════
// 이미지 생성 실행 정책
// ══════════════════════════════════════════════

/** per-card 이미지 생성 타임아웃 (ms)
 *
 * 근거: compact prompt 적용 후 실측 17~29s, 여유 포함 90s.
 * 이전 120s에서 단축 — compact prompt가 응답 시간 90% 단축.
 */
export const PER_CARD_TIMEOUT_MS = 90_000;

/** 배치 크기 — 동시 생성 카드 수
 *
 * 2 = 완전 직렬(느림) vs 전체 병렬(불안정) 사이 균형.
 * API rate limit과 모델 안정성 고려.
 */
export const BATCH_SIZE = 2;

/** 배치 간 간격 (ms) — rate limit 완화 */
export const BATCH_GAP_MS = 1_500;

/** late-arrival 대기 시간 (ms)
 *
 * timeout된 카드 중 뒤늦게 응답이 도착할 수 있다.
 * 이 시간 동안 대기 후 도착한 응답을 복구한다.
 */
export const LATE_ARRIVAL_WAIT_MS = 30_000;

/** per-card 이미지 생성 재시도 횟수 (generateSingleImage 내부 retry와 별개) */
export const MAX_RETRIES_PER_CARD = 0;

/** 재시도 가능한 에러 패턴 (향후 확장용) */
export const RETRYABLE_ERROR_PATTERNS = [
  /429/,
  /RESOURCE_EXHAUSTED/,
  /rate.?limit/i,
] as const;

// ══════════════════════════════════════════════
// Fallback 정책
// ══════════════════════════════════════════════

/** Fallback 카드 정책: 'svg' = readable SVG with text, 'placeholder' = 간단 placeholder */
export const FALLBACK_CARD_POLICY = 'svg' as const;

/** 이미지 비율 */
export const IMAGE_ASPECT_RATIO = '1:1' as const;

// ══════════════════════════════════════════════
// Card Lifecycle 상태 모델
// ══════════════════════════════════════════════

/**
 * 카드 1장의 생성 상태.
 *
 * 상태 전이:
 *   queued → generating → success
 *                       → timeout → recovered (late-arrival)
 *                       → timeout → fallback
 *                       → failed  → fallback
 *
 * 설계 원칙:
 *   - 실제 필요한 상태만 정의 (과도한 복잡성 방지)
 *   - 추후 retry 도입 시 'retrying' 추가 가능
 */
export type CardStatus =
  | 'queued'
  | 'generating'
  | 'success'
  | 'timeout'
  | 'recovered'  // late-arrival로 복구됨
  | 'failed'
  | 'fallback';  // 최종 fallback 카드 적용

// ══════════════════════════════════════════════
// Card-level 결과 타입
// ══════════════════════════════════════════════

/** 카드 1장의 생성 결과 */
export interface CardImageResult {
  /** 0-based index */
  index: number;
  /** 최종 상태 */
  status: CardStatus;
  /** 이미지 URL (성공/복구 시 data:image/..., fallback 시 data:image/svg+xml;base64,...) */
  imageUrl: string | null;
  /** 사용된 프롬프트 */
  prompt: string;
  /** 생성 소요 시간 (ms) */
  durationMs: number;
  /** 재시도 횟수 */
  retryCount: number;
  /** finishReason (모델 응답에서 추출) */
  finishReason?: string;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/** N장 카드 이미지 생성의 전체 요약 */
export interface CardNewsRunSummary {
  /** 총 카드 수 */
  totalCards: number;
  /** 성공 (AI 이미지) */
  successCount: number;
  /** late-arrival 복구 */
  recoveredCount: number;
  /** fallback 적용 */
  fallbackCount: number;
  /** 실패 (fallback 포함) */
  failedCount: number;
  /** 전체 소요 시간 (ms) */
  totalDurationMs: number;
  /** per-card 결과 배열 */
  cards: CardImageResult[];
}

// ══════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════

/** slideCount를 안전하게 clamp */
export function clampSlideCount(requested: number | undefined): number {
  const raw = requested ?? DEFAULT_SLIDE_COUNT;
  const clamped = Math.max(1, Math.min(raw, MAX_SLIDE_COUNT));
  if (raw !== clamped) {
    console.warn(`[CardNewsConfig] slideCount ${raw} → ${clamped} (max=${MAX_SLIDE_COUNT})`);
  }
  return clamped;
}
