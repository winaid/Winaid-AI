/**
 * generateContentJob — 콘텐츠 생성 오케스트레이션의 공식 진입점
 *
 * 책임:
 *   1. 크레딧/접근 게이트 실행 (policies.ts)
 *   2. postType별 생성 함수 디스패치 (geminiService.generateFullPost)
 *   3. 결과를 GeneratedContent 형태로 반환
 *
 * 이 파일이 "생성 1회" 단위의 source of truth다.
 * UI 훅(useContentGeneration)은 이 함수를 호출하고,
 * geminiService.ts는 stage 실행/보조 계층으로 내려간다.
 */

import type { GenerationRequest, GeneratedContent } from '../../types';
import { runCreditGate, type CreditGateResult } from './policies';

// ── 결과 타입 ──

export interface ContentJobResult {
  success: true;
  data: GeneratedContent;
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
 * @returns ContentJobOutcome — 성공 시 data, 실패 시 error
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
    return { success: true, data };
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
