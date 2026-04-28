/**
 * POST /api/reference — 화이트리스트 의료 참고 자료 수집
 * body: { topic: string; category?: string }
 * response: ReferenceResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateDiagnosticRequest } from '../../../lib/guestRateLimit';
import { fetchMedicalReference } from '../../../lib/referenceFetcher';

// Gemini search-grounded LLM 호출이 30~80s 걸려 60s default 로는 504 발생.
// Vercel plan max(Pro=300) 안에서 안전하게 90s 확보.
export const maxDuration = 90;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateDiagnosticRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { topic?: string; category?: string };
  try {
    body = (await request.json()) as { topic?: string; category?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : undefined;
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
