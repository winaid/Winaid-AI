/**
 * POST /api/card-news/generate-outline
 *
 * C2a Step 1 — 주제 + 슬라이드 수 → 슬라이드 구성 안 (SlideOutline[]).
 *
 * 정책:
 *   - 게스트 / 인증 사용자 모두 허용 (rate limit 만 적용).
 *   - 크레딧 차감 0 (구성 안만 — 가벼움, Gemini flash 권장).
 *   - 응답: { outline: SlideOutline[], creditsUsed: 0 }.
 *   - 미커버 분기 발견 시 정직 보고 (C2a 검증 정책).
 *
 * Request body:
 *   { topic: string (5~200자), slideCount: 3 | 5 | 7 | 10, hospitalName?: string, category?: string }
 *
 * Errors:
 *   400 — body 파싱 실패, topic 길이 위반, slideCount 허용 외, hospitalName/category 과도한 길이
 *   429 — rate limit 초과
 *   500 — LLM 호출 실패 / JSON parse 실패
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { callLLM, sanitizeLeakInSlideOutline } from '@winaid/blog-core';
import {
  buildOutlinePrompt,
  parseOutlineJson,
  ALLOWED_SLIDE_COUNTS,
  type AllowedSlideCount,
  type OutlineRequest,
  type SlideOutline,
} from '../../../../lib/cardNewsPrompt';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface Body {
  topic?: unknown;
  slideCount?: unknown;
  hospitalName?: unknown;
  category?: unknown;
}

function err(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

export async function POST(request: NextRequest) {
  // ── 1) rate limit — 구성 안은 가벼우니 분당 10회 ─────────────────────
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) {
    return err(gate.error, gate.status);
  }

  // ── 2) body 파싱 ──────────────────────────────────────────────────────
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return err('invalid_json', 400);
  }

  // ── 3) validation ────────────────────────────────────────────────────
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (topic.length < 5 || topic.length > 200) {
    return err('bad_request', 400, { details: 'topic must be 5~200 chars' });
  }
  const slideCount = body.slideCount;
  if (
    typeof slideCount !== 'number' ||
    !(ALLOWED_SLIDE_COUNTS as readonly number[]).includes(slideCount)
  ) {
    return err('bad_request', 400, {
      details: `slideCount must be one of ${ALLOWED_SLIDE_COUNTS.join(',')}`,
    });
  }
  const hospitalName =
    typeof body.hospitalName === 'string' && body.hospitalName.trim().length <= 50
      ? body.hospitalName.trim() || undefined
      : undefined;
  const category =
    typeof body.category === 'string' && body.category.trim().length <= 30
      ? body.category.trim() || undefined
      : undefined;

  // ── 4) 프롬프트 빌드 ──────────────────────────────────────────────────
  const oReq: OutlineRequest = {
    topic,
    slideCount: slideCount as AllowedSlideCount,
    hospitalName,
    category,
  };
  const { systemInstruction, prompt } = buildOutlinePrompt(oReq);

  // ── 5) LLM 호출 ───────────────────────────────────────────────────────
  let llmText: string;
  try {
    const resp = await callLLM({
      task: 'card_news',
      systemBlocks: [{ type: 'text', text: systemInstruction, cacheable: true }],
      userPrompt: prompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
      userId: null,
      abortSignal: request.signal,
    });
    llmText = resp.text;
  } catch (e) {
    const msg = (e as Error).message || 'unknown';
    console.warn('[card-news/outline] LLM 호출 실패:', msg.slice(0, 200));
    return err('llm_failed', 500, { details: msg.slice(0, 200) });
  }

  // ── 6) JSON parse ────────────────────────────────────────────────────
  const outline: SlideOutline[] | null = parseOutlineJson(llmText);
  if (!outline || outline.length !== slideCount) {
    console.warn(
      `[card-news/outline] parse 실패 또는 길이 불일치 — expected=${slideCount}, got=${outline?.length ?? 0}`,
    );
    return err('parse_failed', 500, {
      details: 'LLM 응답 JSON parse 실패 또는 슬라이드 수 불일치',
    });
  }

  // 첫/마지막 layout 검증 (프롬프트 제약 — 만에 하나 위반 시 catch)
  if (outline[0].layout !== 'cover' || outline[outline.length - 1].layout !== 'closing') {
    console.warn('[card-news/outline] cover/closing 제약 위반 — LLM 출력 형식 불완전');
    return err('parse_failed', 500, {
      details: '첫 슬라이드 cover / 마지막 closing 제약 위반',
    });
  }

  // ── 7) 출력 누수 후처리 (PR #161 / POST_MERGE_FOLLOWUPS #5) ──────────
  // PR #158 영문화가 1차. 모델이 영문 메타를 한국어로 paraphrase 해 outline 의
  // role/titleHint/contentHint 로 echo 한 경우 차단. layout/index 는 enum/number 라 미대상.
  const sanitized = sanitizeLeakInSlideOutline(outline);
  if (sanitized.stripped > 0) {
    console.warn(`[card-news/outline] leak stripped — count=${sanitized.stripped}`);
  }

  // ── 8) 정상 응답 ──────────────────────────────────────────────────────
  return NextResponse.json({
    outline: sanitized.outline,
    creditsUsed: 0,
  });
}
