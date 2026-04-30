/**
 * GET /api/zdebug/openai-image-ping — OpenAI Images API access 진단용 임시 endpoint.
 *
 * ⚠️ 인증 없음. 진단 끝나면 삭제 권장.
 *
 * 사용자 보고 "AI 이미지 생성이 안된다" 의 외부 원인 (env / quota / billing /
 * 모델 access / 정책 변동) 을 분리하기 위한 진단 자산. 후보 이미지 모델들을
 * 최소 payload (1024x1024 low quality) 로 ping 하여 status + 결과 길이 반환.
 *
 * 패턴: app/api/zdebug/openai-ping/route.ts 와 동일 구조 (Chat → Images 변형).
 *
 * ⚠️ 비용 주의: 이미지 생성은 chat ping 보다 비싸 (gpt-image-2 1024 low ≈ $0.01/이미지).
 * 후보 모델 개수만큼 호출 × 1회. 진단 끝나면 삭제 권장.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// 이미지 생성은 chat 보다 길다 — gpt-image-2 평균 30~60s, worst 90s.
// 4 모델 sequential 시 worst 240s. Vercel Pro maxDuration 300 안에서 안전하게.
export const maxDuration = 300;

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const PING_PROMPT = 'a red circle on white background';

interface PingResult {
  model: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  resultLen: number;  // b64_json 길이 (성공 시)
  bodyPreview: string;
}

async function pingModel(model: string, key: string): Promise<PingResult> {
  const started = Date.now();
  try {
    const r = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        prompt: PING_PROMPT,
        size: '1024x1024',
        quality: 'low',
        n: 1,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await r.text();
    let resultLen = 0;
    if (r.ok) {
      try {
        const data = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
        const first = data.data?.[0];
        resultLen = first?.b64_json?.length ?? (first?.url?.length ?? 0);
      } catch { /* parse fail — resultLen 0 유지 */ }
    }
    return {
      model,
      status: r.status,
      ok: r.ok,
      latencyMs: Date.now() - started,
      resultLen,
      bodyPreview: r.ok ? '(success)' : text.slice(0, 400),
    };
  } catch (e) {
    return {
      model,
      status: 0,
      ok: false,
      latencyMs: Date.now() - started,
      resultLen: 0,
      bodyPreview: `[fetch error] ${(e as Error).message.slice(0, 200)}`,
    };
  }
}

export async function GET() {
  // prod 노출 차단 — keyMask + 모델 access 정보 누출 방지.
  // 진단은 Vercel Preview / 로컬에서만.
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'zdebug disabled in production' }, { status: 404 });
  }

  // 멀티키 정보: OPENAI_API_KEY + OPENAI_API_KEY_0~10 카운트만 (전부 ping 하면 비용 누적).
  // 첫 키로만 ping.
  const keys: string[] = [];
  const primary = process.env.OPENAI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 0; i <= 10; i++) {
    const v = process.env[`OPENAI_API_KEY_${i}`];
    if (v && v !== primary) keys.push(v);
  }

  if (keys.length === 0) {
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

  const key = keys[0];
  const keyMask = `${key.slice(0, 6)}***${key.slice(-4)} (length=${key.length})`;

  // 후보 모델: 현재 사용 중 + 명시 버전 핀 + auto resolution + 안정 fallback 컨트롤
  const models = [
    'gpt-image-2',                // 현재 사용 중 (검증 대상, 회귀 시 첫 번째 의심)
    'gpt-image-2-2026-04-21',     // 스냅샷 핀 (auto resolution 의심 시 비교)
    'gpt-image-2-2026',           // 명시 연도 (silent 변경 비교)
    'dall-e-3',                   // 안정 fallback 컨트롤
  ];

  // sequential — 동시 호출 시 OpenAI rate limit 회피 + 비용 누적 가시성.
  const results: PingResult[] = [];
  for (const m of models) {
    results.push(await pingModel(m, key));
  }

  return NextResponse.json({
    keyCount: keys.length,
    keyMask,
    env: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    },
    timestamp: new Date().toISOString(),
    models: results,
    diagnose: results.map((r) => {
      if (r.ok) return `✅ ${r.model}: OK (${r.latencyMs}ms, b64_len=${r.resultLen})`;
      if (r.status === 400) return `❌ ${r.model}: 400 — 파라미터 오류 (size/quality/prompt 검증, bodyPreview 참고)`;
      if (r.status === 401) return `❌ ${r.model}: 401 — API key 무효`;
      if (r.status === 403) return `❌ ${r.model}: 403 — organization verification / billing 점검`;
      if (r.status === 404) return `❌ ${r.model}: 404 — 모델 미존재 또는 조직 access 없음`;
      if (r.status === 429) return `❌ ${r.model}: 429 — quota / rate limit`;
      if (r.status === 500 || r.status === 503) return `❌ ${r.model}: ${r.status} — OpenAI 측 일시 다운`;
      if (r.status === 0) return `❌ ${r.model}: 네트워크 / timeout (120s 초과)`;
      return `❌ ${r.model}: ${r.status} — bodyPreview 참고`;
    }),
  });
}
