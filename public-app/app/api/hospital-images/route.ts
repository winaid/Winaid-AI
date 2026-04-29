import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@winaid/blog-core';
import { gateGuestRequest } from '../../../lib/guestRateLimit';
import { STORAGE_BUCKET } from '../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../lib/hospitalImageService';
import { resolveImageOwner } from '../../../lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ images: [], total: 0 });
  }

  const gate = gateGuestRequest(request, 20);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const owner = await resolveImageOwner(request);
  const params = request.nextUrl.searchParams;
  const hospitalName = params.get('hospitalName');
  const tagsParam = params.get('tags');
  // mine=1 → 본인 이미지만. 그 외 → 본인 OR 같은 팀(team_id 일치).
  // 팀 미배정(team_id NULL) 사용자는 mine 값과 무관하게 본인 것만 조회됨.
  const mineOnly = params.get('mine') === '1';
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

  // owner 의 team_id 조회 (게스트 또는 팀 미배정이면 null).
  let ownerTeamId: number | null = null;
  if (owner !== 'guest') {
    const { data: prof } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', owner)
      .maybeSingle();
    ownerTeamId = (prof?.team_id ?? null) as number | null;
  }

  let query = supabase
    .from('hospital_images')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // user-scope · primary gate. RLS 는 SELECT permissive 라 server-side filter 가
  // 격리 책임. team_id 비교는 정수 컬럼이라 SQL injection 위험 없음.
  if (mineOnly || ownerTeamId === null) {
    query = query.eq('user_id', owner);
  } else {
    query = query.or(`user_id.eq.${owner},team_id.eq.${ownerTeamId}`);
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

  const { data: rows, error, count } = await query;
  if (error) {
    console.error('[hospital-images/GET]', error.message);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
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
