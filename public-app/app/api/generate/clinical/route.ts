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
import { maskPII, unmaskPII, DEFAULT_PII_MASKING_LEVEL } from '@winaid/blog-core';

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
    // ADR-1 §6.1 Table 2.1 #11 — clinical 라우트 PII 마스킹 (POC, PR #127 후속).
    // 사용자 자유 텍스트 5 필드를 LLM 전송 전 결정적 토큰으로 치환하고, 응답에서
    // 동일 토큰을 원본으로 복원. credit/refund 흐름은 한 줄도 건드리지 않음.
    const allReplacements = new Map<string, string>();
    const mask = <T extends string | undefined>(v: T): T => {
      if (typeof v !== 'string' || v.length === 0) return v;
      const { masked, replacements } = maskPII(v, DEFAULT_PII_MASKING_LEVEL);
      for (const [token, original] of replacements) allReplacements.set(token, original);
      return masked as T;
    };

    const { systemInstruction, prompt } = buildClinicalPrompt({
      topic: mask(body.topic) ?? '',
      category: body.category,
      hospitalName: mask(body.hospitalName),
      doctorName: mask(body.doctorName),
      imageAnalysis: mask(body.imageAnalysis) ?? '',
      imageCount: body.imageCount,
      articleType,
      textLength: body.textLength,
      keywords: mask(body.keywords),
    });

    const cookieHeader = request.headers.get('cookie');
    const authHeader = request.headers.get('authorization');
    const fwHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) fwHeaders['Cookie'] = cookieHeader;
    // /api/gemini 가 게스트로 clamp 되지 않도록 원 요청의 Bearer 토큰 그대로 forward.
    // 누락 시 PRO→flash-lite 다운그레이드 + systemInstruction strip 회귀 (사용자 보고).
    if (authHeader) fwHeaders['Authorization'] = authHeader;

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
      // client SSE disconnect 시 in-flight 즉시 종료 (audit Q-3)
      signal: request.signal,
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok || !data?.text) {
      await refundOnFail();
      return NextResponse.json(
        { error: data?.error || 'generation_failed', details: data?.details || null },
        { status: geminiRes.status >= 400 ? geminiRes.status : 500 },
      );
    }

    // 응답 토큰 복원 — LLM 이 토큰을 변형(`[name_1]`) 한 경우 복원되지 않고
    // 그대로 남는다 (안전 방향: 식별 정보가 의도와 다른 위치에 새는 것보다 토큰 노출 우선).
    const finalText = data.text ? unmaskPII(data.text as string, allReplacements) : data.text;
    return NextResponse.json({ text: finalText, usage: data.usage, model: data.model });
  } catch (err) {
    await refundOnFail();
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/clinical] failed: ${message}`);
    return NextResponse.json({ error: 'generation_failed', code: message.slice(0, 200) }, { status: 500 });
  }
}
