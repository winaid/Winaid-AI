import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { STORAGE_BUCKET } from '../../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../../lib/hospitalImageService';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const { data: row } = await supabase
    .from('hospital_images')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (!row) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });

  await supabase.storage.from(STORAGE_BUCKET).remove([row.storage_path]);
  await supabase.from('hospital_images').delete().eq('id', id);

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  if (!supabase) return NextResponse.json({ error: 'Supabase 미연결' }, { status: 500 });

  const gate = gateGuestRequest(request, 10);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const body = (await request.json()) as { tags?: string[]; altText?: string };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Array.isArray(body.tags)) updates.tags = body.tags;
  if (typeof body.altText === 'string') updates.alt_text = body.altText;

  const { data: row, error } = await supabase
    .from('hospital_images')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !row) return NextResponse.json({ error: '수정 실패' }, { status: error ? 500 : 404 });

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
