/**
 * POST /api/card-news/generate-text
 *
 * C2a Step 2 — outline → 각 슬라이드의 SlideData (텍스트 본문).
 *
 * 정책:
 *   - 게스트 / 인증 사용자 모두 허용 (텍스트 단계까지 게스트 가능).
 *   - 인증 사용자만 useCredit(1). LLM 실패 시 refundCredit.
 *   - 의료광고법 자동 대체 (applyContentFilters) → 슬라이드별 위반 표시 (validateSlideMedicalAd).
 *   - 응답: { slides: SlideData[], violations: SlideFieldViolation[], creditsUsed: 0|1 }.
 *
 * Request body:
 *   {
 *     topic: string,
 *     outline: SlideOutline[],     // /generate-outline 의 응답을 그대로 forward
 *     hospitalName?: string,
 *     category?: string,
 *   }
 *
 * Errors:
 *   400 — body 파싱 / outline 형식 / topic 길이 위반
 *   402 — insufficient_credits (인증 사용자만)
 *   429 — rate limit
 *   500 — LLM 실패 / parse 실패 (인증 사용자에 refundCredit 후)
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { callLLM, applyContentFilters, ensureSlideIds, sanitizeLeakInSlides, type SlideData } from '@winaid/blog-core';
import {
  buildTextPrompt,
  parseSlidesJson,
  V1_LAYOUTS,
  isValidThemeId,
  DEFAULT_THEME,
  type SlideOutline,
  type V1Layout,
  type TextRequest,
  type ThemeId,
} from '../../../../lib/cardNewsPrompt';
import {
  validateSlideMedicalAd,
  type SlideFieldViolation,
} from '../../../../lib/medicalAdValidation';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface Body {
  topic?: unknown;
  outline?: unknown;
  hospitalName?: unknown;
  category?: unknown;
  /** C2-fix-1: 톤 가이드 — undefined 시 default theme. */
  theme?: unknown;
}

function err(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

/** outline 입력 (외부) 의 형식을 검증 — type guard. */
function isValidOutline(value: unknown): value is SlideOutline[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 10) return false;
  const allowed = new Set<string>(V1_LAYOUTS);
  for (const item of value) {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    if (typeof o.index !== 'number') return false;
    if (typeof o.layout !== 'string' || !allowed.has(o.layout)) return false;
    if (typeof o.role !== 'string') return false;
    if (typeof o.titleHint !== 'string') return false;
    if (typeof o.contentHint !== 'string') return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  // ── 1) rate limit — 텍스트 LLM 호출은 가격대 중간. 분당 5회 ──────────
  const gate = gateGuestRequest(request, 5);
  if (!gate.ok) {
    return err(gate.error, gate.status);
  }

  // ── 2) body 파싱 ──────────────────────────────────────────────────────
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return err('invalid_json', 400);
  }

  // ── 3) validation ────────────────────────────────────────────────────
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (topic.length < 5 || topic.length > 200) {
    return err('bad_request', 400, { details: 'topic must be 5~200 chars' });
  }
  if (!isValidOutline(body.outline)) {
    return err('bad_request', 400, {
      details: 'outline must be SlideOutline[3..10] with valid layouts',
    });
  }
  const outline = body.outline; // narrowed to SlideOutline[]
  const hospitalName =
    typeof body.hospitalName === 'string' && body.hospitalName.trim().length <= 50
      ? body.hospitalName.trim() || undefined
      : undefined;
  const category =
    typeof body.category === 'string' && body.category.trim().length <= 30
      ? body.category.trim() || undefined
      : undefined;
  // C2-fix-1: theme 화이트리스트 검증. 알 수 없는 값은 default 로 silent fallback.
  const theme: ThemeId = isValidThemeId(body.theme) ? body.theme : DEFAULT_THEME;

  // ── 4) 인증 + 크레딧 차감 (인증 사용자만) ─────────────────────────────
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
  let creditsUsed = 0;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json(
        { error: 'insufficient_credits', remaining: credit.remaining },
        { status: 402 },
      );
    }
    creditsUsed = 1;
  }

  // ── 5) 환불 헬퍼 (LLM 실패 / parse 실패 시 호출) ──────────────────────
  const refundOnFail = async () => {
    if (userId && creditsUsed > 0) {
      const r = await refundCredit(userId).catch(() => null);
      if (r?.success) creditsUsed = 0;
    }
  };

  // ── 6) 프롬프트 빌드 + LLM 호출 ───────────────────────────────────────
  const tReq: TextRequest = { topic, outline, hospitalName, category, theme };
  const { systemInstruction, prompt } = buildTextPrompt(tReq);

  let llmText: string;
  try {
    const resp = await callLLM({
      task: 'card_news',
      systemBlocks: [{ type: 'text', text: systemInstruction, cacheable: true }],
      userPrompt: prompt,
      temperature: 0.7,
      maxOutputTokens: 8192,
      userId,
      abortSignal: request.signal,
    });
    llmText = resp.text;
  } catch (e) {
    await refundOnFail();
    const msg = (e as Error).message || 'unknown';
    console.warn('[card-news/text] LLM 실패:', msg.slice(0, 200));
    return err('llm_failed', 500, { details: msg.slice(0, 200) });
  }

  // ── 7) JSON parse → SlideData[] ──────────────────────────────────────
  let slides: SlideData[] | null = parseSlidesJson(llmText);
  if (!slides || slides.length === 0) {
    await refundOnFail();
    console.warn('[card-news/text] parse 실패 — LLM 응답 JSON 형식 위반');
    return err('parse_failed', 500, { details: 'LLM 응답 JSON parse 실패' });
  }

  // ── 8) 의료광고법 자동 대체 (텍스트 필드 별로) ────────────────────────
  // applyContentFilters 는 string → MedicalLawFilterResult { filtered, replacedCount }.
  // 카드뉴스는 텍스트 필드가 다수(title, subtitle, body, checkItems[], columns[].items[], ...)
  // 라서 각 필드별로 적용해야 한다.
  let totalReplaced = 0;
  slides = slides.map((s) => {
    const out: SlideData = { ...s };
    const filterText = (t: string | undefined): string | undefined => {
      if (typeof t !== 'string' || !t.trim()) return t;
      const r = applyContentFilters(t);
      totalReplaced += r.replacedCount;
      return r.filtered;
    };
    out.title = filterText(out.title) ?? out.title;
    if (out.subtitle) out.subtitle = filterText(out.subtitle);
    if (out.body) out.body = filterText(out.body);
    if (out.visualKeyword) out.visualKeyword = filterText(out.visualKeyword);
    if (Array.isArray(out.checkItems)) {
      out.checkItems = out.checkItems.map((it) => filterText(it) ?? it);
    }
    if (Array.isArray(out.compareLabels) && out.compareLabels.length === 2) {
      const a = filterText(out.compareLabels[0]) ?? out.compareLabels[0];
      const b = filterText(out.compareLabels[1]) ?? out.compareLabels[1];
      out.compareLabels = [a, b];
    }
    if (Array.isArray(out.columns)) {
      out.columns = out.columns.map((c) => ({
        header: filterText(c.header) ?? c.header,
        items: c.items.map((it) => filterText(it) ?? it),
      }));
    }
    if (Array.isArray(out.hashtags)) {
      out.hashtags = out.hashtags.map((it) => filterText(it) ?? it);
    }
    return out;
  });
  if (totalReplaced > 0) {
    console.info(`[card-news/text] 의료법 자동 대체 ${totalReplaced}건`);
  }

  // ── 8-b) 출력 누수 후처리 (PR #161 / POST_MERGE_FOLLOWUPS #5) ────────
  // PR #158 영문화가 1차 방어. 모델이 영문 메타 라벨을 echo 한 경우 차단.
  // 의료법 필터(8) 다음에 적용 — 둘 다 string-in/string-out, 순서 무관.
  const leakResult = sanitizeLeakInSlides(slides);
  slides = leakResult.slides;
  if (leakResult.stripped > 0) {
    console.warn(`[card-news/text] leak stripped — count=${leakResult.stripped}`);
  }

  // ── 9) ensureSlideIds (id 누락 가드) + layout enum guard ─────────────
  // parseSlidesJson 가 이미 generateSlideId 로 id 채웠지만 ensureSlideIds 는 idempotent.
  slides = ensureSlideIds(slides);

  // 마지막 한 번 layout 화이트리스트 검증 (LLM 응답 + parser 통과 이후 추가 안전망)
  const allowedLayouts = new Set<string>(V1_LAYOUTS);
  for (const s of slides) {
    if (!allowedLayouts.has(s.layout as V1Layout)) {
      await refundOnFail();
      return err('parse_failed', 500, { details: `invalid layout: ${s.layout}` });
    }
  }

  // ── 10) 슬라이드별 의료광고법 위반 검증 (자동 대체 후 잔존 항목) ─────
  // validateSlideMedicalAd 는 SlideData → SlideFieldViolation[] (필드별 위반 묶음).
  // 빈 배열이면 위반 0 → C2b UI 에서 정상 표시.
  const violations: SlideFieldViolation[] = [];
  for (const s of slides) {
    const v = validateSlideMedicalAd(s);
    violations.push(...v);
  }

  // ── 11) 응답 ──────────────────────────────────────────────────────────
  return NextResponse.json({
    slides,
    violations,
    creditsUsed,
    // C2b 사용자 가시화용 메타
    replacedCount: totalReplaced,
  });
}
