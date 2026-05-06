/**
 * POST /api/video/add-sound-effects
 *
 * 효과음 자동 삽입 프록시 — video-processor 서버로 요청을 전달한다.
 *
 * 응답 헤더:
 *   - X-Sfx-Metadata: JSON
 *     { applied: boolean, count: number, source: 'ai'|'rule',
 *       style: string, density: number,
 *       effects: [{ time, category, sfx_id, sfx_name }],
 *       reason?: 'sfx_library_empty' }
 *
 * graceful 처리:
 *   - video-processor 미설정 → 503
 *   - 처리 실패 → 원본 그대로 반환 (BGM 라우트와 동일 패턴)
 *   - sfx 라이브러리 비어있는 경우는 video-processor 자체가 원본 + applied:false로 응답
 *
 * BIZ-001: step별 1 credit 차감 (PR #109 BIZ-003 패턴 동일).
 *   - graceful skip (원본 반환) 은 가치 미전달이므로 풀 환불 (PR #114 follow-up).
 *   - 예외 발생 시에도 환불.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { useCredit, refundCredit } from '../../../../lib/creditService';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/add-sound-effects');
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
          `[video/add-sound-effects] refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`,
        );
      }
    }
  };

  try {
    const formData = await request.formData();
    const res = await proxyFormData('/api/video/add-sound-effects', formData, 240000);

    if (!res.ok) {
      // 효과음 합성 실패 → 원본 파일 그대로 반환 (graceful skip — add-bgm과 동일 패턴)
      const file = formData.get('file') as File | null;
      if (file) {
        const buf = await file.arrayBuffer();
        // graceful skip refund: external provider failed, value not delivered
        if (creditDeducted && userId) {
          const refund = await refundCredit(userId).catch(() => null);
          if (refund?.success) {
            console.log(`[video/add-sound-effects] graceful-skip refunded 1 credit for ${userId.slice(0, 8)} (remaining=${refund.remaining})`);
          }
        }
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': file.type || 'video/mp4',
            'X-Sfx-Metadata': JSON.stringify({
              applied: false,
              count: 0,
              source: 'rule',
              effects: [],
              reason: 'video_processor_failed',
              message: '효과음 서버 처리 실패. 원본을 반환합니다.',
            }),
          },
        });
      }
      // file 없는 경우만 진짜 에러 — 환불
      await refundOnFail();
      return NextResponse.json({ error: '효과음 합성 실패' }, { status: 500 });
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        ...copyHeader(res, 'x-sfx-metadata'),
        ...copyHeader(res, 'content-disposition'),
      },
    });
  } catch (err) {
    await refundOnFail();
    const msg = err instanceof Error ? translateVideoError(err.message) : '효과음 합성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function copyHeader(res: Response, key: string): Record<string, string> {
  const val = res.headers.get(key);
  return val ? { [key]: val } : {};
}
