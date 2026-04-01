/**
 * 내부용 피드백 서비스 — internal_feedbacks 테이블 CRUD
 *
 * 페이지 단위 피드백 (각 기록별 댓글이 아님).
 * 로그인/비로그인 모두 작성 가능 (비로그인 시 user_id='anonymous').
 * 3/31 이후 로그인 연동 시 작성자 식별 강화 예정.
 */
import { supabase } from './supabase';

export interface InternalFeedback {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  page: string;
  image_urls?: string[];
  created_at: string;
}

/** 특정 페이지의 피드백 목록 (오래된 순, limit/offset 지원) */
export async function listFeedbacks(
  page?: string,
  options?: { limit?: number; offset?: number },
): Promise<InternalFeedback[]> {
  if (!supabase) return [];
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  let query = supabase
    .from('internal_feedbacks')
    .select('id, user_id, user_name, content, page, image_urls, created_at')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (page) query = query.eq('page', page);
  const { data, error } = await query;
  if (error) {
    console.error('[feedbackService] listFeedbacks error:', error.message);
    return [];
  }
  return (data || []) as InternalFeedback[];
}

/** 피드백 작성 */
export async function addFeedback(
  page: string,
  userId: string,
  userName: string,
  content: string,
  imageUrls?: string[],
): Promise<{ success: boolean; feedback?: InternalFeedback; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  if (!page || typeof page !== 'string' || !page.trim()) return { success: false, error: '페이지 정보가 필요합니다.' };
  if (!content.trim()) return { success: false, error: '내용을 입력하세요.' };
  if (content.length > 10000) return { success: false, error: '피드백은 10,000자 이내로 작성해주세요.' };

  const insertData: Record<string, unknown> = {
    user_id: userId,
    user_name: userName,
    content: content.trim(),
    page,
  };
  if (imageUrls && imageUrls.length > 0) {
    insertData.image_urls = imageUrls;
  }

  const { data, error } = await supabase
    .from('internal_feedbacks')
    .insert(insertData)
    .select('id, user_id, user_name, content, page, image_urls, created_at')
    .single();

  if (error) {
    console.error('[feedbackService] addFeedback error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, feedback: data as InternalFeedback };
}

/** 본인 피드백 삭제 */
export async function deleteFeedback(feedbackId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('internal_feedbacks')
    .delete()
    .eq('id', feedbackId);
  if (error) {
    console.error('[feedbackService] deleteFeedback error:', error.message);
    return false;
  }
  return true;
}

// ── 이미지 업로드 ──

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/** 피드백 이미지를 Supabase Storage에 업로드 → public URL 반환 */
export async function uploadFeedbackImage(file: File, userId: string): Promise<string | null> {
  if (!supabase) return null;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    console.warn('[feedbackService] 허용되지 않는 파일 형식:', file.type);
    return null;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    console.warn('[feedbackService] 파일 크기 초과:', file.size);
    return null;
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `feedback/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const { error: uploadErr } = await supabase.storage
      .from('feedback-images')
      .upload(fileName, file, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error('[feedbackService] 업로드 실패:', uploadErr.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from('feedback-images').getPublicUrl(fileName);
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('[feedbackService] 업로드 예외:', err);
    return null;
  }
}

// ── AI 분석 ──

export interface FeedbackCluster {
  theme: string;
  summary: string;
  count: number;
  examples: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface FeedbackAnalysis {
  clusters: FeedbackCluster[];
  overall: string;
}

/** 피드백 목록을 AI로 분석 — 중복/유사 묶기, 주제별 요약, 우선순위 */
export async function analyzeFeedbacks(
  feedbacks: InternalFeedback[],
): Promise<{ success: boolean; analysis?: FeedbackAnalysis; error?: string }> {
  if (feedbacks.length === 0) {
    return {
      success: true,
      analysis: { clusters: [], overall: '분석할 피드백이 없습니다.' },
    };
  }

  // 피드백을 번호 + 작성자 + 내용으로 직렬화
  const numbered = feedbacks.map(
    (fb, i) => `[${i + 1}] ${fb.user_name}: ${fb.content}`,
  );

  const prompt = `아래는 내부 피드백 ${feedbacks.length}건이다.

${numbered.join('\n')}

위 피드백을 분석해서 아래 JSON 형식으로만 응답해라. 한국어로 작성하라.

규칙:
1. 의미상 비슷한 피드백을 그룹(cluster)으로 묶어라. 단순 키워드 일치가 아니라 의도/요청이 비슷하면 같은 그룹이다.
2. 한 피드백이 여러 주제면 가장 주된 주제 하나에만 넣어라.
3. 1건만 있는 피드백도 단독 그룹으로 만들어라.
4. priority: 여러 사람이 반복하거나 긴급한 불만이면 high, 개선 요청이면 medium, 사소하면 low.
5. examples에는 대표적인 원문 피드백을 최대 3개까지만 넣어라.
6. overall에는 전체 피드백 트렌드를 2~3문장으로 요약해라.
7. 피드백이 1건뿐이면 해당 내용으로 cluster 1개만 만들어라.`;

  try {
    const resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemInstruction: '너는 사용자 피드백 분석 전문가다. JSON만 응답하라.',
        responseType: 'json',
        schema: {
          type: 'object',
          properties: {
            clusters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  theme: { type: 'string' },
                  summary: { type: 'string' },
                  count: { type: 'integer' },
                  examples: { type: 'array', items: { type: 'string' } },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['theme', 'summary', 'count', 'examples', 'priority'],
              },
            },
            overall: { type: 'string' },
          },
          required: ['clusters', 'overall'],
        },
        temperature: 0.3,
        maxOutputTokens: 4096,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { success: false, error: `AI 호출 실패 (${resp.status}): ${err.slice(0, 200)}` };
    }

    const json = await resp.json() as { text?: string; error?: string };
    if (json.error) return { success: false, error: json.error };
    if (!json.text) return { success: false, error: 'AI 응답이 비어 있습니다.' };

    let analysis: FeedbackAnalysis;
    try {
      analysis = JSON.parse(json.text) as FeedbackAnalysis;
    } catch {
      return { success: false, error: 'AI 응답 JSON 파싱 실패' };
    }
    return { success: true, analysis };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || '분석 중 오류' };
  }
}
