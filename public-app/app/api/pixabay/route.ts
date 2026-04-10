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
      min_width: '800',
    });

    const res = await fetch(`https://pixabay.com/api/?${params}`);
    const data = await res.json();

    return NextResponse.json({
      photos: (data.hits || []).map((h: any) => ({
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
