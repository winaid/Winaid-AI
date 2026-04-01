import { getSupabaseClient } from './supabase';

/** 이메일+비밀번호 로그인 */
export const signInWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

/** 이메일+비밀번호 회원가입 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string
) => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: displayName },
    },
  });

  if (data.user) {
    try {
      // profiles upsert (트리거가 name만 저장하므로 full_name 보완)
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          email,
          full_name: displayName,
          name: displayName,
        } as Record<string, unknown>)
        .eq('id', data.user.id);

      // UPDATE 실패 시 (row가 없는 경우) INSERT
      if (updateErr) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          email,
          full_name: displayName,
          name: displayName,
          created_at: new Date().toISOString(),
        } as Record<string, unknown>);
      }

      // subscriptions: free 플랜 생성
      await supabase.from('subscriptions').upsert(
        {
          user_id: data.user.id,
          plan_type: 'free',
          credits_total: 20,
          credits_used: 0,
          expires_at: null,
        } as Record<string, unknown>,
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
