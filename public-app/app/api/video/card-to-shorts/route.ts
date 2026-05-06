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
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/card-to-shorts');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!isVideoProcessorConfigured()) {
    return NextResponse.json({ error: '영상 처리 서버가 설정되지 않았습니다.' }, { status: 503 });
  }

  // BIZ-001: 인증 → 차감 (게스트 skip)
  const owner = await resolveImageOwner(request);
  const userId = owner === 'guest' ? null : owner;
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
    const formData = await request.formData();
    // 슬라이드 N장 + 옵션이라 시간이 좀 걸림 — 270초 (Vercel maxDuration 안)
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
