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

const DEFAULT_ALLOWED_ORIGINS = [
  "https://story-darugi.com",
  "https://www.story-darugi.com",
  "https://ai-hospital.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsOrigin(origin) {
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : DEFAULT_ALLOWED_ORIGINS;

  if (allowed.includes(origin) || (origin && origin.endsWith(".pages.dev"))) {
    return origin;
  }
  return allowed[0];
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
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

async function fetchGeminiWithRotation(keys, model, apiBody, timeout) {
  const maxAttempts = Math.min(keys.length, 3);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let lastError = "";

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentKey = keys[(keyIndex + attempt) % keys.length];
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
          signal: controller.signal,
        });

        if (response.ok) {
          keyIndex = (keyIndex + attempt + 1) % keys.length;
          clearTimeout(timeoutId);
          return { ok: true, data: await response.json() };
        }

        // 429 → 다음 키로 재시도
        if (response.status === 429 && attempt < maxAttempts - 1) {
          lastError = await response.text();
          continue;
        }

        // 기타 에러 → 투명 전달
        clearTimeout(timeoutId);
        const errorText = await response.text();
        return {
          ok: false,
          status: response.status,
          error: `Gemini API error (${response.status})`,
          details: errorText,
        };
      } catch (fetchErr) {
        if (fetchErr.name === "AbortError") {
          clearTimeout(timeoutId);
          return { ok: false, status: 504, error: "Gemini API timeout" };
        }
        lastError = fetchErr.message || String(fetchErr);
        if (attempt >= maxAttempts - 1) break;
      }
    }

    clearTimeout(timeoutId);
    return { ok: false, status: 502, error: "All API keys failed", details: lastError };
  } catch (e) {
    clearTimeout(timeoutId);
    return { ok: false, status: 500, error: e.message || "Internal error" };
  }
}

// ── Vercel 핸들러 ──

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);

  // CORS 헤더 설정
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 헬스 체크 (GET)
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      region: process.env.VERCEL_REGION || "iad1",
      keys: getKeys().length,
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
      const result = await fetchGeminiWithRotation(keys, body.model, body.apiBody, timeout);

      if (!result.ok) {
        return res.status(result.status || 500).json({
          error: result.error,
          details: result.details,
        });
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
    const result = await fetchGeminiWithRotation(keys, model, apiBody, timeout);

    if (!result.ok) {
      return res.status(result.status || 500).json({
        error: result.error,
        details: result.details,
      });
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
