/**
 * POST /api/generate/clinical — 임상글 최종 생성 (Step 2)
 *
 * 정책 (audit Q-2b): 1 user action = 1 credit. Step 1 분석은 별개 무료 흐름.
 * 게스트는 차감 skip (resolveImageOwner === 'guest').
 *
 * public-app mirror of next-app — 동일 패턴.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { buildClinicalPrompt } from '../../../../lib/clinicalPrompt';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  topic?: string;
  category?: string;
  hospitalName?: string;
  doctorName?: string;
  imageAnalysis?: string;
  imageCount?: number;
  articleType?: 'case' | 'procedure' | 'comparison' | 'general';
  textLength?: number;
  keywords?: string;
}

const VALID_CATEGORIES = new Set(['치과', '피부과', '정형외과']);
const VALID_ARTICLE_TYPES = new Set(['case', 'procedure', 'comparison', 'general']);

function resolveInternalUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${base}${path}`;
}

export async function POST(request: NextRequest) {
  // 게스트 cap (gemini ×N 호출 들어가니 보수적)
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.topic?.trim() || !body.category) {
    return NextResponse.json({ error: 'bad_request', details: 'topic/category required' }, { status: 400 });
  }
  if (!VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid category' }, { status: 400 });
  }
  if (!body.imageAnalysis?.trim()) {
    return NextResponse.json({ error: 'bad_request', details: 'imageAnalysis required (Step 1 분석 결과)' }, { status: 400 });
  }
  if (typeof body.imageCount !== 'number' || body.imageCount < 1) {
    return NextResponse.json({ error: 'bad_request', details: 'imageCount must be >= 1' }, { status: 400 });
  }
  const articleType = body.articleType ?? 'general';
  if (!VALID_ARTICLE_TYPES.has(articleType)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid articleType' }, { status: 400 });
  }

  // 1 user action = 1 credit. 게스트는 skip. validation 후 차감.
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
  let creditDeducted = false;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
    creditDeducted = true;
  }

  const refundOnFail = async () => {
    if (creditDeducted && userId) {
      const refund = await refundCredit(userId).catch(() => null);
      if (refund?.success) {
        console.log(`[generate/clinical] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
      }
    }
  };

  try {
    const { systemInstruction, prompt } = buildClinicalPrompt({
      topic: body.topic,
      category: body.category,
      hospitalName: body.hospitalName,
      doctorName: body.doctorName,
      imageAnalysis: body.imageAnalysis,
      imageCount: body.imageCount,
      articleType,
      textLength: body.textLength,
      keywords: body.keywords,
    });

    const cookieHeader = request.headers.get('cookie');
    const fwHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) fwHeaders['Cookie'] = cookieHeader;

    const geminiRes = await fetch(resolveInternalUrl('/api/gemini'), {
      method: 'POST',
      headers: fwHeaders,
      body: JSON.stringify({
        prompt,
        systemInstruction,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.7,
        maxOutputTokens: 65536,
        timeout: 120000,
      }),
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok || !data?.text) {
      await refundOnFail();
      return NextResponse.json(
        { error: data?.error || 'generation_failed', details: data?.details || null },
        { status: geminiRes.status >= 400 ? geminiRes.status : 500 },
      );
    }

    return NextResponse.json({ text: data.text, usage: data.usage, model: data.model });
  } catch (err) {
    await refundOnFail();
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/clinical] failed: ${message}`);
    return NextResponse.json({ error: 'generation_failed', code: message.slice(0, 200) }, { status: 500 });
  }
}
