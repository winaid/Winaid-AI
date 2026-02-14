/**
 * geminiClient.ts - Gemini API 핵심 인프라
 *
 * API 키 관리, 클라이언트 생성, callGemini 래퍼 등
 * geminiService.ts에서 분리된 코어 모듈
 */
import { GoogleGenAI } from "@google/genai";
import {
  initializeApiKeyManager,
  getApiKey,
  handleApiFailure,
  handleApiSuccess,
  logApiKeyStatus,
} from "./apiKeyManager";

// 🎯 Gemini API 상수
export const GEMINI_MODEL = {
  PRO: 'gemini-3-pro-preview',      // 글 생성, 채팅 보정 등 고품질 작업
  FLASH: 'gemini-3-flash-preview',  // 검색, 자동 보정 등 빠른 작업
} as const;

export const TIMEOUTS = {
  GENERATION: 300000,      // 5분
  IMAGE_GENERATION: 180000, // 3분
  QUICK_OPERATION: 60000,   // 60초 (임베딩 API 타임아웃 대응)
} as const;

// 🚀 Gemini API 호출 설정 인터페이스
export interface GeminiCallConfig {
  prompt: string;
  model?: string;
  googleSearch?: boolean;
  responseType?: 'json' | 'text';
  schema?: any;
  timeout?: number;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

// 🔑 Gemini API 키 목록 (환경변수에서 로드)
export const getApiKeysFromEnv = (): string[] => {
  const keys: string[] = [];

  // 환경변수에서 API 키들 가져오기
  const key1 = import.meta.env.VITE_GEMINI_API_KEY;
  const key2 = import.meta.env.VITE_GEMINI_API_KEY_2;
  const key3 = import.meta.env.VITE_GEMINI_API_KEY_3;

  if (key1) keys.push(key1);
  if (key2) keys.push(key2);
  if (key3) keys.push(key3);

  // localStorage에서도 확인 (사용자가 직접 입력한 경우)
  const localKey = localStorage.getItem('GEMINI_API_KEY');
  if (localKey && !keys.includes(localKey)) {
    keys.push(localKey);
  }

  return keys;
};

export const GEMINI_API_KEYS = getApiKeysFromEnv();

// API 키 매니저 초기화
if (GEMINI_API_KEYS.length > 0) {
  initializeApiKeyManager(GEMINI_API_KEYS);
  console.log('🔐 다중 API 키 시스템 활성화 (총 ' + GEMINI_API_KEYS.length + '개)');
  logApiKeyStatus();
} else {
  console.warn('⚠️ 환경변수에 API 키가 설정되지 않았습니다. 사용자가 직접 입력해야 합니다.');
}

/**
 * Gemini API 호출 래퍼 (자동 폴백 및 재시도)
 */
export async function callGeminiWithFallback<T>(
  apiCall: (client: GoogleGenAI) => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  let lastError: any = null;
  let currentKey: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      currentKey = getApiKey();

      if (!currentKey) {
        throw new Error('사용 가능한 API 키가 없습니다');
      }

      const client = new GoogleGenAI({ apiKey: currentKey });
      const result = await apiCall(client);

      // 성공 시 키 상태 업데이트
      handleApiSuccess(currentKey);

      return result;
    } catch (error: any) {
      lastError = error;

      // 할당량 초과 에러 확인
      const isQuotaError =
        error?.message?.includes('quota') ||
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.status === 429;

      if (isQuotaError && currentKey) {
        console.warn(`⚠️ API 할당량 초과 (시도 ${attempt + 1}/${maxRetries})`);
        handleApiFailure(currentKey, error);
        logApiKeyStatus();

        // 다음 시도 전 짧은 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // 할당량 문제가 아니면 즉시 에러 던지기
        throw error;
      }
    }
  }

  // 모든 재시도 실패
  console.error('❌ 모든 API 키에서 요청 실패');
  logApiKeyStatus();
  throw lastError;
}

export const getAiClient = () => {
  // 1순위: 다중 API 키 시스템에서 사용 가능한 키 가져오기
  let apiKey = getApiKey();

  // 2순위: 환경변수 (Cloudflare Pages)
  if (!apiKey) {
    apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  }

  // 3순위: localStorage (사용자 입력)
  if (!apiKey) {
    apiKey = localStorage.getItem('GEMINI_API_KEY');
  }

  if (!apiKey) {
    throw new Error("API Key가 설정되지 않았습니다. API Key를 입력해주세요.");
  }

  return new GoogleGenAI({ apiKey });
};

// AI Provider 설정 읽기 - Gemini만 사용
export const getAiProviderSettings = (): { textGeneration: 'gemini', imageGeneration: 'gemini' } => {
  return { textGeneration: 'gemini', imageGeneration: 'gemini' };
};

/**
 * Gemini API 통합 호출 함수
 * - 모델 선택, 타임아웃, JSON/Text 응답 처리를 하나로 통합
 */
export async function callGemini(config: GeminiCallConfig): Promise<any> {
  const ai = getAiClient();

  const apiConfig: any = {
    model: config.model || GEMINI_MODEL.PRO,
    contents: config.systemPrompt
      ? `${config.systemPrompt}\n\n${config.prompt}`
      : config.prompt,
    config: {
      temperature: config.temperature || 0.85,  // 유려한 글쓰기를 위한 온도
      topP: config.topP || 0.95,
      maxOutputTokens: config.maxOutputTokens || 8192
    }
  };

  // Google Search 설정
  if (config.googleSearch) {
    apiConfig.config.tools = [{ googleSearch: {} }];
  }

  // 응답 타입 설정
  if (config.responseType === 'json') {
    apiConfig.config.responseMimeType = "application/json";
    if (config.schema) {
      apiConfig.config.responseSchema = config.schema;
    }
  } else {
    apiConfig.config.responseMimeType = "text/plain";
  }

  // 타임아웃 처리
  const timeout = config.timeout || TIMEOUTS.GENERATION;

  try {
    const result: any = await Promise.race([
      ai.models.generateContent(apiConfig),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), timeout)
      )
    ]);

    // 🚨 응답 검증
    if (!result) {
      console.error('❌ Gemini가 null/undefined 응답 반환');
      throw new Error('Gemini가 빈 응답을 반환했습니다. 다시 시도해주세요.');
    }

    // 디버깅: 응답 구조 확인
    console.log('📦 Gemini 응답 타입:', typeof result);
    console.log('📦 Gemini 응답 키:', Object.keys(result || {}));
    console.log('📦 result.text 존재:', !!result.text);
    console.log('📦 result.text 길이:', result.text?.length || 0);

    // 🔍 candidates 구조 확인 (Gemini SDK 응답 구조)
    if (result.candidates && result.candidates.length > 0) {
      console.log('📦 candidates[0] 구조:', Object.keys(result.candidates[0] || {}));
      const firstCandidate = result.candidates[0];
      if (firstCandidate.content) {
        console.log('📦 content 구조:', Object.keys(firstCandidate.content || {}));
        if (firstCandidate.content.parts) {
          console.log('📦 parts 개수:', firstCandidate.content.parts.length);
          console.log('📦 parts[0] 구조:', Object.keys(firstCandidate.content.parts[0] || {}));
        }
      }
    }

    // 🚨 responseType에 따라 적절한 값 반환
    if (config.responseType === 'text') {
      // text 타입일 때는 문자열 반환
      const textContent = result.text || '';
      if (!textContent || textContent.trim().length === 0) {
        console.error('❌ Gemini text 응답이 비어있음');
        console.error('   - result.text:', result.text);
        console.error('   - candidates 개수:', result.candidates?.length || 0);

        // candidates에서 직접 텍스트 추출 시도
        if (result.candidates && result.candidates.length > 0) {
          const candidate = result.candidates[0];
          if (candidate.content?.parts && candidate.content.parts.length > 0) {
            const extractedText = candidate.content.parts
              .map((part: any) => part.text || '')
              .join('');

            if (extractedText && extractedText.trim().length > 0) {
              console.log('✅ candidates에서 텍스트 추출 성공:', extractedText.length, '자');
              return extractedText;
            }
          }
        }

        throw new Error('Gemini가 빈 텍스트 응답을 반환했습니다. 다시 시도해주세요.');
      }
      return textContent;
    } else if (config.responseType === 'json') {
      // json 타입일 때는 파싱된 객체 반환
      const textContent = result.text || '{}';
      if (!textContent || textContent.trim().length === 0) {
        console.error('❌ Gemini JSON 응답이 비어있음');
        throw new Error('Gemini가 빈 JSON 응답을 반환했습니다. 다시 시도해주세요.');
      }
      try {
        return JSON.parse(textContent);
      } catch (e) {
        console.warn('⚠️ JSON 파싱 실패, 원본 반환:', textContent.substring(0, 100));
        console.error('   - 파싱 에러:', e);
        return result;
      }
    } else {
      // responseType이 없으면 전체 객체 반환 (기존 동작 유지)
      return result;
    }
  } catch (error) {
    console.error('❌ Gemini API 호출 실패:', error);
    // 에러 모니터링 (비동기, 실패해도 무시)
    import('./errorMonitoringService').then(({ trackError }) => {
      trackError('gemini_api', error, {
        model: config.model,
        responseType: config.responseType,
        promptLength: config.prompt?.length,
      }, 'high');
    }).catch(() => {});
    throw error;
  }
}
