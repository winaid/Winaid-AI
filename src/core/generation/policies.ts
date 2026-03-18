/**
 * Generation Policies — 생성 접근 모드 판정 및 크레딧 게이트
 *
 * 이 파일이 "생성 전 크레딧/인증 검사"의 source of truth다.
 * useContentGeneration.ts는 이 파일의 함수만 호출한다.
 *
 * 3/29 전환 시:
 * 1. contracts.ts의 DEFAULT_ACCESS_MODE를 'authenticated_metered'로 변경
 * 2. 이 파일은 수정 불필요 (모드에 따라 자동 분기)
 */

import {
  type GenerationAccessMode,
  DEFAULT_ACCESS_MODE,
} from './contracts';

// ── 접근 모드 판정 ──

/**
 * 현재 생성 접근 모드를 반환한다.
 * 향후 사용자 세션/플랜/피처 플래그에 따라 분기 가능.
 * 지금은 contracts.ts의 DEFAULT_ACCESS_MODE를 그대로 반환한다.
 */
export function getGenerationAccessMode(): GenerationAccessMode {
  return DEFAULT_ACCESS_MODE;
}

// ── 크레딧 게이트 ──

export interface CreditGateResult {
  allowed: boolean;
  error?: string;
  message?: string;
}

/**
 * 생성 전 크레딧/인증 검사.
 *
 * anonymous_demo: 항상 통과.
 * authenticated_metered: deductCreditOnServer 호출 후 결과 반환.
 */
export async function runCreditGate(
  postType: string,
  mode?: GenerationAccessMode,
): Promise<CreditGateResult> {
  const accessMode = mode ?? getGenerationAccessMode();

  if (accessMode === 'anonymous_demo') {
    return { allowed: true };
  }

  // authenticated_metered: 크레딧 차감
  try {
    const { deductCreditOnServer, clearGenerationToken } = await import(
      '../../services/geminiClient'
    );
    clearGenerationToken();
    const result = await deductCreditOnServer(postType);

    if (!result.success) {
      return {
        allowed: false,
        error: result.error,
        message: result.message || '크레딧이 부족합니다.',
      };
    }
    return { allowed: true };
  } catch (e: any) {
    return {
      allowed: false,
      error: e?.message,
      message: '크레딧 확인에 실패했습니다. 다시 시도해주세요.',
    };
  }
}
