/**
 * POST /api/naver/search — 네이버 통합 검색 API 프록시
 * type: 'blog' (블로그만) | 'webkr' (웹문서=블로그+카페+포스트 통합) | 'cafearticle' (카페만)
 * Env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const cookies = request.headers.get('cookie') || '';
  if (!/sb-[a-z]+-auth-token/.test(cookies)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { query?: string; display?: number; type?: string };
    const { query, display: rawDisplay = 10, type = 'webkr' } = body;

    if (!query) {
      return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
    }

    if (query.length > 200) {
      return NextResponse.json({ error: '검색어가 너무 깁니다 (최대 200자).' }, { status: 400 });
    }

    const display = Math.min(Math.max(Math.floor(rawDisplay), 1), 100);

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ error: `네이버 API 오류: ${response.status}` }, { status: response.status });
    }

    let result;
    try {
      result = await response.json();
    } catch {
      return NextResponse.json({ error: '네이버 API 응답 파싱 실패' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error;
    console.error('[NAVER_SEARCH] 프록시 오류:', err.message);
    const message = err.name === 'AbortError' ? '네이버 API 요청 시간 초과' : '네이버 검색 요청 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
