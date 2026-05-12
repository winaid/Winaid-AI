/**
 * GET /api/teams — 팀 + 병원 데이터 조회 (read-only)
 *
 * 부하 최소화 정책 (2026-05-12 회귀):
 *   - 모듈 스코프 in-memory 캐시 (1h TTL) — 인스턴스 내 재호출은 DB 안 침
 *   - HTTP Cache-Control: 1h public + s-maxage 1h — Vercel edge 캐시
 *   - 합산 효과: 운영 팀 데이터는 자주 안 바뀜, DB 부하 ~95% 감소
 *
 * 배경:
 *   과거 client (anon supabase) 가 hospitals/teams 직접 SELECT → CORS / RLS / 부하 다발.
 *   서버 경유로 supabaseAdmin (service_role) 사용. 캐시 적극 활용으로 DB 호출 최소화.
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { TEAM_DATA, type TeamData } from '../../../lib/teamData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── 모듈 스코프 in-memory 캐시 (Vercel function 인스턴스 lifetime 동안 유효) ──
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1h
let cachedAt = 0;
let cachedData: TeamData[] | null = null;

const HTTP_CACHE_HEADERS = {
  // browser 1h, Vercel edge 1h, 만료 후 stale-while-revalidate 1h.
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600',
};

export async function GET() {
  // 1) 메모리 캐시 hit → 즉시 반환 (DB 0)
  const now = Date.now();
  if (cachedData && now - cachedAt < MEMORY_TTL_MS) {
    return NextResponse.json(cachedData, { headers: HTTP_CACHE_HEADERS });
  }

  // 2) DB 조회
  const db = supabaseAdmin ?? supabase;
  if (!db) {
    return NextResponse.json(TEAM_DATA, { headers: HTTP_CACHE_HEADERS });
  }

  try {
    const [teamsRes, hospitalsRes] = await Promise.all([
      db
        .from('teams')
        .select('id, label, sort_order')
        .order('sort_order', { ascending: true }),
      db
        .from('hospitals')
        .select('id, team_id, name, manager, address, naver_blog_urls, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ]);

    const teams = teamsRes.data;
    const hospitals = hospitalsRes.data;

    let merged: TeamData[];
    if (teamsRes.error || !teams || teams.length === 0) {
      console.warn('[api/teams] teams fetch empty — TEAM_DATA fallback:', teamsRes.error?.message);
      merged = TEAM_DATA.map(t => ({
        id: t.id,
        label: t.label,
        hospitals: (hospitals || [])
          .filter(h => h.team_id === t.id)
          .map(h => ({
            name: h.name as string,
            manager: (h.manager as string) || '',
            address: (h.address as string) || undefined,
            naverBlogUrls: (h.naver_blog_urls as string[])?.filter(Boolean) || undefined,
          })),
      }));
    } else {
      merged = teams.map(t => ({
        id: t.id as number,
        label: t.label as string,
        hospitals: (hospitals || [])
          .filter(h => h.team_id === t.id)
          .map(h => ({
            name: h.name as string,
            manager: (h.manager as string) || '',
            address: (h.address as string) || undefined,
            naverBlogUrls: (h.naver_blog_urls as string[])?.filter(Boolean) || undefined,
          })),
      }));
    }

    // 메모리 캐시 갱신 (성공 시에만)
    cachedData = merged;
    cachedAt = now;
    return NextResponse.json(merged, { headers: HTTP_CACHE_HEADERS });
  } catch (e) {
    console.warn('[api/teams] uncaught:', (e as Error).message);
    return NextResponse.json(TEAM_DATA, { headers: HTTP_CACHE_HEADERS });
  }
}
