/**
 * /api/naver/suggest — 네이버 검색 자동완성(suggest) API 프록시
 *
 * POST body: { query: "백석동 치과" }
 * 응답: { suggestions: ["백석동 치과 추천", "백석동 치과 임플란트", ...] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const { query } = (await request.json()) as { query?: string };
    if (!query?.trim()) {
      return NextResponse.json({ suggestions: [] });
    }

    const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query.trim())}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = await res.json();
    // data.items는 [["제안1", "제안2", ...], [...]] 형태의 2차원 배열
    const items: string[][] = data.items || [];
    const suggestions: string[] = [];

    for (const group of items) {
      if (Array.isArray(group)) {
        for (const item of group) {
          if (Array.isArray(item) && typeof item[0] === 'string') {
            suggestions.push(item[0]);
          } else if (typeof item === 'string' && item.length >= 2) {
            suggestions.push(item);
          }
        }
      }
    }

    return NextResponse.json({ suggestions: [...new Set(suggestions)] });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
