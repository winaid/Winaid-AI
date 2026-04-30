import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@winaid/blog-core';
import { checkAuth } from '../../../lib/apiAuth';
import { resolveImageOwner } from '../../../lib/serverAuth';
import { STORAGE_BUCKET } from '../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../lib/hospitalImageService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ images: [], total: 0 });
  }

  const auth = await checkAuth(request);
  if (auth) return auth;

  // owner 결정 — Bearer 토큰에서 추출. checkAuth 가 'guest' 차단했으므로 valid uuid.
  const owner = await resolveImageOwner(request);

  const params = request.nextUrl.searchParams;
  const hospitalName = params.get('hospitalName');
  const tagsParam = params.get('tags');
  // mine=1 → 본인 업로드만 (라이브러리 페이지의 "내 것만" 토글용).
  // 그 외 → 인증된 모든 직원에게 풀 공유 (next-app=내부 직원 도구 정책).
  const mineOnly = params.get('mine') === '1';
  // ?userId= 는 legacy. owner 와 다르면 사칭 시도 → 무시(silent override + 경고).
  // 합법 호출 (owner 와 동일) 은 그대로 통과.
  const legacyUserId = params.get('userId');
  if (legacyUserId && legacyUserId !== owner) {
    console.warn(`[hospital-images/GET] userId param ignored (param=${legacyUserId} owner=${owner})`);
  }
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

  let query = supabase
    .from('hospital_images')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // 정책: 내부 직원 풀 공유 (사용자 결정 — "팀 상관 없이, 내부용 관리자 아이디로도 작동").
  // 인증된 사용자라면 모두 같은 풀 조회. 팀/업로더 격리 없음.
  // 라이브러리 페이지의 "내 것만" 토글은 mineOnly=1 명시로 처리.
  // hospitalName 단독 전달 → 그 병원으로 좁힘 (라이브러리 hospital 필터 + 블로그 매칭 공통 사용).
  // 이전 scope=hospital 우회는 무용지물 — 이제 디폴트가 풀 공유라 파라미터 무관하게 동작.
  // public-app 의 동일 라우트는 외부 로그인 사용자별 격리를 유지 (별도 정책).
  if (mineOnly) {
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
    return NextResponse.json({ error: `조회 실패: ${error.message}` }, { status: 500 });
  }

  const images: HospitalImage[] = (rows || []).map((r) => {
    const { data: { publicUrl } } = supabase!.storage.from(STORAGE_BUCKET).getPublicUrl(r.storage_path);
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
}
