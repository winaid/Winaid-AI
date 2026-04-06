import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || 'hospital';
  const page = parseInt(searchParams.get('page') || '1');
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) return NextResponse.json({ photos: [], error: 'No API key' });

  try {
    const start = (page - 1) * 10 + 1;
    const params = new URLSearchParams({
      key: apiKey, cx, q: query,
      searchType: 'image', num: '10', start: String(start),
      safe: 'active',
    });

    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    const data = await res.json();
    return NextResponse.json({
      photos: (data.items || []).map((item: any) => ({
        id: item.link,
        url: item.link,
        thumb: item.image?.thumbnailLink || item.link,
        alt: item.title || '',
        source: 'google',
      })),
    });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}
