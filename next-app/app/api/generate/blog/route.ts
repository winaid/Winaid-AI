/**
 * POST /api/generate/blog (next-app 내부용) — Phase 2A v4 통합 초안 (Sonnet 4.6)
 *
 * public-app 과 시맨틱 동일. 차이:
 *   - 내부용이라 guestRateLimit 없음. apiAuth.checkAuth 만 통과시키는 패턴.
 *   - 나머지 흐름 동일.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
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
  const auth = await checkAuth(request);
  if (auth) return auth;

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

  const userId = body.userId || null;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
  }

  let hospitalStyleBlock: string | null = null;
  const hospitalName = body.hospitalName || req.hospitalName;
  if (hospitalName) {
    try {
      hospitalStyleBlock = await getHospitalStylePrompt(hospitalName);
    } catch (err) {
      console.warn(`[generate/blog] getHospitalStylePrompt failed: ${(err as Error).message}`);
    }
  }

  if (process.env.LLM_DEBUG_STYLE === '1') {
    console.log('[generate/blog][style-debug]', {
      hospitalName: hospitalName || null,
      hasBlock: !!hospitalStyleBlock,
      blockLength: hospitalStyleBlock ? hospitalStyleBlock.length : 0,
      preview: hospitalStyleBlock ? hospitalStyleBlock.slice(0, 300) : null,
    });
  }

  const { systemBlocks, userPrompt } = buildBlogPromptV3(req, { hospitalStyleBlock });

  try {
    const resp = await callLLM({
      task: 'blog_unified',
      systemBlocks,
      userPrompt,
      temperature: 0.85,
      maxOutputTokens: 8192,
      userId,
    });

    const detected = filterMedicalLawViolations(resp.text);

    return NextResponse.json({
      text: resp.text,
      violations: detected.foundTerms,
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
