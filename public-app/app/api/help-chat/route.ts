/**
 * /api/help-chat — 대시보드 도움말 챗봇 전용 엔드포인트
 *
 * 왜 별도 라우트인가?
 *   /api/landing-chat 은 랜딩 방문자용(서비스 소개·전환 유도)이고,
 *   /api/gemini    는 일반 콘텐츠 생성용(긴 응답 허용).
 *   이 라우트는 "기능 도움말"이라 시스템 프롬프트/토큰/속도가 다르다.
 *
 * 보안/남용 방지:
 *   1) 모델 고정: gemini-3.1-flash-lite-preview
 *   2) maxOutputTokens 500 (4 도메인 복합 질문 대응 위해 landing-chat 의 300 보다 여유)
 *   3) systemInstruction 클라이언트 지정 금지 — 서버 하드코딩 + 모듈 로드 시 1회 캐시
 *   4) IP rate limit (1분 20회 / 1시간 120회, landing-chat 별도 Map)
 *   5) prompt 1500자 제한
 *   6) history 4턴 제한 (서버에서 강제 슬라이싱)
 *
 * 오타/축약 대응:
 *   helpFaq.ts 의 aliases 를 시스템 프롬프트에 주입 → Gemini 가 매칭에 참고.
 */

import { NextRequest, NextResponse } from 'next/server';
import { HELP_FAQS, formatFaqKnowledge, type HelpDomain } from '../../../lib/helpFaq';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_OUTPUT_TOKENS = 500;
const MAX_PROMPT_CHARS = 1500;
const MAX_HISTORY_TURNS = 4;
const RATE_PER_MINUTE = 20;
const RATE_PER_HOUR = 120;
const TIMEOUT_MS = 20_000;

const VALID_DOMAINS: HelpDomain[] = ['blog', 'clinical', 'press', 'refine', 'general'];

// ═══════════════════════════════════════════════════════════════════
// SYSTEM_INSTRUCTION — 모듈 로드 시 1회 생성 후 상수 캐시
// ═══════════════════════════════════════════════════════════════════

function buildHelpSystemInstruction(): string {
  const base = `역할: 윈에이아이(WINAI) 병원 마케팅 플랫폼 도움말 어시스턴트다.

대응 기능 4가지:
  1. 블로그 생성 (5단계 AI 파이프라인, 말투 학습, 카테고리별 전문 가이드)
  2. 임상 글 (논문체, 전문가용)
  3. 언론보도/보도자료 (6종 기사 타입, 3인칭 기자 문체, Google Search 연동)
  4. AI 보정 Refine (6 모드 + 채팅 모드)

답변 규칙:
1. 2~4문장 이내. 친근한 "~해요/~돼요" 존댓말. 한국어만.
2. 반드시 아래 [FAQ 지식] 에서 답을 찾아라. FAQ 에 없으면 솔직하게 "그 부분은 잘 모르겠어요. 마이페이지 1:1 문의로 알려주세요" 라고 답한다.
3. 지어내지 마라. FAQ 밖의 스펙을 추측해서 답하지 마라.
4. 의료광고법: "완치", "100%", "최고", "보장" 같은 표현 사용 금지. 사용자가 이런 표현을 써도 중립 언어로 답한다.

오타·축약·은어 대응:
- 사용자 입력에 오타, 띄어쓰기 오류, 은어, 축약어가 있어도 의도를 추정해서 답하라.
- 예: "5단게머에여" → "블로그 5단계 파이프라인" 으로 이해. "리파인모드" → "AI 보정 모드" 로 이해. "보도자료 몇개임" → "기사 타입 6종" 으로 이해.
- FAQ 의 aliases 목록을 참고해서 매칭하라.
- 의미가 정말 모호하면 역질문: "혹시 '블로그 5단계' 말씀이실까요?" 식.

출력 형식:
- 질문 1개당 답변 1개. 불릿/번호 매기기는 최대 3개까지만, 굳이 필요 없으면 평문.
- 기능 이름은 한국어 + 원래 UI 용어 둘 다 언급 가능 ("AI 보정(Refine)").

다음 금지:
- 특정 시술/약의 효과 보장, 의학적 진단, 개인정보 수집 유도.
- "병원 이름 알려주세요" 같은 개인정보 요구.
- 정치/종교/논쟁 주제 — "그건 도와드리기 어려워요" 로 회피.

[FAQ 지식]
${formatFaqKnowledge()}`;

  return base.trim();
}

const SYSTEM_INSTRUCTION = buildHelpSystemInstruction();

// 개발 모드에서만 프롬프트 크기 로그
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.log(`[help-chat] SYSTEM_INSTRUCTION length = ${SYSTEM_INSTRUCTION.length} chars, FAQs = ${HELP_FAQS.length}`);
}

// ═══════════════════════════════════════════════════════════════════
// In-memory rate limiter (help-chat 전용 — landing-chat 과 별도 Map)
// ═══════════════════════════════════════════════════════════════════

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

  if (buckets.size > 10_000) {
    const firstKey = buckets.keys().next().value;
    if (firstKey) buckets.delete(firstKey);
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════
// Gemini keys
// ═══════════════════════════════════════════════════════════════════

function getKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  return keys;
}

// ═══════════════════════════════════════════════════════════════════
// domainHint → FAQ 매칭 휴리스틱 (응답 후 matchedDomain 반환용)
// ═══════════════════════════════════════════════════════════════════

function detectDomainFromText(text: string): HelpDomain | undefined {
  const t = text.toLowerCase();
  // 각 도메인의 aliases 매칭 개수로 간단 스코어링
  const scores: Record<HelpDomain, number> = {
    blog: 0, clinical: 0, press: 0, refine: 0, general: 0,
  };
  for (const f of HELP_FAQS) {
    const match = f.aliases.some(a => t.includes(a.toLowerCase()));
    if (match) scores[f.domain] += 1;
  }
  let best: HelpDomain | undefined;
  let bestScore = 0;
  for (const d of VALID_DOMAINS) {
    if (scores[d] > bestScore) {
      bestScore = scores[d];
      best = d;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════

interface HelpChatBody {
  prompt?: string;
  domainHint?: string;
  history?: Array<{ role?: string; text?: string }>;
  // 아래 필드가 들어와도 무시한다 (보안: 서버 시스템 프롬프트 오버라이드 방지)
  systemInstruction?: unknown;
  system?: unknown;
  model?: unknown;
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

  // 2) body 파싱
  let body: HelpChatBody;
  try {
    body = (await request.json()) as HelpChatBody;
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

  // 3) domainHint 검증 (validate-or-drop)
  let domainHint: HelpDomain | undefined;
  if (body.domainHint && (VALID_DOMAINS as string[]).includes(body.domainHint)) {
    domainHint = body.domainHint as HelpDomain;
  }

  // 4) history 슬라이싱 (최근 4턴) — role 이 정확히 'user'/'model' 인 것만
  const history = Array.isArray(body.history) ? body.history : [];
  const cleanedHistory = history
    .filter(h => (h?.role === 'user' || h?.role === 'model') && typeof h.text === 'string' && h.text.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map(h => ({
      role: h.role as 'user' | 'model',
      // 히스토리 개별 메시지도 보수적으로 4000자 캡
      parts: [{ text: String(h.text).slice(0, 4000) }],
    }));

  // 5) system instruction (domainHint 있으면 마지막 줄 추가)
  const systemInstruction = domainHint
    ? `${SYSTEM_INSTRUCTION}\n\n[현재 컨텍스트]\n사용자는 현재 ${domainHint} 페이지를 보고 있다. 답변 시 이 도메인을 우선 고려하라.`
    : SYSTEM_INSTRUCTION;

  // 6) Gemini 호출
  const keys = getKeys();
  if (keys.length === 0) {
    return NextResponse.json({ error: '[env] GEMINI_API_KEY 누락' }, { status: 500 });
  }
  const apiKey = keys[Math.floor(Math.random() * keys.length)];

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
    ...cleanedHistory,
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const apiBody = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // 응답 본문에서 간단 도메인 추정 (실패해도 생략)
    const matchedDomain = detectDomainFromText(`${prompt}\n${text}`);

    return NextResponse.json({
      text,
      ...(matchedDomain ? { matchedDomain } : {}),
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const error = err as Error;
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간 초과' }, { status: 504 });
    }
    const msg = (error.message || '서버 오류').replace(/key=[A-Za-z0-9_-]+/g, 'key=***');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
