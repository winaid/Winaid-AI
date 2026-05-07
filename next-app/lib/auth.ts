import { getSupabaseClient } from '@winaid/blog-core';

/** 이름 + 팀ID → 내부용 이메일 생성 (기존 호환 + 신규 방식) */
const nameToOldHex = (name: string): string =>
  Array.from(name.trim())
    .map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');

const nameToShortHash = (name: string): string => {
  const trimmed = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash << 5) - hash + trimmed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

export const nameTeamToEmail = (name: string, teamId: number): string => {
  const safeName = nameToShortHash(name.trim());
  return `t${teamId}_${safeName}@winaid.kr`;
};

/** 기존 hex 방식 이메일 (하위 호환용) */
export const nameTeamToOldEmail = (name: string, teamId: number): string => {
  return `t${teamId}_${nameToOldHex(name)}@winaid.kr`;
};

/** 팀 내부 로그인 */
export const signInWithTeam = async (
  displayName: string,
  teamId: number,
  password: string
) => {
  const supabase = getSupabaseClient();
  const email = nameTeamToEmail(displayName, teamId);
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // 새 방식 실패 → 기존 hex 방식으로 재시도 (하위 호환)
  if (error) {
    const oldEmail = nameTeamToOldEmail(displayName, teamId);
    if (oldEmail !== email) {
      const retry = await supabase.auth.signInWithPassword({ email: oldEmail, password });
      if (!retry.error) {
        data = retry.data;
        error = null;
      }
    }
  }

  // 로그인 성공 시 profiles 항상 업데이트 (이름/팀 최신화).
  // 과거: UPDATE 후 실패 시 INSERT 폴백 패턴 — 동시 회원가입 시 race 로 중복 row 가능.
  // 수정: upsert(onConflict: 'id') 단일 호출 — DB 가 race 안전하게 처리.
  if (data.user && !error) {
    try {
      await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          email: data.user.email || email,
          full_name: displayName,
          name: displayName,
          team_id: teamId,
        } as Record<string, unknown>,
        { onConflict: 'id' },
      );
    } catch (e) {
      console.error('프로필 업데이트 실패 (무시):', e);
    }
  }

  return { data, error };
};

/** 팀 내부 회원가입 */
export const signUpWithTeam = async (
  displayName: string,
  teamId: number,
  password: string
) => {
  const supabase = getSupabaseClient();
  const email = nameTeamToEmail(displayName, teamId);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: displayName, team_id: teamId },
    },
  });

  if (data.user) {
    try {
      // 트리거(handle_new_user)가 name만 저장하므로 full_name/team_id 보완.
      // upsert(onConflict: 'id') 로 트리거 race 와 동시 가입 race 모두 안전 처리.
      // created_at 은 DB default 또는 트리거가 책임 — payload 에서 제외해 update 시 덮어쓰기 방지.
      await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          email,
          full_name: displayName,
          name: displayName,
          team_id: teamId,
        } as Record<string, unknown>,
        { onConflict: 'id' },
      );

      await supabase.from('subscriptions').upsert(
        {
          user_id: data.user.id,
          plan_type: 'free',
          credits_total: 10,
          credits_used: 0,
          expires_at: null,
        } as any,
        { onConflict: 'user_id' }
      );
    } catch (e) {
      console.error('프로필 생성 실패 (무시):', e);
    }
  }

  return { data, error };
};

/** 로그아웃 */
export const signOut = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error };
};
