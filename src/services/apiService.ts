// API 서버에 콘텐츠 저장하는 서비스

// Cloudflare Pages Functions 사용 - 같은 도메인에서 API 제공
// 개발: http://localhost:3000, 프로덕션: https://story-darugi.com
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

/**
 * 생성된 콘텐츠를 API 서버에 저장
 */
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

/**
 * 저장된 모든 콘텐츠 삭제 (새 글 생성 전 호출)
 */
export const deleteAllContent = async (): Promise<SaveContentResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/delete-all`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
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

/**
 * 저장된 콘텐츠 목록 가져오기
 */
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

/**
 * API 키를 서버에 저장
 */
export const saveApiKeys = async (geminiKey?: string, openaiKey?: string): Promise<SaveContentResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        geminiKey,
        openaiKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    await response.json(); // 응답 확인용
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('API 키 저장 실패:', error);
    return {
      success: false,
      error: error.message || 'API 키 저장 중 오류가 발생했습니다.',
    };
  }
};

/**
 * 서버에서 API 키 가져오기
 */
export const getApiKeys = async (): Promise<{ gemini: string | null; openai: string | null }> => {
  try {
    const headers: Record<string, string> = {};
    const adminToken = sessionStorage.getItem('ADMIN_TOKEN');
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/api-keys/get`, { headers });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const result = await response.json() as { apiKeys?: { gemini: string | null; openai: string | null } };
    return result.apiKeys || { gemini: null, openai: null };
  } catch (error) {
    console.error('API 키 가져오기 실패:', error);
    return { gemini: null, openai: null };
  }
};

/**
 * API 키 삭제
 */
export const deleteApiKeys = async (type?: 'gemini' | 'openai'): Promise<SaveContentResponse> => {
  try {
    const url = type 
      ? `${API_BASE_URL}/api/api-keys/delete?type=${type}`
      : `${API_BASE_URL}/api/api-keys/delete`;
      
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('API 키 삭제 실패:', error);
    return {
      success: false,
      error: error.message || 'API 키 삭제 중 오류가 발생했습니다.',
    };
  }
};
