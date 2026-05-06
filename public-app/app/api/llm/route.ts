/**
 * POST /api/llm — 범용 LLM 호출 (Router 경유 — task 에 따라 Claude/Gemini 자동 분기)
 * 클라이언트에서 /api/gemini 대신 사용. 응답: { text: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../lib/serverAuth';
import { callLLM, sanitizePromptInput } from '@winaid/blog-core';
import { resolveRoute } from '@winaid/blog-core';
import type { LLMTaskKind } from '@winaid/blog-core';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// ── 게스트 비용 폭탄 가드 ──
// 과거: 게스트가 임의 systemInstruction + maxOutputTokens 지정 가능 (clamp 없음).
// 수정: 게스트는 systemInstruction 무시 (서버 default 만), maxOutputTokens cap 8192.
// 인증 사용자는 기존 동작 유지 (단, BL-A-007 으로 상한은 모든 사용자에 부여).
const GUEST_MAX_OUTPUT_TOKENS = 8192;

// BL-A-007: 인증 사용자도 임의 maxOutputTokens 지정 가능하던 비용 burst 회귀 차단.
// Sonnet 4.6 응답 32k 정도가 사실상 모델 한도 — 그 이상은 실효성 없는 burst.
const AUTH_MAX_OUTPUT_TOKENS = 32768;
// BL-A-007: prompt length cap (gemini route 와 동일 100k). 넘치면 400.
const MAX_PROMPT_LENGTH = 100_000;
// BL-A-007: 사용자 입력 의심 task — 외부 envelope tag/injection 가능성 → sanitize 적용.
const SANITIZE_TASKS: ReadonlySet<string> = new Set([
  'refine_chat',
  'refine_auto',
  'blog_image_prompt',
]);

const VALID_TASKS: Set<string> = new Set([
  'blog_title_recommend', 'blog_seo_eval', 'blog_image_prompt',
  'refine_chat', 'refine_auto', 'style_learn', 'score_crawled_post',
  'landing_chat', 'diagnostic_extract', 'diagnostic_narrative',
]);

interface Body {
  task?: string;
  prompt?: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseType?: string;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.task || !body.prompt) {
    return NextResponse.json({ error: 'task, prompt 필수' }, { status: 400 });
  }
  if (!VALID_TASKS.has(body.task)) {
    return NextResponse.json({ error: `허용되지 않는 task: ${body.task}` }, { status: 400 });
  }
  // BL-A-007: prompt 길이 cap — gemini route 와 동일 100k. 무제한 입력 비용 burst 차단.
  if (typeof body.prompt === 'string' && body.prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: 'prompt_too_long', details: `prompt length ${body.prompt.length} > ${MAX_PROMPT_LENGTH}` },
      { status: 400 },
    );
  }

  // 게스트 분기 — silent clamp + 경고 로그
  const owner = await resolveImageOwner(request);
  const isGuest = owner === 'guest';
  // BL-A-007: callLLM 에 userId 미전달로 api_usage_logs.user_id 가 항상 null 이던 회귀 수정.
  const userId = isGuest ? null : owner;
  if (isGuest && body.systemInstruction) {
    console.warn('[llm] systemInstruction stripped (guest)');
    body.systemInstruction = undefined;
  }
  if (isGuest && body.maxOutputTokens !== undefined && body.maxOutputTokens > GUEST_MAX_OUTPUT_TOKENS) {
    console.warn(`[llm] maxOutputTokens clamp ${body.maxOutputTokens}→${GUEST_MAX_OUTPUT_TOKENS} (guest)`);
    body.maxOutputTokens = GUEST_MAX_OUTPUT_TOKENS;
  }
  // BL-A-007: 인증 사용자 maxOutputTokens 도 상한 cap. 32k 초과는 모델 한도 외 burst 차단.
  if (!isGuest && body.maxOutputTokens !== undefined && body.maxOutputTokens > AUTH_MAX_OUTPUT_TOKENS) {
    console.warn(`[llm] maxOutputTokens clamp ${body.maxOutputTokens}→${AUTH_MAX_OUTPUT_TOKENS} (auth)`);
    body.maxOutputTokens = AUTH_MAX_OUTPUT_TOKENS;
  }
  // BL-A-007: 사용자 입력 의심 task 는 sanitizePromptInput 적용.
  // sanitizePromptInput 의 maxLen 은 prompt length cap 과 동일하게 설정해 100k 까지 허용.
  let userPrompt = body.prompt as string;
  if (SANITIZE_TASKS.has(body.task)) {
    userPrompt = sanitizePromptInput(userPrompt, MAX_PROMPT_LENGTH);
  }

  // API 키 사전 확인
  const route = resolveRoute(body.task as LLMTaskKind);
  if (route.provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY 미설정', code: 'missing_api_key' }, { status: 500 });
  }
  if (route.provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY 미설정', code: 'missing_api_key' }, { status: 500 });
  }

  const systemBlocks = body.systemInstruction
    ? [{ type: 'text' as const, text: body.systemInstruction, cacheable: false }]
    : [];

  try {
    const res = await callLLM({
      task: body.task as LLMTaskKind,
      systemBlocks,
      userPrompt,
      temperature: body.temperature ?? 0.5,
      maxOutputTokens: body.maxOutputTokens ?? 4096,
      // BL-A-007: userId 전달 — api_usage_logs 사용자별 비용 추적 복원.
      userId,
      abortSignal: request.signal,
    });

    let text = res.text ?? '';

    // responseType === 'json' → JSON 부분만 추출 (Claude 마크다운 래핑 방어)
    if (body.responseType === 'json') {
      const jsonMatch = text.match(/[\[{][\s\S]*[}\]]/);
      if (jsonMatch) text = jsonMatch[0];
    }

    return NextResponse.json({ text });
  } catch (e) {
    console.warn(`[/api/llm] ${body.task}: ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
