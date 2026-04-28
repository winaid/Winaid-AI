/**
 * POST /api/generate/blog/section (next-app 내부용) — Phase 2A v4 섹션 재생성 (Sonnet 4.6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { useCredit } from '../../../../../lib/creditService';
import {
  buildBlogSectionPromptV3,
  type SectionRegenerateInputV3,
} from '@winaid/blog-core';
import { applyContentFilters } from '@winaid/blog-core';
import { callLLM } from '@winaid/blog-core';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

interface Body {
  input?: SectionRegenerateInputV3;
  userId?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: Body;
  try { body = (await request.json()) as Body; } catch {
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
