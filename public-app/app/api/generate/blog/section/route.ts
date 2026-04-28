/**
 * POST /api/generate/blog/section — Phase 2A v4 섹션 재생성 (Sonnet 4.6)
 *
 * 섹션은 검수(Opus) 미수행 경로이므로 여기서 applyContentFilters 를 직접 적용한다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../../lib/guestRateLimit';
import { useCredit } from '../../../../../lib/creditService';
import {
  buildBlogSectionPromptV3,
  type SectionRegenerateInputV3,
} from '../../../../../lib/blogPrompt';
import { applyContentFilters } from '@winaid/blog-core';
import { callLLM } from '../../../../../lib/llm';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

interface Body {
  input?: SectionRegenerateInputV3;
  userId?: string | null;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const input = body.input;
  if (!input || typeof input.currentSection !== 'string' || typeof input.fullBlogContent !== 'string') {
    return NextResponse.json({ error: 'bad_request', details: 'input.currentSection/fullBlogContent required' }, { status: 400 });
  }

  const userId = body.userId || null;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
  }

  const { systemBlocks, userPrompt } = buildBlogSectionPromptV3(input);

  try {
    const resp = await callLLM({
      task: 'blog_unified_section',
      systemBlocks,
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 4096,
      userId,
    });

    const filtered = applyContentFilters(resp.text);

    return NextResponse.json({
      text: filtered.filtered,
      usage: resp.usage,
      model: resp.model,
    });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog/section] callLLM failed: ${message}`);
    return NextResponse.json(
      { error: 'generation_failed', code: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
