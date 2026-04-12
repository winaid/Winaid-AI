import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';

export async function GET(req: NextRequest) {
  // 게스트 rate limit — 외부 이미지 검색 API, 분당 20회
  const gate = gateGuestRequest(req, 20, '/api/pixabay');
  if (!gate.ok) return NextResponse.json({ photos: [], error: gate.error }, { status: gate.status });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || 'hospital';
  const imageType = searchParams.get('image_type') || 'all';
  const orientation = searchParams.get('orientation') || 'all';
  const perPage = searchParams.get('per_page') || '12';
  const page = searchParams.get('page') || '1';
  const categoryFilter = searchParams.get('category') || '';
  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) return NextResponse.json({ photos: [], error: 'No API key' });

  try {
    // vector(SVG) 결과는 Pixabay 가 래스터 프리뷰만 제공하므로 min_width 를
    // 높이면 대부분 필터링됨 — 벡터/일러스트 검색 시 min_width 를 낮춘다.
    // 실사 사진(photo)은 1080px 미달이면 카드뉴스에 흐리므로 1080 유지.
    const isVectorLike = imageType === 'vector' || imageType === 'illustration';
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: imageType,
      orientation,
      per_page: perPage,
      page,
      lang: 'ko',
      safesearch: 'true',
      min_width: isVectorLike ? '400' : '1080',
      ...(categoryFilter ? { category: categoryFilter } : {}),
    });

    const res = await fetch(`https://pixabay.com/api/?${params}`);
    const data = await res.json();

    return NextResponse.json({
      // 실사 사진: largeImageURL(~1280px) 필수, 없으면 제외 (640px 는 흐림).
      // 벡터/일러스트: largeImageURL 우선, 없으면 webformatURL fallback 허용
      //   — SVG 원본 기반이라 640px 래스터도 스케일 시 허용 범위.
      photos: (data.hits || [])
        .filter((h: any) => isVectorLike ? (h.largeImageURL || h.webformatURL) : h.largeImageURL)
        .map((h: any) => ({
          id: h.id,
          url: h.largeImageURL || h.webformatURL,
          thumb: h.previewURL,
          alt: h.tags || '',
          photographer: h.user,
          source: 'pixabay',
          type: h.type,
        })),
    });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}
