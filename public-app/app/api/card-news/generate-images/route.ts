/**
 * POST /api/card-news/generate-images
 *
 * C2a Step 3 — SlideData[] → 슬라이드별 이미지 생성 + imageDataUrl 부착.
 *
 * 정책:
 *   - 로그인 강제 (게스트 401). 텍스트 단계까지는 게스트 OK 였지만 이미지는 비용 큼.
 *   - 크레딧: `/api/image` 라우트가 이미 슬라이드당 1 credit 차감 + 실패 시 자체 환불.
 *     본 라우트는 사전 잔액 체크 + Promise.all orchestration 만 담당.
 *     (이중 차감 회피 — /api/image 가 단일 책임)
 *   - 부분 실패 (5장 중 2장 실패) 허용 — 실패 슬라이드 인덱스를 응답에 명시,
 *     C2b UI 가 슬라이드별 재생성 버튼 표시.
 *   - 5장 병렬 (Promise.all). 각 호출은 /api/image 내부의 1회 재시도 + 멀티키
 *     로테이션을 그대로 활용 (추가 재시도 X — 비용·복잡도 trade-off).
 *
 * Request body:
 *   { slides: SlideData[], imageStyle?: 'illustration' | 'photo' | 'medical' }
 *   ※ slides 는 generate-text 응답을 그대로 forward.
 *
 * Errors:
 *   400 — body 파싱 / slides 형식 / 길이 위반
 *   401 — 게스트 (이미지 단계 차단)
 *   402 — 사전 잔액 < slideCount (정중한 차단, 부분 실패 회피)
 *   429 — rate limit
 *   500 — orchestration 자체 실패 (드물 것)
 *
 * Response:
 *   { slides: SlideData[] (imageDataUrl 포함), failedSlides: number[],
 *     creditsUsed: number, creditsRefunded: number,
 *     netDeducted: number (사전·사후 잔액 실측) }
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { getCredits } from '../../../../lib/creditService';
import { ensureSlideIds, type SlideData } from '@winaid/blog-core';
import {
  V1_LAYOUTS,
  isValidThemeId,
  getTheme,
  isValidRatio,
  getRatio,
  DEFAULT_THEME,
  DEFAULT_RATIO,
  type V1Layout,
  type ThemeId,
  type AspectRatio,
} from '../../../../lib/cardNewsPrompt';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  slides?: unknown;
  imageStyle?: unknown;
  /** C2-fix-1: 톤·색상 일관성. 알 수 없는 값은 default. */
  theme?: unknown;
  /** C2-fix-1e: aspect ratio ('1:1' | '4:5'). 알 수 없는 값은 default. */
  ratio?: unknown;
}

function err(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

/** slides 입력 검증 — SlideData[] 의 핵심 필드만 확인. */
function isValidSlides(value: unknown): value is SlideData[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return false;
  const allowed = new Set<string>(V1_LAYOUTS);
  for (const item of value) {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string') return false;
    if (typeof o.index !== 'number') return false;
    if (typeof o.layout !== 'string' || !allowed.has(o.layout)) return false;
    if (typeof o.title !== 'string') return false;
  }
  return true;
}

/** 슬라이드 → /api/image 호출용 prompt (visualKeyword 또는 title fallback). */
function slidePromptText(slide: SlideData): string {
  if (slide.visualKeyword && slide.visualKeyword.trim()) return slide.visualKeyword.trim();
  if (slide.body && slide.body.trim()) return `${slide.title} — ${slide.body}`.slice(0, 200);
  return slide.title;
}

/**
 * C2-fix-1: theme prefix + 슬라이드 prompt 결합.
 * GPT Image 2.0 친화 영문 prefix 가 앞에, subject 한·영 혼용 hint 가 뒤에.
 * C2-fix-1b §2: "Visual concept (no text in image):" 라벨로 SLIDE 위 직접 텍스트
 * 렌더를 막는다 (테마 prefix 의 NO TEXT directive 와 이중 안전망).
 * 결과는 /api/image 의 prompt 필드로 그대로 전달됨 (서버 변경 0).
 */
function buildImagePromptWithTheme(slide: SlideData, themeId: ThemeId): string {
  const theme = getTheme(themeId);
  const subject = slidePromptText(slide);
  return `${theme.imageStyleEn}. Visual concept (no text in image): ${subject}.`;
}

/**
 * C2-fix-1e: theme.referencePath → public/ 에서 fs.readFile → data URL.
 * 실패 시 null (호출자가 fallback — /api/image 는 referenceImage 없어도 정상 동작).
 *
 * NOTE: server-side fs 접근. public-app 의 Next.js process.cwd() 가 public-app
 * 디렉토리이므로 public/{cleanPath} 로 접근.
 */
async function readReferenceAsDataUrl(referencePath: string): Promise<string | null> {
  try {
    const cleanPath = referencePath.replace(/^\//, '');
    // 경로 escape 방지 — '..' 또는 절대경로 거절
    if (cleanPath.includes('..') || path.isAbsolute(cleanPath)) {
      console.warn(`[generate-images] reference path 거절 (escape suspect): ${referencePath}`);
      return null;
    }
    const filepath = path.join(process.cwd(), 'public', cleanPath);
    const buf = await fs.readFile(filepath);
    const ext = path.extname(filepath).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn(
      `[generate-images] reference 읽기 실패 ${referencePath}:`,
      (e as Error).message?.slice(0, 200),
    );
    return null;
  }
}

interface ImageResult {
  imageDataUrl: string | null;
  errorDetails?: string;
}

/** /api/image self-call. 응답 { imageDataUrl, mimeType, model } 또는 비-2xx. */
async function callImageRoute(
  origin: string,
  authHeader: string | null,
  promptText: string,
  imageStyle: 'illustration' | 'photo' | 'medical',
  aspectRatio: AspectRatio,
  referenceImage: string | null,
): Promise<ImageResult> {
  try {
    const res = await fetch(`${origin}/api/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        prompt: promptText,
        mode: 'card_news',
        imageStyle,
        quality: 'fast',
        aspectRatio,
        ...(referenceImage ? { referenceImage } : {}),
      }),
    });
    if (!res.ok) {
      let detail = `http_${res.status}`;
      try {
        const j = (await res.json()) as { error?: string; details?: string };
        detail = j.details || j.error || detail;
      } catch { /* ignore */ }
      return { imageDataUrl: null, errorDetails: detail.slice(0, 120) };
    }
    const j = (await res.json()) as { imageDataUrl?: string };
    return { imageDataUrl: typeof j.imageDataUrl === 'string' ? j.imageDataUrl : null };
  } catch (e) {
    return { imageDataUrl: null, errorDetails: (e as Error).message?.slice(0, 120) || 'fetch_failed' };
  }
}

async function _wrappedPOST(request: NextRequest) {
  // ── 1) rate limit — 이미지 5장 병렬은 비용 큼. 분당 3회 ───────────────
  const gate = gateGuestRequest(request, 3);
  if (!gate.ok) {
    return err(gate.error, gate.status);
  }

  // ── 2) body 파싱 + validation ────────────────────────────────────────
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return err('invalid_json', 400);
  }
  if (!isValidSlides(body.slides)) {
    return err('bad_request', 400, { details: 'slides must be SlideData[1..10]' });
  }
  const inputSlides = body.slides;
  const allowedStyles = new Set(['illustration', 'photo', 'medical']);
  const imageStyle =
    typeof body.imageStyle === 'string' && allowedStyles.has(body.imageStyle)
      ? (body.imageStyle as 'illustration' | 'photo' | 'medical')
      : 'illustration';
  // C2-fix-1: theme 화이트리스트 검증. 알 수 없는 값은 silent fallback.
  const theme: ThemeId = isValidThemeId(body.theme) ? body.theme : DEFAULT_THEME;
  // C2-fix-1e: aspect ratio 화이트리스트 검증.
  const ratio: AspectRatio = isValidRatio(body.ratio) ? body.ratio : DEFAULT_RATIO;
  const ratioPreset = getRatio(ratio);

  // ── 3) 인증 (게스트 401) ──────────────────────────────────────────────
  const owner = await resolveImageOwner(request);
  if (owner === 'guest') {
    return err('unauthorized', 401, { details: '이미지 생성은 로그인 후 가능합니다.' });
  }
  const userId = owner;

  // ── 4) 사전 잔액 체크 ────────────────────────────────────────────────
  // /api/image 가 슬라이드별로 useCredit 하는데, 5장 중 3장만 잔액이 남으면 마지막
  // 2장이 402 로 잘림 — UX 안 좋음. 사전 체크로 "잔액 부족" 명시 후 전체 차단.
  // CreditInfo.credits 가 현재 잔여분 (totalUsed 와 별도) — creditService 정의 참고.
  const before = await getCredits(userId);
  const beforeRemaining = before?.credits ?? 0;
  if (before !== null && beforeRemaining < inputSlides.length) {
    return NextResponse.json(
      {
        error: 'insufficient_credits',
        remaining: beforeRemaining,
        required: inputSlides.length,
      },
      { status: 402 },
    );
  }
  // before === null 케이스 (Supabase 미설정) → 무제한으로 간주, 통과.

  // ── 5) /api/image 병렬 호출 (Promise.all) ────────────────────────────
  // origin 은 self-host. NEXT_PUBLIC_PUBLIC_APP_URL 보다 request.nextUrl.origin
  // 이 정확 (preview/production 자동 인식).
  const origin = request.nextUrl.origin;
  const authHeader = request.headers.get('authorization');

  // C2-fix-1e: reference 이미지 1회 읽고 5장 모두에 동일 base64 전달.
  // fs.readFile 은 한 번만 — 5번 동일 파일 읽지 않음.
  const themeObj = getTheme(theme);
  const referenceDataUrl = await readReferenceAsDataUrl(themeObj.referencePath);
  if (!referenceDataUrl) {
    console.warn(
      `[generate-images] theme=${theme} reference 사용 불가 — prompt-only 로 진행`,
    );
  }

  const results = await Promise.all(
    inputSlides.map((s) =>
      callImageRoute(
        origin,
        authHeader,
        buildImagePromptWithTheme(s, theme),
        imageStyle,
        ratio,
        referenceDataUrl,
      ),
    ),
  );

  // ── 6) 결과 정리 ──────────────────────────────────────────────────────
  const outSlides: SlideData[] = inputSlides.map((s, i) => {
    const r = results[i];
    if (r.imageDataUrl) {
      return { ...s, imageUrl: r.imageDataUrl };
    }
    return s; // imageUrl 미설정
  });
  const failedSlides = results
    .map((r, i) => (r.imageDataUrl ? null : i))
    .filter((x): x is number => x !== null);
  const successCount = results.length - failedSlides.length;

  // ── 7) 사후 잔액 실측 (netDeducted 명시) ─────────────────────────────
  const after = await getCredits(userId);
  const afterRemaining = after?.credits ?? beforeRemaining;
  const netDeducted = Math.max(0, beforeRemaining - afterRemaining);

  // ── 8) 응답 ──────────────────────────────────────────────────────────
  return NextResponse.json({
    slides: ensureSlideIds(outSlides),
    failedSlides,
    // 명목: /api/image 가 슬라이드당 차감 + 실패 시 환불.
    // success 가 곧 net 차감, fail 카운트가 곧 환불.
    creditsUsed: successCount,
    creditsRefunded: failedSlides.length,
    // 실측 — debug 용. /api/image 의 차감/환불 처리가 예상대로 됐는지 검증.
    netDeducted,
  });
}

export const POST = withApiError(_wrappedPOST, { route: '/api/card-news/generate-images' });
