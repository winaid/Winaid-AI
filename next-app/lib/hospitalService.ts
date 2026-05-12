/**
 * 병원/팀 데이터 — DB 우선, teamData.ts fallback
 *
 * DB: teams + hospitals 테이블
 * Fallback: lib/teamData.ts (DB 미설정 또는 빈 테이블일 때)
 */
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { TEAM_DATA, type TeamData, type HospitalEntry } from './teamData';

// 모든 write 는 admin UI 에서만 호출됨. teams 는 INSERT 정책 자체가 없어 anon/auth 모두 차단,
// hospitals 는 정책 광범위해도 service_role 로 일관 처리.
const writeDb = () => supabaseAdmin ?? supabase;

// ── 조회 ──

/** DB에서 팀+병원 전체 로드. 팀 라벨은 TEAM_DATA fallback 항상 권위 — 회귀 차단.
 *
 * 사용자 보고: "팀이 왜 없어졌어" — DB `teams` 테이블에서 row 가 사라지거나 RLS
 * 변경으로 빈 결과가 반환되면 드롭다운에서 팀 자체가 사라져 로그인 불가.
 * 수정: `teams` 테이블 의존 제거. TEAM_DATA fallback (본부장님/1팀/2팀/3팀/콘텐츠팀)
 * 을 권위로 두고 DB `hospitals` row 만 enrich. 새 팀 추가 시 본 fallback 도 함께
 * 갱신해야 함 (1줄 commit 으로 처리).
 */
export async function getTeamDataFromDB(): Promise<TeamData[]> {
  if (!supabase) return TEAM_DATA;

  try {
    const { data: hospitals, error: hospErr } = await supabase
      .from('hospitals')
      .select('id, team_id, name, manager, address, naver_blog_urls, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (hospErr || !hospitals) return TEAM_DATA;

    // TEAM_DATA labels 를 source of truth 로, DB hospitals 만 team_id 로 매핑.
    return TEAM_DATA.map(t => ({
      id: t.id,
      label: t.label,
      hospitals: hospitals
        .filter(h => h.team_id === t.id)
        .map(h => ({
          name: h.name,
          manager: h.manager || '',
          address: h.address || undefined,
          naverBlogUrls: (h.naver_blog_urls as string[])?.filter(Boolean) || undefined,
        })),
    }));
  } catch {
    return TEAM_DATA;
  }
}

// ── 추가 ──

export async function addHospital(
  teamId: number,
  name: string,
  manager: string,
  address: string,
  naverBlogUrls: string[],
): Promise<{ success: boolean; error?: string }> {
  const db = writeDb();
  if (!db) return { success: false, error: 'Supabase 미설정' };
  if (!name.trim()) return { success: false, error: '병원명을 입력하세요' };

  const { error } = await (db.from('hospitals') as any).upsert(
    {
      team_id: teamId,
      name: name.trim(),
      manager: manager.trim(),
      address: address.trim(),
      naver_blog_urls: naverBlogUrls.filter(u => u.trim()),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'name' },
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── 수정 ──

export async function updateHospital(
  hospitalName: string,
  updates: {
    teamId?: number;
    manager?: string;
    address?: string;
    naverBlogUrls?: string[];
  },
): Promise<{ success: boolean; error?: string }> {
  const db = writeDb();
  if (!db) return { success: false, error: 'Supabase 미설정' };

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.teamId !== undefined) updateData.team_id = updates.teamId;
  if (updates.manager !== undefined) updateData.manager = updates.manager;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.naverBlogUrls !== undefined) updateData.naver_blog_urls = updates.naverBlogUrls.filter(u => u.trim());

  const { error } = await db
    .from('hospitals')
    .update(updateData)
    .eq('name', hospitalName);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── 삭제 (비활성화) ──

export async function deactivateHospital(
  hospitalName: string,
): Promise<{ success: boolean; error?: string }> {
  const db = writeDb();
  if (!db) return { success: false, error: 'Supabase 미설정' };

  const { error } = await db
    .from('hospitals')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('name', hospitalName);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── 팀 추가 ──

export async function addTeam(
  label: string,
): Promise<{ success: boolean; id?: number; error?: string }> {
  const db = writeDb();
  if (!db) return { success: false, error: 'Supabase 미설정' };

  const { data, error } = await db
    .from('teams')
    .insert({ label: label.trim(), sort_order: 99 })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data?.id };
}
