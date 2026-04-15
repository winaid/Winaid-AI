/**
 * POST /api/generate/blog/review — Phase 2A v4 감수 (Opus 4.6)
 *
 * 흐름:
 *   1) Opus 4.6 이 11개 체크리스트로 초안을 JSON 감수.
 *   2) JSON parse 실패 → graceful degrade (verdict='pass', summaryNote='parse_failed_passthrough').
 *   3) verdict !== 'pass' 이고 revisedHtml 있으면 regex 안전망(applyContentFilters) 적용.
 *   4) verdict === 'pass' 인데 ruleFilterViolations 가 비어있지 않으면,
 *      서버가 자체적으로 applyContentFilters(draftHtml) 을 돌려 revisedHtml 로 채우고
 *      verdict='minor_fix' 로 승격. Opus 가 놓친 금지어를 안전망이 잡는 구조.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../../lib/guestRateLimit';
import { useCredit } from '../../../../../lib/creditService';
import { buildBlogReviewPrompt } from '../../../../../lib/blogPrompt';
import { applyContentFilters } from '../../../../../lib/medicalLawFilter';
import { callLLM } from '../../../../../lib/llm';
import { getHospitalStylePrompt } from '../../../../../lib/styleService';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface ReviewIssue {
  category: 'medical_law' | 'factuality' | 'tone' | 'seo' | 'structure' | 'ai_artifact';
  severity: 'low' | 'medium' | 'high';
  originalQuote?: string;
  problem?: string;
  suggestion?: string;
}

interface ReviewJson {
  verdict: 'pass' | 'minor_fix' | 'major_fix';
  issues?: ReviewIssue[];
  revisedHtml?: string | null;
  summaryNote?: string;
}

interface Body {
  draftHtml?: string;
  category?: string;
  hospitalName?: string;
  ruleFilterViolations?: string[];
  stylePromptText?: string;
  userId?: string | null;
}

function tryParseJson(raw: string): ReviewJson | null {
  if (!raw) return null;
  // 1) raw 자체 JSON 시도
  try {
    return JSON.parse(raw) as ReviewJson;
  } catch {
    /* pass */
  }
  // 2) 코드펜스 안에 있으면 추출
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]) as ReviewJson; } catch { /* pass */ }
  }
  // 3) 첫 '{' ~ 마지막 '}' 구간 시도
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as ReviewJson;
    } catch { /* pass */ }
  }
  return null;
}

export async function POST(request: NextRequest) {
  // 1) rate limit
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 2) body
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const draftHtml = body.draftHtml;
  if (!draftHtml || typeof draftHtml !== 'string') {
    return NextResponse.json({ error: 'bad_request', details: 'draftHtml required' }, { status: 400 });
  }

  // 3) 크레딧 — 감수는 저렴하지만 호출 비용이 있으므로 1 크레딧 차감.
  //    추후 creditService 에 0.5 지원 추가되면 조정.
  const userId = body.userId || null;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
  }

  // 관리자 학습 경로(DB 프로파일) 의 hospitalStyleBlock 을 계산해 styleOverride 트리거에 반영.
  // 4-A 정책: stylePromptText(UI 학습) 가 있으면 DB 프로파일은 어차피 V3 메인에서 버려지므로 review 에서도 조회 스킵.
  let hospitalStyleBlock: string | null = null;
  if (body.hospitalName && !body.stylePromptText?.trim()) {
    try {
      hospitalStyleBlock = await getHospitalStylePrompt(body.hospitalName);
    } catch (err) {
      console.warn(`[generate/blog/review] getHospitalStylePrompt 실패: ${(err as Error).message}`);
    }
  }

  // 4) 프롬프트 조립
  const { systemBlocks, userPrompt } = buildBlogReviewPrompt(draftHtml, {
    category: body.category,
    hospitalName: body.hospitalName,
    ruleFilterViolations: body.ruleFilterViolations,
    stylePromptText: body.stylePromptText,
    hospitalStyleBlock: hospitalStyleBlock ?? undefined,
  });

  // 5) callLLM (Opus 4.6)
  let rawText = '';
  let usage: unknown = null;
  let model = '';
  try {
    const resp = await callLLM({
      task: 'blog_review',
      systemBlocks,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
      userId,
    });
    rawText = resp.text;
    usage = resp.usage;
    model = resp.model;
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog/review] callLLM failed: ${message}`);
    // 감수 실패는 pipeline 을 막지 않는다 — 원본 통과로 응답.
    return NextResponse.json({
      verdict: 'pass',
      issues: [],
      revisedHtml: null,
      summaryNote: 'review_call_failed_passthrough',
      usage: null,
      model: '',
      warning: `review_failed: ${message.slice(0, 200)}`,
    });
  }

  // 6) JSON parse
  const parsed = tryParseJson(rawText);
  let verdict: 'pass' | 'minor_fix' | 'major_fix';
  let issues: ReviewIssue[];
  let revisedHtml: string | null;
  let summaryNote: string;

  if (!parsed) {
    verdict = 'pass';
    issues = [];
    revisedHtml = null;
    summaryNote = 'parse_failed_passthrough';
  } else {
    verdict = parsed.verdict === 'minor_fix' || parsed.verdict === 'major_fix' ? parsed.verdict : 'pass';
    issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [];
    revisedHtml = (verdict !== 'pass' && typeof parsed.revisedHtml === 'string') ? parsed.revisedHtml : null;
    summaryNote = typeof parsed.summaryNote === 'string' ? parsed.summaryNote.slice(0, 400) : '';

    if (verdict === 'pass') {
      issues = [];
      revisedHtml = null;
    }
  }

  // 7) regex 안전망 — revisedHtml 있으면 치환 적용
  if (revisedHtml) {
    const filtered = applyContentFilters(revisedHtml);
    revisedHtml = filtered.filtered;
  }

  // 8) verdict='pass' 인데 violations 감지된 경우 → 서버가 자체 치환 후 minor_fix 승격
  const ruleViolations = body.ruleFilterViolations || [];
  if (verdict === 'pass' && ruleViolations.length > 0) {
    const filtered = applyContentFilters(draftHtml);
    if (filtered.replacedCount > 0) {
      verdict = 'minor_fix';
      revisedHtml = filtered.filtered;
      const promotedIssue: ReviewIssue = {
        category: 'medical_law',
        severity: 'low',
        problem: `규칙 필터로 자동 치환된 표현이 ${filtered.replacedCount}건 있습니다 (${ruleViolations.slice(0, 3).join(', ')}${ruleViolations.length > 3 ? ' 등' : ''}).`,
        suggestion: '자동 치환된 안전 표현을 유지하거나 필요 시 수동 교정하세요.',
      };
      issues = [promotedIssue, ...issues].slice(0, 5);
      summaryNote = summaryNote
        ? `${summaryNote} | 서버 안전망이 ${filtered.replacedCount}건 자동 치환.`
        : `서버 안전망이 ${filtered.replacedCount}건 자동 치환.`;
    }
  }

  return NextResponse.json({
    verdict,
    issues,
    revisedHtml,
    summaryNote,
    usage,
    model,
  });
}
