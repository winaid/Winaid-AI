/**
 * Gemini API US Proxy — Vercel Serverless Function
 * 리전: iad1 (US East, Washington DC) — vercel.json에서 고정
 *
 * 네 가지 모드:
 * 1. 크레딧 차감:  POST { action: "check_and_deduct", postType }
 *    → 응답: { success, generationToken, creditsRemaining }
 * 2. 텍스트 생성:  POST { prompt, model, ... } + X-Generation-Token
 *    → 응답: { text, usageMetadata, candidates }
 * 3. Raw 모드:     POST { raw: true, model, apiBody } + X-Generation-Token
 *    → 응답: Gemini API 원본 JSON 그대로
 * 4. 헬스 체크:    GET /api/gemini
 *    → 응답: { status, region, keys, timestamp }
 *
 * 인증:
 *   - 모든 POST는 Authorization: Bearer <supabase_jwt> 필수
 *   - AI 호출(2,3)은 추가로 X-Generation-Token 필수
 *   - GET 헬스체크는 인증 불필요
 *
 * 환경변수 (Vercel Dashboard → Settings → Environment Variables):
 *   GEMINI_API_KEY           (필수)
 *   GEMINI_API_KEY_2         (선택 - 멀티키 로테이션)
 *   GEMINI_API_KEY_3         (선택)
 *   ALLOWED_ORIGINS          (선택, 쉼표 구분)
 *   SUPABASE_URL             (필수 - JWT 검증)
 *   SUPABASE_ANON_KEY        (필수 - JWT 검증)
 *   SUPABASE_SERVICE_ROLE_KEY (필수 - RPC 호출)
 *   GENERATION_TOKEN_SECRET  (필수 - HMAC 서명)
 *
 * 프론트엔드 계약:
 *   - deductCreditOnServer() → POST { action, postType } → { success, generationToken }
 *   - callGemini()           → POST { prompt, model, ... } → { text, usageMetadata }
 *   - callGeminiRaw()        → POST { raw:true, model, apiBody } → Gemini 원본 JSON
 *   ⚠️ 응답 구조는 절대 변경 금지
 */

import crypto from "crypto";

// ── CORS ──
//
// Vercel 환경변수 예시 (Dashboard → Settings → Environment Variables):
//   ALLOWED_ORIGINS=https://story-darugi.com,https://www.story-darugi.com,https://d0507fad.ai-hospital.pages.dev,https://ai-hospital.pages.dev,http://localhost:5173,http://localhost:3000
//
// 환경변수가 없으면 아래 DEFAULT_ALLOWED_ORIGINS가 사용됨.
// *.pages.dev 와 localhost:* 는 환경변수 유무와 무관하게 항상 허용.

const DEFAULT_ALLOWED_ORIGINS = [
  "https://story-darugi.com",
  "https://www.story-darugi.com",
  "https://ai-hospital.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

/** 환경변수에서 허용 origin 목록 파싱 (빈 문자열 필터링) */
function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    const parsed = process.env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function isOriginAllowed(origin) {
  if (!origin) return false;

  // 1) 화이트리스트 정확 매칭
  if (getAllowedOrigins().includes(origin)) return true;

  // 2) *.pages.dev (Cloudflare Pages 본 도메인 + 프리뷰 서브도메인)
  if (origin.endsWith(".pages.dev") && origin.startsWith("https://")) return true;

  // 3) localhost / 127.0.0.1 (포트 무관)
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  } catch {}

  // 4) *.sandbox.novita.ai (개발 샌드박스)
  if (origin.endsWith(".sandbox.novita.ai")) return true;

  return false;
}

function corsHeaders(origin) {
  const allowed = isOriginAllowed(origin);

  // origin이 있는데 허용 목록에 없으면 경고 로그
  if (!allowed && origin) {
    console.warn(`[CORS] ⛔ rejected origin="${origin}" allowedList=[${getAllowedOrigins().join(", ")}]`);
  }

  // 허용된 경우: 요청 origin 그대로 반영 (브라우저가 매칭 검증)
  // 비허용/origin 없음: 기본 도메인 고정 (서버-to-서버 등)
  const effectiveOrigin = allowed ? origin : "https://story-darugi.com";

  return {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Generation-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ── 멀티키 로테이션 ──

function getKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  return keys;
}

let keyIndex = 0;

// ── 키별 503 cooldown 상태 (text / imagePro / imageNB2 분리) ──
// Vercel Serverless는 인스턴스가 재사용되므로 모듈 스코프 변수가 유지됨
// text, imagePro, imageNB2가 각각 독립 cooldown pool을 사용하여
// 한 tier의 503이 다른 tier까지 차단하는 문제를 방지
const keyCooldownsText = new Map();      // keyIndex → { until: timestamp, count: number }
const keyCooldownsImagePro = new Map();  // keyIndex → { until: timestamp, count: number } — Pro image model
const keyCooldownsImageNB2 = new Map();  // keyIndex → { until: timestamp, count: number } — NB2 (Flash image) model

const KEY_COOLDOWN_MS = 10000; // 503 발생 시 해당 키 10초 쿨다운

// NB2 모델 식별 패턴
const NB2_MODEL_PATTERN = /flash.*image|image.*flash/i;

function getCooldownMap(isRaw, model) {
  if (!isRaw) return keyCooldownsText;
  // image 요청: model명으로 Pro vs NB2 분리
  if (model && NB2_MODEL_PATTERN.test(model)) return keyCooldownsImageNB2;
  return keyCooldownsImagePro;
}

function getCooldownScope(isRaw, model) {
  if (!isRaw) return 'text';
  if (model && NB2_MODEL_PATTERN.test(model)) return 'imageNB2';
  return 'imagePro';
}

function isKeyCooledDown(ki, isRaw, model) {
  const map = getCooldownMap(isRaw, model);
  const cd = map.get(ki);
  if (!cd) return false;
  if (Date.now() > cd.until) {
    map.delete(ki);
    return false;
  }
  return true;
}

function markKeyCooldown(ki, isRaw, model) {
  const map = getCooldownMap(isRaw, model);
  const cd = map.get(ki) || { until: 0, count: 0 };
  cd.count++;
  // 연속 503 시 쿨다운 시간 증가 (10초, 20초, 30초)
  cd.until = Date.now() + KEY_COOLDOWN_MS * Math.min(cd.count, 3);
  map.set(ki, cd);
  const scope = getCooldownScope(isRaw, model);
  console.warn(`[proxy] 🧊 key=${ki} cooldownScope=${scope} cooldown ${Math.min(cd.count, 3) * 10}s (503 count=${cd.count})`);
}

function markKeySuccess(ki, isRaw, model) {
  getCooldownMap(isRaw, model).delete(ki);
}

async function fetchGeminiWithRotation(keys, model, apiBody, timeout, isRaw = false) {
  const maxAttempts = Math.min(keys.length, 3);
  // 업스트림 fetch timeout = 프록시 timeout의 85% (프록시가 응답 보낼 여유 확보)
  const perAttemptTimeout = Math.min(Math.floor(timeout * 0.85), isRaw ? 95000 : 150000);
  const tag = isRaw ? "raw" : "text";
  console.info(`[proxy] ${tag} model=${model} proxyTimeout=${timeout}ms upstreamTimeout=${perAttemptTimeout}ms keys=${keys.length}`);
  const t0 = Date.now();
  let lastError = "";
  let lastStatus = 502;
  let triedKeys = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ki = (keyIndex + attempt) % keys.length;

    // 503 쿨다운 중인 키는 건너뜀 (text/imagePro/imageNB2 분리)
    if (isKeyCooledDown(ki, isRaw, model)) {
      const map = getCooldownMap(isRaw, model);
      const cd = map.get(ki);
      const scope = getCooldownScope(isRaw, model);
      console.warn(`[proxy] ⏭️ ${tag} key=${ki} model=${model} skipped (cooldownScope=${scope} until +${Math.round((cd.until - Date.now()) / 1000)}s)`);
      lastError = `key=${ki} in cooldown (${scope})`;
      lastStatus = 503;
      continue;
    }

    triedKeys++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
    const currentKey = keys[ki];
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;
    const t0 = Date.now();

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const ms = Date.now() - t0;

      if (response.ok) {
        keyIndex = (ki + 1) % keys.length;
        markKeySuccess(ki, isRaw, model);
        console.log(`[proxy] ✅ ${tag} key=${ki} model=${model} ${ms}ms cooldownScope=${getCooldownScope(isRaw, model)}`);
        return { ok: true, data: await response.json() };
      }

      const errorText = await response.text();
      const us = response.status;
      const scope = getCooldownScope(isRaw, model);

      // upstream 500 구분: 프록시 내부 500과 구별하기 위해 명시적으로 로깅
      if (us === 500) {
        console.error(`[proxy] ⚠️ upstream_500 ${tag} key=${ki} model=${model} scope=${scope} ${ms}ms — possible upstream bug. body=${errorText.substring(0, 200)}`);
      } else {
        console.warn(`[proxy] ⚠️ ${tag} key=${ki} model=${model} upstream=${us} scope=${scope} ${ms}ms`);
      }

      if (us === 503 || us === 429) {
        lastError = errorText;
        lastStatus = us;
        markKeyCooldown(ki, isRaw, model);
        if (attempt < maxAttempts - 1) {
          const delay = us === 503 ? 3000 : 2000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      return {
        ok: false,
        status: us,
        error: us === 500 ? "upstream_500" : `upstream ${us}`,
        isUpstream500: us === 500,
        isUpstream503: us === 503,
        details: errorText.substring(0, 500),
      };
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const ms = Date.now() - t0;

      if (fetchErr.name === "AbortError") {
        lastError = `upstream fetch timeout ${ms}ms (upstreamLimit=${perAttemptTimeout}ms, proxyLimit=${timeout}ms)`;
        lastStatus = 504;
        console.warn(`[proxy] ⏱️ ${tag} key=${ki} model=${model} upstream-timeout ${ms}ms (upstreamLimit=${perAttemptTimeout}ms proxyLimit=${timeout}ms)`);
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return { ok: false, status: 504, error: "proxy timeout", details: lastError };
      }

      lastError = fetchErr.message || String(fetchErr);
      lastStatus = 502;
      console.warn(`[proxy] ❌ ${tag} key=${ki} model=${model} ${ms}ms ${lastError.substring(0, 80)}`);
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }

  const allCooled = triedKeys === 0;
  if (allCooled) {
    // 가장 빨리 풀리는 키의 cooldown 잔여 시간 계산
    const now = Date.now();
    let earliest = Infinity;
    let earliestKeyIndex = -1;
    const cooldownMap = getCooldownMap(isRaw, model);
    for (let i = 0; i < keys.length; i++) {
      const cd = cooldownMap.get(i);
      if (cd && cd.until > now && cd.until < earliest) {
        earliest = cd.until;
        earliestKeyIndex = i;
      }
    }
    const retryAfterMs = earliest === Infinity ? 5000 : Math.max(earliest - now + 500, 1000); // +500ms 여유
    const nextAvailableAt = earliest === Infinity ? now + 5000 : earliest + 500;

    // 구조화된 로그: 각 키의 cooldown 상태
    const scope = getCooldownScope(isRaw, model);
    const map = getCooldownMap(isRaw, model);
    for (let i = 0; i < keys.length; i++) {
      const cd = map.get(i);
      if (cd && cd.until > now) {
        console.warn(`[proxy] 🧊 key=${i} cooldownScope=${scope} cooldownUntil=+${Math.round((cd.until - now) / 1000)}s count=${cd.count} model=${model}`);
      }
    }
    console.warn(`[proxy] 🧊 all_keys_in_cooldown cooldownScope=${scope} keys=${keys.length} retryAfterMs=${retryAfterMs} nextAvailableAt=${nextAvailableAt} earliestKey=${earliestKeyIndex} model=${model} isRaw=${isRaw} elapsedMs=${Date.now() - (t0 || now)}`);

    return {
      ok: false,
      status: 503,
      error: "all_keys_in_cooldown",
      message: `All ${scope} keys are cooling down`,
      cooldownScope: scope,
      retryAfterMs,
      nextAvailableAt,
      details: `next key available in ${retryAfterMs}ms (scope=${scope})`,
    };
  }
  return {
    ok: false,
    status: lastStatus,
    error: "all keys failed",
    details: lastError,
  };
}

// ── 인증 + Generation Token ──

const CREDIT_COSTS = { blog: 1, card_news: 2, press_release: 1 };
const GENERATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15분

/** Supabase JWT 검증 → userId 반환 */
async function verifyUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: "authentication_required" };
  }
  const jwt = authHeader.slice(7);
  if (!jwt) return { error: "authentication_required" };

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("[auth] SUPABASE_URL or SUPABASE_ANON_KEY not configured");
    return { error: "server_auth_not_configured" };
  }

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
    });
    if (!resp.ok) return { error: "invalid_token" };
    const user = await resp.json();
    if (!user || !user.id) return { error: "invalid_token" };
    return { userId: user.id };
  } catch (err) {
    console.error("[auth] Supabase auth error:", err.message);
    return { error: "auth_server_error" };
  }
}

/** Supabase deduct_credits RPC 호출 */
async function deductCredits(userId, amount) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { success: false, error: "server_auth_not_configured" };
  }

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/deduct_credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
    });

    if (!resp.ok) {
      console.error(`[credits] RPC HTTP ${resp.status}`);
      return { success: false, error: "credit_check_failed" };
    }

    const result = await resp.json(); // boolean
    return { success: result === true };
  } catch (err) {
    console.error("[credits] RPC error:", err.message);
    return { success: false, error: "credit_check_failed" };
  }
}

/** 사용자의 현재 크레딧 잔여량 조회 */
async function getCreditsRemaining(userId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=credits_total,credits_used`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!rows || rows.length === 0) return null;
    const { credits_total, credits_used } = rows[0];
    return credits_total === -1 ? Infinity : credits_total - credits_used;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 기반 stateless generation token 발급 */
function createGenerationToken(userId, postType) {
  const secret = process.env.GENERATION_TOKEN_SECRET;
  if (!secret) return null;

  const payload = JSON.stringify({
    uid: userId,
    pt: postType,
    iat: Date.now(),
    exp: Date.now() + GENERATION_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${sig.toString("base64url")}`;
}

/** Generation token 검증 (timing-safe 서명 비교) */
function verifyGenerationToken(token, expectedUserId) {
  const secret = process.env.GENERATION_TOKEN_SECRET;
  if (!secret) return { valid: false, error: "server_auth_not_configured" };
  if (!token) return { valid: false, error: "generation_token_required" };

  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return { valid: false, error: "malformed_token" };

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);

  // 서명 재계산
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const actualSig = Buffer.from(sigB64, "base64url");

  // timing-safe 비교 (길이 불일치 시 즉시 거부)
  if (expectedSig.length !== actualSig.length) {
    return { valid: false, error: "invalid_signature" };
  }
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) {
    return { valid: false, error: "invalid_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return { valid: false, error: "malformed_token" };
  }

  if (payload.exp < Date.now()) return { valid: false, error: "generation_token_expired" };
  if (payload.uid !== expectedUserId) return { valid: false, error: "token_user_mismatch" };

  return { valid: true, payload };
}

// ── Vercel 핸들러 ──

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);

  // CORS 헤더는 모든 응답에 항상 설정 (에러 응답 포함)
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight — CORS 헤더만 반환, Content-Type 불필요
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // JSON 응답에만 Content-Type 설정
  res.setHeader("Content-Type", "application/json");

  // 헬스 체크 (GET) — CORS + 키 상태 디버깅 정보
  if (req.method === "GET") {
    const keysCount = getKeys().length;
    const cooldowns = { text: {}, imagePro: {}, imageNB2: {} };
    for (let i = 0; i < keysCount; i++) {
      const cdText = keyCooldownsText.get(i);
      if (cdText && Date.now() < cdText.until) {
        cooldowns.text[`key${i}`] = { remaining: Math.round((cdText.until - Date.now()) / 1000) + "s", count: cdText.count };
      }
      const cdPro = keyCooldownsImagePro.get(i);
      if (cdPro && Date.now() < cdPro.until) {
        cooldowns.imagePro[`key${i}`] = { remaining: Math.round((cdPro.until - Date.now()) / 1000) + "s", count: cdPro.count };
      }
      const cdNB2 = keyCooldownsImageNB2.get(i);
      if (cdNB2 && Date.now() < cdNB2.until) {
        cooldowns.imageNB2[`key${i}`] = { remaining: Math.round((cdNB2.until - Date.now()) / 1000) + "s", count: cdNB2.count };
      }
    }
    const hasCooldowns = Object.keys(cooldowns.text).length > 0 || Object.keys(cooldowns.imagePro).length > 0 || Object.keys(cooldowns.imageNB2).length > 0;
    return res.status(200).json({
      status: "ok",
      region: process.env.VERCEL_REGION || "iad1",
      keys: keysCount,
      cooldowns: hasCooldowns ? cooldowns : "none",
      cors: {
        requestOrigin: origin || "(none)",
        allowed: isOriginAllowed(origin),
        allowedList: getAllowedOrigins(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  // ================================================================
  // POST 공통: JWT 인증 (모든 POST 요청에 필수)
  // ================================================================
  const authResult = await verifyUser(req);
  if (authResult.error) {
    const status = authResult.error === "server_auth_not_configured" ? 500
      : authResult.error === "auth_server_error" ? 502 : 401;
    return res.status(status).json({ error: authResult.error });
  }
  const userId = authResult.userId;

  try {
    const body = req.body;

    // ================================================================
    // 크레딧 차감 + Generation Token 발급
    // deductCreditOnServer()에서 호출
    // 응답: { success, generationToken, creditsRemaining }
    // ================================================================
    if (body && body.action === "check_and_deduct") {
      const postType = body.postType || "blog";
      const cost = CREDIT_COSTS[postType] || 1;

      const deductResult = await deductCredits(userId, cost);
      if (!deductResult.success) {
        const status = deductResult.error === "server_auth_not_configured" ? 500
          : deductResult.error === "credit_check_failed" ? 500 : 403;
        const message = deductResult.error === "credit_check_failed"
          ? "크레딧 확인 중 서버 오류가 발생했습니다."
          : "크레딧이 부족합니다. 요금제를 업그레이드해주세요.";
        return res.status(status).json({ error: deductResult.error || "insufficient_credits", message });
      }

      const generationToken = createGenerationToken(userId, postType);
      if (!generationToken) {
        return res.status(500).json({ error: "server_auth_not_configured", message: "GENERATION_TOKEN_SECRET 미설정" });
      }

      const creditsRemaining = await getCreditsRemaining(userId);
      console.info(`[credits] ✅ deducted ${cost} for ${postType} user=${userId.substring(0, 8)} remaining=${creditsRemaining}`);

      return res.status(200).json({
        success: true,
        generationToken,
        creditsRemaining: creditsRemaining ?? -1,
      });
    }

    // ================================================================
    // AI 호출 공통: Generation Token 검증
    // ================================================================
    const genToken = req.headers["x-generation-token"] || "";
    const tokenResult = verifyGenerationToken(genToken, userId);
    if (!tokenResult.valid) {
      return res.status(403).json({ error: tokenResult.error });
    }

    // API 키 확인
    const keys = getKeys();
    if (keys.length === 0) {
      return res.status(500).json({ error: "No Gemini API keys configured" });
    }

    // ================================================================
    // Raw 모드: apiBody를 Gemini API에 그대로 프록시
    // 이미지 생성/편집 등 — callGeminiRaw()에서 호출
    // 응답: Gemini API 원본 JSON (candidates, content, parts 등)
    // ⚠️ 이 응답 형식은 절대 가공하지 말 것
    // ================================================================
    if (body && body.raw === true) {
      if (!body.model) {
        return res.status(400).json({ error: "raw mode requires model" });
      }
      if (!body.apiBody) {
        return res.status(400).json({ error: "raw mode requires apiBody" });
      }

      const timeout = Math.min(body.timeout || 180000, 300000);
      const result = await fetchGeminiWithRotation(keys, body.model, body.apiBody, timeout, true);

      if (!result.ok) {
        const errBody = { error: result.error, details: result.details };
        if (result.retryAfterMs) errBody.retryAfterMs = result.retryAfterMs;
        if (result.nextAvailableAt) errBody.nextAvailableAt = result.nextAvailableAt;
        if (result.message) errBody.message = result.message;
        return res.status(result.status || 500).json(errBody);
      }

      // ⚠️ Raw 모드: Gemini 응답을 가공 없이 그대로 반환
      return res.status(200).json(result.data);
    }

    // ================================================================
    // 일반 모드: prompt 기반 텍스트/키워드 생성
    // callGemini()에서 호출
    // 응답: { text, usageMetadata, candidates }
    // ⚠️ 이 응답 구조는 프론트 _callGeminiOnce()가 의존
    // ================================================================
    if (!body || !body.prompt) {
      return res.status(400).json({
        error: "prompt is required",
        received: body ? Object.keys(body) : [],
        hint: "raw mode? set raw:true with model and apiBody",
      });
    }

    const model = body.model || "gemini-3.1-pro-preview";
    const systemText = body.systemInstruction || body.systemPrompt || "";
    const userText = body.systemInstruction
      ? body.prompt
      : systemText
        ? systemText + "\n\n" + body.prompt
        : body.prompt;

    const apiBody = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: body.temperature ?? 0.85,
        topP: body.topP ?? 0.95,
        maxOutputTokens: body.maxOutputTokens ?? 8192,
        responseMimeType:
          body.responseType === "json" ? "application/json" : "text/plain",
      },
    };

    if (body.systemInstruction) {
      apiBody.systemInstruction = { parts: [{ text: systemText }] };
    }
    if (body.schema && body.responseType === "json") {
      apiBody.generationConfig.responseSchema = body.schema;
    }
    if (body.googleSearch) {
      apiBody.tools = [{ googleSearch: {} }];
    }
    if (body.thinkingLevel && body.thinkingLevel !== "none") {
      const budget = { low: 1024, medium: 4096, high: 8192 };
      apiBody.generationConfig.thinkingConfig = {
        thinkingBudget: budget[body.thinkingLevel] || 4096,
      };
    }

    const timeout = Math.min(body.timeout || 120000, 180000);
    const result = await fetchGeminiWithRotation(keys, model, apiBody, timeout, false);

    if (!result.ok) {
      const errBody = { error: result.error, details: result.details };
      if (result.retryAfterMs) errBody.retryAfterMs = result.retryAfterMs;
      if (result.nextAvailableAt) errBody.nextAvailableAt = result.nextAvailableAt;
      if (result.message) errBody.message = result.message;
      return res.status(result.status || 500).json(errBody);
    }

    // ⚠️ 텍스트 모드 응답 구조 — 프론트가 { text, usageMetadata } 를 기대
    const candidates = result.data.candidates || [];
    const textParts = candidates[0]?.content?.parts || [];
    const text = textParts.map((p) => p.text || "").join("");

    return res.status(200).json({
      text,
      usageMetadata: result.data.usageMetadata || null,
      candidates: candidates.length,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Gemini API timeout" });
    }
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
