import { NextRequest, NextResponse } from 'next/server';
import { devLog } from '../../../../lib/devLog';
import { supabase } from '@winaid/blog-core';
import { checkAuth } from '../../../../lib/apiAuth';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, STORAGE_BUCKET, mimeToExt } from '../../../../lib/hospitalImageService';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
    }

    const auth = await checkAuth(request);
    if (auth) return auth;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = (formData.get('userId') as string || '').trim() || 'guest';

    if (!file) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    devLog('[upload] start', { fileName: file.name, fileSize: file.size, fileType: file.type, userId });

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `invalid_mime: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // 매직 넘버 검증 (실제 이미지 포맷) — 확장자 위조 방어
    const isPng = buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isJpeg = buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    const isWebP = buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    const isGif = buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    if (!isPng && !isJpeg && !isWebP && !isGif) {
      return NextResponse.json({ error: 'invalid_image_format' }, { status: 400 });
    }

    // 최소 크기 하한 (너무 작은 파일은 placeholder·corrupt 가능성)
    if (buf.length < 5 * 1024) {
      return NextResponse.json({ error: 'image_too_small' }, { status: 400 });
    }

    const ext = mimeToExt(file.type);
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    devLog('[upload] storage path:', storagePath);
    const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadErr) {
      console.error('[upload] storage error:', uploadErr);
      return NextResponse.json({ error: `storage_error: ${uploadErr.message}` }, { status: 500 });
    }
    devLog('[upload] storage ok');

    const tags = (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean);
    const altText = (formData.get('altText') as string || '').trim();
    const hospitalName = (formData.get('hospitalName') as string || '').trim() || null;

    // userId 의 team_id 를 INSERT 에 명시 첨부. DB 트리거가 backup 으로도 채움.
    let ownerTeamId: number | null = null;
    if (userId !== 'guest') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', userId)
        .maybeSingle();
      ownerTeamId = (prof?.team_id ?? null) as number | null;
    }

    const { data: row, error: dbErr } = await supabase
      .from('hospital_images')
      .insert({
        user_id: userId,
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
      return NextResponse.json({ error: `db_error: ${dbErr.message}` }, { status: 500 });
    }
    devLog('[upload] db ok, id:', row.id);

    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

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
    return NextResponse.json({ error: `uncaught: ${message}` }, { status: 500 });
  }
}
