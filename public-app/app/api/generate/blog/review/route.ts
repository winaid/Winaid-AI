/**
 * POST /api/generate/blog/review — Phase 2A v4 감수 (Opus 4.6)
 *
 * 흐름:
 *   1) Opus 4.6 이 11개 체크리스트로 초안을 JSON 감수.
 *   2) JSON parse 실패 → fail-closed (BL-A-P2). regex 안전망(applyContentFilters) 결과로
 *      verdict='minor_fix' (치환 발생) / 'major_fix' (치환 0) 결정. 절대 'pass' 자동 통과 X.
 *   3) verdict !== 'pass' 이고 revisedHtml 있으면 regex 안전망(applyContentFilters) 적용.
 *   4) verdict === 'pass' 인데 ruleFilterViolations 가 비어있지 않으면,
 *      서버가 자체적으로 applyContentFilters(draftHtml) 을 돌려 revisedHtml 로 채우고
 *      verdict='minor_fix' 로 승격. Opus 가 놓친 금지어를 안전망이 잡는 구조.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../../lib/serverAuth';
import { buildBlogReviewPrompt } from '@winaid/blog-core';
import { applyContentFilters } from '@winaid/blog-core';
import { callLLM } from '@winaid/blog-core';
import { getHospitalStylePrompt } from '@winaid/blog-core';
import { maskPII, unmaskPII, DEFAULT_PII_MASKING_LEVEL } from '@winaid/blog-core';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface ReviewIssue {
  category: 'medical_law' | 'factuality' | 'tone' | 'seo' | 'structure' | 'ai_artifact';
  severity: 'low' | 'medium' | 'high';
  originalQuote?: string;
  problem?: string;
  suggestion?: string;
}

interface ReviewJson {
  qualityScores?: { safety?: number; conversion?: number };
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
  // userId 는 client 입력 신뢰 안 함. Bearer 토큰에서 도출.
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
  // category 화이트리스트 (prompt 보간 방어)
  if (body.category !== undefined && !['치과', '피부과', '정형외과'].includes(String(body.category))) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid category' }, { status: 400 });
  }

  // 3) 크레딧은 메인 /api/generate/blog 에서 1회 차감. review 는 후속 단계라 추가 차감 없음.
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;

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

  // 4) PII 마스킹 (ADR-1 §5 B+C 결정 — blog cycle POC)
  //
  // 외부 LLM (Anthropic Opus 4.6) 으로 보내는 사용자 입력에서 환자명·전화·이메일·차트번호
  // 등 식별 정보를 결정적 토큰으로 치환. 의료 용어 / 일반 명사는 denylist 로 보존.
  // 응답을 unmask 해 사용자에게는 원본 식별 정보가 그대로 보이도록 한다 (마스킹 비노출 UX).
  //
  // hospitalStyleBlock 은 system 블록 내부 (DB 학습 자료 — PII 가능성 낮음) 라 마스킹 제외.
  // 옵트인 UI 는 본 PR 범위 밖 — server 기본값 'standard' 적용.
  const allReplacements = new Map<string, string>();
  const maskField = <T extends string | undefined>(value: T): T => {
    if (typeof value !== 'string' || value.length === 0) return value;
    const { masked, replacements } = maskPII(value, DEFAULT_PII_MASKING_LEVEL);
    for (const [token, original] of replacements) allReplacements.set(token, original);
    return masked as T;
  };

  const maskedDraftHtml = maskField(draftHtml);
  const maskedHospitalName = maskField(body.hospitalName);
  const maskedStylePromptText = maskField(body.stylePromptText);
  const maskedRuleFilterViolations = Array.isArray(body.ruleFilterViolations)
    ? body.ruleFilterViolations.map((v) => (typeof v === 'string' ? maskField(v) : v))
    : body.ruleFilterViolations;

  // 5) 프롬프트 조립 — 마스킹된 입력 사용
  const { systemBlocks, userPrompt } = buildBlogReviewPrompt(maskedDraftHtml, {
    category: body.category,
    hospitalName: maskedHospitalName,
    ruleFilterViolations: maskedRuleFilterViolations,
    stylePromptText: maskedStylePromptText,
    hospitalStyleBlock: hospitalStyleBlock ?? undefined,
  });

  // 6) callLLM (Opus 4.6)
  let rawText = '';
  let usage: unknown = null;
  let model = '';
  try {
    const resp = await callLLM({
      task: 'blog_review',
      systemBlocks,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 4096,
      userId,
      abortSignal: request.signal,
    });
    rawText = resp.text;
    usage = resp.usage;
    model = resp.model;
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog/review] callLLM failed: ${message}`);
    // ⚠️ 과거: verdict='pass' 반환 → fail-open 으로 의료광고법 검증 우회 (H3 Agent 5).
    // 수정: regex 안전망 (applyContentFilters) 적용 후 verdict 결정.
    //  - replacedCount > 0: minor_fix
    //  - replacedCount === 0: major_fix (수동 검토 필요 — auto-pass 절대 X)
    const filtered = applyContentFilters(draftHtml);
    const fellbackVerdict: 'minor_fix' | 'major_fix' = filtered.replacedCount > 0 ? 'minor_fix' : 'major_fix';
    console.warn(`[generate/blog/review] LLM 실패 fallback: verdict=${fellbackVerdict}, replacedCount=${filtered.replacedCount}`);
    return NextResponse.json({
      verdict: fellbackVerdict,
      issues: [{
        category: 'medical_law',
        severity: 'high',
        problem: `감수 LLM 호출이 실패했습니다 (${message.slice(0, 80)}). 정규식 안전망이 ${filtered.replacedCount}건 치환했습니다. 게시 전 수동 검토를 권장합니다.`,
        suggestion: '안전망 결과를 검토하거나, 잠시 후 감수를 재시도해 주세요.',
      }],
      revisedHtml: filtered.replacedCount > 0 ? filtered.filtered : null,
      summaryNote: filtered.replacedCount > 0
        ? `auto_replaced_after_review_failure (${filtered.replacedCount}건)`
        : 'review_call_failed_manual_review_required',
      usage: null,
      model: '',
      warning: `review_failed: ${message.slice(0, 200)}`,
    });
  }

  // 7) PII unmask — LLM 응답의 토큰을 원문으로 복원.
  // LLM 이 user prompt 의 토큰을 응답에 그대로 인용하면 원문 식별 정보가 복원되고,
  // 토큰을 변형(예: `[name_1]` 소문자) 했다면 변형 토큰이 노출된다 (안전 방향).
  // 사용자에게는 마스킹 사실 비노출 — 원본 식별 정보가 보이도록 unmask 적용.
  rawText = unmaskPII(rawText, allReplacements);

  // 8) JSON parse
  const parsed = tryParseJson(rawText);
  let verdict: 'pass' | 'minor_fix' | 'major_fix';
  let issues: ReviewIssue[];
  let revisedHtml: string | null;
  let summaryNote: string;
  let qualityScores: { safety?: number; conversion?: number } | undefined;

  if (!parsed) {
    // BL-A-P2 fail-closed: parse 실패 시 verdict='pass' 로 우회하던 fail-open 제거.
    // LLM 호출 실패 분기와 동일한 정책 — regex 안전망 결과로 minor_fix / major_fix 결정.
    const filtered = applyContentFilters(draftHtml);
    const fellbackVerdict: 'minor_fix' | 'major_fix' = filtered.replacedCount > 0 ? 'minor_fix' : 'major_fix';
    console.warn(`[generate/blog/review] JSON parse 실패 fail-closed: verdict=${fellbackVerdict}, replacedCount=${filtered.replacedCount}`);
    return NextResponse.json({
      verdict: fellbackVerdict,
      issues: [{
        category: 'medical_law',
        severity: 'high',
        problem: `감수 결과 JSON 파싱에 실패했습니다. 정규식 안전망이 ${filtered.replacedCount}건 치환했습니다. 게시 전 수동 검토를 권장합니다.`,
        suggestion: '안전망 결과를 검토하거나, 잠시 후 감수를 재시도해 주세요.',
      }],
      revisedHtml: filtered.replacedCount > 0 ? filtered.filtered : null,
      summaryNote: filtered.replacedCount > 0
        ? `parse_failed_safetynet_replaced (${filtered.replacedCount}건)`
        : 'parse_failed_manual_review_required',
      usage,
      model,
      warning: 'review_parse_failed',
    });
  } else {
    verdict = parsed.verdict === 'minor_fix' || parsed.verdict === 'major_fix' ? parsed.verdict : 'pass';
    issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [];
    revisedHtml = (verdict !== 'pass' && typeof parsed.revisedHtml === 'string') ? parsed.revisedHtml : null;
    summaryNote = typeof parsed.summaryNote === 'string' ? parsed.summaryNote.slice(0, 400) : '';

    if (verdict === 'pass') {
      issues = [];
      revisedHtml = null;
    }

    // qualityScores: 0~100 범위만 허용
    const qs = parsed.qualityScores;
    if (qs && typeof qs === 'object') {
      const clamp = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : undefined;
      const safety = clamp(qs.safety);
      const conversion = clamp(qs.conversion);
      if (safety !== undefined || conversion !== undefined) {
        qualityScores = { ...(safety !== undefined ? { safety } : {}), ...(conversion !== undefined ? { conversion } : {}) };
      }
    }
  }

  // 9) regex 안전망 — revisedHtml 있으면 치환 적용 (unmask 된 원문에 대해 적용)
  if (revisedHtml) {
    const filtered = applyContentFilters(revisedHtml);
    revisedHtml = filtered.filtered;
  }

  // 10) verdict='pass' 인데 violations 감지된 경우 → 서버가 자체 치환 후 minor_fix 승격
  // 원본 draftHtml 사용 (마스킹 전) — applyContentFilters 는 의료광고법 금지어 정규식이라
  // 원문에 직접 적용하는 것이 의미적으로 맞다.
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
    qualityScores,
    usage,
    model,
  });
}
