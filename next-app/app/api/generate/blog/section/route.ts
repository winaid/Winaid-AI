/**
 * POST /api/generate/blog/section (next-app 내부용) — Phase 2A v4 섹션 재생성 (Sonnet 4.6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../../lib/creditService';
import { verifyAdminCookie } from '../../../../../lib/adminCookie';
import {
  buildBlogSectionPromptV3,
  type SectionRegenerateInputV3,
} from '@winaid/blog-core';
import { applyContentFilters } from '@winaid/blog-core';
import { sanitizeLeakInHtml } from '@winaid/blog-core';
import { callLLM } from '@winaid/blog-core';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  input?: SectionRegenerateInputV3;
  // userId 는 client 입력 신뢰 안 함. Bearer 토큰에서 도출.
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: Body;
  try { body = (await request.json()) as Body; } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const input = body.input;
  if (!input || typeof input.currentSection !== 'string' || typeof input.fullBlogContent !== 'string') {
    return NextResponse.json({ error: 'bad_request', details: 'input.currentSection/fullBlogContent required' }, { status: 400 });
  }

  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
  // 🛑 INVARIANT §2 — next-app admin (admin_session cookie) 은 크레딧 무관 무제한.
  const isAdmin = verifyAdminCookie(request).valid;
  let creditDeducted = false;
  if (userId && !isAdmin) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
    creditDeducted = true;
  }

  const { systemBlocks, userPrompt } = buildBlogSectionPromptV3(input);

  try {
    const resp = await callLLM({
      task: 'blog_unified_section',
      systemBlocks,
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 4096,
      userId,
      abortSignal: request.signal,
    });
    const filtered = applyContentFilters(resp.text);
    // 누수 필터 — 섹션 재생성 응답은 client normalizeBlogStructure 를 거치지 않으므로
    // server-side 에서 직접 strip. heading/p 안에 메타 지시문 ("로 감싸 ...", "[META]" 등)
    // 이 그대로 노출되던 회귀 (사용자 보고 "소제목을 / 로 감싸 가독성과 SEO 구조를 보강") 차단.
    const cleaned = sanitizeLeakInHtml(filtered.filtered);
    if (cleaned.headingsStripped + cleaned.paragraphsStripped > 0) {
      console.warn(`[generate/blog/section] leak stripped — h:${cleaned.headingsStripped} p:${cleaned.paragraphsStripped}`);
    }
    return NextResponse.json({
      text: cleaned.html,
      usage: resp.usage,
      model: resp.model,
    });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate/blog/section] callLLM failed: ${message}`);
    // 섹션 재생성 실패 시 1 크레딧 환불 (refund 실패는 swallow)
    if (creditDeducted && userId) {
      const refund = await refundCredit(userId).catch(() => null);
      if (refund?.success) {
        console.log(`[generate/blog/section] refunded 1 credit for ${userId} (remaining=${refund.remaining})`);
      }
    }
    return NextResponse.json(
      { error: 'generation_failed', code: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
