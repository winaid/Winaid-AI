/**
 * Google PageSpeed Insights API 클라이언트
 *
 * - 모바일 기준으로만 측정 (외래 환자 대부분 모바일에서 병원 홈페이지 접속)
 * - PAGESPEED_API_KEY 사실상 필수 — Google 2024+ 정책으로 무키 호출의 일일 쿼터가 0.
 *   키 없으면 항상 429(RESOURCE_EXHAUSTED) → null 반환 → UI 에 "측정 불가" 표시.
 * - 1회당 타임아웃 35초 — 모바일 Lighthouse 가 보통 15~40초. 25s 시절 일시적 지연으로 실패하던
 *   사이트를 커버. fetchPsi 가 1차 실패 시 1회 재시도 → 최악 70초.
 *   route.ts 의 maxDuration=180 + 외부 withTimeout(70s) 안에 정합.
 * - 실패 경로는 전부 null 반환 + console.warn 으로 사유만 남김 (키 값 마스킹).
 */

import type { PsiResult } from './types';

const PSI_TIMEOUT_MS = 35_000;

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
  error?: { code?: number; status?: string; message?: string };
}

/**
 * PSI 호출 — 1차 시도 실패 시 1회 재시도.
 * Google PSI 가 일시적 5xx/타임아웃 빈도가 적지 않아 재시도 1회만으로 성공률 체감 상승.
 * 외부(route.ts)에서 withTimeout(70s) 으로 한 번 더 감싸 최악 시나리오를 잘라냄.
 */
export async function fetchPsi(url: string): Promise<PsiResult | null> {
  const first = await fetchPsiOnce(url);
  if (first) return first;
  console.warn('[psi] 1차 실패 → 1회 재시도');
  return await fetchPsiOnce(url);
}

async function fetchPsiOnce(url: string): Promise<PsiResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);
  else console.warn('[psi] PAGESPEED_API_KEY 미설정 — Google 무키 쿼터=0 이라 호출이 429 로 실패합니다. .env 에 키를 설정하세요.');

  try {
    const res = await fetch(`${base}?${params.toString()}`, {
      signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 실패 사유만 간략히 (키 값은 query string 에 있으므로 로그에 URL 넣지 않음)
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as PsiApiResponse;
        if (body?.error) reason += ` · ${body.error.status || ''} ${body.error.message || ''}`.trim();
      } catch { /* ignore */ }
      console.warn(`[psi] 응답 실패: ${reason}`);
      return null;
    }
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
  } catch (e) {
    const name = (e as Error)?.name || 'Error';
    const msg = (e as Error)?.message || 'unknown';
    console.warn(`[psi] 호출 예외: ${name} · ${msg.slice(0, 200)}`);
    return null;
  }
}

function numericOrNull(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
