import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (auth) return auth;

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
      photos: (data.photos || []).map((p: any) => ({
        id: p.id,
        url: p.src.large2x || p.src.large,
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
