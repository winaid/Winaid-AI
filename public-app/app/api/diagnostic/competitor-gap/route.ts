/**
 * POST /api/diagnostic/competitor-gap — 경쟁사 경량 진단 + GAP 분석 (Tier 3-B)
 *
 * body: { selfResult: DiagnosticResponse, competitorUrl: string }
 * response: GapAnalysis
 *
 * 경쟁사 크롤 + scoring (PSI 생략) + calculateGap + Sonnet GAP narrative.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateDiagnosticRequest } from '../../../../lib/guestRateLimit';
import { crawlSite } from '../../../../lib/diagnostic/crawler';
import { scoreCategories, computeOverallScore } from '../../../../lib/diagnostic/scoring';
import { calculateGap } from '../../../../lib/diagnostic/gapAnalysis';
import { logDiagnostic, generateTraceId } from '../../../../lib/diagnostic/logger';
import { callLLM } from '../../../../lib/llm';
import type { DiagnosticResponse, GapAnalysis } from '../../../../lib/diagnostic/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface Body {
  selfResult?: DiagnosticResponse;
  competitorUrl?: string;
}

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

export async function POST(request: NextRequest) {
  const gate = gateDiagnosticRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const self = body.selfResult;
  if (!self?.categories || !self.overallScore) {
    return NextResponse.json({ error: 'selfResult required' }, { status: 400 });
  }
  const compUrl = body.competitorUrl ? normalizeUrl(body.competitorUrl) : null;
  if (!compUrl) {
    return NextResponse.json({ error: 'valid competitorUrl required' }, { status: 400 });
  }

  const traceId = generateTraceId();
  const t0 = Date.now();
  logDiagnostic({ traceId, step: 'gap_start', url: compUrl });

  // 1) 경쟁사 크롤 (경량 — PSI 생략)
  let crawl;
  try {
    crawl = await crawlSite(compUrl);
  } catch (e) {
    logDiagnostic({ traceId, step: 'gap_crawl_error', url: compUrl, error: (e as Error).message.slice(0, 200) });
    return NextResponse.json({ error: '경쟁사 사이트에 접근할 수 없습니다.' }, { status: 502 });
  }

  // 2) 경쟁사 채점 (PSI null → psi 항목 unknown)
  const categories = scoreCategories({
    crawl,
    psi: null,
    hasRobotsTxt: crawl.hasRobotsTxt,
    hasSitemap: crawl.hasSitemap,
  });
  const overallScore = computeOverallScore(categories);
  const competitorSiteName = crawl.title.trim() || new URL(crawl.finalUrl).hostname;

  // 3) GAP 계산
  const gap = calculateGap(self, { overallScore, categories });
  logDiagnostic({ traceId, step: 'gap_calc', detail: `diff=${gap.overallDiff}` });

  // 4) Sonnet GAP narrative
  let narrative = '';
  try {
    const gapPrompt = `당신은 병원 AEO/GEO 컨설턴트입니다.

[본인 병원]
이름: ${self.siteName}
종합 점수: ${self.overallScore}점

[경쟁사 (AI 추천 1위)]
이름: ${competitorSiteName}
종합 점수: ${overallScore}점

[카테고리별 차이]
${gap.categoryDiffs.map((d) => `- ${d.categoryName}: 본인 ${d.selfScore} vs 경쟁사 ${d.competitorScore} (${d.diff > 0 ? '+' : ''}${d.diff})`).join('\n')}

[본인이 뒤지는 항목]
${gap.weakerItems.length > 0 ? gap.weakerItems.join(', ') : '없음'}

[본인이 앞서는 항목]
${gap.strongerItems.length > 0 ? gap.strongerItems.join(', ') : '없음'}

위 비교를 바탕으로:
1. 본인 병원이 AI 검색에서 1위를 따라잡기 위해 가장 시급한 개선점 3가지를 구체적으로 설명하세요.
2. 본인이 이미 1위보다 강한 부분이 있으면 강점으로 언급하세요.
3. 60대 원장님이 이해할 수 있는 쉬운 한국어로 작성하세요.
4. 3~5문장으로 간결하게.`;

    const res = await callLLM({
      task: 'diagnostic_narrative',
      systemBlocks: [{ type: 'text', text: '병원 AEO/GEO 경쟁사 GAP 분석 해설을 작성하는 전문가.', cacheable: false }],
      userPrompt: gapPrompt,
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
    narrative = (res.text ?? '').trim();
  } catch (e) {
    logDiagnostic({ traceId, step: 'gap_narrative_error', error: (e as Error).message.slice(0, 200) });
  }

  logDiagnostic({ traceId, step: 'gap_done', duration: Date.now() - t0 });

  const result: GapAnalysis = {
    competitor: { url: compUrl, siteName: competitorSiteName, overallScore, categories },
    gap,
    narrative,
  };
  return NextResponse.json(result);
}
