/**
 * Google PageSpeed Insights API 클라이언트
 *
 * - 모바일 기준으로만 측정 (외래 환자 대부분 모바일에서 병원 홈페이지 접속)
 * - PAGESPEED_API_KEY 있으면 쿼리에 붙여서 rate limit 완화
 * - 키 없어도 동작 (하루 25회 정도 제한)
 * - 타임아웃 10초. 실패 시 null
 */

import type { PsiResult } from './types';

const PSI_TIMEOUT_MS = 10_000;

interface PsiAudit {
  numericValue?: number;
  displayValue?: string;
}

interface PsiLighthouseResult {
  categories?: {
    performance?: { score?: number | null };
  };
  audits?: Record<string, PsiAudit | undefined>;
}

interface PsiApiResponse {
  lighthouseResult?: PsiLighthouseResult;
}

export async function fetchPsi(url: string): Promise<PsiResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);

  try {
    const res = await fetch(`${base}?${params.toString()}`, {
      signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as PsiApiResponse;

    const lr = json.lighthouseResult;
    const perfScore = lr?.categories?.performance?.score;
    const audits = lr?.audits ?? {};

    return {
      score: typeof perfScore === 'number' ? Math.round(perfScore * 100) : null,
      fcp: numericOrNull(audits['first-contentful-paint']?.numericValue),
      lcp: numericOrNull(audits['largest-contentful-paint']?.numericValue),
      cls: numericOrNull(audits['cumulative-layout-shift']?.numericValue),
      tbt: numericOrNull(audits['total-blocking-time']?.numericValue),
    };
  } catch {
    return null;
  }
}

function numericOrNull(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
