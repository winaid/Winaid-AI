/**
 * POST /api/generate/youtube — 유튜브 분석 기반 글 최종 생성 (Step 2)
 *
 * 정책 (audit Q-2d, 분기 b2): 1 user action = 1 credit. 게스트는 server 차감 skip.
 * Step 1 (handleExtract) 은 그대로 /api/gemini 직접 (무료).
 *
 * public-app mirror of next-app — 동일 패턴.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { buildYoutubePrompt, type YoutubeWritingStyle } from '../../../../lib/youtubePrompt';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  topic?: string;
  transcript?: string;
  writingStyle?: YoutubeWritingStyle;
  category?: string;
  hospitalName?: string;
  doctorName?: string;
  textLength?: number;
  keywords?: string;
}

const VALID_CATEGORIES = new Set(['치과', '피부과', '정형외과']);
const VALID_STYLES = new Set<YoutubeWritingStyle>(['blog', 'clinical', 'summary']);

function resolveInternalUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${base}${path}`;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.topic?.trim() || !body.transcript?.trim() || !body.category) {
    return NextResponse.json({ error: 'bad_request', details: 'topic/transcript/category required' }, { status: 400 });
  }
  if (!VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid category' }, { status: 400 });
  }
  const writingStyle = body.writingStyle ?? 'blog';
  if (!VALID_STYLES.has(writingStyle)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid writingStyle' }, { status: 400 });
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
        console.log(`[generate/youtube] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
      }
    }
  };

  try {
    const { systemInstruction, prompt } = buildYoutubePrompt({
      topic: body.topic,
      transcript: body.transcript,
      writingStyle,
      category: body.category,
      hospitalName: body.hospitalName,
      doctorName: writingStyle === 'clinical' ? body.doctorName : undefined,
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
        googleSearch: true,
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

    return NextResponse.json({ text: data.text });
  } catch (err) {
    await refundOnFail();
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/youtube] failed: ${message}`);
    return NextResponse.json({ error: 'generation_failed', code: message.slice(0, 200) }, { status: 500 });
  }
}
