/**
 * Google Cloud Functions — Gemini API Proxy
 * 리전: us-central1 (고정)
 *
 * 배포 명령:
 *   gcloud functions deploy gemini-proxy \
 *     --runtime nodejs20 \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --region us-central1 \
 *     --set-secrets 'GEMINI_API_KEY=GEMINI_API_KEY:latest' \
 *     --source .
 */

const ALLOWED_ORIGINS = [
  "https://story-darugi.com",
  "https://www.story-darugi.com",
  "https://ai-hospital.pages.dev",
  "http://localhost:5173",
];

function getCorsOrigin(req) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".pages.dev")) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

exports.geminiProxy = async (req, res) => {
  // CORS
  const allowedOrigin = getCorsOrigin(req);
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS 프리플라이트
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const body = req.body;

    if (!body || !body.prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // API 키 (Secret Manager에서 주입됨)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API key not configured" });
    }

    // Gemini REST API 요청 구성
    const model = body.model || "gemini-3.1-pro-preview";
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
      return res.status(response.status).json({
        error: `Gemini API error (${response.status})`,
        details: errText,
      });
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("");

    return res.status(200).json({
      text,
      usageMetadata: result.usageMetadata || null,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Gemini API timeout" });
    }
    return res.status(500).json({ error: err.message || "Internal error" });
  }
};
