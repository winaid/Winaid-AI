/**
 * GET /api/video/search-bgm
 *
 * Jamendo API로 무료 음악 검색.
 * 50만곡, Creative Commons, 무료 API.
 *
 * 환경변수: JAMENDO_CLIENT_ID (https://developer.jamendo.com 에서 발급)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MOOD_MAP: Record<string, string> = {
  bright: 'happy+upbeat',
  calm: 'calm+relaxing',
  emotional: 'emotional+sad',
  trendy: 'groovy+electronic',
  corporate: 'inspiring+corporate',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const mood = searchParams.get('mood') || '';
  const page = searchParams.get('page') || '1';
  const limit = searchParams.get('limit') || '10';

  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Jamendo API 키가 설정되지 않았습니다. JAMENDO_CLIENT_ID 환경변수를 확인하세요.' }, { status: 503 });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      format: 'json',
      limit,
      offset: String((parseInt(page) - 1) * parseInt(limit)),
      vocalinstrumental: 'instrumental', // BGM이니까 인스트루멘탈만
      include: 'musicinfo',
      order: 'popularity_total',
    });

    // 검색어 또는 분위기 태그
    if (query) {
      params.set('search', query);
    }
    if (mood && MOOD_MAP[mood]) {
      params.set('tags', MOOD_MAP[mood]);
    }
    if (!query && !mood) {
      params.set('tags', 'calm+relaxing'); // 기본: 차분한
    }

    const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Jamendo 검색 실패 (${res.status})` }, { status: 502 });
    }

    const data = await res.json() as {
      results: Array<{
        id: string;
        name: string;
        artist_name: string;
        duration: number;
        audio: string;        // 스트리밍 URL
        audiodownload: string; // 다운로드 URL
        image: string;
        album_name: string;
        license_ccurl: string;
        musicinfo?: { tags?: { genres?: string[]; instruments?: string[] } };
      }>;
      headers: { results_count: number; results_fullcount: number };
    };

    const tracks = (data.results || []).map(t => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      duration: t.duration,
      previewUrl: t.audio,       // 스트리밍 미리듣기
      downloadUrl: t.audiodownload, // 다운로드
      coverUrl: t.image,
      album: t.album_name,
      license: t.license_ccurl,
      genres: t.musicinfo?.tags?.genres || [],
    }));

    return NextResponse.json({
      tracks,
      total: data.headers?.results_fullcount || 0,
      page: parseInt(page),
    });

  } catch (err) {
    console.error('[search-bgm] 에러', err);
    return NextResponse.json({ error: '음악 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
