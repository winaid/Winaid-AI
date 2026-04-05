/**
 * /api/naver/news — 네이버 뉴스 검색 API 프록시
 *
 * OLD api/naver-news.js 포팅.
 * GET ?query=키워드&display=10
 */
import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 게스트 허용: 로그인 쿠키 없으면 IP 기반 분당 10회 제한
  const gate = gateGuestRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query');
  const rawDisplay = parseInt(searchParams.get('display') || '10', 10);
  const display = Math.min(Math.max(isNaN(rawDisplay) ? 10 : rawDisplay, 1), 100);

  if (!query) {
    return NextResponse.json({ error: 'query parameter required' }, { status: 400 });
  }

  if (query.length > 200) {
    return NextResponse.json({ error: 'query too long (max 200 chars)' }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Naver API credentials not configured' },
      { status: 500 },
    );
  }

  try {
    const naverUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(naverUrl, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NAVER_NEWS] API 오류:', response.status, errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Naver API error: ${response.status}` },
        { status: response.status },
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return NextResponse.json({ error: 'Naver API 응답 파싱 실패' }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('unknown');
    console.error('[NAVER_NEWS] 프록시 오류:', error.message);
    const message = error.name === 'AbortError' ? 'Naver API 요청 시간 초과' : 'Naver news request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
