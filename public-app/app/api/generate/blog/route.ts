/**
 * POST /api/generate/blog — 2-pass 병렬 생성 (v5)
 *
 * Pass 1: 아웃라인(JSON) 생성 → Sonnet 4.6
 * Pass 2: 섹션별 병렬 작성 → Promise.allSettled
 * Fallback: 아웃라인 실패 시 기존 1-pass (buildBlogPromptV3) 로 ��환
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { getHospitalStylePrompt } from '@winaid/blog-core';
import { buildBlogPromptV3, buildOutlinePrompt, buildSectionFromOutlinePrompt } from '@winaid/blog-core';
import { filterMedicalLawViolations } from '@winaid/blog-core';
import { callLLM } from '@winaid/blog-core';
import type { GenerationRequest, BlogOutline } from '@winaid/blog-core';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  request?: GenerationRequest;
  hospitalName?: string;
  // userId 는 client 입력 신뢰 안 함. Bearer 토큰에서 도출.
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

  // 3) 크레딧 차감 (로그인 사용자만) — userId 는 Bearer 토큰에서 도출
  // (client body.userId 신뢰 시 다른 사용자 크레딧 차감 가능 — 외부 사용자 라우트라 특히 위험)
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

  // 4) 병원 스타일 블록 (있으면 cache 블록으로 합쳐짐)
  let hospitalStyleBlock: string | null = null;
  const hospitalName = body.hospitalName || req.hospitalName;
  // 우선순위 4-A 정책: stylePromptText 가 있으면 빌더에서 hospitalStyleBlock 은 버려지므로,
  // DB/네트워크 왕복 자체를 스킵해 비용 절약. 캐시 키 영향 없음 (조회를 안 함).
  if (hospitalName && !req.stylePromptText?.trim()) {
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
      // 4-A 정책 가시성: hospitalName 입력은 있으나 stylePromptText 우선으로 무시되는 케이스
      policy_skipped: !!req.stylePromptText?.trim() && !!hospitalName,
      stylePromptText_len: req.stylePromptText?.length ?? 0,
    });
  }

  // 5) 2-pass 시도 → 실패 시 1-pass fallback
  try {
    const result = await generate2Pass(req, hospitalStyleBlock, userId);
    const detected = filterMedicalLawViolations(result.text);

    return NextResponse.json({
      text: result.text,
      violations: detected.foundTerms,
      usage: result.usage,
      model: result.model,
      mode: result.mode,
    });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog] failed: ${message}`);
    // generation 실패 시 크레딧 환불 — refund 실패는 swallow
    if (creditDeducted && userId) {
      const refund = await refundCredit(userId).catch(() => null);
      if (refund?.success) {
        console.log(`[generate/blog] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
      }
    }
    return NextResponse.json(
      { error: 'generation_failed', code: message.slice(0, 200) },
      { status: 500 },
    );
  }
}

function parseOutlineJson(raw: string): BlogOutline | null {
  try {
    const match = raw.match(/[\[{][\s\S]*[}\]]/);
    const json = match ? match[0] : raw;
    const parsed = JSON.parse(json) as BlogOutline;
    if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length < 3) return null;
    if (!parsed.keyMessage || !parsed.totalCharTarget) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function generate2Pass(
  req: GenerationRequest,
  hospitalStyleBlock: string | null,
  userId: string | null,
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; model: string; mode: '2pass' | '1pass' }> {
  // ── Pass 1: 아웃라인 ──
  let outline: BlogOutline | null = null;
  try {
    const outlinePrompt = buildOutlinePrompt(req);
    const outlineResp = await callLLM({
      task: 'blog_outline',
      systemBlocks: outlinePrompt.systemBlocks,
      userPrompt: outlinePrompt.userPrompt,
      temperature: 0.4,
      maxOutputTokens: 2048,
      userId,
    });
    outline = parseOutlineJson(outlineResp.text);
    if (!outline) {
      console.error('[generate/blog] outline parse FAILED. Raw response:', outlineResp.text?.slice(0, 500));
    } else {
      console.log('[generate/blog] outline OK:', outline.sections.length, 'sections');
    }
  } catch (err) {
    console.error('[generate/blog] outline generation FAILED:', (err as Error).message);
    console.error('[generate/blog] outline FULL ERROR:', JSON.stringify(err, Object.getOwnPropertyNames(err as object)).slice(0, 1000));
  }

  // ── Fallback: 1-pass ──
  if (!outline) {
    return generate1Pass(req, hospitalStyleBlock, userId);
  }

  // ── Pass 2: 섹션별 병렬 생성 ──
  const sectionPromises = outline.sections.map((section, idx) => {
    const prompt = buildSectionFromOutlinePrompt({
      section,
      sectionIndex: idx,
      outline,
      req,
      hospitalStyleBlock,
    });
    return callLLM({
      task: 'blog_unified',
      systemBlocks: prompt.systemBlocks,
      userPrompt: prompt.userPrompt,
      temperature: 0.8,
      maxOutputTokens: 4096,
      userId,
    });
  });

  const results = await Promise.allSettled(sectionPromises);

  const htmlParts: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let model = '';
  let failedCount = 0;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      htmlParts.push(r.value.text.trim());
      totalInput += r.value.usage.inputTokens;
      totalOutput += r.value.usage.outputTokens;
      totalCost += r.value.usage.costUsd;
      if (!model) model = r.value.model;
    } else {
      failedCount++;
      console.warn(`[generate/blog] section failed: ${r.reason?.message?.slice(0, 200) ?? 'unknown'}`);
    }
  }

  // 절반 이상 실패 → 1-pass fallback
  if (failedCount > results.length / 2) {
    console.warn(`[generate/blog] ${failedCount}/${results.length} sections failed, falling back to 1-pass`);
    return generate1Pass(req, hospitalStyleBlock, userId);
  }

  return {
    text: htmlParts.join('\n\n'),
    usage: { inputTokens: totalInput, outputTokens: totalOutput, costUsd: totalCost },
    model: model || 'claude-sonnet-4-6',
    mode: '2pass',
  };
}

async function generate1Pass(
  req: GenerationRequest,
  hospitalStyleBlock: string | null,
  userId: string | null,
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; model: string; mode: '1pass' }> {
  const { systemBlocks, userPrompt } = buildBlogPromptV3(req, { hospitalStyleBlock });
  const resp = await callLLM({
    task: 'blog_unified',
    systemBlocks,
    userPrompt,
    temperature: 0.85,
    maxOutputTokens: 8192,
    userId,
  });
  return {
    text: resp.text,
    usage: resp.usage,
    model: resp.model,
    mode: '1pass',
  };
}
