/**
 * POST /api/diagnostic/refresh-narrative — 실측 결과 반영 해설 갱신 (C+B 강화안)
 *
 * 양 플랫폼 실측 완료 후 사용자가 "AI 해설 갱신" 클릭 시 호출.
 * 기존 진단 결과 + 실측 데이터를 Sonnet 에 보내 narrative 재생성.
 *
 * body: { diagnosticResult: DiagnosticResponse, measurements: Record<AIPlatform, MeasurementData> }
 * response: RefreshNarrativeResponse
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
import { generateNarratives } from '../../../../lib/diagnostic/enrich';
import type {
  DiagnosticResponse,
  AIPlatform,
  MeasurementData,
  RefreshNarrativeResponse,
} from '../../../../lib/diagnostic/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface Body {
  diagnosticResult?: DiagnosticResponse;
  measurements?: Partial<Record<AIPlatform, MeasurementData>>;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const diag = body.diagnosticResult;
  const measurements = body.measurements;
  if (!diag || !diag.categories || !diag.aiVisibility) {
    return NextResponse.json({ error: 'diagnosticResult required' }, { status: 400 });
  }
  if (!measurements || (!measurements.ChatGPT && !measurements.Gemini)) {
    return NextResponse.json({ error: 'at least one platform measurement required' }, { status: 400 });
  }

  try {
    const narr = await generateNarratives({
      meta: diag.siteSummary
        ? { siteSummary: diag.siteSummary, detectedStrengths: [], detectedGaps: [] }
        : null,
      categories: diag.categories,
      aiVisibility: diag.aiVisibility,
      priorityActions: diag.priorityActions,
      siteName: diag.siteName,
      overallScore: diag.overallScore,
      measurements,
    });

    if (!narr) {
      return NextResponse.json({ error: 'narrative generation failed' }, { status: 500 });
    }

    const updatedVisibility = diag.aiVisibility.map((v) => {
      const override = narr.aiNarratives[v.platform];
      return override ? { ...v, reason: override } : v;
    });

    const response: RefreshNarrativeResponse = {
      heroSummary: narr.heroSummary,
      aiNarratives: narr.aiNarratives,
      aiVisibility: updatedVisibility,
    };

    return NextResponse.json(response);
  } catch (e) {
    console.warn(`[refresh-narrative] ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
