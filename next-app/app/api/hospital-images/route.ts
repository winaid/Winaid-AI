import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { checkAuth } from '../../../lib/apiAuth';
import { STORAGE_BUCKET } from '../../../lib/hospitalImageService';
import type { HospitalImage } from '../../../lib/hospitalImageService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ images: [], total: 0 });
  }

  const auth = await checkAuth(request);
  if (auth) return auth;

  const params = request.nextUrl.searchParams;
  const userId = params.get('userId');
  const hospitalName = params.get('hospitalName');
  const tagsParam = params.get('tags');
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

  let query = supabase
    .from('hospital_images')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq('user_id', userId);
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
    return NextResponse.json({ error: `조회 실패: ${error.message}` }, { status: 500 });
  }

  const images: HospitalImage[] = (rows || []).map((r) => {
    const { data: { publicUrl } } = supabase!.storage.from(STORAGE_BUCKET).getPublicUrl(r.storage_path);
    return {
      id: r.id,
      userId: r.user_id,
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
