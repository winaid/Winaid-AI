import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, STORAGE_BUCKET, mimeToExt } from '../../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../../lib/hospitalImageService';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: '이미지 라이브러리를 사용하려면 Supabase 연결이 필요합니다.' }, { status: 500 });
  }

  // 인증: 쿠키에서 userId 추출
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `허용되지 않는 파일 형식입니다. (${ALLOWED_MIME_TYPES.join(', ')})` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '파일 크기가 10MB를 초과합니다.' }, { status: 400 });
  }

  const ext = mimeToExt(file.type);
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `Storage 업로드 실패: ${uploadErr.message}` }, { status: 500 });
  }

  const tags = (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean);
  const altText = (formData.get('altText') as string || '').trim();
  const hospitalName = (formData.get('hospitalName') as string || '').trim() || undefined;
  const width = parseInt(formData.get('width') as string || '', 10) || undefined;
  const height = parseInt(formData.get('height') as string || '', 10) || undefined;

  const { data: row, error: dbErr } = await supabase
    .from('hospital_images')
    .insert({
      user_id: user.id,
      hospital_name: hospitalName,
      storage_path: storagePath,
      original_filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      width,
      height,
      tags,
      alt_text: altText,
    })
    .select()
    .single();

  if (dbErr || !row) {
    return NextResponse.json({ error: `DB 저장 실패: ${dbErr?.message}` }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const image: HospitalImage = {
    id: row.id,
    userId: row.user_id,
    hospitalName: row.hospital_name,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    tags: row.tags || [],
    altText: row.alt_text || '',
    aiDescription: row.ai_description,
    usageCount: row.usage_count || 0,
    createdAt: row.created_at,
    publicUrl,
  };

  return NextResponse.json(image, { status: 201 });
}
