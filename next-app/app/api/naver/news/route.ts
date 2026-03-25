/**
 * /api/naver/news — 네이버 뉴스 검색 API 프록시
 *
 * OLD api/naver-news.js 포팅.
 * GET ?query=키워드&display=10
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query');
  const display = searchParams.get('display') || '10';

  if (!query) {
    return NextResponse.json({ error: 'query parameter required' }, { status: 400 });
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

    const response = await fetch(naverUrl, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NAVER_NEWS] API 오류:', response.status, errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Naver API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[NAVER_NEWS] 프록시 오류:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
