/**
 * errorMonitoringService.ts - 중앙 에러 모니터링
 *
 * 모든 서비스의 에러를 수집 → Supabase에 기록 → 어드민에서 조회 가능
 * Supabase error_logs 테이블이 없으면 graceful fallback (localStorage)
 */
import { supabase } from '../lib/supabase';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory =
  | 'gemini_api'
  | 'gemini_api_all_retries_failed'
  | 'crawling'
  | 'embedding'
  | 'medical_law'
  | 'supabase'
  | 'payment'
  | 'auth'
  | 'unknown';

export interface ErrorLog {
  id?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  user_id?: string;
  session_id: string;
  created_at: string;
  resolved: boolean;
}

// 인메모리 버퍼 (어드민 패널 즉시 조회용)
const errorBuffer: ErrorLog[] = [];
const MAX_BUFFER = 200;

// 세션 ID (페이지 로드당 1개)
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// 배치 전송용 큐
let pendingErrors: ErrorLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 10_000; // 10초마다 배치 전송
const FLUSH_THRESHOLD = 5; // 5개 모이면 즉시 전송

/**
 * 에러 추적 - 모든 서비스에서 이 함수 호출
 */
export function trackError(
  category: ErrorCategory,
  error: unknown,
  context?: Record<string, unknown>,
  severity: ErrorSeverity = 'medium'
): void {
  const errorObj = normalizeError(error);

  const log: ErrorLog = {
    category,
    severity,
    message: errorObj.message,
    stack: errorObj.stack,
    context: {
      ...context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    },
    session_id: SESSION_ID,
    created_at: new Date().toISOString(),
    resolved: false,
  };

  // 인메모리 버퍼에 추가
  errorBuffer.push(log);
  if (errorBuffer.length > MAX_BUFFER) errorBuffer.shift();

  // 콘솔 출력 (개발 시 유용)
  const emoji = severity === 'critical' ? '🚨' : severity === 'high' ? '❌' : '⚠️';
  console.error(`${emoji} [${category}] ${log.message}`, context || '');

  // Supabase 전송 큐에 추가
  pendingErrors.push(log);

  if (pendingErrors.length >= FLUSH_THRESHOLD) {
    flushErrors();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushErrors, FLUSH_INTERVAL);
  }

  // localStorage 백업 (Supabase 실패 대비)
  saveToLocalStorage(log);
}

/**
 * 배치 전송 - Supabase에 에러 로그 일괄 저장
 */
async function flushErrors(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (pendingErrors.length === 0) return;

  const batch = [...pendingErrors];
  pendingErrors = [];

  try {
    const { error } = await supabase
      .from('error_logs')
      .insert(batch.map(e => ({
        category: e.category,
        severity: e.severity,
        message: e.message.substring(0, 1000), // DB 필드 길이 제한
        stack: e.stack?.substring(0, 2000),
        context: e.context,
        session_id: e.session_id,
        resolved: false,
      })));

    if (error) {
      // 테이블이 없거나 권한 문제 → localStorage에만 보관
      console.warn('[ErrorMonitoring] Supabase 저장 실패 (테이블 미생성?):', error.message);
    }
  } catch {
    // 네트워크 에러 등 → 무시 (무한 재귀 방지)
  }
}

/**
 * 에러 객체 정규화
 */
function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message: unknown }).message) };
  }
  return { message: String(error) };
}

/**
 * localStorage 백업 (최근 50개)
 */
function saveToLocalStorage(log: ErrorLog): void {
  try {
    const key = 'hospitalai_error_logs';
    const stored = JSON.parse(localStorage.getItem(key) || '[]') as ErrorLog[];
    stored.push(log);
    if (stored.length > 50) stored.splice(0, stored.length - 50);
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // 용량 초과 등 무시
  }
}


// ─────────────────────────────────────
// 조회 API (어드민 패널용)
// ─────────────────────────────────────

/**
 * 인메모리 에러 로그 조회 (현재 세션)
 */
export function getRecentErrors(limit = 50): ErrorLog[] {
  return errorBuffer.slice(-limit);
}

/**
 * Supabase에서 에러 로그 조회 (전체 이력)
 */
export async function fetchErrorLogs(options?: {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  limit?: number;
  since?: string;
}): Promise<ErrorLog[]> {
  try {
    let query = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(options?.limit || 100);

    if (options?.category) query = query.eq('category', options.category);
    if (options?.severity) query = query.eq('severity', options.severity);
    if (options?.since) query = query.gte('created_at', options.since);

    const { data, error } = await query;
    if (error) {
      console.warn('[ErrorMonitoring] 조회 실패:', error.message);
      return getLocalStorageErrors();
    }
    return (data as ErrorLog[]) || [];
  } catch {
    return getLocalStorageErrors();
  }
}

/**
 * localStorage에서 에러 조회 (Supabase 미사용 시 폴백)
 */
function getLocalStorageErrors(): ErrorLog[] {
  try {
    return JSON.parse(localStorage.getItem('hospitalai_error_logs') || '[]');
  } catch {
    return [];
  }
}

/**
 * 에러 통계 요약
 */
export function getErrorStats(): {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  recent1h: number;
} {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let recent1h = 0;

  for (const log of errorBuffer) {
    byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
    if (now - new Date(log.created_at).getTime() < oneHour) recent1h++;
  }

  return {
    total: errorBuffer.length,
    byCategory,
    bySeverity,
    recent1h,
  };
}

/**
 * Supabase error_logs 테이블 생성 SQL (어드민 최초 실행용)
 */
export const ERROR_LOGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert errors" ON error_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can read" ON error_logs FOR SELECT USING (auth.role() = 'authenticated');
`;
