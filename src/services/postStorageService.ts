/**
 * Post Storage Service
 * 생성된 글을 Supabase에 저장하는 서비스
 */

import { supabase, getUserIP, hashIP } from '../lib/supabase';

// 글 타입 정의
export type PostType = 'blog' | 'card_news' | 'press_release';

// 저장할 글 데이터 인터페이스
export interface SavePostData {
  hospitalName?: string;
  category?: string;
  doctorName?: string;
  doctorTitle?: string;
  postType: PostType;
  title: string;
  content: string; // HTML 본문
  keywords?: string[];
  topic?: string;
  imageStyle?: string;
  slideCount?: number;
}

// HTML에서 순수 텍스트 추출
const extractPlainText = (html: string): string => {
  // 브라우저 환경에서만 DOMParser 사용
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent?.trim() || '';
  }
  // 서버 환경: 간단한 정규식으로 태그 제거
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// 글자수 계산 (공백 제외)
const countChars = (text: string): number => {
  return text.replace(/\s/g, '').length;
};

// 단어수 계산
const countWords = (text: string): number => {
  return text.split(/\s+/).filter(word => word.length > 0).length;
};

/**
 * 생성된 글을 Supabase에 저장
 */
export const saveGeneratedPost = async (data: SavePostData): Promise<{
  success: boolean;
  postId?: string;
  error?: string;
}> => {
  try {
    console.log('[PostStorage] 글 저장 시작:', {
      postType: data.postType,
      title: data.title?.substring(0, 50)
    });

    // 현재 사용자 정보 가져오기
    const { data: { user } } = await supabase.auth.getUser();
    
    // IP 해시 (비로그인 사용자 식별용)
    let ipHash: string | null = null;
    if (!user) {
      const ip = await getUserIP();
      ipHash = await hashIP(ip);
    }

    // 순수 텍스트 추출
    const plainText = extractPlainText(data.content);
    const charCount = countChars(plainText);
    const wordCount = countWords(plainText);

    // 저장 데이터 구성
    const insertData = {
      user_id: user?.id || null,
      user_email: user?.email || null,
      ip_hash: ipHash,
      hospital_name: data.hospitalName || null,
      category: data.category || null,
      doctor_name: data.doctorName || null,
      doctor_title: data.doctorTitle || null,
      post_type: data.postType,
      title: data.title,
      content: data.content,
      plain_text: plainText,
      keywords: data.keywords || null,
      topic: data.topic || null,
      image_style: data.imageStyle || null,
      slide_count: data.slideCount || null,
      char_count: charCount,
      word_count: wordCount
    };

    // 📊 payload 크기 진단 로그 — Supabase TEXT 컬럼 한도(1GB) 대비 실제 크기 확인
    const contentBytes = data.content.length * 2; // UTF-16 근사
    const plainTextBytes = plainText.length * 2;
    const totalPayloadEstimate = contentBytes + plainTextBytes;
    const hasBlobLeak = data.content.includes('blob:');
    console.info(
      `[PostStorage] 📊 payload 크기 | content=${data.content.length}자(${Math.round(contentBytes / 1024)}KB) | plainText=${plainText.length}자(${Math.round(plainTextBytes / 1024)}KB) | total≈${Math.round(totalPayloadEstimate / 1024)}KB | blob잔류=${hasBlobLeak}`
    );
    if (hasBlobLeak) {
      console.warn('[PostStorage] ⚠️ blob: URL이 content에 포함됨 — 재로드 시 이미지 깨짐 위험');
    }
    if (contentBytes > 4 * 1024 * 1024) {
      console.warn(`[PostStorage] ⚠️ content 크기 ${Math.round(contentBytes / 1024 / 1024)}MB — 대용량 payload 주의`);
    }

    // Supabase에 저장
    const { data: result, error } = await supabase
      .from('generated_posts')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      // 테이블이 없는 경우 안내
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[PostStorage] generated_posts 테이블이 없습니다. SQL 마이그레이션을 실행해주세요.');
        return {
          success: false,
          error: 'generated_posts 테이블이 없습니다. Supabase에서 마이그레이션을 실행해주세요.'
        };
      }
      
      console.error('[PostStorage] 저장 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }

    console.log('[PostStorage] ✅ 글 저장 완료:', result.id);
    return {
      success: true,
      postId: result.id
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PostStorage] 예외 발생:', errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
};

// Admin용: 모든 글 조회 (RPC 함수 호출)
export const getAllGeneratedPosts = async (
  adminPassword: string,
  options?: {
    filterPostType?: PostType;
    filterHospital?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> => {
  try {
    const rpcPromise = supabase.rpc('get_all_generated_posts', {
      admin_password: adminPassword,
      filter_post_type: options?.filterPostType || null,
      filter_hospital: options?.filterHospital || null,
      limit_count: options?.limit || 100,
      offset_count: options?.offset || 0
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('데이터 조회 시간 초과 (15초)')), 15000)
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: any; error: any };

    if (error) {
      console.error('[PostStorage] Admin 조회 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      data: data || []
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PostStorage] Admin 조회 예외:', errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
};

// Admin용: 통계 조회
export const getAdminStats = async (adminPassword: string): Promise<{
  success: boolean;
  stats?: {
    totalPosts: number;
    blogCount: number;
    cardNewsCount: number;
    pressReleaseCount: number;
    uniqueHospitals: number;
    uniqueUsers: number;
    postsToday: number;
    postsThisWeek: number;
    postsThisMonth: number;
  };
  error?: string;
}> => {
  try {
    console.log('[Admin] RPC 호출 시작...');

    // 관리자 인증은 Supabase Auth 세션이 아닌 RPC 비밀번호 기반이므로
    // refreshSession() 호출 불필요 (Auth session missing! 경고 원인이었음)
    // RPC 함수는 SECURITY DEFINER로 anon key만으로도 호출 가능

    // 안전망: Supabase RPC hang 방지 (30초 — 싱가포르 서버 + 대용량 테이블 고려)
    const rpcPromise = supabase.rpc('get_admin_stats', {
      admin_password: adminPassword
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('인증 요청 시간 초과 (30초). 네트워크 연결을 확인하세요.')), 30000)
    );

    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: any; error: any };

    console.log('[Admin] RPC 응답:', { data: !!data, error: !!error });

    if (error) {
      console.error('[PostStorage] Admin 통계 조회 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }

    // RPC가 빈 배열을 반환하면 인증 실패 (비밀번호 불일치)
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        success: false,
        error: '비밀번호가 올바르지 않습니다.'
      };
    }

    const stats = Array.isArray(data) ? data[0] : data;
    return {
      success: true,
      stats: {
        totalPosts: Number(stats.total_posts) || 0,
        blogCount: Number(stats.blog_count) || 0,
        cardNewsCount: Number(stats.card_news_count) || 0,
        pressReleaseCount: Number(stats.press_release_count) || 0,
        uniqueHospitals: Number(stats.unique_hospitals) || 0,
        uniqueUsers: Number(stats.unique_users) || 0,
        postsToday: Number(stats.posts_today) || 0,
        postsThisWeek: Number(stats.posts_this_week) || 0,
        postsThisMonth: Number(stats.posts_this_month) || 0
      }
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PostStorage] Admin 통계 예외:', errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
};

// Admin용: 글 삭제
export const deleteGeneratedPost = async (
  adminPassword: string,
  postId: string
): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const { data, error } = await supabase.rpc('delete_generated_post', {
      admin_password: adminPassword,
      post_id: postId
    });

    if (error) {
      console.error('[PostStorage] Admin 삭제 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: data === true,
      error: data === false ? '삭제할 글을 찾을 수 없습니다.' : undefined
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PostStorage] Admin 삭제 예외:', errorMsg);
    return {
      success: false,
      error: errorMsg
    };
  }
};

// ═══════════════════════════════════════════
// 사용자 히스토리 (SaaS용)
// ═══════════════════════════════════════════

export interface PostHistoryItem {
  id: string;
  title: string;
  post_type: string;
  category: string | null;
  char_count: number;
  created_at: string;
}

/**
 * 현재 로그인한 사용자의 생성 히스토리 조회
 */
export const getMyPostHistory = async (
  limit: number = 20,
  offset: number = 0
): Promise<{
  success: boolean;
  data?: PostHistoryItem[];
  total?: number;
  error?: string;
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const { data, error, count } = await supabase
      .from('generated_posts')
      .select('id, title, post_type, category, char_count, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: 'generated_posts 테이블이 없습니다.' };
      }
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []) as PostHistoryItem[],
      total: count || 0,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 특정 글의 전체 콘텐츠 조회
 */
export const getPostById = async (postId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const { data, error } = await supabase
      .from('generated_posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};
