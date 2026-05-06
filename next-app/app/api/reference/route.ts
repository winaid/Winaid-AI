/**
 * POST /api/reference — 화이트리스트 의료 참고 자료 수집
 * body: { topic: string; category?: string }
 * response: ReferenceResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { sanitizePromptInput } from '@winaid/blog-core';
import { checkAuth } from '../../../lib/apiAuth';
import { fetchMedicalReference } from '../../../lib/referenceFetcher';

// Gemini search-grounded LLM 호출이 가변적이라(30s ~ 200s+) 한도 여유 있게 풀.
// Vercel Pro plan max(300s) 풀로 사용 — 사용자 요청.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: { topic?: string; category?: string };
  try {
    body = (await request.json()) as { topic?: string; category?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // 프롬프트 인젝션 방어 — pressPrompt/clinicalPrompt/youtubePrompt 과 동일 정책.
  // referenceFetcher 는 사용자 topic 을 LLM userPrompt 에 그대로 보간하므로
  // 출처 fabrication / 화이트리스트 우회 인젝션 위험. (SEC-006 회귀 회복)
  const rawTopic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!rawTopic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }
  const topic = sanitizePromptInput(rawTopic, 500);
  const rawCategory = typeof body.category === 'string' ? body.category.trim() : '';
  const category = rawCategory ? sanitizePromptInput(rawCategory, 50) : undefined;
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }

  try {
    const result = await fetchMedicalReference(topic, category);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message || 'unknown';
    console.error(`[reference] FAIL topic="${topic}" category="${category}" err=${msg.slice(0, 500)}`);
    const match = msg.match(/Gemini error \((\d+)\)/);
    const upstreamStatus = match ? Number(match[1]) : null;
    const hint = upstreamStatus === 429 ? 'rate_limited'
      : upstreamStatus === 503 ? 'gemini_unavailable'
      : upstreamStatus === 504 ? 'gemini_timeout'
      : 'internal';
    return NextResponse.json(
      { error: 'reference fetch failed', hint, upstreamStatus },
      { status: 500 },
    );
  }
}
