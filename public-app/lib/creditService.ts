/**
 * creditService.ts — 크레딧 조회/차감
 *
 * Supabase RPC: get_credits, use_credit
 * Supabase 미설정 시 크레딧 무제한 (개발 환경)
 */
import { isSupabaseConfigured, getSupabaseClient } from '@winaid/blog-core';

export interface CreditInfo {
  credits: number;
  totalUsed: number;
}

export interface CreditResult {
  success: boolean;
  remaining: number;
  error?: string;
}

/** 크레딧 조회 — Supabase 미설정 시 null (무제한) */
export async function getCredits(userId: string): Promise<CreditInfo | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_credits', { p_user_id: userId });
    if (error || !data) return null;
    const d = data as { credits: number; total_used: number };
    return { credits: d.credits, totalUsed: d.total_used };
  } catch {
    return null;
  }
}

/** 크레딧 1 차감 — Supabase 미설정 시 항상 성공 */
export async function useCredit(userId: string): Promise<CreditResult> {
  if (!isSupabaseConfigured) {
    return { success: true, remaining: 999 };
  }
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('use_credit', { p_user_id: userId });
    if (error) return { success: false, remaining: 0, error: error.message };
    return data as CreditResult;
  } catch {
    return { success: false, remaining: 0, error: 'unknown_error' };
  }
}
