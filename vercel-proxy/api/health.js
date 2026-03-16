/**
 * /api/health — 프록시 헬스 체크 전용 엔드포인트
 *
 * 용도:
 * 1. 프록시가 살아 있는지 확인 (404 여부 판별)
 * 2. CORS 설정 진단
 * 3. 프론트엔드 pre-check용
 *
 * GET /api/health → { status: "ok", ... }
 * OPTIONS /api/health → 204 (CORS preflight)
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://story-darugi.com",
  "https://www.story-darugi.com",
  "https://ai-hospital.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

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
  if (getAllowedOrigins().includes(origin)) return true;
  if (origin.endsWith(".pages.dev") && origin.startsWith("https://")) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  } catch {}
  if (origin.endsWith(".sandbox.novita.ai")) return true;
  return false;
}

function corsHeaders(origin) {
  const allowed = isOriginAllowed(origin);
  const effectiveOrigin = allowed ? origin : "https://story-darugi.com";
  return {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  res.setHeader("Content-Type", "application/json");

  return res.status(200).json({
    status: "ok",
    service: "gemini-proxy",
    region: process.env.VERCEL_REGION || "iad1",
    timestamp: new Date().toISOString(),
    cors: {
      requestOrigin: origin || "(none)",
      allowed: isOriginAllowed(origin),
    },
    routes: {
      gemini: "/api/gemini",
      health: "/api/health",
    },
  });
}
