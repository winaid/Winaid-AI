/**
 * POST /api/refine-selection — 블로그 에디터 _선택 구간 다듬기_ (public-app 외부 출시용)
 *
 * 흐름:
 *   1. gateGuestRequest (IP rate limit, 분당 30회) — 게스트 허용 (외부 사용자 접근성 우선).
 *      credit 차감은 client-side localStorage counter (10회당 1) — 로그인 여부 무관 우회 가능.
 *   2. body 검증 + sanitize (sanitizePromptInput + sanitizeSourceContent + stripInjectionForUse)
 *   3. buildRefineSelectionPrompt → callLLM('refine_selection') — Claude Sonnet 4.6
 *   4. 응답 JSON parse → refined 필드 추출
 *   5. 후처리 chain: stripPromptLeakage → applyContentFilters → sanitizeHtml
 *   6. return { refined, original }
 *
 * credit:
 *   - 서버는 차감 안 함. client-side counter 가 10회당 1 credit 차감 (별도 endpoint 호출).
 *   - 어드민 분기는 next-app 만 — public-app 은 일반 유저만 (admin_session 비보유).
 *
 * P-1 / P-2 비충돌 (public-app 은 일반 유저용 — admin 분기 무관, 텍스트 LLM 만).
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../lib/serverAuth';
import {
  buildRefineSelectionPrompt,
  callLLM,
  applyContentFilters,
  stripPromptLeakage,
  sanitizePromptInput,
  sanitizeSourceContent,
  stripInjectionForUse,
  tryParseRefinedFromLLM,
  type RefineSelectionOption,
} from '@winaid/blog-core';
import { sanitizeHtml } from '../../../lib/sanitize';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const VALID_OPTIONS: ReadonlySet<RefineSelectionOption> = new Set([
  'shorter', 'longer', 'friendly', 'professional', 'custom',
]);

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  '치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과',
]);

interface Body {
  selectedText?: string;
  surroundingContext?: string;
  option?: string;
  customInstruction?: string;
  category?: string;
}

// LLM 응답 → refined 본문 추출 — blog-core/refineSelectionPrompt.ts 의
// tryParseRefinedFromLLM 사용 (XML 태그 우선 + JSON fallback).
// GEO-fix: 옛 tryParseJson 단독 사용 시 따옴표 escape 누락으로 502 발생 (shorter/longer/professional/custom 옵션).

export async function POST(request: NextRequest) {
  // IP 기반 분당 30회 — 자연스러운 다듬기 빈도 (10초당 5회) 안에 안전.
  const gate = gateGuestRequest(request, 30);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 게스트 허용 (외부 사용자 접근성 우선 — PO 결정). credit 차감은 client-side counter 가 담당.
  // owner='guest' 인 경우 callLLM 텔레메트리에 userId=null 로 전달 (PII 0).
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  // 필수 필드 검증 (next-app 과 동일 lockstep)
  const rawSelected = (body.selectedText || '').trim();
  const rawContext = (body.surroundingContext || '').trim();
  if (!rawSelected || rawSelected.length < 5) {
    return NextResponse.json({ error: 'bad_request', details: 'selectedText too short (min 5 chars)' }, { status: 400 });
  }
  if (rawSelected.length > 2000) {
    return NextResponse.json({ error: 'bad_request', details: 'selectedText too long (max 2000 chars)' }, { status: 400 });
  }
  if (!rawContext) {
    return NextResponse.json({ error: 'bad_request', details: 'surroundingContext required' }, { status: 400 });
  }
  if (!body.option || !VALID_OPTIONS.has(body.option as RefineSelectionOption)) {
    return NextResponse.json({ error: 'bad_request', details: `option must be one of ${[...VALID_OPTIONS].join('|')}` }, { status: 400 });
  }
  const option = body.option as RefineSelectionOption;

  // category 화이트리스트
  let category: string | undefined;
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json({ error: 'bad_request', details: 'invalid category' }, { status: 400 });
    }
    category = body.category;
  }

  // customInstruction sanitize chain (인젝션 가드 + 길이 cap + 일반 sanitize)
  let customInstruction: string | undefined;
  if (option === 'custom') {
    const raw = (body.customInstruction || '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'bad_request', details: 'customInstruction required for option=custom' }, { status: 400 });
    }
    const stripped = stripInjectionForUse(raw);
    customInstruction = sanitizePromptInput(stripped, 200);
    if (!customInstruction) {
      return NextResponse.json({ error: 'bad_request', details: 'customInstruction blocked or empty after sanitize' }, { status: 400 });
    }
  }

  // selectedText / surroundingContext sanitize — 본문 콘텐츠 (sanitizeSourceContent 가 대괄호·따옴표 보존)
  const selectedText = sanitizeSourceContent(rawSelected, 2000);
  const surroundingContext = sanitizeSourceContent(rawContext, 5000);

  const { systemBlocks, userPrompt } = buildRefineSelectionPrompt({
    selectedText,
    surroundingContext,
    option,
    customInstruction,
    category,
  });

  let rawText = '';
  let model = '';
  try {
    const resp = await callLLM({
      task: 'refine_selection',
      systemBlocks,
      userPrompt,
      temperature: 0.5,
      maxOutputTokens: 2048,
      userId,
      abortSignal: request.signal,
    });
    rawText = resp.text;
    model = resp.model;
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[refine-selection] callLLM failed: ${message}`);
    return NextResponse.json(
      { error: 'llm_failed', details: message.slice(0, 200) },
      { status: 502 },
    );
  }

  // GEO-fix: XML 태그 우선 + JSON fallback (4 전략) — 502 회귀 차단
  const refinedRaw = tryParseRefinedFromLLM(rawText);
  if (!refinedRaw) {
    console.warn(`[refine-selection] parse_failed or empty refined (model=${model}, option=${option}, raw=${rawText.slice(0, 300)})`);
    return NextResponse.json(
      { error: 'parse_failed', details: '응답 파싱 실패. 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  const leakResult = stripPromptLeakage(refinedRaw, true);
  const filtered = applyContentFilters(leakResult.html);
  const safeHtml = sanitizeHtml(filtered.filtered);

  if (!safeHtml.trim()) {
    return NextResponse.json(
      { error: 'sanitize_emptied', details: '후처리 후 결과가 비었습니다. 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    refined: safeHtml,
    original: rawSelected,
    model,
    replacedCount: filtered.replacedCount,
    foundTerms: filtered.foundTerms.slice(0, 10),
  });
}
