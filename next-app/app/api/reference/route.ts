/**
 * POST /api/reference — 화이트리스트 의료 참고 자료 수집
 * body: { topic: string; category?: string }
 * response: ReferenceResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';
import { fetchMedicalReference } from '../../../lib/referenceFetcher';

export const maxDuration = 60;
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

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : undefined;
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }

  try {
    const result = await fetchMedicalReference(topic, category);
    return NextResponse.json(result);
  } catch (e) {
    console.warn(`[reference] ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ error: 'reference fetch failed' }, { status: 500 });
  }
}
