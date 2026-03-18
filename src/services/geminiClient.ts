/**
 * geminiClient.ts - Gemini API 핵심 인프라 (SaaS 프록시 전용)
 *
 * 모든 AI 호출은 서버 프록시(VITE_GEMINI_PROXY_URL)를 경유한다.
 * 클라이언트에는 API 키가 존재하지 않는다.
 */

// 🎯 Gemini API 상수
export const GEMINI_MODEL = {
  PRO: 'gemini-3.1-pro-preview',           // 글 생성 등 고품질 작업 (3.1 Pro)
  FLASH: 'gemini-3.1-flash-lite-preview',   // 검색, 자동 보정, 채팅 등 빠른 작업 (3.1 Flash Lite)
  FLASH_LITE: 'gemini-3.1-flash-lite-preview', // 프롬프트 추천 등 경량 작업 (3.1 Flash Lite)
  IMAGE_PRO: 'gemini-3-pro-image-preview',    // 이미지 생성 (Nano Banana Pro) — hero 품질용
  IMAGE_FLASH: 'gemini-3.1-flash-image-preview', // 이미지 생성 (Nano Banana 2) — sub 속도/성공률용
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
  maxRetries?: number;         // callGemini retry 횟수 (기본 3). 1이면 retry 없이 1회만 시도.
  noAutoFallback?: boolean;    // true면 _callGeminiOnce 내부 PRO→FLASH 자동 폴백 금지. Stage C처럼 caller가 직접 폴백을 관리할 때 사용.
}

// SaaS 프록시 모드 — 클라이언트에 API 키 없음이 정상
(() => {
  const proxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL;
  if (proxyUrl) {
    console.info('ℹ️ SaaS 프록시 모드 — AI 호출은 서버 프록시 경유');
  } else {
    console.warn('⚠️ VITE_GEMINI_PROXY_URL 미설정 — Gemini 호출 불가');
  }
})();

// ── 인증 + Generation Token 관리 ──

/** Supabase 세션의 access_token 가져오기 */
async function getAuthToken(): Promise<string | null> {
  try {
    const { supabase } = await import('../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || null;
    console.debug(`[AUTH] getAuthToken: ${token ? 'JWT 있음' : 'JWT 없음'}`);
    return token;
  } catch (e) {
    console.warn('[GEN_STEP] getAuthToken 예외:', e);
    return null;
  }
}

/** 관리자 세션 토큰 가져오기 (sessionStorage) */
function getAdminToken(): string | null {
  try {
    const isAdmin = sessionStorage.getItem('ADMIN_AUTHENTICATED') === 'true';
    const token = sessionStorage.getItem('ADMIN_TOKEN');
    if (isAdmin && token) {
      console.debug('[AUTH] getAdminToken: 있음');
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 현재 generation token (모듈 스코프).
 * 동시 생성 1건 전제 — 생성 시작 전 clear, 종료 시 clear.
 */
let _currentGenerationToken: string | null = null;

/** Generation token 초기화. 생성 시작 전 + 생성 종료(finally)에서 반드시 호출. */
export function clearGenerationToken(): void {
  _currentGenerationToken = null;
}

/**
 * 서버에서 크레딧 차감 + generation token 발급.
 * 생성 시작 전 1회 호출. 성공 시 이후 callGemini/callGeminiRaw에 자동 첨부.
 */
export async function deductCreditOnServer(postType: string): Promise<{
  success: boolean;
  creditsRemaining?: number;
  error?: string;
  message?: string;
}> {
  const token = await getAuthToken();
  const adminToken = getAdminToken();

  // TODO: 2026-03-29 인증 복구 시 아래 early return 주석 해제할 것
  // 현재는 프록시가 anonymous 허용하므로 프론트에서도 차단하지 않음
  // if (!token && !adminToken) {
  //   console.warn('[GEN_STEP] deductCredit: JWT 없음, 관리자 토큰 없음 → authentication_required');
  //   return { success: false, error: 'authentication_required', message: '로그인이 필요합니다.' };
  // }
  console.debug(`[GEN_STEP] deductCredit 시작 — jwt=${!!token}, admin=${!!adminToken}, postType=${postType}`);

  const endpoint = getGeminiEndpoint();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (adminToken) headers['X-Admin-Token'] = adminToken;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'check_and_deduct', postType }),
    });

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as any;

    if (!response.ok) {
      console.warn(`[GEN_STEP] deductCredit 서버 응답 실패: HTTP ${response.status}, error=${data.error}`);
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
        message: data.message || (response.status === 401 ? '로그인이 필요합니다.' : '크레딧이 부족합니다.'),
      };
    }

    if (data.success && data.generationToken) {
      _currentGenerationToken = data.generationToken;
      console.info(`[GEN_STEP] deductCredit 성공 — creditsRemaining=${data.creditsRemaining}`);
    }

    return data;
  } catch (err: any) {
    console.error(`[GEN_STEP] deductCredit 네트워크 에러: ${err?.message}`);
    return { success: false, error: 'network_error', message: '서버 연결에 실패했습니다.' };
  }
}

/** 프록시 요청용 헤더 생성 (JWT + Admin Token + Generation Token) */
async function getProxyHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const adminToken = getAdminToken();
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  if (_currentGenerationToken) headers['X-Generation-Token'] = _currentGenerationToken;
  console.debug(`[AUTH] proxyHeaders: auth=${!!headers['Authorization']}, admin=${!!headers['X-Admin-Token']}, gen=${!!headers['X-Generation-Token']}`);
  return headers;
}

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
  const maxRetries = config.maxRetries ?? 3;
  let lastError: any = null;
  const callId = `[BLOG_FLOW] callGemini(${config.model || 'PRO'})`;
  console.info(`${callId} 시작 (prompt: ${config.prompt?.substring(0, 50)}...)`);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await _callGeminiOnce(config);
      console.info(`${callId} 성공 (시도 ${attempt + 1}/${maxRetries})`);
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

  const headers = await getProxyHeaders();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw: true, model, apiBody, timeout }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const ms = Date.now() - t0;

    if (!response.ok) {
      // 404: 프록시 라우트 자체가 없음 — CORS와 혼동되는 핵심 원인
      if (response.status === 404) {
        console.error(`[RAW] ⛔ ${model} 404 ${ms}ms — 프록시 라우트 미존재!`);
        const error: any = new Error('프록시 서버에 /api/gemini 라우트가 없습니다 (404). Vercel 배포 설정을 확인하세요.');
        error.status = 404;
        error.errorType = 'route_not_found';
        error.isRouteNotFound = true;
        // health cache 즉시 무효화
        _proxyHealthCache = { ok: false, ts: Date.now(), detail: 'route 404' };
        throw error;
      }

      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string; details?: string; retryAfterMs?: number; nextAvailableAt?: number };
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
  // timeout 상세는 debug only — 운영에서 반복 노출 방지
  console.debug(`[GEMINI] ${model} timeout: client=${clientTimeout}ms proxy=${timeout}ms upstream≈${upstreamTimeout}ms`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clientTimeout);
  const headers = await getProxyHeaders();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
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

      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string; details?: string };

      // 503/429/504 + PRO → FLASH 폴백 (noAutoFallback이면 caller에게 위임)
      if ((response.status === 503 || response.status === 429 || response.status === 504) && model === GEMINI_MODEL.PRO) {
        if (config.noAutoFallback) {
          console.warn(`[FALLBACK] PRO ${response.status} — noAutoFallback, throw to caller`);
        } else {
          console.warn(`[FALLBACK] PRO ${response.status} → FLASH`);
          return _callGeminiOnce({ ...config, model: GEMINI_MODEL.FLASH, timeout: 25000 });
        }
      }

      const error: any = new Error(errorBody.error || `서버 응답 오류 (${response.status})`);
      error.status = response.status;
      error.details = errorBody.details;
      throw error;
    }

    const result = await response.json() as { text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };

    // 응답 검증
    if (!result || !result.text) {
      if (result.text === '') {
        throw new Error('Gemini가 빈 응답을 반환했습니다. 다시 시도해주세요.');
      }
    }

    // API 사용량 추적 (비동기, 실패해도 무시)
    try {
      if (result.usageMetadata) {
        const meta = result.usageMetadata;
        import('./creditService').then(({ trackApiUsage, calculateCost }) => {
          const inputTokens = meta.promptTokenCount || 0;
          const outputTokens = meta.candidatesTokenCount || 0;
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
      // timeout 로그: 모델명 + timeout값만 (반복 상세 제거)
      const willFallback = model === GEMINI_MODEL.PRO && !config.noAutoFallback;
      console.warn(`[TIMEOUT] ${model} ${clientTimeout}ms 초과 → ${willFallback ? 'FLASH 폴백' : 'throw'}`);
      if (willFallback) {
        return _callGeminiOnce({ ...config, model: GEMINI_MODEL.FLASH, timeout: 25000 });
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
