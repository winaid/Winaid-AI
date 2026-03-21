import { getSupabaseClient } from './supabase';

/** 이름 + 팀ID → 내부용 이메일 생성 (기존 Vite 앱과 동일한 로직) */
export const nameTeamToEmail = (name: string, teamId: number): string => {
  const hexName = Array.from(name.trim())
    .map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');
  return `t${teamId}_${hexName}@winaid.kr`;
};

/** 팀 내부 로그인 */
export const signInWithTeam = async (
  displayName: string,
  teamId: number,
  password: string
) => {
  const supabase = getSupabaseClient();
  const email = nameTeamToEmail(displayName, teamId);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // 로그인 성공 시 profiles 자동 생성 (기존 유저 호환)
  if (data.user && !error) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
        await supabase.from('profiles').upsert(
          {
            id: data.user.id,
            email,
            full_name: displayName,
            team_id: teamId,
            created_at: new Date().toISOString(),
          } as any,
          { onConflict: 'id' }
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
      }
    } catch (e) {
      console.error('프로필 확인/생성 실패 (무시):', e);
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
      await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          email,
          full_name: displayName,
          team_id: teamId,
          created_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' }
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
