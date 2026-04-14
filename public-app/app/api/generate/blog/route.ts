/**
 * POST /api/generate/blog — Phase 2A v4 통합 초안 생성 (Sonnet 4.6)
 *
 * v4 의미:
 *   - Sonnet 4.6 이 초안 + SEO + 의료광고법 준수를 한 번에 수행.
 *   - 서버에서 regex 치환은 하지 않음. 감지만 — filterMedicalLawViolations 로
 *     foundTerms 배열을 뽑아 클라이언트에 전달하면, 클라이언트가 /review 에 넘긴다.
 *   - 최종 치환(regex 안전망)은 /api/generate/blog/review 엔드포인트에서 담당.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { useCredit } from '../../../../lib/creditService';
import { getHospitalStylePrompt } from '../../../../lib/styleService';
import { buildBlogPromptV3 } from '../../../../lib/blogPrompt';
import { filterMedicalLawViolations } from '../../../../lib/medicalLawFilter';
import { callLLM } from '../../../../lib/llm';
import type { GenerationRequest } from '../../../../lib/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface Body {
  request?: GenerationRequest;
  hospitalName?: string;
  userId?: string | null;
}

export async function POST(request: NextRequest) {
  // 1) rate limit — 생성은 가장 비싼 호출이므로 타이트하게 분당 5회
  const gate = gateGuestRequest(request, 5);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 2) body 파싱
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const req = body.request;
  if (!req || !req.topic || !req.category) {
    return NextResponse.json({ error: 'bad_request', details: 'request.topic/category required' }, { status: 400 });
  }

  // 3) 크레딧 차감 (로그인 사용자만)
  const userId = body.userId || null;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
  }

  // 4) 병원 스타일 블록 (있으면 cache 블록으로 합쳐짐)
  let hospitalStyleBlock: string | null = null;
  const hospitalName = body.hospitalName || req.hospitalName;
  if (hospitalName) {
    try {
      hospitalStyleBlock = await getHospitalStylePrompt(hospitalName);
    } catch (err) {
      console.warn(`[generate/blog] getHospitalStylePrompt failed: ${(err as Error).message}`);
    }
  }

  // 5) V3 프롬프트 조립
  const { systemBlocks, userPrompt } = buildBlogPromptV3(req, { hospitalStyleBlock });

  // 6) callLLM
  try {
    const resp = await callLLM({
      task: 'blog_unified',
      systemBlocks,
      userPrompt,
      temperature: 0.85,
      maxOutputTokens: 8192,
      userId,
    });

    // 7) 감지만 (치환 X) — violations 배열로 클라이언트에 넘김
    const detected = filterMedicalLawViolations(resp.text);
    const violations = detected.foundTerms;

    return NextResponse.json({
      text: resp.text, // Sonnet 원본 그대로
      violations,
      usage: resp.usage,
      model: resp.model,
    });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog] callLLM failed: ${message}`);
    return NextResponse.json(
      { error: 'generation_failed', code: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
