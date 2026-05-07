/**
 * 의료광고법 override 클라이언트 헬퍼.
 *
 * - 슬라이드 → 검증 결과 + content_hash 계산
 * - server `/api/medical/override-token` POST → 토큰 발급
 * - Shorts API multipart 동봉 또는 운영 로그용 사용자 동의 표시
 *
 * 호출부 (4 다운로드 경로 + Shorts) 가 동일 흐름을 공유하기 위해 단일 함수로 캡슐화.
 *
 * 절대 규칙:
 *   - violation_text 길이 200자 절단 (PII 누설 방지) — server 도 재절단
 *   - 토큰 미발급 시(게스트/시크릿 미설정) Shorts 외에는 다운로드 진행 가능 —
 *     운영 로그만 누락. Shorts 는 server-side 가드라 토큰 없으면 400.
 */

import type { SlideData } from '@winaid/blog-core';
import {
  validateSlideMedicalAd,
  type SlideFieldViolation,
} from './medicalAdValidation';
import type { DownloadPath } from '../components/MedicalAdOverrideModal';
import { authFetch } from './authFetch';

const VIOLATION_TEXT_MAX = 200;

export interface CardNewsViolationSummary {
  fieldViolations: SlideFieldViolation[];
  highCount: number;
  mediumCount: number;
  totalCount: number;
  /** 대표 카테고리 (가장 많이 잡힌 카테고리) — 운영 로그 violation_type */
  primaryCategory: string;
  /** 운영 로그용 — 200자 절단된 컨텍스트 텍스트 */
  truncatedContext: string;
}

/** 슬라이드 배열을 일괄 검증 + 운영 로그용 메타 산출 */
export function summarizeSlidesViolations(slides: SlideData[]): CardNewsViolationSummary {
  const fieldViolations: SlideFieldViolation[] = [];
  for (const slide of slides) {
    fieldViolations.push(...validateSlideMedicalAd(slide));
  }

  let highCount = 0;
  let mediumCount = 0;
  const categoryCount: Record<string, number> = {};
  for (const fv of fieldViolations) {
    for (const v of fv.violations) {
      if (v.severity === 'high') highCount++;
      else mediumCount++;
      categoryCount[v.category] = (categoryCount[v.category] || 0) + 1;
    }
  }

  // 가장 많이 잡힌 카테고리 — tie 시 첫 항목
  let primaryCategory = 'unknown';
  let primaryN = 0;
  for (const [cat, n] of Object.entries(categoryCount)) {
    if (n > primaryN) {
      primaryCategory = cat;
      primaryN = n;
    }
  }

  // 운영 로그용 컨텍스트 — 첫 위반 필드의 텍스트 200자 절단
  // (모든 필드 합치면 PII 위험 — 대표 1건만)
  const firstField = fieldViolations[0];
  const truncatedContext = firstField
    ? firstField.text.slice(0, VIOLATION_TEXT_MAX)
    : '';

  return {
    fieldViolations,
    highCount,
    mediumCount,
    totalCount: highCount + mediumCount,
    primaryCategory,
    truncatedContext,
  };
}

/**
 * 슬라이드 직렬화 SHA-256 prefix → content_hash.
 * 클라이언트는 SubtleCrypto 사용. 서버는 동일 hash 비교 안 함 (HMAC payload 에 포함만).
 */
export async function computeSlidesContentHash(slides: SlideData[]): Promise<string> {
  // 직렬화 — slides 배열에서 텍스트 필드만 추출 (이미지 base64 등 큰 데이터 제외)
  const serialized = JSON.stringify(
    slides.map(s => ({
      id: s.id,
      layout: s.layout,
      title: s.title,
      subtitle: s.subtitle,
      body: s.body,
      visualKeyword: s.visualKeyword,
    })),
  );
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(serialized);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hex.slice(0, 32); // 128-bit prefix — 64-bit 충돌 가능성 제거 (audit §9.5)
  }
  // SubtleCrypto 미지원 fallback — 길이만 반영 (서명에는 영향 없음, 변조 감지만 약화)
  return `len-${serialized.length.toString(16).slice(0, 12)}`;
}

export interface IssueOverrideTokenArgs {
  downloadPath: DownloadPath;
  summary: CardNewsViolationSummary;
  contentHash: string;
  /** 카드뉴스 post id (저장된 경우) */
  contentId?: string;
}

export interface IssueOverrideTokenResult {
  ok: true;
  token: string;
  expiresIn: number;
}

export interface IssueOverrideTokenError {
  ok: false;
  /** 'unauthenticated' = 게스트, 'unavailable' = 시크릿/네트워크 실패 */
  reason: 'unauthenticated' | 'unavailable' | 'invalid';
  message?: string;
}

/**
 * server에 토큰 발급 요청. 운영 로그도 server 측에서 INSERT.
 *
 * 게스트(401) → 'unauthenticated' — 호출부는 Shorts 외 경로면 토큰 없이 진행 (다운로드는 가능),
 * Shorts 는 토큰 필수이므로 사용자에게 로그인 안내.
 */
export async function requestOverrideToken(
  args: IssueOverrideTokenArgs,
): Promise<IssueOverrideTokenResult | IssueOverrideTokenError> {
  try {
    const res = await authFetch('/api/medical/override-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        download_path: args.downloadPath,
        violations_count: args.summary.totalCount,
        content_hash: args.contentHash,
        violation_type: args.summary.primaryCategory,
        violation_text: args.summary.truncatedContext.slice(0, VIOLATION_TEXT_MAX),
        content_id: args.contentId,
      }),
    });
    if (res.status === 401) {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        reason: res.status === 400 ? 'invalid' : 'unavailable',
        message: data.error || `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    if (typeof data.token !== 'string' || typeof data.expires_in !== 'number') {
      return { ok: false, reason: 'unavailable', message: 'malformed response' };
    }
    return { ok: true, token: data.token, expiresIn: data.expires_in };
  } catch (err) {
    return {
      ok: false,
      reason: 'unavailable',
      message: err instanceof Error ? err.message : 'network error',
    };
  }
}
