import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
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

    console.log('[upload] start', { fileName: file.name, fileSize: file.size, fileType: file.type, userId });

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `invalid_mime: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const ext = mimeToExt(file.type);
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    console.log('[upload] storage path:', storagePath);

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadErr) {
      console.error('[upload] storage error:', uploadErr);
      return NextResponse.json({ error: `storage_error: ${uploadErr.message}` }, { status: 500 });
    }
    console.log('[upload] storage ok');

    const tags = (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean);
    const altText = (formData.get('altText') as string || '').trim();
    const hospitalName = (formData.get('hospitalName') as string || '').trim() || null;

    const { data: row, error: dbErr } = await supabase
      .from('hospital_images')
      .insert({
        user_id: userId,
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
    console.log('[upload] db ok, id:', row.id);

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
