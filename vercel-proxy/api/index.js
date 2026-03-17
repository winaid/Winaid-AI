/**
 * / (루트) — 프록시 상태 페이지
 *
 * 배포 후 브라우저에서 루트 URL 접속 시 프록시 상태를 바로 확인할 수 있다.
 * GET / → HTML 상태 페이지
 */

export default function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 현재 인증 모드 판별
  const authMode = "optional (anonymous 허용)"; // TODO: 2026-03-29 인증 복구 시 "strict" 로 변경

  const keysConfigured = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean).length;

  const supabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const region = process.env.VERCEL_REGION || "iad1";
  const timestamp = new Date().toISOString();

  // Accept 헤더에 따라 JSON 또는 HTML 반환
  const accept = req.headers.accept || "";
  if (accept.includes("application/json")) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      service: "WINAID Gemini Proxy",
      status: "ok",
      region,
      authMode,
      cors: true,
      routes: {
        "POST /api/gemini": "Gemini API proxy (text/image/raw)",
        "GET  /api/gemini": "Gemini health + key status",
        "GET  /api/health": "Simple health check",
        "GET  /": "This status page",
      },
      env: {
        geminiKeys: keysConfigured,
        supabase: supabaseConfigured,
      },
      timestamp,
    });
  }

  // HTML 상태 페이지
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WINAID Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1e293b; border-radius: 16px; padding: 40px; max-width: 520px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; color: #f8fafc; }
    .badge { display: inline-block; background: #22c55e; color: #fff; font-size: 0.75rem; font-weight: 600; padding: 2px 10px; border-radius: 9999px; margin-left: 8px; vertical-align: middle; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; font-size: 0.875rem; border-bottom: 1px solid #334155; }
    td:first-child { color: #94a3b8; width: 140px; }
    td:last-child { color: #f1f5f9; font-family: 'SF Mono', monospace; }
    .route { background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; display: inline-block; margin: 2px 0; }
    .footer { margin-top: 20px; color: #64748b; font-size: 0.75rem; text-align: center; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>WINAID Gemini Proxy <span class="badge">OK</span></h1>
    <p class="subtitle">AI 병원 블로그 마케팅 프록시 서버</p>
    <table>
      <tr><td>Region</td><td>${region}</td></tr>
      <tr><td>Auth Mode</td><td>${authMode}</td></tr>
      <tr><td>CORS</td><td>Enabled</td></tr>
      <tr><td>Gemini Keys</td><td>${keysConfigured}개 설정됨</td></tr>
      <tr><td>Supabase</td><td>${supabaseConfigured ? "연결됨" : "미설정"}</td></tr>
      <tr>
        <td>Routes</td>
        <td>
          <a href="/api/gemini" class="route">GET /api/gemini</a><br>
          <span class="route">POST /api/gemini</span><br>
          <a href="/api/health" class="route">GET /api/health</a>
        </td>
      </tr>
      <tr><td>Timestamp</td><td>${timestamp}</td></tr>
    </table>
    <p class="footer">WINAID &copy; 2025 &mdash; <a href="/api/health">Health Check</a></p>
  </div>
</body>
</html>`);
}
