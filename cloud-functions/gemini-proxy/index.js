/**
 * Google Cloud Run — Gemini API Proxy
 * 리전: us-central1 (고정)
 *
 * Cloud Run 서비스로 배포 (PORT 환경변수로 listen)
 */

const http = require("http");

const ALLOWED_ORIGINS = [
  "https://story-darugi.com",
  "https://www.story-darugi.com",
  "https://ai-hospital.pages.dev",
  "http://localhost:5173",
];

function getCorsOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin) || (origin && origin.endsWith(".pages.dev"))) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj, corsOrigin) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const corsOrigin = getCorsOrigin(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "POST only" }, corsOrigin);
  }

  try {
    const body = await parseBody(req);

    if (!body || !body.prompt) {
      return sendJson(res, 400, { error: "prompt is required" }, corsOrigin);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return sendJson(res, 500, { error: "API key not configured" }, corsOrigin);
    }

    // Gemini REST API 요청 구성
    const model = body.model || "gemini-2.0-flash";
    const sysText = body.systemInstruction || body.systemPrompt || "";
    const userText = body.systemInstruction
      ? body.prompt
      : sysText
        ? sysText + "\n\n" + body.prompt
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
      apiBody.systemInstruction = { parts: [{ text: sysText }] };
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

    // Gemini API 호출
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = Math.min(body.timeout || 120000, 180000);
    const tid = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiBody),
      signal: controller.signal,
    });

    clearTimeout(tid);

    if (!response.ok) {
      const errText = await response.text();
      return sendJson(res, response.status, {
        error: `Gemini API error (${response.status})`,
        details: errText,
      }, corsOrigin);
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("");

    return sendJson(res, 200, {
      text,
      usageMetadata: result.usageMetadata || null,
    }, corsOrigin);
  } catch (err) {
    if (err.name === "AbortError") {
      return sendJson(res, 504, { error: "Gemini API timeout" }, corsOrigin);
    }
    return sendJson(res, 500, { error: err.message || "Internal error" }, corsOrigin);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Gemini proxy listening on port ${PORT}`);
});
