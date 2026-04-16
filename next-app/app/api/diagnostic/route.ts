/**
 * POST /api/diagnostic — AEO/GEO 진단 도구
 *
 * body: { url: string }
 * 흐름: crawlSite → (선택) fetchPsi → scoreCategories → computeOverallScore
 *       → predictAIVisibility → buildActionPlan → DiagnosticResponse 반환
 *
 * 에러 코드 / HTTP status:
 *   INVALID_URL → 400 / UNREACHABLE → 502 / TIMEOUT → 504
 *   PARSE_ERROR → 500 / UNKNOWN → 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';
import { crawlSite } from '../../../lib/diagnostic/crawler';
import { fetchPsi } from '../../../lib/diagnostic/psi';
import { scoreCategories, computeOverallScore } from '../../../lib/diagnostic/scoring';
import { predictAIVisibility } from '../../../lib/diagnostic/aiVisibility';
import { buildActionPlan } from '../../../lib/diagnostic/actionPlan';
import { enrichDiagnostic } from '../../../lib/diagnostic/enrich';
import { discoverCompetitors } from '../../../lib/diagnostic/discovery';
import type { DiagnosticResponse, DiagnosticErrorResponse } from '../../../lib/diagnostic/types';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

interface Body { url?: string }

type ErrCode = NonNullable<DiagnosticErrorResponse['code']>;

function err(code: ErrCode, message: string, status: number, url?: string): NextResponse {
  const body: DiagnosticErrorResponse & { message: string; url?: string } = {
    success: false,
    error: message,
    code,
    message,
    ...(url ? { url } : {}),
  };
  return NextResponse.json(body, { status });
}

/** http/https 없으면 https:// 자동 추가 후 new URL 검증. */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function deriveSiteName(title: string, finalUrl: string): string {
  const t = title.trim();
  if (t) return t.length > 60 ? t.slice(0, 60) : t;
  try {
    return new URL(finalUrl).hostname;
  } catch {
    return finalUrl;
  }
}

function classifyCrawlError(e: unknown): { code: ErrCode; status: number; message: string } {
  const msg = (e as Error)?.message || 'unknown';
  const name = (e as Error)?.name || '';
  if (/^UNREACHABLE/.test(msg)) {
    return { code: 'UNREACHABLE', status: 502, message: `사이트에 접근할 수 없습니다 (${msg}).` };
  }
  if (name === 'TimeoutError' || name === 'AbortError' || /timeout/i.test(msg)) {
    return { code: 'TIMEOUT', status: 504, message: '사이트 응답 시간이 초과되었습니다.' };
  }
  if (/parse|cheerio|syntax/i.test(msg)) {
    return { code: 'PARSE_ERROR', status: 500, message: 'HTML 파싱에 실패했습니다.' };
  }
  return { code: 'UNKNOWN', status: 500, message: `진단 중 오류가 발생했습니다: ${msg.slice(0, 200)}` };
}

export async function POST(request: NextRequest) {
  try {
  // 1) 인증 가드 — next-app 내부용
  const auth = await checkAuth(request);
  if (auth) return auth;

  // 2) body 파싱 + URL 정규화
  let body: Body;
  try { body = (await request.json()) as Body; } catch {
    return err('INVALID_URL', '요청 본문(JSON) 을 읽을 수 없습니다.', 400);
  }
  if (!body.url || typeof body.url !== 'string') {
    return err('INVALID_URL', 'url 필드가 필요합니다.', 400);
  }
  const normalizedUrl = normalizeUrl(body.url);
  if (!normalizedUrl) {
    return err('INVALID_URL', '유효한 URL 형식이 아닙니다.', 400, body.url);
  }

  // 3) 크롤링 — robots.txt / sitemap.xml 은 crawler 가 내부에서 이미 처리해 CrawlResult 에 채움
  let crawl;
  try {
    crawl = await crawlSite(normalizedUrl);
  } catch (e) {
    const { code, status, message } = classifyCrawlError(e);
    if (code === 'UNKNOWN') console.warn(`[diagnostic] crawlSite 실패: ${(e as Error).message}`);
    return err(code, message, status, normalizedUrl);
  }

  // 4) PSI — 선택. 실패해도 null 로 진행 (psi.ts 내부 try/catch)
  const psi = await fetchPsi(crawl.finalUrl);

  // 5~7) 채점 + 종합
  const categories = scoreCategories({
    crawl,
    psi,
    hasRobotsTxt: crawl.hasRobotsTxt,
    hasSitemap: crawl.hasSitemap,
  });
  const overallScore = computeOverallScore(categories);

  // 8~9) AI 노출 + 우선 조치
  const aiVisibility = predictAIVisibility(categories);
  const priorityActions = buildActionPlan(categories);

  // 10) 응답 조립 (base)
  const base: DiagnosticResponse = {
    success: true,
    url: normalizedUrl,
    analyzedAt: new Date().toISOString(),
    siteName: deriveSiteName(crawl.title, crawl.finalUrl),
    overallScore,
    categories,
    performance: psi,
    aiVisibility,
    priorityActions,
    crawlMeta: {
      pagesAnalyzed: 1 + (crawl.subpagesReached?.length ?? 0),
      totalLinks: crawl.internalLinks.length + crawl.externalLinks.length,
      totalImages: crawl.totalImages,
      schemaTypesFound: crawl.schemaTypes,
      detectedServices: crawl.detectedServices,
    },
  };

  // 11+12) enrich + discovery 병렬 실행 (Phase 1.3)
  // 둘 다 crawl 만 입력으로 쓰고 서로 의존 없음 → Promise.allSettled 로 ~25초 절약.
  // Before: crawl(15) + PSI(40) + enrich(30) + discovery(25) = 110초 순차
  // After:  crawl(15) + PSI(40) + max(enrich 30, discovery 25) = 85초 병렬
  const [enrichResult, discResult] = await Promise.allSettled([
    enrichDiagnostic(base, crawl),
    discoverCompetitors(crawl, '치과'),
  ]);

  // enrich 결과 — 실패 시 base 그대로
  const enriched = enrichResult.status === 'fulfilled' ? enrichResult.value : base;
  if (enrichResult.status === 'rejected') {
    console.warn(`[diagnostic] enrichDiagnostic rejected: ${(enrichResult.reason as Error)?.message?.slice(0, 200)}`);
  }

  // discovery 결과 — 실패 시 enriched 그대로
  let final = enriched;
  if (discResult.status === 'fulfilled') {
    const disc = discResult.value;
    if (disc.findings.length > 0 || disc.detectedRegion) {
      final = {
        ...enriched,
        ...(disc.findings.length > 0 ? { competitorFindings: disc.findings } : {}),
        ...(disc.detectedRegion ? { detectedRegion: disc.detectedRegion } : {}),
        detectedCategory: disc.detectedCategory,
      };
    }
  } else {
    console.warn(`[diagnostic] discoverCompetitors rejected: ${(discResult.reason as Error)?.message?.slice(0, 200)}`);
  }

  return NextResponse.json(final);
  } catch (e) {
    // 최상위 안전망 — 어떤 예외든 JSON UNKNOWN 응답으로 변환.
    // 기존 세부 try/catch 가 못 잡은 케이스(LLM throw, scoring 예외 등) 보호.
    const name = (e as Error)?.name || 'Error';
    const msg = (e as Error)?.message || 'unknown';
    console.warn(`[diagnostic] unhandled exception: ${name} - ${msg.slice(0, 300)}`);
    return err('UNKNOWN', `진단 중 예상치 못한 오류가 발생했습니다 (${name}).`, 500);
  }
}
