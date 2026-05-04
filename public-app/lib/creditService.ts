/**
 * creditService.ts — 크레딧 조회/차감
 *
 * Supabase RPC: get_credits, use_credit
 * Supabase 미설정 시 크레딧 무제한 (개발 환경)
 */
import { isSupabaseConfigured, getSupabaseClient, supabaseAdmin } from '@winaid/blog-core';

/** RPC 호출용 클라이언트 — supabaseAdmin 우선 (service_role bypass for credit RPCs). */
function getRpcClient() {
  return supabaseAdmin ?? getSupabaseClient();
}

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
    const supabase = getRpcClient();
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
    const supabase = getRpcClient();
    const { data, error } = await supabase.rpc('use_credit', { p_user_id: userId });
    if (error) return { success: false, remaining: 0, error: error.message };
    return data as CreditResult;
  } catch {
    return { success: false, remaining: 0, error: 'unknown_error' };
  }
}

/**
 * 크레딧 환불 — generation 실패 / route catch 분기에서 호출.
 * refund_credit RPC (2026-05-04_credit_refund_rpc.sql) 가 caller 검증 + amount 1~100 enforce.
 * 환불 실패는 swallow (호출자 흐름 안 막음 — console.warn 으로 운영 가시성).
 */
export async function refundCredit(userId: string, amount = 1): Promise<CreditResult> {
  if (!isSupabaseConfigured) {
    return { success: true, remaining: 999 };
  }
  try {
    const supabase = getRpcClient();
    const { data, error } = await supabase.rpc('refund_credit', {
      p_user_id: userId,
      p_amount: amount,
    });
    if (error) {
      console.warn(`[credit] refund failed: ${error.message}`);
      return { success: false, remaining: 0, error: error.message };
    }
    return data as CreditResult;
  } catch (e) {
    console.warn(`[credit] refund threw: ${(e as Error).message}`);
    return { success: false, remaining: 0, error: 'unknown_error' };
  }
}
