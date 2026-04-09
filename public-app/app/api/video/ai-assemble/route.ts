/**
 * POST /api/video/ai-assemble
 *
 * AI 쇼츠 최종 조립 — video-processor 서버로 프록시.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { isVideoProcessorConfigured, translateVideoError } from '../../../../lib/videoProxy';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 2, '/api/video/ai-assemble');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!isVideoProcessorConfigured()) {
    return NextResponse.json({ error: '영상 처리 서버가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const url = `${process.env.NEXT_PUBLIC_VIDEO_PROCESSOR_URL}/api/video/ai-assemble`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600000);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '조립 실패' }));
      return NextResponse.json({ error: errData.error }, { status: res.status });
    }

    const resultBody = await res.arrayBuffer();
    return new NextResponse(resultBody, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        ...(res.headers.get('content-disposition') ? { 'Content-Disposition': res.headers.get('content-disposition')! } : {}),
        ...(res.headers.get('x-assemble-metadata') ? { 'X-Assemble-Metadata': res.headers.get('x-assemble-metadata')! } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? translateVideoError(err.message) : '영상 조립 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
