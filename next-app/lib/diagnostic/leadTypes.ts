/**
 * Diagnostic Lead form types — shared by client form, submit API,
 * internal admin proxy.
 *
 * Storage: public-app Supabase `diagnostic_leads` table.
 * See public-app-sql/migrations/2026-05-12_diagnostic_leads.sql
 */

export type LeadSource = 'lock-actionplan' | 'lock-snippets' | 'bottom-cta';
export type LeadStatus = 'new' | 'contacted' | 'closed';

export const LEAD_SOURCES: LeadSource[] = ['lock-actionplan', 'lock-snippets', 'bottom-cta'];
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'closed'];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  'lock-actionplan': '우선조치 잠금',
  'lock-snippets': '코드 스니펫 잠금',
  'bottom-cta': '하단 배너',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: '신규',
  contacted: '연락함',
  closed: '종료',
};

/** Client → POST /api/diagnostic/leads body. */
export interface LeadSubmitBody {
  hospitalName: string;
  contactName: string;
  phone: string;
  message?: string;
  source: LeadSource;
  /** 자동 첨부 (현재 진단). */
  diagnosticUrl?: string;
  diagnosticScore?: number;
  diagnosticToken?: string;
  /** Spam honeypot — CSS 로 숨김. 값이 있으면 서버에서 거부. */
  company_website?: string;
}

/** Admin admin list/detail row. */
export interface LeadRow {
  id: string;
  hospital_name: string;
  contact_name: string;
  phone: string;
  message: string | null;
  diagnostic_url: string | null;
  diagnostic_score: number | null;
  diagnostic_token: string | null;
  source: LeadSource;
  status: LeadStatus;
  ip: string | null;
  user_agent: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 한국 휴대폰 가벼운 검증 — '-' 제거 후 패턴. */
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/[^0-9]/g, '');
  return /^01[016789][0-9]{7,8}$/.test(digits);
}
