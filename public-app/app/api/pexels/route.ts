import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';

export async function GET(req: NextRequest) {
  // 게스트 rate limit — 외부 이미지 검색 API, 분당 20회
  const gate = gateGuestRequest(req, 20, '/api/pexels');
  if (!gate.ok) return NextResponse.json({ photos: [], error: gate.error }, { status: gate.status });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || 'hospital';
  const orientation = searchParams.get('orientation') || '';
  const perPage = searchParams.get('per_page') || '12';
  const page = searchParams.get('page') || '1';
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) return NextResponse.json({ photos: [], error: 'No API key' });

  try {
    const params = new URLSearchParams({ query, per_page: perPage, page, locale: 'ko-KR' });
    if (orientation) params.set('orientation', orientation);

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
    });
    const data = await res.json();
    return NextResponse.json({
      // 해상도 전략: 카드뉴스 출력 해상도(1080~1350px)에 맞춰 과해상도를 피한다.
      //   medium: Pexels 기준 약 1280px 장변 — 카드뉴스에 가장 적합, 로드 빠름
      //   large:  약 940px 장변 (fallback, 1080 에 살짝 못 미치지만 허용범위)
      //   large2x: 2048+px — 과해상도, 다운로드만 오래 걸리고 시각 이점 없음
      // 이전엔 large2x 를 우선 사용해 이미지당 2~5MB, 슬라이드 10장에 20~50MB
      // 다운로드가 걸렸다. medium 우선으로 약 5~15MB 로 감소.
      photos: (data.photos || []).map((p: any) => ({
        id: p.id,
        url: p.src.medium || p.src.large,
        thumb: p.src.small,
        alt: p.alt || '',
        photographer: p.photographer,
        source: 'pexels',
      })),
    });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}
