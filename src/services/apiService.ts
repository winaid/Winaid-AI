// [LEGACY] Cloudflare KV 콘텐츠 저장 서비스
//
// 이 파일의 함수들은 Cloudflare KV 기반 /api/content/* 엔드포인트를 호출한다.
// 2024-03 기준 실사용 호출부가 없음:
//   - saveContentToServer: useContentGeneration에서 호출 제거됨
//   - deleteAllContent / getContentList: 호출부 없음 (admin은 Supabase 경로 사용)
//
// 생성 결과 저장은 Supabase generated_posts (postStorageService) 단일 경로.
// 이 파일은 타입 export(SaveContentRequest, SaveContentResponse)만 아직 참조될 수 있으므로 유지.
// TODO: 타입 참조 정리 후 파일 삭제 가능
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface SaveContentRequest {
  title: string;
  content: string;
  category: string;
  postType: 'blog' | 'card_news' | 'press_release';
  metadata?: {
    keywords?: string;
    imageUrls?: string[];
    seoScore?: number;
    aiSmellScore?: number;
  };
}

export interface SaveContentResponse {
  success: boolean;
  id?: string;
  error?: string;
}

/** @deprecated Cloudflare KV retire — 호출부 제거됨 (2024-03) */
export const saveContentToServer = async (data: SaveContentRequest): Promise<SaveContentResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const result = await response.json() as { id?: string };
    return {
      success: true,
      id: result.id,
    };
  } catch (error: any) {
    console.error('콘텐츠 저장 실패:', error);
    return {
      success: false,
      error: error.message || '저장 중 오류가 발생했습니다.',
    };
  }
};

/** @deprecated Cloudflare KV retire — 호출부 없음 (2024-03) */
export const deleteAllContent = async (): Promise<SaveContentResponse> => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const adminToken = sessionStorage.getItem('ADMIN_TOKEN');
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/content/delete-all`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const result = await response.json() as { deletedCount?: number };
    return {
      success: true,
      id: result.deletedCount?.toString(),
    };
  } catch (error: any) {
    console.error('콘텐츠 삭제 실패:', error);
    return {
      success: false,
      error: error.message || '삭제 중 오류가 발생했습니다.',
    };
  }
};

/** @deprecated Cloudflare KV retire — 호출부 없음 (2024-03) */
export const getContentList = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/list`);
    
    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const result = await response.json() as { data?: any[] };
    return result.data || [];
  } catch (error) {
    console.error('콘텐츠 목록 가져오기 실패:', error);
    return [];
  }
};

