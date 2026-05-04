/**
 * POST /api/generate/press — 보도자료 생성 (단일 chain)
 *
 * 정책 (audit Q-2c, 분기 b): 1 user action = 1 credit. 게스트는 server 차감 skip
 * (resolveImageOwner === 'guest'), client-side guest credit (consumeGuestCredit) 만 차감.
 *
 * public-app 의 press 흐름은 next-app 와 다르게 crawl 단계 없음 — buildPressPrompt
 * + 학습 말투 + 메인 PRO gemini 1회만.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { buildPressPrompt, type PressType } from '../../../../lib/pressPrompt';
import { getHospitalStylePrompt } from '@winaid/blog-core';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  topic?: string;
  keywords?: string;
  hospitalName?: string;
  doctorName?: string;
  doctorTitle?: string;
  pressType?: PressType;
  textLength?: number;
  category?: string;
}

const VALID_CATEGORIES = new Set(['치과', '피부과', '정형외과']);
const VALID_PRESS_TYPES = new Set<PressType>(['achievement', 'new_service', 'research', 'event', 'award', 'health_tips']);

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

  if (!body.topic?.trim() || !body.doctorName?.trim()) {
    return NextResponse.json({ error: 'bad_request', details: 'topic/doctorName required' }, { status: 400 });
  }
  if (body.category && !VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid category' }, { status: 400 });
  }
  const pressType = body.pressType ?? 'achievement';
  if (!VALID_PRESS_TYPES.has(pressType)) {
    return NextResponse.json({ error: 'bad_request', details: 'invalid pressType' }, { status: 400 });
  }
  const doctorTitle = body.doctorTitle?.trim() || '대표원장';

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
        console.log(`[generate/press] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
      }
    }
  };

  const cookieHeader = request.headers.get('cookie');
  const fwHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) fwHeaders['Cookie'] = cookieHeader;

  try {
    // 1) 학습 말투 로드 (server-side, free)
    let stylePrompt = '';
    if (body.hospitalName) {
      try {
        stylePrompt = (await getHospitalStylePrompt(body.hospitalName)) || '';
      } catch (err) {
        console.warn(`[generate/press] getHospitalStylePrompt failed: ${(err as Error).message}`);
      }
    }

    // 2) 프롬프트 조립 — server-side build
    const { systemInstruction, prompt } = buildPressPrompt({
      topic: body.topic,
      keywords: body.keywords,
      hospitalName: body.hospitalName,
      doctorName: body.doctorName,
      doctorTitle,
      pressType,
      textLength: body.textLength,
      category: body.category,
    });

    let finalPrompt = prompt;
    if (stylePrompt) {
      finalPrompt = `${prompt}\n\n[병원 블로그 학습 말투 - 보도자료 스타일 유지하며 적용]\n${stylePrompt}`;
    }

    // 3) PRO gemini 호출 (Google Search 연동)
    const res = await fetch(resolveInternalUrl('/api/gemini'), {
      method: 'POST',
      headers: fwHeaders,
      body: JSON.stringify({
        prompt: finalPrompt,
        systemInstruction,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.7,
        maxOutputTokens: 32768,
        googleSearch: true,
      }),
      // client SSE disconnect 시 in-flight 즉시 종료 (audit Q-3)
      signal: request.signal,
    });

    const data = await res.json() as { text?: string; error?: string; details?: string };
    if (!res.ok || !data.text) {
      await refundOnFail();
      return NextResponse.json(
        { error: data.error || 'generation_failed', details: data.details || null },
        { status: res.status >= 400 ? res.status : 500 },
      );
    }

    return NextResponse.json({ text: data.text });
  } catch (err) {
    await refundOnFail();
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/press] failed: ${message}`);
    return NextResponse.json({ error: 'generation_failed', code: message.slice(0, 200) }, { status: 500 });
  }
}
