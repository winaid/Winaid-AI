/**
 * POST /api/video/generate-thumbnail
 *
 * 썸네일 프록시 — video-processor 서버로 요청을 전달한다.
 *
 * BIZ-001: step별 1 credit 차감 (PR #109 BIZ-003 패턴 동일).
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/generate-thumbnail');
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
          `[video/generate-thumbnail] refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`,
        );
      }
    }
  };

  try {
    const formData = await request.formData();
    const res = await proxyFormData('/api/video/generate-thumbnail', formData, 60000);

    if (!res.ok) {
      await refundOnFail();
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        ...copyHeader(res, 'x-thumbnail-metadata'),
        ...copyHeader(res, 'content-disposition'),
      },
    });
  } catch (err) {
    await refundOnFail();
    const msg = err instanceof Error ? translateVideoError(err.message) : '썸네일 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function copyHeader(res: Response, key: string): Record<string, string> {
  const val = res.headers.get(key);
  return val ? { [key]: val } : {};
}
