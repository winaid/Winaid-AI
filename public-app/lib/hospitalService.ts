/**
 * 병원/팀 데이터 — DB 우선, teamData.ts fallback
 *
 * DB: teams + hospitals 테이블
 * Fallback: lib/teamData.ts (DB 미설정 또는 빈 테이블일 때)
 */
import { supabase } from './supabase';
import { TEAM_DATA, type TeamData, type HospitalEntry } from './teamData';

// ── 조회 ──

/** DB에서 팀+병원 전체 로드. 실패/빈 결과 시 teamData.ts fallback */
export async function getTeamDataFromDB(): Promise<TeamData[]> {
  if (!supabase) return TEAM_DATA;

  try {
    // 팀
    const { data: teams, error: teamErr } = await supabase
      .from('teams')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true });
    if (teamErr || !teams || teams.length === 0) return TEAM_DATA;

    // 병원
    const { data: hospitals, error: hospErr } = await supabase
      .from('hospitals')
      .select('id, team_id, name, manager, address, naver_blog_urls, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (hospErr || !hospitals) return TEAM_DATA;

    // TeamData[] 형태로 조립
    return teams.map(t => ({
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
  if (!supabase) return { success: false, error: 'Supabase 미설정' };
  if (!name.trim()) return { success: false, error: '병원명을 입력하세요' };

  const { error } = await (supabase.from('hospitals') as any).upsert(
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
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.teamId !== undefined) updateData.team_id = updates.teamId;
  if (updates.manager !== undefined) updateData.manager = updates.manager;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.naverBlogUrls !== undefined) updateData.naver_blog_urls = updates.naverBlogUrls.filter(u => u.trim());

  const { error } = await supabase
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
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  const { error } = await supabase
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
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  const { data, error } = await supabase
    .from('teams')
    .insert({ label: label.trim(), sort_order: 99 })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data?.id };
}
