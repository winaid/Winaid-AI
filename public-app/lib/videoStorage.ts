/**
 * 영상 결과물 영구 저장 — Supabase Storage + video_outputs 테이블
 *
 * 정책:
 *  - 로그인 사용자만 저장 (RLS로 격리)
 *  - 게스트/Supabase 미설정 → null 반환 (호출부는 blob URL fallback)
 *  - 7일 후 자동 만료 (조회 시 expires_at > now() 필터)
 *  - 저장 실패해도 throw 안 함 — 다운로드는 blob URL로 가능
 *
 * 응답 객체는 snake_case (postStorage / generated_posts와 동일 컨벤션)
 */

import { supabase, isSupabaseConfigured, getSessionSafe } from './supabase';

const BUCKET = 'video-outputs';
const RETENTION_DAYS = 7;

export type VideoOutputType = 'pipeline' | 'ai_shorts' | 'card_to_shorts';

export interface SavedVideo {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_path: string;
  file_size: number;
  duration: number;
  type: VideoOutputType;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

export interface SaveVideoOptions {
  fileName: string;
  type: VideoOutputType;
  duration: number;
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────
// 저장
// ──────────────────────────────────────────────────────────────────

export async function saveVideoToStorage(
  blob: Blob,
  options: SaveVideoOptions,
): Promise<SavedVideo | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { userId } = await getSessionSafe();
    if (!userId) return null; // 게스트는 저장 안 함

    const safeName = sanitizeFileName(options.fileName);
    const finalName = safeName.toLowerCase().endsWith('.mp4') ? safeName : `${safeName}.mp4`;
    const filePath = `${userId}/${Date.now()}_${finalName}`;

    // 1) Storage 업로드
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, blob, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.warn('[videoStorage] 업로드 실패:', uploadError.message);
      return null;
    }

    // 2) 공개 URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const fileUrl = urlData.publicUrl;

    // 3) DB 메타데이터 (실패해도 Storage URL은 반환)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const insertRow = {
      user_id: userId,
      file_name: finalName,
      file_url: fileUrl,
      file_path: filePath,
      file_size: blob.size,
      duration: options.duration,
      type: options.type,
      metadata: options.metadata || {},
      expires_at: expiresAt.toISOString(),
    };

    const { data, error: dbError } = await supabase
      .from('video_outputs')
      .insert(insertRow)
      .select('id, created_at')
      .single();

    if (dbError || !data) {
      console.warn('[videoStorage] DB 저장 실패 (Storage URL은 사용 가능):', dbError?.message);
      // 임시 ID로 반환 — 호출부는 file_url만 사용하면 됨
      return {
        id: `local_${Date.now()}`,
        ...insertRow,
        created_at: now.toISOString(),
      } as SavedVideo;
    }

    return {
      id: data.id as string,
      ...insertRow,
      created_at: data.created_at as string,
    } as SavedVideo;
  } catch (err) {
    console.warn('[videoStorage] 예외:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// 조회 (만료된 것 자동 필터)
// ──────────────────────────────────────────────────────────────────

export async function listVideoHistory(limit = 10): Promise<SavedVideo[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { userId } = await getSessionSafe();
    if (!userId) return [];

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('video_outputs')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[videoStorage] 조회 실패:', error.message);
      return [];
    }
    return (data || []) as SavedVideo[];
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────
// 삭제 (Storage + DB)
// ──────────────────────────────────────────────────────────────────

export async function deleteVideoFromHistory(id: string, filePath?: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { userId } = await getSessionSafe();
    if (!userId) return false;

    let path = filePath;

    // file_path를 못 받았으면 DB에서 가져옴
    if (!path) {
      const { data } = await supabase
        .from('video_outputs')
        .select('file_path')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      path = (data?.file_path as string | undefined) || undefined;
    }

    // Storage 삭제 (실패해도 DB는 삭제 시도)
    if (path) {
      const { error: storageErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (storageErr) console.warn('[videoStorage] Storage 삭제 실패:', storageErr.message);
    }

    // DB 삭제 (RLS로 자동으로 본인 것만)
    const { error: dbErr } = await supabase
      .from('video_outputs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (dbErr) {
      console.warn('[videoStorage] DB 삭제 실패:', dbErr.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────────

/** 한글/영문/숫자/기본 문자만 허용, 100자 제한 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9가-힣_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100) || 'video';
}

/** 다운로드용 친절한 파일명 생성 — 타입별 한글 prefix + 날짜 */
export function generateVideoFileName(type: VideoOutputType, suffix?: string): string {
  const date = new Date().toISOString().slice(0, 10); // 2026-04-10
  const prefix = ({
    pipeline: '영상편집',
    ai_shorts: 'AI쇼츠',
    card_to_shorts: '카드뉴스쇼츠',
  } as const)[type];
  const suf = suffix ? `_${sanitizeFileName(suffix)}` : '';
  return `${prefix}_${date}${suf}.mp4`;
}
