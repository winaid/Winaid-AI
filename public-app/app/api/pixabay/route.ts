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
  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) return NextResponse.json({ photos: [], error: 'No API key' });

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: imageType,
      orientation,
      per_page: perPage,
      page,
      lang: 'ko',
      safesearch: 'true',
      // 카드뉴스 출력 해상도(1080~1350px)에 맞춰 1080 이상만 요청.
      // 이전 800 은 640px webformatURL 에 fallback 될 여지가 있어 흐린 이미지가
      // 슬라이드에 들어갔음. 1080 으로 올려 사전 차단.
      min_width: '1080',
    });

    const res = await fetch(`https://pixabay.com/api/?${params}`);
    const data = await res.json();

    return NextResponse.json({
      // largeImageURL(약 1280px) 만 사용. 이전엔 없으면 webformatURL(640px) 로
      // fallback 했는데 640px 이미지가 1080px 슬라이드에 들어가면 흐려짐.
      // largeImageURL 이 없는 결과는 결과에서 완전히 제외.
      photos: (data.hits || [])
        .filter((h: any) => h.largeImageURL)
        .map((h: any) => ({
          id: h.id,
          url: h.largeImageURL,
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
