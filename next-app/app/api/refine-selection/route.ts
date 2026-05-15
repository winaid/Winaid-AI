/**
 * POST /api/refine-selection — 블로그 에디터 _선택 구간 다듬기_ (next-app 내부용)
 *
 * 흐름:
 *   1. checkAuth (Bearer/admin cookie 필수)
 *   2. body 검증 + sanitize (sanitizePromptInput + sanitizeSourceContent + stripInjectionForUse)
 *   3. buildRefineSelectionPrompt → callLLM('refine_selection') — Claude Sonnet 4.6
 *   4. 응답 JSON parse → refined 필드 추출
 *   5. 후처리 chain: stripPromptLeakage → applyContentFilters → sanitizeHtml
 *   6. return { refined, original }
 *
 * credit:
 *   - 서버는 차감 안 함. client-side counter 가 10회당 1 credit 차감 (별도 endpoint 호출).
 *   - 어드민 (admin_session cookie) 은 checkAuth 통과 시 자동 면제 (P-1 invariant).
 *
 * P-1 (어드민 풀 액세스): rate limit / cap 추가 안 함.
 * P-2 무관 (텍스트 LLM 만). maxDuration 60 충분.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';
import { resolveImageOwner } from '../../../lib/serverAuth';
import {
  buildRefineSelectionPrompt,
  callLLM,
  applyContentFilters,
  stripPromptLeakage,
  sanitizePromptInput,
  sanitizeSourceContent,
  stripInjectionForUse,
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

interface RefinedJson {
  refined?: string;
}

function tryParseJson(raw: string): RefinedJson | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as RefinedJson; } catch { /* pass */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]) as RefinedJson; } catch { /* pass */ }
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as RefinedJson; } catch { /* pass */ }
  }
  return null;
}

export async function POST(request: NextRequest) {
  // 인증 가드 — 어드민 cookie 또는 Bearer 필수 (next-app 은 내부 운영용).
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  // 필수 필드 검증
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

  // category 화이트리스트 (prompt 보간 방어)
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
    // 1) injection guard strip — system instruction override 패턴 제거
    const stripped = stripInjectionForUse(raw);
    // 2) sanitizePromptInput — 대괄호·envelope tag·zero-width 등 제거 + length cap 200
    customInstruction = sanitizePromptInput(stripped, 200);
    if (!customInstruction) {
      return NextResponse.json({ error: 'bad_request', details: 'customInstruction blocked or empty after sanitize' }, { status: 400 });
    }
  }

  // selectedText / surroundingContext sanitize — 본문 콘텐츠라 sanitizeSourceContent (대괄호·따옴표 보존)
  // 단, envelope tag (XML) 는 strip — surrounding_context 안에 사용자 [[SELECTION_START]] 마커는 보존되어야 하는데
  // sanitizeSourceContent 의 TAG_LIKE_RE 가 [[...]] 는 매칭 안 함 (꺽쇠만). 안전.
  const selectedText = sanitizeSourceContent(rawSelected, 2000);
  const surroundingContext = sanitizeSourceContent(rawContext, 5000);

  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;

  // ── prompt build + LLM 호출 ────────────────────────────────────────
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
    // fail-closed — 응답 없으면 client 가 "다시 시도" 안내. fail-open 절대 X.
    return NextResponse.json(
      { error: 'llm_failed', details: message.slice(0, 200) },
      { status: 502 },
    );
  }

  // ── 응답 파싱 + 후처리 chain ──────────────────────────────────────
  const parsed = tryParseJson(rawText);
  const refinedRaw = (parsed?.refined || '').trim();
  if (!refinedRaw) {
    console.warn(`[refine-selection] parse_failed or empty refined: ${rawText.slice(0, 200)}`);
    return NextResponse.json(
      { error: 'parse_failed', details: '응답 파싱 실패. 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  // 1) prompt leakage strip — system prompt body echo 차단
  const leakResult = stripPromptLeakage(refinedRaw, true);
  // 2) applyContentFilters — 의료법 normalize + prose-flow + korean grammar + markdown HTML
  const filtered = applyContentFilters(leakResult.html);
  // 3) sanitizeHtml — DOMPurify XSS 최종 안전망 (whitelist tags only)
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
