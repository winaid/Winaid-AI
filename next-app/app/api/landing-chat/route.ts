/**
 * /api/landing-chat — 랜딩 페이지 전용 챗봇 엔드포인트
 *
 * 왜 별도 라우트인가?
 *   /api/gemini에 있던 "systemInstruction에 winaid 포함 시 인증 우회" 백도어는
 *   공개 문자열이라 누구나 악용할 수 있었다. 백도어를 제거하고 /api/gemini는
 *   로그인 사용자 전용으로 강화하고, 대신 비로그인 랜딩 방문자용 제한적 챗봇을
 *   이 파일로 분리한다.
 *
 * 보안/남용 방지 장치:
 *   1) 모델 고정: gemini-3.1-flash-lite-preview (비용/속도 기준 가장 저렴)
 *   2) maxOutputTokens 300 고정 (긴 응답 남용 차단)
 *   3) systemInstruction 클라이언트 지정 금지 — 서버에서 하드코딩
 *   4) IP 기반 in-memory rate limit (1분 10회 / 1시간 60회)
 *   5) prompt 길이 2000자 제한
 *
 * 한계:
 *   - in-memory rate limit은 서버리스 인스턴스 간 공유가 안 됨. 완벽한 차단은
 *     아니지만 일반 브라우저 봇에는 충분한 저지선. 필요 시 Upstash Redis 전환.
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_OUTPUT_TOKENS = 300;
const MAX_PROMPT_CHARS = 2000;
const RATE_PER_MINUTE = 10;
const RATE_PER_HOUR = 60;

const SYSTEM_INSTRUCTION = `역할: 윈에이아이(WINAI) 병원 마케팅 AI 어시스턴트

윈에이아이 서비스:
- 블로그 글 AI 자동 생성 (의료광고법 자동 검증)
- 카드뉴스/보도자료/이미지 자동 제작
- AI 콘텐츠 보정 (AI 흔적 제거)

답변 규칙:
1. 2~3문장으로 간결하게. "~해요/~돼요" 친근한 존댓말.
2. 병원 마케팅 질문이면 정보 제공 후 윈에이아이 서비스와 자연스럽게 연결.
3. 한국어만 사용.

의료법 안전:
- 특정 시술/약의 효과 보장 금지 ("완치", "100%", "최고" 금지)
- 의학적 조언 금지 — "정확한 진단은 전문의 상담이 필요해요" 안내
- 불안감 조장 금지

❌ "미백은 완벽한 효과를 보장해요!"
✅ "치아 미백 효과는 생활 습관에 따라 6~24개월 유지돼요. 윈에이아이에서는 이런 정보를 의료법 자동 검증하면서 블로그 글을 만들어줘요."

모르는 질문은 솔직히 "잘 모르겠어요"라고 답하세요.`;

// ── in-memory rate limiter ──
type Bucket = { minute: number[]; hour: number[] };
const buckets = new Map<string, Bucket>();

function getClientKey(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return ip;
}

function checkRate(key: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const hourAgo = now - 3_600_000;

  let b = buckets.get(key);
  if (!b) {
    b = { minute: [], hour: [] };
    buckets.set(key, b);
  }

  b.minute = b.minute.filter(t => t > minuteAgo);
  b.hour = b.hour.filter(t => t > hourAgo);

  if (b.minute.length >= RATE_PER_MINUTE) {
    const oldest = b.minute[0];
    return { ok: false, retryAfter: Math.ceil((oldest + 60_000 - now) / 1000) };
  }
  if (b.hour.length >= RATE_PER_HOUR) {
    const oldest = b.hour[0];
    return { ok: false, retryAfter: Math.ceil((oldest + 3_600_000 - now) / 1000) };
  }

  b.minute.push(now);
  b.hour.push(now);

  // 버킷 청소 (메모리 방어)
  if (buckets.size > 10_000) {
    const firstKey = buckets.keys().next().value;
    if (firstKey) buckets.delete(firstKey);
  }

  return { ok: true };
}

function getKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  return keys;
}

export async function POST(request: NextRequest) {
  // 1) rate limit
  const clientKey = getClientKey(request);
  const rate = checkRate(clientKey);
  if (!rate.ok) {
    return NextResponse.json(
      { error: '잠시 후 다시 시도해주세요.', retryAfter: rate.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  // 2) 요청 파싱
  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'prompt 필수' }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `prompt는 ${MAX_PROMPT_CHARS}자 이하로 입력해주세요.` },
      { status: 400 },
    );
  }

  // 3) Gemini 호출
  const keys = getKeys();
  if (keys.length === 0) {
    return NextResponse.json({ error: '[env] GEMINI_API_KEY 누락' }, { status: 500 });
  }
  const apiKey = keys[Math.floor(Math.random() * keys.length)];

  const apiBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(apiBody),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = (await res.text()).substring(0, 300).replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
      return NextResponse.json(
        { error: `Gemini ${res.status}`, details: errText },
        { status: 502 },
      );
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return NextResponse.json({ text });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const error = err as Error;
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간 초과' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || '서버 오류' }, { status: 500 });
  }
}
