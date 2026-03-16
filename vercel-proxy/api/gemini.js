/**
 * Gemini API US Proxy — Vercel Serverless Function
 * 리전: iad1 (US East, Washington DC) — vercel.json에서 고정
 *
 * 두 가지 모드:
 * 1. 텍스트 생성: POST { prompt, model, systemInstruction, ... }
 *    → 응답: { text, usageMetadata, candidates }
 * 2. Raw 모드:   POST { raw: true, model, apiBody, timeout }
 *    → 응답: Gemini API 원본 JSON 그대로
 * 3. 헬스 체크:  GET /api/gemini
 *    → 응답: { status, region, keys, timestamp }
 *
 * 환경변수 (Vercel Dashboard → Settings → Environment Variables):
 *   GEMINI_API_KEY    (필수)
 *   GEMINI_API_KEY_2  (선택 - 멀티키 로테이션)
 *   GEMINI_API_KEY_3  (선택)
 *   ALLOWED_ORIGINS   (선택, 쉼표 구분)
 *
 * 프론트엔드 계약:
 *   - callGemini()    → POST { prompt, model, ... } → { text, usageMetadata }
 *   - callGeminiRaw() → POST { raw:true, model, apiBody } → Gemini 원본 JSON
 *   ⚠️ 이 계약은 절대 변경 금지
 */

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
    "Access-Control-Allow-Headers": "Content-Type",
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

// ── 키별 503 cooldown 상태 ──
// Vercel Serverless는 인스턴스가 재사용되므로 모듈 스코프 변수가 유지됨
const keyCooldowns = new Map(); // keyIndex → { until: timestamp, count: number }

const KEY_COOLDOWN_MS = 10000; // 503 발생 시 해당 키 10초 쿨다운

function isKeyCooledDown(ki) {
  const cd = keyCooldowns.get(ki);
  if (!cd) return false;
  if (Date.now() > cd.until) {
    keyCooldowns.delete(ki);
    return false;
  }
  return true;
}

function markKeyCooldown(ki) {
  const cd = keyCooldowns.get(ki) || { until: 0, count: 0 };
  cd.count++;
  // 연속 503 시 쿨다운 시간 증가 (10초, 20초, 30초)
  cd.until = Date.now() + KEY_COOLDOWN_MS * Math.min(cd.count, 3);
  keyCooldowns.set(ki, cd);
  console.warn(`[proxy] 🧊 key=${ki} cooldown ${Math.min(cd.count, 3) * 10}s (503 count=${cd.count})`);
}

function markKeySuccess(ki) {
  keyCooldowns.delete(ki);
}

async function fetchGeminiWithRotation(keys, model, apiBody, timeout, isRaw = false) {
  const maxAttempts = Math.min(keys.length, 3);
  const perAttemptTimeout = Math.min(timeout, isRaw ? 95000 : 150000);
  const tag = isRaw ? "raw" : "text";
  let lastError = "";
  let lastStatus = 502;
  let triedKeys = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ki = (keyIndex + attempt) % keys.length;

    // 503 쿨다운 중인 키는 건너뜀
    if (isKeyCooledDown(ki)) {
      const cd = keyCooldowns.get(ki);
      console.warn(`[proxy] ⏭️ ${tag} key=${ki} model=${model} skipped (cooldown until +${Math.round((cd.until - Date.now()) / 1000)}s)`);
      lastError = `key=${ki} in cooldown`;
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
        markKeySuccess(ki);
        console.log(`[proxy] ✅ ${tag} key=${ki} model=${model} ${ms}ms`);
        return { ok: true, data: await response.json() };
      }

      const errorText = await response.text();
      const us = response.status;
      console.warn(`[proxy] ⚠️ ${tag} key=${ki} model=${model} upstream=${us} ${ms}ms`);

      if (us === 503 || us === 429) {
        lastError = errorText;
        lastStatus = us;
        markKeyCooldown(ki);
        if (attempt < maxAttempts - 1) {
          // 503: 3초 대기 후 다음 키, 429: 2초 대기 후 다음 키
          const delay = us === 503 ? 3000 : 2000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      return {
        ok: false,
        status: us,
        error: `upstream ${us}`,
        details: errorText.substring(0, 500),
      };
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const ms = Date.now() - t0;

      if (fetchErr.name === "AbortError") {
        lastError = `proxy timeout ${ms}ms (limit ${perAttemptTimeout}ms)`;
        lastStatus = 504;
        console.warn(`[proxy] ⏱️ ${tag} key=${ki} model=${model} timeout ${ms}ms`);
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
    for (let i = 0; i < keys.length; i++) {
      const cd = keyCooldowns.get(i);
      if (cd && cd.until > now && cd.until < earliest) earliest = cd.until;
    }
    const retryAfterMs = earliest === Infinity ? 5000 : Math.max(earliest - now + 500, 1000); // +500ms 여유
    console.warn(`[proxy] 🧊 all ${keys.length} keys cooled down, retryAfter=${retryAfterMs}ms`);
    return {
      ok: false,
      status: 503,
      error: "all_keys_in_cooldown",
      retryAfterMs,
      details: `next key available in ${retryAfterMs}ms`,
    };
  }
  return {
    ok: false,
    status: lastStatus,
    error: "all keys failed",
    details: lastError,
  };
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
    const cooldowns = {};
    for (let i = 0; i < keysCount; i++) {
      const cd = keyCooldowns.get(i);
      if (cd && Date.now() < cd.until) {
        cooldowns[`key${i}`] = { remaining: Math.round((cd.until - Date.now()) / 1000) + "s", count: cd.count };
      }
    }
    return res.status(200).json({
      status: "ok",
      region: process.env.VERCEL_REGION || "iad1",
      keys: keysCount,
      cooldowns: Object.keys(cooldowns).length > 0 ? cooldowns : "none",
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

  // API 키 확인
  const keys = getKeys();
  if (keys.length === 0) {
    return res.status(500).json({ error: "No Gemini API keys configured" });
  }

  try {
    const body = req.body;

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
