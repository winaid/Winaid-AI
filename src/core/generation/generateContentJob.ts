/**
 * generateContentJob — 블로그/보도자료 생성의 공식 오케스트레이션 진입점
 *
 * 책임:
 *   1. 크레딧/접근 게이트 실행 (policies.ts) — 이 함수가 gate의 유일한 실행 지점
 *   2. postType별 생성 함수 디스패치 (geminiService.generateFullPost)
 *   3. 생성 결과를 ContentArtifact shape로 래핑하여 반환
 *
 * gate 책임 규칙:
 *   - 블로그/보도자료: 이 함수 내부에서만 gate 실행 (훅에서 호출 금지)
 *   - 카드뉴스: 별도 워크플로우이므로 훅(useContentGeneration)에서 직접 gate 실행
 *
 * UI 훅(useContentGeneration)은 이 함수를 호출하고,
 * geminiService.ts는 stage 실행/보조 계층으로 내려간다.
 */

import type { GenerationRequest } from '../../types';
import { runCreditGate, type CreditGateResult } from './policies';
import type { ContentArtifact } from './contracts';

// ── 결과 타입 ──

export interface ContentJobResult {
  success: true;
  artifact: ContentArtifact;
  /** @deprecated artifact.content로 접근하라. 기존 소비자 호환용. */
  data: ContentArtifact['content'];
}

export interface ContentJobError {
  success: false;
  error: string;
  /** credit gate에서 차단된 경우 */
  gateBlocked?: boolean;
}

export type ContentJobOutcome = ContentJobResult | ContentJobError;

// ── 공식 진입점 ──

/**
 * 콘텐츠 생성 job 실행.
 *
 * @param request  - 생성 요청 (postType, topic, keywords, ...)
 * @param onProgress - 진행 상황 콜백 (UI 표시용)
 * @returns ContentJobOutcome — 성공 시 artifact + data, 실패 시 error
 *
 * 호출자(useContentGeneration)가 담당하는 것:
 *   - React state 관리 (isLoading, error, data)
 *   - hard timeout
 *   - 스크롤 잠금, 중복 클릭 방어
 *   - 서버 저장, 사용량 플러시
 *
 * 이 함수가 담당하는 것:
 *   - 크레딧 게이트
 *   - generateFullPost 디스패치
 *   - 결과를 ContentArtifact로 래핑
 *   - 에러 래핑
 */
export async function runContentJob(
  request: GenerationRequest,
  onProgress?: (msg: string) => void,
): Promise<ContentJobOutcome> {
  // ── 1. 입력 검증 ──
  if (!request.postType) {
    return {
      success: false,
      error: '콘텐츠 타입이 선택되지 않았습니다.',
    };
  }

  // ── 2. 크레딧 게이트 ──
  const gate: CreditGateResult = await runCreditGate(request.postType);
  if (!gate.allowed) {
    return {
      success: false,
      error: gate.message || '크레딧이 부족합니다.',
      gateBlocked: true,
    };
  }

  // ── 3. 생성 실행 ──
  try {
    const { generateFullPost } = await import('../../services/geminiService');
    const data = await generateFullPost(request, onProgress);

    // ── 4. ContentArtifact 래핑 ──
    const warnings: string[] = [];
    if (data.imageFailCount && data.imageFailCount > 0) {
      warnings.push(`이미지 ${data.imageFailCount}장 생성 실패`);
    }

    const artifact: ContentArtifact = {
      postType: request.postType,
      createdAt: new Date().toISOString(),
      title: data.title,
      content: data,
      category: request.category,
      keywords: request.keywords,
      seoTotal: data.seoScore?.total,
      aiSmellScore: data.factCheck?.ai_smell_score,
      imageMeta: {
        successCount: (request.imageCount ?? 1) - (data.imageFailCount ?? 0),
        failCount: data.imageFailCount ?? 0,
        prompts: data.imagePrompts ?? [],
      },
      warnings,
    };

    return { success: true, artifact, data };
  } catch (err: any) {
    // 한국어 에러 메시지 변환
    let friendlyError: string;
    try {
      const { getKoreanErrorMessage } = await import('../../services/geminiClient');
      friendlyError = getKoreanErrorMessage(err);
    } catch {
      friendlyError = err?.message || '콘텐츠 생성 중 오류가 발생했습니다.';
    }

    if (!friendlyError?.trim()) {
      friendlyError = '콘텐츠 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
    }

    return { success: false, error: friendlyError };
  }
}
