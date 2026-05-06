/**
 * POST /api/video/card-to-shorts
 *
 * 카드뉴스 슬라이드 → 9:16 쇼츠 영상 변환 프록시.
 * video-processor /api/video/card-to-shorts로 multipart를 그대로 전달.
 *
 * 응답:
 *   - body: 합성된 mp4 (스트림)
 *   - X-Shorts-Metadata: { slides, duration, transition, bgm, narration, aspect } JSON
 *
 * BIZ-001: 1 credit 차감 (PR #109 BIZ-003 패턴 동일).
 *
 * ADR-2 (docs/decisions/CARDNEWS_HARDBLOCK_UX.md) Option B:
 *   - multipart 의 텍스트 필드 (slide_texts: JSON 직렬화) 또는 슬라이드 메타에서
 *     server-side `validateMedicalAd` 재실행 — client useMemo 우회 차단.
 *   - 위반 발견 시 `medical_ad_override_token` (헤더 또는 form field) 필수.
 *     · 토큰 미동봉 → 400 medical_law_violation
 *     · 토큰 검증 실패 (만료/위변조) → 403 invalid_override_token
 *     · 토큰 OK → 운영 로그(이미 발급 시점에 INSERT) + 변환 진행
 *   - 게스트는 토큰 발급 자체가 401 이므로, 게스트가 위반 콘텐츠 변환을 시도하면
 *     server 가 거부 (위반 0 인 경우만 진행).
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';
import { validateMedicalAd } from '../../../../lib/medicalAdValidation';
import { verifyOverrideToken } from '../../../../lib/medicalAdOverrideToken';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** multipart 의 slide_texts 필드(JSON) 또는 caption 필드들에서 위반 검출 */
function extractSlideViolations(formData: FormData): { count: number; sampleKeyword?: string } {
  // 우선순위 1: slide_texts (JSON 배열) — 클라이언트가 명시적으로 동봉할 경우
  const raw = formData.get('slide_texts');
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let count = 0;
        let sampleKeyword: string | undefined;
        for (const text of parsed) {
          if (typeof text !== 'string') continue;
          const v = validateMedicalAd(text);
          count += v.length;
          if (!sampleKeyword && v.length > 0) sampleKeyword = v[0].keyword;
        }
        return { count, sampleKeyword };
      }
    } catch {
      // 파싱 실패 — 클라가 동봉 안 했거나 손상. 우선순위 2 로 폴백.
    }
  }

  // 우선순위 2: 일반 caption/title/body 텍스트 필드 — 현재 클라는 이미지만 보내므로 거의 hit 0
  let count = 0;
  let sampleKeyword: string | undefined;
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (!/(title|subtitle|body|caption|text)/i.test(key)) continue;
    const v = validateMedicalAd(value);
    count += v.length;
    if (!sampleKeyword && v.length > 0) sampleKeyword = v[0].keyword;
  }
  return { count, sampleKeyword };
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/card-to-shorts');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!isVideoProcessorConfigured()) {
    return NextResponse.json({ error: '영상 처리 서버가 설정되지 않았습니다.' }, { status: 503 });
  }

  // BIZ-001: 인증 → 차감 (게스트 skip)
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;

  // formData 1회 파싱 (server-side 검증 + proxy 양쪽에서 사용)
  const formData = await request.formData();

  // ── ADR-2 Option B: 의료광고법 위반 server-side 검증 + 토큰 게이트 ──
  // 이미지 위주 multipart 라 텍스트는 slide_texts JSON 으로만 전달됨.
  // 클라가 동봉 안 한 경우 위반 검출 0 → 게이트 skip (정상 흐름 보존).
  const { count: violationsCount, sampleKeyword } = extractSlideViolations(formData);
  if (violationsCount > 0) {
    const overrideTokenHeader = request.headers.get('x-medical-ad-override');
    const overrideTokenField = formData.get('medical_ad_override_token');
    const overrideToken =
      overrideTokenHeader ||
      (typeof overrideTokenField === 'string' ? overrideTokenField : null);

    if (!overrideToken) {
      return NextResponse.json(
        {
          error: 'medical_law_violation',
          violations_count: violationsCount,
          sample_keyword: sampleKeyword,
          message: '의료광고법 위반 가능성 발견 — 동의(override) 후 다시 시도해 주세요.',
        },
        { status: 400 },
      );
    }

    const verify = verifyOverrideToken(overrideToken);
    if (!verify.ok) {
      return NextResponse.json(
        {
          error: 'invalid_override_token',
          reason: verify.reason,
          message:
            verify.reason === 'expired'
              ? '동의 토큰이 만료되었습니다 (5분). 다시 동의해 주세요.'
              : '동의 토큰이 유효하지 않습니다.',
        },
        { status: 403 },
      );
    }

    // 토큰 발급 사용자가 본 요청 사용자와 일치하는지 추가 검증
    if (userId && verify.payload.user_id !== userId) {
      return NextResponse.json(
        { error: 'invalid_override_token', reason: 'user_mismatch' },
        { status: 403 },
      );
    }
    // 게스트는 토큰 발급 API 가 401 이므로 여기 도달 불가 — 추가 방어
    if (!userId) {
      return NextResponse.json(
        { error: 'invalid_override_token', reason: 'guest_with_token' },
        { status: 403 },
      );
    }
    // 토큰 OK — 통과. 운영 로그는 토큰 발급 시점(/api/medical/override-token) 에 이미 INSERT 됨.
  }

  // ── credit 차감 (검증 통과 후) ──
  let creditDeducted = false;
  if (userId) {
    const credit = await useCredit(userId);
    if (!credit.success) {
      return NextResponse.json(
        { error: 'insufficient_credits', remaining: credit.remaining },
        { status: 402 },
      );
    }
    creditDeducted = true;
  }

  const refundOnFail = async () => {
    if (creditDeducted && userId) {
      const refund = await refundCredit(userId).catch(() => null);
      if (refund?.success) {
        console.log(
          `[video/card-to-shorts] refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`,
        );
      }
    }
  };

  try {
    // 슬라이드 N장 + 옵션이라 시간이 좀 걸림 — 270초 (Vercel maxDuration 안)
    // override 토큰 / slide_texts 는 video-processor 에 전달 불필요 — server-side 에서만 사용.
    if (formData.has('medical_ad_override_token')) {
      formData.delete('medical_ad_override_token');
    }
    if (formData.has('slide_texts')) {
      formData.delete('slide_texts');
    }
    const res = await proxyFormData('/api/video/card-to-shorts', formData, 270000);

    if (!res.ok) {
      await refundOnFail();
      const errText = await res.text();
      let errMsg = '카드뉴스 변환 실패';
      try { errMsg = JSON.parse(errText).error || errMsg; } catch {}
      return NextResponse.json({ error: translateVideoError(errMsg) }, { status: res.status });
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        ...copyHeader(res, 'x-shorts-metadata'),
        ...copyHeader(res, 'content-disposition'),
      },
    });
  } catch (err) {
    await refundOnFail();
    const msg = err instanceof Error ? translateVideoError(err.message) : '카드뉴스 변환 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function copyHeader(res: Response, key: string): Record<string, string> {
  const val = res.headers.get(key);
  return val ? { [key]: val } : {};
}
