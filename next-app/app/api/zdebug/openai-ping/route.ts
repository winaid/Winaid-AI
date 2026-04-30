/**
 * GET /api/zdebug/openai-ping — OpenAI API 키/모델 access 진단용 임시 endpoint.
 *
 * ⚠️ 인증 없음. 진단 끝나면 삭제 권장.
 *
 * 사용자 보고 "GPT 도 실측이 안돼 갑자기" 의 외부 원인 (env / quota / billing /
 * 정책 / 모델 버전 변동) 을 분리하기 위한 진단 자산. 후보 모델들을 최소 payload
 * 로 ping 하여 status + body preview 반환.
 *
 * 패턴: app/api/zdebug/gemini-ping/route.ts 와 동일 구조.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

async function pingModel(model: string, key: string) {
  const started = Date.now();
  try {
    const r = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    return {
      model,
      status: r.status,
      ok: r.ok,
      latencyMs: Date.now() - started,
      bodyPreview: text.slice(0, 400),
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
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    return NextResponse.json({
      status: 'no_key',
      message: 'OPENAI_API_KEY 환경변수가 설정되어 있지 않음 (Vercel env)',
      env: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  const keyMask = `${key.slice(0, 6)}***${key.slice(-4)} (length=${key.length})`;

  // 후보 모델: 실측 운영용 + 비교 컨트롤
  const models = [
    'gpt-5-search-api',        // 현재 사용 중 (검증 대상, 회귀 시 첫 번째 의심)
    'gpt-5.4-search-api',      // 명시 버전 핀 (auto resolution 의심 시 비교)
    'gpt-5.3-search-api',      // 명시 이전 버전 (silent 변경 비교)
    'gpt-5',                   // search 없는 일반 5 (search 분기 영향 분리)
    'gpt-4o-search-preview',   // 안정 search 모델 (컨트롤)
  ];

  const results = await Promise.all(models.map((m) => pingModel(m, key)));

  return NextResponse.json({
    keyMask,
    env: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    },
    timestamp: new Date().toISOString(),
    models: results,
    diagnose: results.map((r) => {
      if (r.ok) return `✅ ${r.model}: OK (${r.latencyMs}ms)`;
      if (r.status === 400) return `❌ ${r.model}: 400 — 모델 또는 요청 파라미터 오류 (bodyPreview 참고)`;
      if (r.status === 401) return `❌ ${r.model}: 401 — API key 무효`;
      if (r.status === 403) return `❌ ${r.model}: 403 — billing / restrictions 점검`;
      if (r.status === 404) return `❌ ${r.model}: 404 — 모델 ID 미존재 또는 조직 access 없음`;
      if (r.status === 429) return `❌ ${r.model}: 429 — quota / rate limit`;
      if (r.status === 503) return `❌ ${r.model}: 503 — OpenAI 측 일시 다운`;
      if (r.status === 0) return `❌ ${r.model}: 네트워크 / timeout`;
      return `❌ ${r.model}: ${r.status} — bodyPreview 참고`;
    }),
  });
}
