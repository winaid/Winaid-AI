import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { checkAuth } from '../../../lib/apiAuth';
import { resolveImageOwner } from '../../../lib/serverAuth';
import { STORAGE_BUCKET } from '../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../lib/hospitalImageService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ images: [], total: 0 });
  }

  try {
    const auth = await checkAuth(request);
    if (auth) return auth;

    // owner 결정 — Bearer 토큰에서 추출. admin cookie 만 있는 케이스는 'guest'.
    const owner = await resolveImageOwner(request);

    const params = request.nextUrl.searchParams;
    const hospitalName = params.get('hospitalName');
    const tagsParam = params.get('tags');
    const mineOnly = params.get('mine') === '1';
    const legacyUserId = params.get('userId');
    if (legacyUserId && legacyUserId !== owner) {
      console.warn(`[hospital-images/GET] userId param ignored (param=${legacyUserId} owner=${owner})`);
    }
    const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 1000);
    const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

    // service_role 우선 — RLS (auth.uid()=user_id) 가 admin cookie 만 가진 운영자의
    // anon SELECT 를 거부해 500 발생하던 회귀 차단. service_role 은 RLS 우회.
    // SUPABASE_SERVICE_ROLE_KEY 미설정 시 anon supabase 로 폴백 (기존 동작).
    const db = supabaseAdmin ?? supabase;

    let query = db
      .from('hospital_images')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 정책: 내부 직원 풀 공유. mineOnly=1 일 때만 본인 업로드 필터.
    if (mineOnly && owner !== 'guest') {
      query = query.eq('user_id', owner);
    }
    if (hospitalName) {
      query = query.eq('hospital_name', hospitalName);
    }
    if (tagsParam) {
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        query = query.contains('tags', tags);
      }
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('[hospital-images/GET] query error:', error.message, 'code=', error.code, 'details=', error.details);
      return NextResponse.json(
        { error: `조회 실패: ${error.message}`, code: error.code, details: error.details },
        { status: 500 },
      );
    }

    const images: HospitalImage[] = (rows || []).map((r) => {
      const { data: { publicUrl } } = db.storage.from(STORAGE_BUCKET).getPublicUrl(r.storage_path);
      return {
        id: r.id,
        userId: r.user_id,
        teamId: r.team_id ?? null,
        hospitalName: r.hospital_name,
        storagePath: r.storage_path,
        originalFilename: r.original_filename,
        fileSize: r.file_size,
        mimeType: r.mime_type,
        width: r.width,
        height: r.height,
        tags: r.tags || [],
        altText: r.alt_text || '',
        aiDescription: r.ai_description,
        usageCount: r.usage_count || 0,
        createdAt: r.created_at,
        publicUrl,
      };
    });

    return NextResponse.json(images);
  } catch (e) {
    const msg = (e as Error).message || 'unknown';
    const stack = (e as Error).stack?.slice(0, 500);
    console.error('[hospital-images/GET] UNCAUGHT:', msg, stack);
    return NextResponse.json({ error: 'uncaught_error', details: msg }, { status: 500 });
  }
}
