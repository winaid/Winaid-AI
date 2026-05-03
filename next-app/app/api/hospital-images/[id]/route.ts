import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { checkAuth } from '../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { STORAGE_BUCKET } from '../../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../../lib/hospitalImageService';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const auth = await checkAuth(request);
  if (auth) return auth;

  const owner = await resolveImageOwner(request);
  const { id } = await ctx.params;
  // checkAuth 통과 + .eq('user_id', owner) 로 소유권 강제. RLS 우회.
  const db = supabaseAdmin ?? supabase;

  // soft delete: is_deleted=true 로 표시만. 파일 물리 삭제는 관리자 전용 cleanup 작업
  // (별도). 기존 블로그의 <img src> 는 Storage 파일 유지되므로 계속 유효.
  const { data: updated, error } = await db
    .from('hospital_images')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', owner)
    .eq('is_deleted', false)
    .select();

  if (error) {
    console.error(`[hospital-images/DELETE] update failed: ${error.message}`);
    return NextResponse.json({ error: 'db_update_failed' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    console.warn(`[hospital-images/DELETE] not found or ownership mismatch (id=${id} owner=${owner})`);
    return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const auth = await checkAuth(request);
  if (auth) return auth;

  const owner = await resolveImageOwner(request);
  const { id } = await ctx.params;
  const body = (await request.json()) as { tags?: string[]; altText?: string };
  // checkAuth 통과 + .eq('user_id', owner) 로 소유권 강제. RLS 우회.
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

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  if (!row) {
    console.warn(`[hospital-images/PATCH] not found or ownership mismatch (id=${id} owner=${owner})`);
    return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(row.storage_path);
  const image: HospitalImage = {
    id: row.id, userId: row.user_id, hospitalName: row.hospital_name,
    storagePath: row.storage_path, originalFilename: row.original_filename,
    fileSize: row.file_size, mimeType: row.mime_type, width: row.width, height: row.height,
    tags: row.tags || [], altText: row.alt_text || '', aiDescription: row.ai_description,
    usageCount: row.usage_count || 0, createdAt: row.created_at, publicUrl,
  };

  return NextResponse.json(image);
}
