/**
 * POST /api/generate/press — 보도자료 생성 (단일 chain, 1 user action = 1 credit)
 *
 * 정책 (audit Q-2c, 분기 b): 한 폼 submit → crawl(optional) + 병원 정보 추출(flash-lite)
 * + 학습 말투 로드 + 메인 PRO gemini 1회. 모두 합쳐 1 credit.
 *
 * 보안 강화: buildPressPrompt 가 server-side 로 이전 — client 가 임의 systemInstruction
 * 보내 prompt injection 하던 surface 차단 (Q-2b 와 동일 부수효과).
 *
 * crawl 흐름: hospitalWebsite 가 있으면 server-to-server `/api/internal/crawl-hospital-blog`
 * 호출 (PR #92 가 추가한 server-side proxy 재사용). 실패 시 hospital info 없이 진행.
 *
 * LLM 호출: 내부 `/api/gemini` server-to-server forward (PRO→FLASH 폴백 + 멀티키 재시도 재사용).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
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
  hospitalWebsite?: string;
  doctorName?: string;
  doctorTitle?: string;
  pressType?: PressType;
  textLength?: number;
  category?: string;
  hospitalStrengths?: string; // client localStorage 에서 포함하여 송신 (winaid_hospital_strengths)
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
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  // 1 user action = 1 credit (audit Q-2c). validation 후 차감.
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

  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');
  const fwHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) fwHeaders['Authorization'] = authHeader;
  if (cookieHeader) fwHeaders['Cookie'] = cookieHeader;

  try {
    // 1) 병원 크롤링 + 정보 추출 (free, optional)
    let hospitalInfo: string | undefined;
    if (body.hospitalWebsite?.trim()) {
      try {
        const crawlRes = await fetch(resolveInternalUrl('/api/internal/crawl-hospital-blog'), {
          method: 'POST',
          headers: fwHeaders,
          body: JSON.stringify({ blogUrl: body.hospitalWebsite.trim(), maxPosts: 1 }),
          signal: request.signal,
        });
        if (crawlRes.ok) {
          const crawlData = await crawlRes.json() as { posts?: Array<{ content?: string }> };
          const siteContent = crawlData.posts?.[0]?.content || '';
          if (siteContent) {
            const analysisRes = await fetch(resolveInternalUrl('/api/gemini'), {
              method: 'POST',
              headers: fwHeaders,
              body: JSON.stringify({
                prompt: `다음은 ${body.hospitalName || 'OO병원'}의 웹사이트 내용입니다.\n\n${siteContent.slice(0, 3000)}\n\n위 병원 웹사이트에서 다음 정보를 추출해주세요:\n1. 병원의 핵심 강점 (3~5개)\n2. 특화 진료과목이나 특별한 의료 서비스\n3. 차별화된 특징 (장비, 시스템, 의료진 등)\n4. 수상 경력이나 인증 사항\n\n간결하게 핵심만 추출해주세요.`,
                model: 'gemini-3.1-flash-lite-preview', temperature: 0.3, maxOutputTokens: 1000,
              }),
              signal: request.signal,
            });
            if (analysisRes.ok) {
              const analysis = await analysisRes.json() as { text?: string };
              if (analysis.text) {
                hospitalInfo = `[🏥 ${body.hospitalName || 'OO병원'} 병원 정보 - 웹사이트 분석 결과]\n${analysis.text}`;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[generate/press] crawl/analysis failed (continuing without hospitalInfo): ${(err as Error).message}`);
      }
    }

    // 2) 학습 말투 로드 (server-side, free)
    let stylePrompt = '';
    if (body.hospitalName) {
      try {
        stylePrompt = (await getHospitalStylePrompt(body.hospitalName)) || '';
      } catch (err) {
        console.warn(`[generate/press] getHospitalStylePrompt failed: ${(err as Error).message}`);
      }
    }

    // 3) 프롬프트 조립 — server-side build
    const { systemInstruction, prompt } = buildPressPrompt({
      topic: body.topic,
      keywords: body.keywords,
      hospitalName: body.hospitalName,
      doctorName: body.doctorName,
      doctorTitle,
      pressType,
      textLength: body.textLength,
      category: body.category,
      hospitalInfo,
    });

    let finalPrompt = prompt;
    if (stylePrompt) {
      finalPrompt = `${prompt}\n\n[병원 블로그 학습 말투 - 보도자료 스타일 유지하며 적용]\n${stylePrompt}`;
    }
    if (body.hospitalStrengths?.trim()) {
      finalPrompt += `\n\n[병원 특장점]\n${body.hospitalStrengths.trim()}\n→ 주제와 관련 있는 부분만 기사체로 반영.`;
    }

    // 4) 메인 PRO gemini 호출 (Google Search 연동)
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
