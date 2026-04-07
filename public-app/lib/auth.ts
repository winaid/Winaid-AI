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
  displayName: string,
  homepageUrl?: string,
  address?: string,
) => {
  const supabase = getSupabaseClient();

  const metaData: Record<string, string> = { name: displayName };
  if (homepageUrl) metaData.homepage_url = homepageUrl;
  if (address) metaData.address = address;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metaData },
  });

  if (data.user) {
    try {
      // profiles upsert (트리거가 name만 저장하므로 full_name 보완)
      const profileData: Record<string, unknown> = {
        email,
        full_name: displayName,
        name: displayName,
      };
      if (homepageUrl) profileData.homepage_url = homepageUrl;
      if (address) profileData.address = address;

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', data.user.id);

      // UPDATE 실패 시 (row가 없는 경우) INSERT
      if (updateErr) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          ...profileData,
          created_at: new Date().toISOString(),
        } as Record<string, unknown>);
      }

      // subscriptions: 플랜 생성 (윈에이드/윈에이아이 계정은 999 크레딧)
      const isAdmin = email.includes('winaid') || email.includes('winai');
      await supabase.from('subscriptions').upsert(
        {
          user_id: data.user.id,
          plan_type: isAdmin ? 'admin' : 'free',
          credits_total: isAdmin ? 999 : 20,
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
