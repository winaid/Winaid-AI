/**
 * POST /api/geo/competitor/respond — "✨ 대응 콘텐츠 초안" 클릭 시 prefill URL 생성
 *
 * body: { competitor_content_id }
 * 흐름:
 *   1. competitor_contents fetch (title / snippet / pattern_type)
 *   2. blog 빌더 prefill URL 생성 (?title=&pattern=&category=)
 *   3. competitor_contents.responded = true 마킹
 *   4. 응답 { prefillUrl, content }
 *
 * SECURITY: next-app — checkAuth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

const BLOG_BUILDER_PATH = '/blog';

async function getDb() {
  const { supabase, supabaseAdmin } = await import('@winaid/blog-core');
  return supabaseAdmin ?? supabase ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const b = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const id = typeof b.competitor_content_id === 'string' ? b.competitor_content_id.trim() : '';
  if (!id) return NextResponse.json({ error: 'competitor_content_id 필수' }, { status: 400 });

  const db = await getDb();
  if (!db) {
    return NextResponse.json({
      prefillUrl: BLOG_BUILDER_PATH,
      note: 'supabase 미설정 — 빈 blog 페이지로 이동',
    });
  }

  const { data, error } = await (db.from('competitor_contents') as ReturnType<typeof db.from>)
    .select('id, title, snippet, pattern_type, competitor_domain, url, source')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
  }
  const content = data as {
    id: string; title?: string; snippet?: string; pattern_type?: string;
    competitor_domain: string; url: string; source: string;
  };

  // responded = true 마킹 (실패는 swallow — 응답 prefillUrl 이 더 중요)
  await (db.from('competitor_contents') as ReturnType<typeof db.from>)
    .update({ responded: true })
    .eq('id', id)
    .then((r) => {
      if (r.error) console.warn('[geo/competitor respond] mark responded error:', r.error.message);
    });

  // prefill URL — blog 빌더 page query string
  const params = new URLSearchParams();
  if (content.title) params.set('title', content.title);
  if (content.pattern_type) params.set('pattern', content.pattern_type);
  params.set('competitor_source', content.competitor_domain);
  const prefillUrl = `${BLOG_BUILDER_PATH}?${params.toString()}`;

  return NextResponse.json({ success: true, prefillUrl, content });
}
