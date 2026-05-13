import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { STORAGE_BUCKET } from '../../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../../lib/hospitalImageService';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

async function _wrappedDELETE(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const owner = await resolveImageOwner(request);
  const { id } = await ctx.params;
  // gateGuestRequest + 명시적 user_id 비교로 소유권 강제. RLS 우회.
  const db = supabaseAdmin ?? supabase;
  const { data: row } = await db
    .from('hospital_images')
    .select('storage_path, user_id')
    .eq('id', id)
    .single();

  if (!row) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });

  if (row.user_id !== owner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 순서: DB 먼저 → storage. DB 실패 시 storage 는 남되 row 가 정상이라 재시도 가능.
  // 반대 순서일 경우 storage 만 사라지고 row 가 남아 UI 깨짐 (썸네일 404).
  const { error: dbErr } = await db
    .from('hospital_images')
    .delete()
    .eq('id', id)
    .eq('user_id', owner);
  if (dbErr) {
    console.error('[hospital-images/DELETE] db error:', dbErr.message, 'id:', id);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  // storage remove 실패는 swallow — DB 가 사라졌으므로 사용자에 dangling 안 보임.
  // 정기 cleanup 으로 orphan storage 제거 검토.
  const { error: rmErr } = await db.storage.from(STORAGE_BUCKET).remove([row.storage_path]);
  if (rmErr) {
    console.warn('[hospital-images/DELETE] storage orphan:', rmErr.message, 'path:', row.storage_path);
  }

  return NextResponse.json({ success: true });
}

async function _wrappedPATCH(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const owner = await resolveImageOwner(request);
  const { id } = await ctx.params;
  const body = (await request.json()) as { tags?: string[]; altText?: string };
  const db = supabaseAdmin ?? supabase;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Array.isArray(body.tags)) updates.tags = body.tags;
  if (typeof body.altText === 'string') updates.alt_text = body.altText;

  const { data: row, error } = await db
    .from('hospital_images')
    .update(updates)
    .eq('id', id)
    .eq('user_id', owner)
    .select()
    .single();

  if (error || !row) return NextResponse.json({ error: '수정 실패' }, { status: error ? 500 : 404 });

  const { data: { publicUrl } } = db.storage.from(STORAGE_BUCKET).getPublicUrl(row.storage_path);
  const image: HospitalImage = {
    id: row.id, userId: row.user_id, hospitalName: row.hospital_name,
    storagePath: row.storage_path, originalFilename: row.original_filename,
    fileSize: row.file_size, mimeType: row.mime_type, width: row.width, height: row.height,
    tags: row.tags || [], altText: row.alt_text || '', aiDescription: row.ai_description,
    usageCount: row.usage_count || 0, createdAt: row.created_at, publicUrl,
  };

  return NextResponse.json(image);
}

export const DELETE = withApiError(_wrappedDELETE, { route: '/api/hospital-images/[id]' });
export const PATCH = withApiError(_wrappedPATCH, { route: '/api/hospital-images/[id]' });
