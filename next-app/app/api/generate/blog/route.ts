/**
 * POST /api/generate/blog (next-app 내부용) — 2-pass 병렬 생성 (v5)
 *
 * public-app 과 시맨틱 동일. 차이: checkAuth (내부용).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';
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
  // userId 는 더 이상 client 입력 신뢰 안 함. Bearer 토큰에서 도출.
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
  // category 화이트리스트 — ContentCategory enum 외 임의 문자열 차단 (prompt injection 방어).
  // 사용자 입력이 buildBlogPromptV3 의 categoryHints / TERMINOLOGY_BY_CATEGORY 에 직접 보간되므로
  // 화이트리스트 enforce 가 1차 책임.
  const VALID_CATEGORIES = new Set(['치과', '피부과', '정형외과']);
  if (!VALID_CATEGORIES.has(req.category)) {
    return NextResponse.json({ error: 'bad_request', details: `invalid category: ${String(req.category).slice(0, 30)}` }, { status: 400 });
  }

  // userId 는 Bearer 토큰에서 도출 (client body.userId 신뢰 금지 — 다른 사용자 크레딧 차감 방지)
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

  const url = new URL(request.url);
  const isStream = url.searchParams.get('stream') === '1';

  if (isStream) {
    return streamResponse(req, hospitalStyleBlock, userId, creditDeducted);
  }

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
    // generation 실패 시 크레딧 환불 — refund 실패는 swallow (호출자 흐름 영향 X)
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

function parseOutlineJson(raw: string, imageCount: number): BlogOutline | null {
  // 1) pure JSON 먼저 시도 (Claude 가 정상적으로 JSON 만 반환한 경우 최적)
  let parsed: BlogOutline | null = null;
  try {
    parsed = JSON.parse(raw.trim()) as BlogOutline;
  } catch {
    // 2) 첫 { ... } 블록 추출해서 parse (마크다운/코멘트 뒤따라올 때 대응)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]) as BlogOutline;
    } catch {
      return null;
    }
  }

  // 3) 구조 검증
  if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length < 3) return null;
  if (!parsed.keyMessage || !parsed.totalCharTarget) return null;

  // 4) imageIndex 검증: imageCount 초과 또는 0 이하면 제거
  for (const sec of parsed.sections) {
    if (typeof sec.imageIndex === 'number') {
      if (sec.imageIndex < 1 || sec.imageIndex > imageCount) {
        console.warn(`[outline] imageIndex ${sec.imageIndex} out of range (imageCount=${imageCount}) — removed`);
        delete sec.imageIndex;
      }
    }
  }

  // 5) charTarget 합 검증: totalCharTarget과 2배 이상 차이나면 비례 조정
  {
    const sumCharTargets = parsed.sections.reduce((s, sec) => s + (sec.charTarget ?? 0), 0);
    if (sumCharTargets > 0) {
      const ratio = parsed.totalCharTarget / sumCharTargets;
      if (ratio < 0.5 || ratio > 2.0) {
        console.warn(`[outline] charTarget sum=${sumCharTargets} vs totalCharTarget=${parsed.totalCharTarget} (ratio=${ratio.toFixed(2)}) — rescaling`);
        for (const sec of parsed.sections) {
          if (typeof sec.charTarget === 'number') {
            sec.charTarget = Math.round(sec.charTarget * ratio);
          }
        }
      }
    }
  }

  return parsed;
}

/**
 * 동시성 cap 헬퍼 — Promise.allSettled 와 동일 출력 형태 (status='fulfilled'|'rejected').
 *
 * Anthropic Tier 1 (50 RPM, 4000 ITPM) 에서 8 섹션 무제한 병렬 + 이미지 동시 호출 시
 * 429 빈번 → 부분 발행 + full credit 차감 위험. cap=3 으로 제한해 throughput 확보.
 *
 * env: BLOG_SECTION_CONCURRENCY (기본 3, 1~10 clamp). 외부 의존성 0.
 */
async function pLimitedSettled<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit) || 3));
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = { status: 'fulfilled', value: await fn(items[i], i) }; }
      catch (err) { results[i] = { status: 'rejected', reason: err }; }
    }
  };
  const workerCount = Math.min(safeLimit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

const SECTION_CONCURRENCY = Math.max(1, Math.min(10, parseInt(process.env.BLOG_SECTION_CONCURRENCY || '3', 10) || 3));

async function generate2Pass(
  req: GenerationRequest,
  hospitalStyleBlock: string | null,
  userId: string | null,
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; model: string; mode: '2pass' | '1pass' }> {
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
    outline = parseOutlineJson(outlineResp.text, req.imageCount ?? 0);
    if (!outline) {
      console.error('[generate/blog] outline parse FAILED. Raw response:', outlineResp.text?.slice(0, 500));
    } else {
      console.log('[generate/blog] outline OK:', outline.sections.length, 'sections');
    }
  } catch (err) {
    console.error('[generate/blog] outline generation FAILED:', (err as Error).message);
    console.error('[generate/blog] outline FULL ERROR:', JSON.stringify(err, Object.getOwnPropertyNames(err as object)).slice(0, 1000));
  }

  if (!outline) {
    return generate1Pass(req, hospitalStyleBlock, userId);
  }

  const totalSectionsForDistribution = outline.sections.length;
  if (typeof req.keywordDensity === 'number' && req.keywords?.trim()) {
    const bodyCount = Math.max(1, outline.sections.filter(s => s.type === 'section').length);
    const base = Math.floor(req.keywordDensity / bodyCount);
    const bonus = req.keywordDensity % bodyCount;
    const distribution = Array.from({ length: bodyCount }, (_, i) => base + (i < bonus ? 1 : 0));
    console.info(`[BLOG] 키워드 분배: density=${req.keywordDensity} bodyCount=${bodyCount} base=${base} bonusCount=${bonus} → 본문 섹션별 [${distribution.join(',')}] / intro·outro 는 0~1회`);
  }
  // Anthropic Tier 1 RPM 보호: 동시 섹션 호출을 SECTION_CONCURRENCY (기본 3) 로 제한.
  // outline 8 섹션 → 무제한 fan-out 시 429 빈번 → Promise.allSettled 가 swallow → 부분 발행.
  const results = await pLimitedSettled(
    outline.sections,
    (section, idx) => {
      const prompt = buildSectionFromOutlinePrompt({
        section,
        sectionIndex: idx,
        outline,
        req,
        hospitalStyleBlock,
        density: req.keywordDensity,
        totalSections: totalSectionsForDistribution,
      });
      return callLLM({
        task: 'blog_unified',
        systemBlocks: prompt.systemBlocks,
        userPrompt: prompt.userPrompt,
        temperature: 0.8,
        maxOutputTokens: 4096,
        userId,
      });
    },
    SECTION_CONCURRENCY,
  );

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

// ── SSE 스트림 모드 ──

type ProgressSend = (event: string, data: Record<string, unknown>) => void;

function streamResponse(
  req: GenerationRequest,
  hospitalStyleBlock: string | null,
  userId: string | null,
  creditDeducted: boolean,
): Response {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send: ProgressSend = (event, data) => {
        const payload = JSON.stringify({ ...data, elapsedMs: Date.now() - startTime });
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
      };

      try {
        const result = await generate2PassWithProgress(req, hospitalStyleBlock, userId, send);
        const detected = filterMedicalLawViolations(result.text);
        send('complete', {
          text: result.text,
          violations: detected.foundTerms,
          usage: result.usage,
          model: result.model,
          mode: result.mode,
        });
      } catch (err) {
        // SSE generation 실패 시 환불 (50%+ 섹션 실패 fallback 도 못 가서 throw 한 케이스)
        if (creditDeducted && userId) {
          const refund = await refundCredit(userId).catch(() => null);
          if (refund?.success) {
            send('refunded', { remaining: refund.remaining, amount: 1 });
          }
        }
        send('error', { message: ((err as Error).message || 'unknown').slice(0, 200) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function generate2PassWithProgress(
  req: GenerationRequest,
  hospitalStyleBlock: string | null,
  userId: string | null,
  send: ProgressSend,
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; model: string; mode: '2pass' | '1pass' }> {
  send('stage', { name: 'outline_start' });

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
    outline = parseOutlineJson(outlineResp.text, req.imageCount ?? 0);
  } catch (err) {
    console.error('[generate/blog][stream] outline FAILED:', (err as Error).message);
  }

  send('stage', { name: 'outline_done', success: !!outline });

  if (!outline) {
    send('stage', { name: 'fallback_1pass' });
    return generate1Pass(req, hospitalStyleBlock, userId);
  }

  const totalSections = outline.sections.length;
  send('stage', { name: 'sections_start', total: totalSections });

  if (typeof req.keywordDensity === 'number' && req.keywords?.trim()) {
    const bodyCount = Math.max(1, outline.sections.filter(s => s.type === 'section').length);
    const base = Math.floor(req.keywordDensity / bodyCount);
    const bonus = req.keywordDensity % bodyCount;
    const distribution = Array.from({ length: bodyCount }, (_, i) => base + (i < bonus ? 1 : 0));
    console.info(`[BLOG] 키워드 분배: density=${req.keywordDensity} bodyCount=${bodyCount} base=${base} bonusCount=${bonus} → 본문 섹션별 [${distribution.join(',')}] / intro·outro 는 0~1회`);
  }

  let completedCount = 0;
  // pLimitedSettled 로 SECTION_CONCURRENCY (기본 3) 개씩 순차 실행 — Anthropic Tier 1 RPM 보호.
  const results = await pLimitedSettled(
    outline.sections,
    async (section, idx) => {
      const prompt = buildSectionFromOutlinePrompt({
        section,
        sectionIndex: idx,
        outline: outline!,
        req,
        hospitalStyleBlock,
        density: req.keywordDensity,
        totalSections,
      });
      try {
        const result = await callLLM({
          task: 'blog_unified',
          systemBlocks: prompt.systemBlocks,
          userPrompt: prompt.userPrompt,
          temperature: 0.8,
          maxOutputTokens: 4096,
          userId,
        });
        completedCount++;
        send('stage', { name: 'section_done', index: idx, completed: completedCount, total: totalSections });
        return result;
      } catch (err) {
        completedCount++;
        send('stage', { name: 'section_failed', index: idx, completed: completedCount, total: totalSections });
        throw err;
      }
    },
    SECTION_CONCURRENCY,
  );

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
    }
  }

  if (failedCount > results.length / 2) {
    send('stage', { name: 'fallback_1pass_too_many_failures' });
    return generate1Pass(req, hospitalStyleBlock, userId);
  }

  return {
    text: htmlParts.join('\n\n'),
    usage: { inputTokens: totalInput, outputTokens: totalOutput, costUsd: totalCost },
    model: model || 'claude-sonnet-4-6',
    mode: '2pass',
  };
}
