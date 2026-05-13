/**
 * POST /api/video/silence-remove
 *
 * video-processor 서버로 프록시.
 * auto-editor + FFmpeg로 무음 제거.
 *
 * BIZ-001: step별 1 credit 차감 (PR #109 BIZ-003 패턴 동일).
 */

import { withApiError } from '@/lib/apiErrorHandler';
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function _wrappedPOST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/silence-remove');
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
          `[video/silence-remove] refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`,
        );
      }
    }
  };

  try {
    const formData = await request.formData();
    const res = await proxyFormData('/api/video/silence-remove', formData, 180000);

    // 에러 응답이면 JSON으로 전달
    if (!res.ok) {
      await refundOnFail();
      const errText = await res.text();
      let errMsg = '무음 제거 실패';
      try { errMsg = JSON.parse(errText).error || errMsg; } catch { /* */ }
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        ...(res.headers.get('x-silence-metadata') ? { 'X-Silence-Metadata': res.headers.get('x-silence-metadata')! } : {}),
        ...(res.headers.get('content-disposition') ? { 'Content-Disposition': res.headers.get('content-disposition')! } : {}),
      },
    });
  } catch (err) {
    await refundOnFail();
    const msg = err instanceof Error ? translateVideoError(err.message) : '무음 제거 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withApiError(_wrappedPOST, { route: '/api/video/silence-remove' });
