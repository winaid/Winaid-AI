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

  // 로그인 성공 시 profiles 항상 업데이트 (이름/팀 최신화) — fire-and-forget.
  // 과거: await profile upsert → REST API hung 시 로그인 전체 hung (사용자 보고
  // "로그인 중..." 무한 로딩). 수정: 백그라운드 실행, 로그인 응답은 즉시 반환.
  // profile 동기화는 다음 렌더에서 자연 반영.
  if (data.user && !error) {
    void (async () => {
      try {
        const { error: upsertErr } = await supabase.from('profiles').upsert(
          {
            id: data.user!.id,
            email: data.user!.email || email,
            full_name: displayName,
            name: displayName,
            team_id: teamId,
          } as Record<string, unknown>,
          { onConflict: 'id' },
        );
        if (upsertErr) console.warn('[signIn] 프로필 업데이트 실패 (무시):', upsertErr.message);
      } catch (e) {
        console.warn('[signIn] 프로필 업데이트 throw (무시):', (e as Error).message);
      }
    })();
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
    // 트리거(handle_new_user)가 name만 저장하므로 full_name/team_id 보완.
    // fire-and-forget — REST API hung 시 가입 응답이 무한 대기 회귀 차단.
    // 트리거가 백업으로 record 생성하므로 client upsert 실패해도 무관.
    const uid = data.user.id;
    void (async () => {
      try {
        const { error: e1 } = await supabase.from('profiles').upsert(
          {
            id: uid,
            email,
            full_name: displayName,
            name: displayName,
            team_id: teamId,
          } as Record<string, unknown>,
          { onConflict: 'id' },
        );
        if (e1) console.warn('[signUp] profiles upsert 실패 (무시):', e1.message);
      } catch (e) {
        console.warn('[signUp] profiles upsert throw (무시):', (e as Error).message);
      }
    })();
    void (async () => {
      try {
        const { error: e2 } = await supabase.from('subscriptions').upsert(
          {
            user_id: uid,
            plan_type: 'free',
            credits_total: 10,
            credits_used: 0,
            expires_at: null,
          } as any,
          { onConflict: 'user_id' },
        );
        if (e2) console.warn('[signUp] subscriptions upsert 실패 (무시):', e2.message);
      } catch (e) {
        console.warn('[signUp] subscriptions upsert throw (무시):', (e as Error).message);
      }
    })();
  }

  return { data, error };
};

/** 로그아웃 */
export const signOut = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error };
};
