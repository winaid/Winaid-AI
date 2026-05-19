/**
 * POST /api/geo/citations/analyze — AI 인용 출처 분석 (ChatGPT + Gemini 병렬)
 *
 * body: { hospital_name, query, our_domains[], campaign_id?, models? }
 *   models 기본: ['chatgpt', 'gemini'] (둘 다 호출). 한 모델 키 미설정 → 그 모델만 503,
 *   다른 모델은 정상 진행 (Promise.allSettled).
 *
 * 흐름: gate → parse body → 모델별 병렬 호출 → row 1건씩 저장 → 응답
 *
 * SECURITY:
 *   - public-app: gateGuestRequest + (로그인 사용자만) useCredit(1)
 *   - admin_session cookie 있으면 P-1 정책으로 rate limit / credit 모두 bypass (방어적)
 *   - sanitize: query → sanitizePromptInput(500) (client 내부에서)
 *   - 응답 answer → stripPromptLeakage (client 내부에서)
 *   - supabaseAdmin (service_role) 으로 RLS 우회
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../../lib/creditService';
import {
  queryChatGptWithCitations,
  queryGeminiWithCitations,
  type CitationQueryResult,
  type CitationRow,
  type AnalyzeCitationsRequest,
} from '@winaid/blog-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MAX_NAME_LEN = 200;
const MAX_QUERY_LEN = 500;
const MAX_DOMAINS = 20;
const MAX_DOMAIN_LEN = 200;

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

function hasAdminSession(request: NextRequest): boolean {
  const cookies = request.headers.get('cookie') || '';
  // P-1 정책: admin_session 쿠키 보유 시 모든 게이트 bypass (방어적 — 보통 next-app 도메인 한정).
  return /admin_session=/i.test(cookies);
}

function validateBody(raw: unknown): { ok: true; body: AnalyzeCitationsRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Record<string, unknown>;
  if (typeof b.hospital_name !== 'string' || !b.hospital_name.trim() || b.hospital_name.length > MAX_NAME_LEN) {
    return { ok: false, error: 'hospital_name 필수 (1~200자)' };
  }
  if (typeof b.query !== 'string' || !b.query.trim() || b.query.length > MAX_QUERY_LEN) {
    return { ok: false, error: 'query 필수 (1~500자)' };
  }
  if (!Array.isArray(b.our_domains)) {
    return { ok: false, error: 'our_domains 배열 필수' };
  }
  if (b.our_domains.length > MAX_DOMAINS) {
    return { ok: false, error: `our_domains 최대 ${MAX_DOMAINS}개` };
  }
  const our_domains: string[] = [];
  for (const d of b.our_domains) {
    if (typeof d !== 'string') return { ok: false, error: 'our_domains 항목은 문자열' };
    const t = d.trim();
    if (!t || t.length > MAX_DOMAIN_LEN) return { ok: false, error: 'our_domains 항목 길이 1~200자' };
    our_domains.push(t);
  }
  let models: Array<'chatgpt' | 'gemini'> = ['chatgpt', 'gemini'];
  if (Array.isArray(b.models) && b.models.length > 0) {
    const filtered: Array<'chatgpt' | 'gemini'> = [];
    for (const m of b.models) {
      if (m === 'chatgpt' || m === 'gemini') filtered.push(m);
    }
    if (filtered.length > 0) models = filtered;
  }
  let campaign_id: string | null = null;
  if (typeof b.campaign_id === 'string' && b.campaign_id.trim()) {
    campaign_id = b.campaign_id.trim();
  }
  return {
    ok: true,
    body: {
      hospital_name: b.hospital_name.trim(),
      query: b.query.trim(),
      our_domains,
      campaign_id,
      models,
    },
  };
}

async function saveRow(row: CitationRow, createdBy: string): Promise<CitationRow> {
  try {
    const db = await getDb();
    if (!db) return row;
    const { data, error } = await (db.from('geo_citations') as ReturnType<typeof db.from>)
      .insert({
        campaign_id: row.campaign_id,
        hospital_name: row.hospital_name,
        query: row.query,
        ai_model: row.ai_model,
        answer_text: row.answer_text,
        citations: row.citations,
        our_domains: row.our_domains,
        created_by: createdBy,
      })
      .select('id, created_at')
      .single();
    if (error) {
      console.warn('[geo/citations] supabase insert error:', error.message);
      return row;
    }
    const d = data as { id?: string; created_at?: string } | null;
    return { ...row, id: d?.id, created_at: d?.created_at };
  } catch (err) {
    console.warn('[geo/citations] saveRow exception:', err);
    return row;
  }
}

async function _wrappedPOST(request: NextRequest) {
  const isAdmin = hasAdminSession(request);

  // P-1: admin 은 모든 게이트 bypass. 일반 경로는 분당 10회 게이트.
  if (!isAdmin) {
    const gate = gateGuestRequest(request, 10);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const validated = validateBody(raw);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const { hospital_name, query, our_domains, campaign_id, models = ['chatgpt', 'gemini'] } = validated.body;

  // 로그인 사용자만 크레딧 차감 (게스트는 무료, admin 은 bypass).
  const userId = await resolveImageOwner(request);
  let creditDeducted = false;
  if (!isAdmin && userId && userId !== 'guest') {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json({ error: 'insufficient_credits', remaining: credit.remaining }, { status: 402 });
    }
    creditDeducted = true;
  }

  const refundOnFail = async () => {
    if (creditDeducted && userId && userId !== 'guest') {
      await refundCredit(userId, 1).catch(() => {});
    }
  };

  // 모델별 병렬 호출. Promise.allSettled 로 한 모델 실패해도 진행.
  const tasks: Array<Promise<{ ai_model: 'chatgpt' | 'gemini'; result?: CitationQueryResult; error?: string }>> = [];
  if (models.includes('chatgpt')) {
    tasks.push(
      queryChatGptWithCitations(query, { ourDomains: our_domains, abortSignal: request.signal })
        .then(r => ({ ai_model: 'chatgpt' as const, result: r }))
        .catch(e => ({ ai_model: 'chatgpt' as const, error: e instanceof Error ? e.message : String(e) })),
    );
  }
  if (models.includes('gemini')) {
    tasks.push(
      queryGeminiWithCitations(query, { ourDomains: our_domains, abortSignal: request.signal })
        .then(r => ({ ai_model: 'gemini' as const, result: r }))
        .catch(e => ({ ai_model: 'gemini' as const, error: e instanceof Error ? e.message : String(e) })),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const results: { chatgpt?: CitationRow; gemini?: CitationRow } = {};
  const errors: { chatgpt?: string; gemini?: string } = {};

  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const v = s.value;
    if (v.error || !v.result) {
      errors[v.ai_model] = v.error || 'unknown error';
      continue;
    }
    const row: CitationRow = {
      campaign_id: campaign_id ?? null,
      hospital_name,
      query,
      ai_model: v.ai_model,
      answer_text: v.result.answer,
      citations: v.result.citations,
      our_domains,
    };
    const createdBy = isAdmin ? 'admin' : (userId && userId !== 'guest' ? userId : 'guest');
    results[v.ai_model] = await saveRow(row, createdBy);
  }

  if (Object.keys(results).length === 0) {
    await refundOnFail();
    return NextResponse.json({ error: 'all models failed', errors }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
}

export const POST = withApiError(_wrappedPOST);
