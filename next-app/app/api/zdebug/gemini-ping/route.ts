/**
 * GET /api/_debug/gemini-ping — Gemini API 키/모델 access 진단용 임시 endpoint.
 *
 * ⚠️ 인증 없음. 진단 끝나면 삭제 권장.
 *
 * Gemini API 를 최소 payload 로 호출하여 키/quota/access 상태를 확인.
 * 응답에 status + body preview 포함 (key 값은 redact).
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const REDACT_KEY = (s: string) => s.replace(/key=[A-Za-z0-9_-]+/g, 'key=***');

async function pingModel(model: string, key: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    return {
      model,
      status: r.status,
      ok: r.ok,
      latencyMs: Date.now() - started,
      bodyPreview: REDACT_KEY(text.slice(0, 400)),
    };
  } catch (e) {
    return {
      model,
      status: 0,
      ok: false,
      latencyMs: Date.now() - started,
      bodyPreview: `[fetch error] ${(e as Error).message.slice(0, 200)}`,
    };
  }
}

export async function GET() {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const v = process.env[i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`];
    if (v) keys.push(v);
  }

  if (keys.length === 0) {
    return NextResponse.json({
      status: 'no_key',
      message: 'GEMINI_API_KEY 환경변수가 설정되어 있지 않음 (Vercel env)',
    }, { status: 500 });
  }

  const key = keys[0];
  const keyMask = `${key.slice(0, 6)}***${key.slice(-4)} (length=${key.length})`;

  // 우리 코드가 실제로 쓰는 모델들 ping
  const models = [
    'gemini-3.1-pro-preview',         // GEO 실측 + blog final
    'gemini-3.1-flash-lite-preview',  // 다수 task (free tier)
    'gemini-3.1-flash-image-preview', // 이미지
  ];

  const results = await Promise.all(models.map((m) => pingModel(m, key)));

  return NextResponse.json({
    keyCount: keys.length,
    keyMask,
    models: results,
    diagnose: results.map((r) => {
      if (r.ok) return `✅ ${r.model}: OK (${r.latencyMs}ms)`;
      if (r.status === 401) return `❌ ${r.model}: 401 — API key 무효`;
      if (r.status === 403 && r.bodyPreview.includes('PERMISSION_DENIED')) {
        return `❌ ${r.model}: 403 PERMISSION_DENIED — Cloud Console 의 API restrictions 확인 (Generative Language API 허용 필요) 또는 모델 access tier 부족`;
      }
      if (r.status === 403) return `❌ ${r.model}: 403 — 권한 / billing / restrictions 점검`;
      if (r.status === 404) return `❌ ${r.model}: 404 — 모델 ID 또는 region 문제`;
      if (r.status === 429) return `❌ ${r.model}: 429 — quota / rate limit 초과`;
      if (r.status === 503) return `❌ ${r.model}: 503 — Google 측 일시 다운`;
      if (r.status === 0) return `❌ ${r.model}: 네트워크 / timeout`;
      return `❌ ${r.model}: ${r.status} — bodyPreview 참고`;
    }),
  });
}
