/**
 * GET /api/teams — 팀 + 병원 데이터 조회 (read-only)
 *
 * 배경: 과거엔 client (anon supabase) 가 hospitals 테이블 직접 SELECT. RLS 정책
 * 변경 / 프로젝트 일시 장애 시 응답에 CORS 헤더 누락 → 브라우저 콘솔 CORS 에러로
 * 표시 (사용자 보고). RLS 자체 거부면 401 + CORS 헤더가 정상이지만 PostgREST
 * internal layer 또는 프로젝트 paused 상태에선 CORS 없이 short-circuit.
 *
 * 수정: 서버에서 supabaseAdmin (service_role) 으로 hospitals 조회 → 동일 origin
 * 응답 → 브라우저 CORS 제약 무관. RLS 도 service_role 라 우회.
 *
 * 응답: TeamData[] (TEAM_DATA labels + hospitals enriched). 실패 시 TEAM_DATA only.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@winaid/blog-core';
import { TEAM_DATA, type TeamData } from '../../../lib/teamData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  // supabaseAdmin 미설정 (SUPABASE_SERVICE_ROLE_KEY 누락) → TEAM_DATA fallback only
  if (!supabaseAdmin) {
    return NextResponse.json(TEAM_DATA, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  }

  try {
    const { data: hospitals, error } = await supabaseAdmin
      .from('hospitals')
      .select('id, team_id, name, manager, address, naver_blog_urls, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error || !hospitals) {
      console.warn('[api/teams] hospitals fetch failed:', error?.message);
      return NextResponse.json(TEAM_DATA, {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
      });
    }

    const merged: TeamData[] = TEAM_DATA.map(t => ({
      id: t.id,
      label: t.label,
      hospitals: hospitals
        .filter(h => h.team_id === t.id)
        .map(h => ({
          name: h.name as string,
          manager: (h.manager as string) || '',
          address: (h.address as string) || undefined,
          naverBlogUrls: (h.naver_blog_urls as string[])?.filter(Boolean) || undefined,
        })),
    }));

    return NextResponse.json(merged, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (e) {
    console.warn('[api/teams] uncaught:', (e as Error).message);
    return NextResponse.json(TEAM_DATA, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  }
}
