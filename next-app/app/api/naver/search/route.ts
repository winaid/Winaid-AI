/**
 * POST /api/naver/search — 네이버 통합 검색 API 프록시
 * type: 'blog' (블로그만) | 'webkr' (웹문서=블로그+카페+포스트 통합) | 'cafearticle' (카페만)
 * Env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { query?: string; display?: number; type?: string };
    const { query, display = 10, type = 'webkr' } = body;

    if (!query) {
      return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
    }

    const clientId = process.env.NAVER_CLIENT_ID?.trim();
    const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 확인하세요.' },
        { status: 500 },
      );
    }

    // webkr = 웹문서 (블로그+카페+포스트 통합), blog = 블로그만, cafearticle = 카페만
    const validTypes = ['blog', 'webkr', 'cafearticle'];
    const searchType = validTypes.includes(type) ? type : 'webkr';
    const searchUrl = `https://openapi.naver.com/v1/search/${searchType}.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;

    const response = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `네이버 API 오류: ${response.status}` }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
