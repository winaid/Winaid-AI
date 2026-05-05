/**
 * POST /api/diagnostic — AEO/GEO 기본 진단 (실측 제외)
 *
 * body: { url: string, customQuery?: string }
 * 흐름: crawlSite → (선택) fetchPsi → scoreCategories → computeOverallScore
 *       → predictAIVisibility → buildActionPlan → enrichDiagnostic → DiagnosticResponse 반환
 *
 * 실측(ChatGPT/Gemini 답변) 은 /api/diagnostic/stream 별도 엔드포인트로 분리됨 (단계 S-A).
 * 사용자가 "실측하기" 버튼을 눌렀을 때만 플랫폼별로 SSE 스트림.
 *
 * 에러 코드 / HTTP status:
 *   INVALID_URL → 400 / UNREACHABLE → 502 / TIMEOUT → 504
 *   PARSE_ERROR → 500 / UNKNOWN → 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateDiagnosticRequest } from '../../../lib/guestRateLimit';
import { crawlSite, detectCategory } from '../../../lib/diagnostic/crawler';
import { fetchPsi } from '../../../lib/diagnostic/psi';
import { scoreCategories, computeOverallScore } from '../../../lib/diagnostic/scoring';
import { predictAIVisibility } from '../../../lib/diagnostic/aiVisibility';
import { buildActionPlan } from '../../../lib/diagnostic/actionPlan';
import { enrichDiagnostic } from '../../../lib/diagnostic/enrich';
import { extractRegion } from '../../../lib/diagnostic/discovery';
import { logDiagnostic, generateTraceId } from '../../../lib/diagnostic/logger';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import type { DiagnosticResponse, DiagnosticErrorResponse } from '../../../lib/diagnostic/types';

// 실측(discovery) 은 /api/diagnostic/stream 별도 엔드포인트로 분리 (단계 S-A, 플랫폼별 SSE).
// 기본 진단은 crawl + PSI + scoring + enrich 만 — maxDuration 240→120 으로 감축.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface Body { url?: string; customQuery?: string; category?: string }

const VALID_DIAG_CATEGORIES = new Set(['치과', '피부과', '정형외과', '성형외과']);

/** 사용자 직접 입력 검색어 상한 — 프론트와 일치. 초과 시 절단(거부 아님). */
const MAX_QUERY_LEN = 100;

/** customQuery 정규화 — trim + 길이 캡. 비어 있으면 undefined(자동 추출). */
function sanitizeCustomQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim().slice(0, MAX_QUERY_LEN);
  return t || undefined;
}

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

/** 개별 단계 타임아웃 — Promise.race 로 감싸 ms 초과 시 reject. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms),
    ),
  ]);
}

export async function POST(request: NextRequest) {
  const traceId = generateTraceId();
  const t0 = Date.now();
  try {
  // 1) rate limit — 진단 전용 (Phase 1.2: 로그인=쿠키해시 분당 5, 게스트=IP+UA해시 분당 3)
  const gate = gateDiagnosticRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error, code: 'UNKNOWN', message: gate.error }, { status: gate.status });
  }

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
  const customQuery = sanitizeCustomQuery(body.customQuery);

  // 3) 크롤링 — 외곽 타임아웃 가드 (느린 사이트가 누적해 함수 한도 120s 를 깎아먹지 않도록).
  //    classifyCrawlError 가 'timeout' 패턴을 TIMEOUT 코드로 분기하므로 catch 통과시 자동 504.
  let crawl;
  const tCrawl = Date.now();
  try {
    crawl = await withTimeout(
      crawlSite(normalizedUrl, { subpageLimit: 1 }),
      40_000,
      'crawl',
    );
    logDiagnostic({ traceId, step: 'crawl', duration: Date.now() - tCrawl, url: normalizedUrl });
  } catch (e) {
    logDiagnostic({ traceId, step: 'crawl_error', duration: Date.now() - tCrawl, url: normalizedUrl, error: (e as Error).message.slice(0, 200) });
    const { code, status, message } = classifyCrawlError(e);
    return err(code, message, status, normalizedUrl);
  }

  // 4) PSI
  const tPsi = Date.now();
  const psi = await withTimeout(fetchPsi(crawl.finalUrl), 25_000, 'psi').catch(() => null);
  logDiagnostic({ traceId, step: 'psi', duration: Date.now() - tPsi, detail: psi ? `score=${psi.score}` : 'null' });

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

  // 11) enrich
  const tEnrich = Date.now();
  const enriched = await withTimeout(enrichDiagnostic(base, crawl), 40_000, 'enrich').catch((e) => {
    logDiagnostic({ traceId, step: 'enrich_error', duration: Date.now() - tEnrich, error: (e as Error)?.message?.slice(0, 200) });
    return base;
  });
  logDiagnostic({ traceId, step: 'enrich', duration: Date.now() - tEnrich });

  const detectedRegion = customQuery ? undefined : (extractRegion(crawl) ?? undefined);
  // 카테고리 결정 — '치과' 하드코딩 제거 (audit hotfix). client body.category (화이트리스트) 우선.
  const userCategory = body.category && VALID_DIAG_CATEGORIES.has(body.category) ? body.category : null;
  const detectedCategory = userCategory ?? detectCategory(crawl);

  const final: DiagnosticResponse = {
    ...enriched,
    detectedCategory,
    ...(detectedRegion ? { detectedRegion } : {}),
  };
  logDiagnostic({ traceId, step: 'done', duration: Date.now() - t0, url: normalizedUrl, detail: `score=${final.overallScore}` });

  // 히스토리 저장 (fire-and-forget — 응답 지연 안 함)
  // RLS 강화 시점에 anon 차단 대비 service_role 우선 사용 (현재 RLS 미활성이라도 방어적)
  const dbHist = supabaseAdmin ?? supabase;
  if (dbHist) {
    dbHist.from('diagnostic_history').insert({
      url: final.url,
      site_name: final.siteName,
      overall_score: Math.round(final.overallScore),
      categories: final.categories,
      ai_visibility: final.aiVisibility,
      hero_summary: final.heroSummary ?? null,
      analyzed_at: final.analyzedAt,
    }).then(({ error }) => {
      if (error) console.warn('[history] 저장 실패:', error.message);
    });
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
