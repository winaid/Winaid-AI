/**
 * POST /api/video/silence-remove
 *
 * video-processor 서버로 프록시.
 * auto-editor + FFmpeg로 무음 제거.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { proxyFormData, isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/silence-remove');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!isVideoProcessorConfigured()) {
    return NextResponse.json({ error: '영상 처리 서버가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const res = await proxyFormData('/api/video/silence-remove', formData, 180000);

    // 바이너리 응답을 그대로 전달
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        ...(res.headers.get('x-silence-metadata') ? { 'X-Silence-Metadata': res.headers.get('x-silence-metadata')! } : {}),
        ...(res.headers.get('content-disposition') ? { 'Content-Disposition': res.headers.get('content-disposition')! } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? translateVideoError(err.message) : '무음 제거 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
