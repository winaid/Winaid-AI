import { NextRequest, NextResponse } from 'next/server';
import { devLog } from '../../../../lib/devLog';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, STORAGE_BUCKET, mimeToExt } from '../../../../lib/hospitalImageService';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
    }
    // gateGuestRequest 가 인증 게이트. 그 아래 storage/DB 쓰기는 service_role 로 RLS 우회.
    const db = supabaseAdmin ?? supabase;

    const gate = gateGuestRequest(request, 100);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const owner = await resolveImageOwner(request);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    devLog('[upload] start', { fileName: file.name, fileSize: file.size, fileType: file.type, owner });

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `invalid_mime: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const ext = mimeToExt(file.type);
    const storagePath = `${owner}/${crypto.randomUUID()}.${ext}`;
    devLog('[upload] storage path:', storagePath);

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadErr) {
      console.error('[upload] storage error:', uploadErr);
      return NextResponse.json({ error: 'storage_error' }, { status: 500 });
    }
    devLog('[upload] storage ok');

    const tags = (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean);
    const altText = (formData.get('altText') as string || '').trim();
    const hospitalName = (formData.get('hospitalName') as string || '').trim() || null;

    // owner 의 team_id 를 INSERT 에 명시 첨부. DB 트리거가 backup 으로도 채움.
    let ownerTeamId: number | null = null;
    if (owner !== 'guest') {
      const { data: prof } = await db
        .from('profiles')
        .select('team_id')
        .eq('id', owner)
        .maybeSingle();
      ownerTeamId = (prof?.team_id ?? null) as number | null;
    }

    const { data: row, error: dbErr } = await db
      .from('hospital_images')
      .insert({
        user_id: owner,
        team_id: ownerTeamId,
        hospital_name: hospitalName,
        storage_path: storagePath,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        tags,
        alt_text: altText,
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[upload] db error:', dbErr);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    devLog('[upload] db ok, id:', row.id);

    const { data: { publicUrl } } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      id: row.id,
      userId: row.user_id,
      storagePath: row.storage_path,
      originalFilename: row.original_filename,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      tags: row.tags || [],
      altText: row.alt_text || '',
      usageCount: 0,
      createdAt: row.created_at,
      publicUrl,
    }, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.slice(0, 500) : '';
    console.error('[upload] UNCAUGHT:', message, stack);
    return NextResponse.json({ error: 'uncaught' }, { status: 500 });
  }
}
