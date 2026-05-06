/**
 * POST /api/generate/card_news — 카드뉴스 원고 생성 (BIZ-003 시교정)
 *
 * 정책: 1 user action = 1 credit. 게스트는 차감 skip (resolveImageOwner === 'guest').
 *
 * 배경 (감사 BIZ-003):
 *   기존 흐름은 클라이언트가 `/api/gemini` 직접 호출 → 응답 후 브라우저에서
 *   Supabase RPC `cardNewsUseCredit` 직접 호출. DevTools 로 RPC 만 차단해도
 *   무한 사용 가능했고, 네트워크 끊기면 차감 안 됨.
 *
 *   본 라우트는 server-side 에서 인증 → 차감 → 생성 → 실패 시 환불 흐름을
 *   강제하여 무료 사용 우회 차단. 다른 generate 라우트 (blog/clinical/press
 *   /youtube/image) 와 동일 패턴.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  prompt?: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  googleSearch?: boolean;
}

function resolveInternalUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${base}${path}`;
}

export async function POST(request: NextRequest) {
  // 게스트 cap — 카드뉴스도 PRO+googleSearch 호출이라 보수적으로 5/min
  const gate = gateGuestRequest(request, 5);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.prompt?.trim() || !body.systemInstruction?.trim()) {
    return NextResponse.json(
      { error: 'bad_request', details: 'prompt/systemInstruction required' },
      { status: 400 },
    );
  }

  // 1 user action = 1 credit. 게스트는 skip. validation 후 차감.
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
  let creditDeducted = false;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json(
        { error: 'insufficient_credits', remaining: credit.remaining },
        { status: 402 },
      );
    }
    creditDeducted = true;
  }

  const refundOnFail = async () => {
    if (creditDeducted && userId) {
      const refund = await refundCredit(userId).catch(() => null);
      if (refund?.success) {
        console.log(
          `[generate/card_news] refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`,
        );
      }
    }
  };

  try {
    const cookieHeader = request.headers.get('cookie');
    const authHeader = request.headers.get('authorization');
    const fwHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) fwHeaders['Cookie'] = cookieHeader;
    if (authHeader) fwHeaders['Authorization'] = authHeader;

    const geminiRes = await fetch(resolveInternalUrl('/api/gemini'), {
      method: 'POST',
      headers: fwHeaders,
      body: JSON.stringify({
        prompt: body.prompt,
        systemInstruction: body.systemInstruction,
        model: body.model || 'gemini-3.1-pro-preview',
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: body.maxOutputTokens ?? 32768,
        googleSearch: body.googleSearch ?? true,
      }),
      // SSE/disconnect 시 in-flight 즉시 종료 (audit Q-3)
      signal: request.signal,
    });

    const data = (await geminiRes.json()) as {
      text?: string;
      error?: string;
      details?: string;
      usage?: unknown;
      model?: string;
    };

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
    console.error(`[generate/card_news] failed: ${message}`);
    return NextResponse.json(
      { error: 'generation_failed', code: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
