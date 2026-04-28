/**
 * POST /api/llm — 범용 LLM 호출 (Router 경유 — task 에 따라 Claude/Gemini 자동 분기)
 * 클라이언트에서 /api/gemini 대신 사용. 응답: { text: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';
import { callLLM } from '@winaid/blog-core';
import type { LLMTaskKind } from '@winaid/blog-core';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

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
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  const systemBlocks = body.systemInstruction
    ? [{ type: 'text' as const, text: body.systemInstruction, cacheable: false }]
    : [];

  try {
    const res = await callLLM({
      task: body.task as LLMTaskKind,
      systemBlocks,
      userPrompt: body.prompt,
      temperature: body.temperature ?? 0.5,
      maxOutputTokens: body.maxOutputTokens ?? 4096,
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
