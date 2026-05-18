/**
 * POST /api/influencer/generate-dm — 인플루언서 협업 DM 자동 생성 (public-app 외부 출시용)
 *
 * 흐름:
 *   1. gateGuestRequest (IP rate limit, 분당 30회) + resolveImageOwner — 게스트는 401
 *      (DM 생성은 1 credit 차감 대상이라 게스트 식별 불가능 → 차단. PR-D 명세)
 *   2. 입력 검증 + sanitize chain (4중):
 *      - influencer.* / hospital.* 메타 → sanitizePromptInput
 *      - recent_post_text (외부 IG 텍스트) → stripInjectionForUse + sanitizeSourceContent
 *      - customInstruction (옵션) → stripInjectionForUse + sanitizePromptInput(200)
 *   3. buildDmPrompt → callLLM('instagram_dm') — Claude Haiku 4.5
 *   4. JSON parse → drafts 추출 (fail-closed: parse fail / 빈 응답 → 502)
 *   5. 후처리 chain (각 draft.message 에 적용):
 *      - stripPromptLeakage (plain text 모드)
 *      - applyContentFilters → filtered + 의료법 violations
 *   6. violations 발견 시 autoReplaceMessage 필드 채워 반환 — 클라이언트 1-click 치환.
 *
 * credit:
 *   - 서버는 차감 안 함. client-side counter 가 DM 1회 생성당 1 credit 차감 (별도 endpoint).
 *   - 어드민 분기는 next-app 만 — public-app 은 일반 유저만 (admin_session 비보유).
 *
 * P-1 / P-2 비충돌 (public-app 은 일반 유저용 — admin 분기 무관, 텍스트 LLM 만).
 *
 * 양 앱 lockstep: next-app 의 동일 라우트와 sanitize / 빌더 호출 / 후처리 chain
 * 모두 동일. 게이트 (gateGuestRequest + owner === 'guest' 차단) 만 추가 차이.
 */
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import {
  buildDmPrompt,
  callLLM,
  applyContentFilters,
  filterMedicalLawViolations,
  stripPromptLeakage,
  sanitizePromptInput,
  sanitizeSourceContent,
  stripInjectionForUse,
  type DmTone,
} from '@winaid/blog-core';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const VALID_TONES: ReadonlySet<DmTone> = new Set(['casual', 'business', 'friendly']);
const MAX_CUSTOM_INSTRUCTION = 200;
const MAX_DRAFTS = 3;

// ── 5 패턴 휴리스틱 (UI 경고용 — filterMedicalLawViolations 와 중복돼도 안전망) ──
const MEDICAL_AD_HEURISTICS = [
  { pattern: /최고|최초|유일|탁월|혁신/g, message: '최상급/과장 표현' },
  { pattern: /완치|100\s?%|확실히|보장/g, message: '효과 보장 표현' },
  { pattern: /무료|할인|특가|이벤트/g, message: '가격/할인 언급 (첫 DM 금지)' },
  { pattern: /지금\s*바로|서두르|한정/g, message: '긴급성 압박 표현' },
  { pattern: /전후\s*사진|비포\s*애프터|before.*after/gi, message: '전후 비교 언급' },
];

function checkMedicalAdHeuristics(text: string): string[] {
  const warnings: string[] = [];
  for (const rule of MEDICAL_AD_HEURISTICS) {
    const matches = text.match(rule.pattern);
    if (matches) warnings.push(`${rule.message}: "${matches[0]}"`);
  }
  return warnings;
}

interface DraftJson {
  tone?: string;
  message?: string;
}
interface DmResponseJson {
  drafts?: DraftJson[];
}

function tryParseJson(raw: string): DmResponseJson | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as DmResponseJson; } catch { /* pass */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]) as DmResponseJson; } catch { /* pass */ }
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as DmResponseJson; } catch { /* pass */ }
  }
  return null;
}

interface GenerateDmBody {
  influencer?: {
    username?: string;
    full_name?: string;
    follower_count?: number;
    engagement_rate?: number;
    estimated_location?: string;
    primary_category?: string;
    recent_posts?: { text?: string }[];
  };
  hospital?: {
    name?: string;
    location?: string;
    features?: string;
    instagram?: string;
  };
  tone?: string;
  customInstruction?: string;
}

export async function POST(request: NextRequest) {
  // 1) IP 기반 분당 30회 rate limit
  const gate = gateGuestRequest(request, 30);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 2) 게스트 차단 — DM 생성은 1 credit 차감 대상 (식별된 user 필요)
  const owner = await resolveImageOwner(request);
  if (owner === 'guest') {
    return NextResponse.json(
      { error: 'unauthorized', details: 'DM 생성은 로그인 후 사용 가능합니다.' },
      { status: 401 },
    );
  }
  const userId = owner;

  let body: GenerateDmBody;
  try { body = (await request.json()) as GenerateDmBody; }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const influencer = body.influencer;
  if (!influencer || typeof influencer !== 'object') {
    return NextResponse.json({ error: 'bad_request', details: '인플루언서 정보가 없습니다' }, { status: 400 });
  }
  const tone = (body.tone || 'casual') as DmTone;
  if (!VALID_TONES.has(tone)) {
    return NextResponse.json({ error: 'bad_request', details: 'tone 은 casual / business / friendly 중 하나' }, { status: 400 });
  }

  // ── sanitize chain 4중 (입력) ──
  const safeUsername = sanitizePromptInput(influencer.username, 80);
  const safeFullName = sanitizePromptInput(influencer.full_name, 80);
  const safeLocation = sanitizePromptInput(influencer.estimated_location, 80);
  const safeCategory = sanitizePromptInput(influencer.primary_category, 60);
  if (!safeUsername) {
    return NextResponse.json({ error: 'bad_request', details: 'username 누락' }, { status: 400 });
  }

  // 외부 IG 게시물 텍스트 — stripInjectionForUse + sanitizeSourceContent 2단.
  const rawRecent = influencer.recent_posts?.[0]?.text || '';
  const recentStripped = stripInjectionForUse(String(rawRecent));
  const recentPostText = sanitizeSourceContent(recentStripped, 150);

  const hospital = body.hospital || {};
  const safeHospitalName = sanitizePromptInput(hospital.name, 100);
  const safeHospitalLocation = sanitizePromptInput(hospital.location, 100);
  const safeHospitalFeatures = sanitizePromptInput(hospital.features, 200);
  const safeHospitalInstagram = sanitizePromptInput(hospital.instagram, 80);

  // customInstruction (옵션)
  let customInstruction: string | undefined;
  if (typeof body.customInstruction === 'string' && body.customInstruction.trim()) {
    const stripped = stripInjectionForUse(body.customInstruction.trim());
    const capped = sanitizePromptInput(stripped, MAX_CUSTOM_INSTRUCTION);
    customInstruction = capped || undefined;
  }

  const followerCount = Math.max(0, Math.min(1_000_000_000, Number(influencer.follower_count) || 0));
  const engagementRate = Math.max(0, Math.min(100, Number(influencer.engagement_rate) || 0));

  const { systemBlocks, userPrompt } = buildDmPrompt({
    influencer: {
      username: safeUsername,
      full_name: safeFullName,
      follower_count: followerCount,
      engagement_rate: engagementRate,
      estimated_location: safeLocation,
      primary_category: safeCategory,
      recent_post_text: recentPostText || undefined,
    },
    hospital: {
      name: safeHospitalName,
      location: safeHospitalLocation,
      features: safeHospitalFeatures,
      instagram: safeHospitalInstagram,
    },
    tone,
    customInstruction,
  });

  let rawText = '';
  let model = '';
  try {
    const resp = await callLLM({
      task: 'instagram_dm',
      systemBlocks,
      userPrompt,
      temperature: 0.8,
      maxOutputTokens: 2048,
      userId,
      abortSignal: request.signal,
    });
    rawText = resp.text;
    model = resp.model;
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[generate-dm] callLLM failed: ${message}`);
    return NextResponse.json(
      { error: 'llm_failed', details: message.slice(0, 200) },
      { status: 502 },
    );
  }

  const parsed = tryParseJson(rawText);
  const rawDrafts = Array.isArray(parsed?.drafts) ? parsed!.drafts! : [];
  if (rawDrafts.length === 0) {
    console.warn(`[generate-dm] parse_failed: ${rawText.slice(0, 200)}`);
    return NextResponse.json(
      { error: 'parse_failed', details: '응답 파싱 실패. 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  // 출력 sanitize chain + 의료법 자동수정 마커
  const drafts = rawDrafts.slice(0, MAX_DRAFTS).map((d): {
    tone: string;
    message: string;
    warnings: string[];
    autoReplaceMessage?: string;
    replacedCount?: number;
  } => {
    const draftTone = String(d.tone || tone);
    const rawMessage = String(d.message || '');
    if (!rawMessage) return { tone: draftTone, message: '', warnings: ['empty_message'] };

    const leak = stripPromptLeakage(rawMessage, false);
    const filtered = applyContentFilters(leak.html);
    const message = filtered.filtered.trim();
    const warnings = checkMedicalAdHeuristics(message);

    const replaceResult = filterMedicalLawViolations(message);
    const result: {
      tone: string; message: string; warnings: string[];
      autoReplaceMessage?: string; replacedCount?: number;
    } = { tone: draftTone, message, warnings };
    if (replaceResult.replacedCount > 0 && replaceResult.filtered !== message) {
      result.autoReplaceMessage = replaceResult.filtered;
      result.replacedCount = replaceResult.replacedCount;
    }
    return result;
  }).filter(d => d.message.length > 0);

  if (drafts.length === 0) {
    return NextResponse.json(
      { error: 'sanitize_emptied', details: '후처리 후 결과가 비었습니다. 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ drafts, model });
}
