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
  FLASH: 'gemini-3.1-flash-lite-preview',   // 검색, 자동 보정, 채팅 등 빠른 작업 (3.1 Flash Lite)
  FLASH_LITE: 'gemini-3.1-flash-lite-preview', // 프롬프트 추천 등 경량 작업 (3.1 Flash Lite)
  IMAGE_PRO: 'gemini-3-pro-image-preview',  // 이미지 생성 (Nano Banana Pro)
} as const;

export const TIMEOUTS = {
  GENERATION: 120000,       // 2분 (기존 5분 → 단축)
  CONTENT_GENERATION: 120000, // 2분
  IMAGE_GENERATION: 180000, // 3분
  QUICK_OPERATION: 60000,   // 60초 (임베딩 API 타임아웃 대응)
} as const;

/**
 * Gemini 프록시 엔드포인트 반환 (Vercel 단일 경로)
 *
 * - VITE_GEMINI_PROXY_URL 필수 (Vercel US 프록시)
 * - workers.dev / cloudfunctions.net URL 차단 (legacy 방어)
 * - Pages Functions 폴백 제거 (HKG 리전 → Gemini 지역 제한 에러)
 */
function getGeminiEndpoint(): string {
  const url = import.meta.env.VITE_GEMINI_PROXY_URL;

  if (!url) {
    console.error('[BLOG_FLOW] ⛔ VITE_GEMINI_PROXY_URL 미설정 — Gemini 호출 불가');
    throw new Error('Gemini 프록시 URL이 설정되지 않았습니다. 관리자에게 문의하세요.');
  }

  if (url.includes('workers.dev')) {
    console.error('[BLOG_FLOW] ⛔ workers.dev URL 차단됨:', url);
    throw new Error('잘못된 Gemini 프록시 URL (workers.dev). 관리자에게 문의하세요.');
  }

  if (url.includes('cloudfunctions.net')) {
    console.error('[BLOG_FLOW] ⛔ GCF URL 차단됨:', url);
    throw new Error('잘못된 Gemini 프록시 URL (GCF). 관리자에게 문의하세요.');
  }

  return url;
}

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

// Vite define으로 주입된 전역 상수 (Cloudflare Pages 빌드 호환)
declare const __GEMINI_KEY_1__: string;
declare const __GEMINI_KEY_2__: string;
declare const __GEMINI_KEY_3__: string;

// 🔑 Gemini API 키 목록 (환경변수에서 로드)
export const getApiKeysFromEnv = (): string[] => {
  const keys: string[] = [];

  // 1순위: vite.config.ts define으로 직접 주입된 키 (Cloudflare Pages 호환)
  const dk1 = typeof __GEMINI_KEY_1__ !== 'undefined' ? __GEMINI_KEY_1__ : '';
  const dk2 = typeof __GEMINI_KEY_2__ !== 'undefined' ? __GEMINI_KEY_2__ : '';
  const dk3 = typeof __GEMINI_KEY_3__ !== 'undefined' ? __GEMINI_KEY_3__ : '';

  // 2순위: Vite import.meta.env (로컬 dev에서 사용)
  const key1 = dk1 || import.meta.env.VITE_GEMINI_API_KEY;
  const key2 = dk2 || import.meta.env.VITE_GEMINI_API_KEY_2;
  const key3 = dk3 || import.meta.env.VITE_GEMINI_API_KEY_3;

  if (key1) keys.push(key1);
  if (key2) keys.push(key2);
  if (key3) keys.push(key3);

  // localStorage에서도 확인 (사용자가 직접 입력한 경우)
  const localKey = localStorage.getItem('GEMINI_API_KEY');
  if (localKey && localKey !== '***' && !keys.includes(localKey)) {
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
  // 프록시 모드에서는 API 키가 서버에만 존재 → 클라이언트에 없어도 정상
  const proxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL;
  if (proxyUrl) {
    console.info('ℹ️ 클라이언트 API 키 없음 — 서버 프록시 모드로 동작 (정상)');
  } else {
    console.warn('⚠️ API 키도 없고 프록시 URL도 없음 — Gemini 호출 불가');
  }
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

  // 2순위: define 주입 키 (Cloudflare Pages 빌드)
  if (!apiKey) {
    const dk = typeof __GEMINI_KEY_1__ !== 'undefined' ? __GEMINI_KEY_1__ : '';
    apiKey = dk || import.meta.env.VITE_GEMINI_API_KEY;
  }

  // 3순위: localStorage (사용자 입력)
  if (!apiKey) {
    apiKey = localStorage.getItem('GEMINI_API_KEY');
  }

  if (!apiKey) {
    console.error('[geminiClient] 키 탐색 실패 — getApiKey():', !getApiKey(), '| env:', !import.meta.env.VITE_GEMINI_API_KEY, '| localStorage:', !localStorage.getItem('GEMINI_API_KEY'));
    throw new Error("API Key가 설정되지 않았습니다. 환경변수 VITE_GEMINI_API_KEY 확인 후 재배포하세요.");
  }

  return new GoogleGenAI({ apiKey });
};

export const getApiKeyValue = (): string => {
  let apiKey = getApiKey();
  if (!apiKey) {
    const dk = typeof __GEMINI_KEY_1__ !== 'undefined' ? __GEMINI_KEY_1__ : '';
    apiKey = dk || import.meta.env.VITE_GEMINI_API_KEY;
  }
  if (!apiKey) apiKey = localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) throw new Error("API Key가 설정되지 않았습니다.");
  return apiKey;
};

// AI Provider 설정 읽기 - Gemini만 사용
export const getAiProviderSettings = (): { textGeneration: 'gemini', imageGeneration: 'gemini' } => {
  return { textGeneration: 'gemini', imageGeneration: 'gemini' };
};

/**
 * CORS/프록시 설정 에러인지 판별
 * 브라우저가 CORS 차단 시 throw하는 에러 패턴:
 *  - Chrome: TypeError: Failed to fetch
 *  - Firefox: TypeError: NetworkError when attempting to fetch resource
 *  - Safari: TypeError: Load failed
 * 이 에러는 재시도해도 해결되지 않으므로 즉시 사용자에게 알려야 함
 */
export function isCorsOrProxyError(error: any): boolean {
  const msg = error?.message || '';
  const name = error?.name || '';

  // TypeError + fetch 관련 메시지 = 거의 확실한 CORS 또는 네트워크 차단
  if (name === 'TypeError' && (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('fetch')
  )) return true;

  return (
    msg.includes('ERR_NETWORK') ||
    msg.includes('CORS') ||
    msg.includes('cors') ||
    msg.includes('Access-Control') ||
    msg.includes('blocked by CORS') ||
    msg.includes('No \'Access-Control-Allow-Origin\'')
  );
}

/**
 * 사용자 친화적 에러 메시지 변환
 */
export function getKoreanErrorMessage(error: any): string {
  const msg = error?.message || '';
  const status = error?.status;

  if (status === 404 || error?.isRouteNotFound) {
    return '🔧 AI 프록시 서버의 라우트를 찾을 수 없습니다 (404). Vercel 배포 상태를 확인해주세요.';
  }
  if (status === 429 || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('limit')) {
    return '⚠️ API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (isCorsOrProxyError(error)) {
    return '🔧 AI 프록시 서버 연결에 실패했습니다. 프록시 라우트(404)이거나 CORS 설정 문제일 수 있습니다. 관리자에게 문의하세요.';
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
 * CORS/프록시 에러는 재시도해도 해결 불가 → false 반환
 */
function isRetryableError(error: any): boolean {
  if (isCorsOrProxyError(error)) return false;
  if (error?.isRouteNotFound || error?.status === 404) return false;

  const msg = error?.message || '';
  const status = error?.status;
  return (
    status === 429 || status === 500 || status === 503 || status === 504 ||
    msg.includes('429') || msg.includes('500') || msg.includes('503') || msg.includes('504') ||
    msg.includes('UNAVAILABLE') || msg.includes('INTERNAL') ||
    msg.includes('overloaded') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('timeout') || msg.includes('Timeout')
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
  const callId = `[BLOG_FLOW] callGemini(${config.model || 'PRO'})`;
  console.log(`${callId} 시작 (prompt: ${config.prompt?.substring(0, 50)}...)`);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await _callGeminiOnce(config);
      console.log(`${callId} 성공 (시도 ${attempt + 1}/${maxRetries})`);
      return result;
    } catch (error: any) {
      lastError = error;
      console.warn(`${callId} 실패 (시도 ${attempt + 1}/${maxRetries}): ${error?.status || 'N/A'} ${error?.message?.substring(0, 80)}`);

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
 * 프록시 엔드포인트 health check (캐시 1분)
 * 404 vs CORS vs 네트워크 장애를 사전에 구분하기 위한 pre-check
 */
let _proxyHealthCache: { ok: boolean; ts: number; detail: string } | null = null;
const PROXY_HEALTH_CACHE_MS = 60000; // 1분 캐시

export async function checkProxyHealth(): Promise<{ ok: boolean; detail: string }> {
  if (_proxyHealthCache && Date.now() - _proxyHealthCache.ts < PROXY_HEALTH_CACHE_MS) {
    return { ok: _proxyHealthCache.ok, detail: _proxyHealthCache.detail };
  }

  const endpoint = getGeminiEndpoint();
  // /api/gemini → /api/health (같은 도메인)
  const healthUrl = endpoint.replace(/\/api\/gemini\/?$/, '/api/health');

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const ok = res.ok;
    const detail = ok ? 'proxy alive' : `proxy returned ${res.status}`;
    _proxyHealthCache = { ok, ts: Date.now(), detail };
    if (!ok) {
      console.warn(`[PROXY] ⚠️ health check ${res.status}: ${detail} | url: ${healthUrl}`);
    }
    return { ok, detail };
  } catch (err: any) {
    const detail = isCorsOrProxyError(err) ? 'health check CORS/network error' : (err?.message || 'unknown');
    _proxyHealthCache = { ok: false, ts: Date.now(), detail };
    console.warn(`[PROXY] ⚠️ health check failed: ${detail} | url: ${healthUrl}`);
    return { ok: false, detail };
  }
}

/**
 * Raw 모드 프록시 호출 - Gemini API 바디를 직접 전달
 * 이미지 생성/편집 등 고급 기능에 사용
 * Vercel 단일 경로 — 폴백 없음 (호출자가 재시도 관리)
 */
export async function callGeminiRaw(model: string, apiBody: any, timeout: number = TIMEOUTS.IMAGE_GENERATION): Promise<any> {
  const endpoint = getGeminiEndpoint();
  const t0 = Date.now();
  // 클라이언트 AbortController는 프록시 timeout보다 약간 여유
  const clientTimeout = timeout + 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clientTimeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: true, model, apiBody, timeout }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const ms = Date.now() - t0;

    if (!response.ok) {
      // 404: 프록시 라우트 자체가 없음 — CORS와 혼동되는 핵심 원인
      if (response.status === 404) {
        console.error(`[RAW] ⛔ ${model} 404 ${ms}ms — 프록시 라우트 미존재! endpoint: ${endpoint}`);
        const error: any = new Error('프록시 서버에 /api/gemini 라우트가 없습니다 (404). Vercel 배포 설정을 확인하세요.');
        error.status = 404;
        error.errorType = 'route_not_found';
        error.isRouteNotFound = true;
        // health cache 즉시 무효화
        _proxyHealthCache = { ok: false, ts: Date.now(), detail: 'route 404' };
        throw error;
      }

      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      const isCooldown = errorBody.error === 'all_keys_in_cooldown';
      const isUpstream503 = !isCooldown && response.status === 503;
      const retryMs = errorBody.retryAfterMs || 0;
      const nextAt = errorBody.nextAvailableAt || 0;
      const errorType = isCooldown ? 'all_keys_in_cooldown' : isUpstream503 ? 'upstream_503' : `http_${response.status}`;
      console.warn(`[RAW] ${model} ${response.status} ${ms}ms errorType=${errorType}: ${(errorBody.error || '').substring(0, 60)}${retryMs ? ` retryAfterMs=${retryMs}` : ''}${nextAt ? ` nextAvailableAt=${nextAt}` : ''}`);
      const error: any = new Error(errorBody.error || `서버 응답 오류 (${response.status})`);
      error.status = response.status;
      error.details = errorBody.details;
      error.errorType = errorType;
      if (retryMs > 0) error.retryAfterMs = retryMs;
      if (nextAt > 0) error.nextAvailableAt = nextAt;
      if (isCooldown) error.isCooldown = true;
      if (isUpstream503) error.isUpstream503 = true;
      throw error;
    }

    console.info(`[RAW] ${model} 200 ${ms}ms`);
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    const ms = Date.now() - t0;

    // 이미 분류된 에러는 그대로 throw
    if (error.errorType) {
      throw error;
    }

    if (error.name === 'AbortError') {
      console.warn(`[RAW] ${model} client-timeout ${ms}ms (limit ${clientTimeout}ms)`);
      const timeoutError: any = new Error('Gemini API timeout');
      timeoutError.status = 504;
      timeoutError.errorType = 'timeout';
      throw timeoutError;
    }

    // CORS/네트워크 에러 — 404와 구분하여 진단
    if (isCorsOrProxyError(error)) {
      // 비동기로 health check 실행하여 원인 구분 시도
      const healthHint = _proxyHealthCache?.ok === false
        ? ` (health: ${_proxyHealthCache.detail})`
        : '';
      console.error(`[PROXY] ⛔ callGeminiRaw CORS/network error: ${error.message}${healthHint} | endpoint: ${endpoint}`);

      // health check를 비동기로 트리거 (다음 호출 시 참조)
      checkProxyHealth().catch(() => {});

      const corsError: any = new Error(
        `AI 프록시 서버 연결 실패 — 프록시가 404를 반환하거나 CORS 차단 상태일 수 있습니다.${healthHint} 관리자에게 문의하세요.`
      );
      corsError.status = 0;
      corsError.errorType = 'cors_or_network';
      corsError.isCors = true;
      throw corsError;
    }

    throw error;
  }
}

/**
 * 서버 프록시를 통한 Gemini API 호출 (단일 Vercel 엔드포인트)
 * - API 키가 서버에만 존재 → 클라이언트 노출 없음
 * - PRO 모델 503/429/timeout → FLASH 폴백
 * - 폴백 루프 제거 — 단일 endpoint, callGemini에서 retry 관리
 */
async function _callGeminiOnce(config: GeminiCallConfig): Promise<any> {
  const model = config.model || GEMINI_MODEL.PRO;
  const timeout = config.timeout || TIMEOUTS.GENERATION;

  const proxyRequest = {
    prompt: config.prompt,
    model,
    systemPrompt: config.systemPrompt,
    systemInstruction: config.systemInstruction,
    responseType: config.responseType,
    schema: config.schema,
    temperature: config.temperature,
    topP: config.topP,
    maxOutputTokens: config.maxOutputTokens,
    googleSearch: config.googleSearch,
    thinkingLevel: config.thinkingLevel,
    timeout,
  };

  const endpoint = getGeminiEndpoint();
  const clientTimeout = timeout + 5000;
  const upstreamTimeout = Math.floor(timeout * 0.85);
  console.info(`[BLOG_FLOW] _callGeminiOnce(${model}) timeout: client=${clientTimeout}ms proxy=${timeout}ms upstream≈${upstreamTimeout}ms`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clientTimeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 404: 프록시 라우트 자체가 없음
      if (response.status === 404) {
        console.error(`[BLOG_FLOW] ⛔ ${model} 404 — 프록시 라우트 미존재! endpoint: ${endpoint}`);
        _proxyHealthCache = { ok: false, ts: Date.now(), detail: 'route 404' };
        const error: any = new Error('프록시 서버에 /api/gemini 라우트가 없습니다 (404). Vercel 배포 설정을 확인하세요.');
        error.status = 404;
        error.errorType = 'route_not_found';
        error.isRouteNotFound = true;
        throw error;
      }

      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      // 503/429/504 + PRO → FLASH 폴백 (모델 다운그레이드)
      if ((response.status === 503 || response.status === 429 || response.status === 504) && model === GEMINI_MODEL.PRO) {
        console.warn(`⚠️ PRO 모델 ${response.status} → FLASH 즉시 폴백 시도...`);
        return _callGeminiOnce({ ...config, model: GEMINI_MODEL.FLASH, timeout: 30000 });
      }

      const error: any = new Error(errorBody.error || `서버 응답 오류 (${response.status})`);
      error.status = response.status;
      error.details = errorBody.details;
      throw error;
    }

    const result = await response.json();

    // 응답 검증
    if (!result || !result.text) {
      if (result.text === '') {
        throw new Error('Gemini가 빈 응답을 반환했습니다. 다시 시도해주세요.');
      }
    }

    // API 사용량 추적 (비동기, 실패해도 무시)
    try {
      if (result.usageMetadata) {
        import('./creditService').then(({ trackApiUsage, calculateCost }) => {
          const inputTokens = result.usageMetadata.promptTokenCount || 0;
          const outputTokens = result.usageMetadata.candidatesTokenCount || 0;
          trackApiUsage({
            model,
            inputTokens,
            outputTokens,
            costUsd: calculateCost(model, inputTokens, outputTokens),
            operation: config.systemPrompt?.substring(0, 30) || 'unknown',
          });
        }).catch(() => {});
      }
    } catch {}

    // responseType에 따라 적절한 값 반환
    const text = result.text;

    if (config.responseType === 'text') {
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini가 빈 텍스트 응답을 반환했습니다. 다시 시도해주세요.');
      }
      return text;
    } else if (config.responseType === 'json') {
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini가 빈 JSON 응답을 반환했습니다. 다시 시도해주세요.');
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('⚠️ JSON 파싱 실패, 원본 반환:', text.substring(0, 100));
        return { text };
      }
    } else {
      return { text, usageMetadata: result.usageMetadata };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      const elapsed = Date.now() - (Date.now() - clientTimeout); // approximate
      console.warn(`[TIMEOUT] ⏱️ client AbortController fired: model=${model} clientTimeout=${clientTimeout}ms proxyTimeout=${timeout}ms upstreamTimeout≈${upstreamTimeout}ms`);
      if (model === GEMINI_MODEL.PRO) {
        console.warn('⚠️ PRO 모델 타임아웃 → FLASH 폴백 시도...');
        return _callGeminiOnce({ ...config, model: GEMINI_MODEL.FLASH, timeout: 30000 });
      }
      const timeoutError: any = new Error(`Gemini API timeout (client=${clientTimeout}ms, proxy=${timeout}ms)`);
      timeoutError.status = 504;
      timeoutError.errorType = 'timeout';
      throw timeoutError;
    }

    // 이미 분류된 에러 (404 route_not_found 등)는 그대로 throw
    if (error.errorType) {
      throw error;
    }

    // CORS/프록시 에러는 폴백/재시도 없이 즉시 throw
    if (isCorsOrProxyError(error)) {
      const healthHint = _proxyHealthCache?.ok === false
        ? ` (health: ${_proxyHealthCache.detail})`
        : '';
      console.error(`[PROXY] ⛔ _callGeminiOnce CORS/network error: ${error.message}${healthHint} | endpoint: ${endpoint}`);
      checkProxyHealth().catch(() => {});
      const corsError: any = new Error(
        `AI 프록시 서버 연결 실패 — 프록시가 404를 반환하거나 CORS 차단 상태일 수 있습니다.${healthHint} 관리자에게 문의하세요.`
      );
      corsError.status = 0;
      corsError.errorType = 'cors_or_network';
      corsError.isCors = true;
      throw corsError;
    }

    throw error;
  }
}
