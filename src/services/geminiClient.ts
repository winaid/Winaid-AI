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
  PRO: 'gemini-3.1-pro-preview',           // 글 생성 등 고품질 작업 (3.1 Pro)
  FLASH: 'gemini-3-flash-preview',         // 검색, 자동 보정, 채팅 등 빠른 작업 (3 Flash)
  FLASH_LITE: 'gemini-3.1-flash-lite-preview', // 프롬프트 추천 등 경량 작업 (3.1 Flash Lite)
} as const;

export const TIMEOUTS = {
  GENERATION: 120000,       // 2분 (기존 5분 → 단축)
  CONTENT_GENERATION: 120000, // 2분
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
  systemInstruction?: string;  // Gemini API의 별도 system instruction으로 전송
  temperature?: number;
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high';  // Gemini thinking budget
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

export const getApiKeyValue = (): string => {
  let apiKey = getApiKey();
  if (!apiKey) apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) apiKey = localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) throw new Error("API Key가 설정되지 않았습니다.");
  return apiKey;
};

// AI Provider 설정 읽기 - Gemini만 사용
export const getAiProviderSettings = (): { textGeneration: 'gemini', imageGeneration: 'gemini' } => {
  return { textGeneration: 'gemini', imageGeneration: 'gemini' };
};

/**
 * 사용자 친화적 에러 메시지 변환
 */
export function getKoreanErrorMessage(error: any): string {
  const msg = error?.message || '';
  const status = error?.status;

  if (status === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('limit')) {
    return '⚠️ API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_NETWORK')) {
    return '📡 인터넷 연결이 불안정합니다. 네트워크 상태를 확인해주세요.';
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return '⏱️ 응답 시간이 초과되었습니다. 다시 시도해주세요.';
  }
  if (status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded')) {
    return '🔧 AI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
  }
  if (status === 500 || msg.includes('500') || msg.includes('INTERNAL')) {
    return '🔧 AI 서버에 일시적인 문제가 발생했습니다. 다시 시도해주세요.';
  }
  if (msg.includes('API Key') || msg.includes('API_KEY') || msg.includes('apiKey')) {
    return '🔑 API 키가 설정되지 않았거나 유효하지 않습니다. 설정을 확인해주세요.';
  }
  if (msg.includes('빈 응답') || msg.includes('빈 텍스트')) {
    return '📭 AI가 빈 응답을 반환했습니다. 다시 시도해주세요.';
  }
  return `❌ 오류 발생: ${msg.substring(0, 100)}`;
}

/**
 * 재시도 가능한 에러인지 판별
 */
function isRetryableError(error: any): boolean {
  const msg = error?.message || '';
  const status = error?.status;
  return (
    status === 500 || status === 503 ||
    msg.includes('500') || msg.includes('503') ||
    msg.includes('UNAVAILABLE') || msg.includes('INTERNAL') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') || msg.includes('Timeout') ||
    msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
    msg.includes('ERR_NETWORK')
  );
}

/**
 * Gemini API 통합 호출 함수
 * - 모델 선택, 타임아웃, JSON/Text 응답 처리를 하나로 통합
 * - 재시도 가능한 에러 시 지수 백오프 retry (최대 3회)
 * - PRO 모델 실패 시 FLASH 폴백
 */
export async function callGemini(config: GeminiCallConfig): Promise<any> {
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await _callGeminiOnce(config);
      return result;
    } catch (error: any) {
      lastError = error;

      // 재시도 불가능한 에러 (API 키 문제, 할당량 초과 등)는 즉시 던지기
      if (!isRetryableError(error)) {
        throw error;
      }

      // 마지막 시도였으면 던지기
      if (attempt >= maxRetries - 1) {
        break;
      }

      // 백오프: 1초, 2초 (기존 2초, 4초에서 단축)
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`⚠️ Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries}), ${delay / 1000}초 후 재시도...`, error?.message?.substring(0, 80));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 모든 retry 실패 → 에러 모니터링 후 사용자 친화적 메시지로 던지기
  import('./errorMonitoringService').then(({ trackError }) => {
    trackError('gemini_api_all_retries_failed', lastError, {
      model: config.model,
      responseType: config.responseType,
      promptLength: config.prompt?.length,
      retries: maxRetries,
    }, 'high');
  }).catch(() => {});

  const friendlyError = new Error(getKoreanErrorMessage(lastError));
  (friendlyError as any).originalError = lastError;
  throw friendlyError;
}

/**
 * 단일 Gemini API 호출 (retry 없이 1회 실행)
 * - PRO 모델 503/timeout 시 FLASH 폴백은 여기서 처리
 */
async function _callGeminiOnce(config: GeminiCallConfig): Promise<any> {
  const ai = getAiClient();

  // systemInstruction이 있으면 Gemini API의 별도 system instruction으로 분리
  // systemPrompt는 기존 호환성 유지 (contents에 합침)
  const systemText = config.systemInstruction || config.systemPrompt || '';
  const userText = config.systemInstruction
    ? config.prompt  // systemInstruction 사용 시 prompt만 contents에
    : (config.systemPrompt ? `${config.systemPrompt}\n\n${config.prompt}` : config.prompt);

  const apiConfig: any = {
    model: config.model || GEMINI_MODEL.PRO,
    contents: userText,
    config: {
      temperature: config.temperature || 0.85,
      topP: config.topP || 0.95,
      maxOutputTokens: config.maxOutputTokens || 8192
    }
  };

  // Gemini API system instruction 분리 전송
  if (config.systemInstruction) {
    apiConfig.config.systemInstruction = systemText;
  }

  // Thinking level 설정
  if (config.thinkingLevel && config.thinkingLevel !== 'none') {
    apiConfig.config.thinkingConfig = { thinkingBudget: config.thinkingLevel === 'low' ? 1024 : config.thinkingLevel === 'medium' ? 4096 : 8192 };
  }

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

    // responseType에 따라 적절한 값 반환
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
  } catch (error: any) {
    // 503 서버 과부하 또는 타임아웃 → FLASH 폴백 재시도
    const is503 = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('UNAVAILABLE');
    const isTimeout = error?.message?.includes('timeout') || error?.message?.includes('Timeout');
    const shouldRetry = is503 || isTimeout;

    if (shouldRetry && apiConfig.model === GEMINI_MODEL.PRO) {
      console.warn(`⚠️ PRO 모델 ${is503 ? '503 과부하' : '타임아웃'} → FLASH 폴백 시도...`);
      // 폴백 전 대기 제거 — 바로 FLASH 시도 (속도 개선)

      try {
        const retryConfig = { ...apiConfig, model: GEMINI_MODEL.FLASH };
        const retryResult: any = await Promise.race([
          ai.models.generateContent(retryConfig),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('FLASH 폴백도 타임아웃')), 60000) // 90초 → 60초
          )
        ]);
        if (retryResult) {
          console.log('✅ FLASH 폴백 성공');
          if (config.responseType === 'text') {
            return retryResult.text || '';
          } else if (config.responseType === 'json') {
            try { return JSON.parse(retryResult.text || '{}'); } catch { return retryResult; }
          }
          return retryResult;
        }
      } catch (retryError: any) {
        console.warn('⚠️ FLASH 폴백도 실패:', retryError?.message?.substring(0, 100));
      }
    }

    throw error;
  }
}
