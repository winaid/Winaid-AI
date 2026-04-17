/**
 * AEO/GEO 진단 — 구조화 로깅.
 * Vercel / LogTail / Datadog 에서 JSON 파싱 가능한 한 줄 로그.
 * 사용처: /api/diagnostic, /api/diagnostic/stream, /api/diagnostic/refresh-narrative.
 */

interface DiagnosticLog {
  traceId: string;
  step: string;
  duration?: number;
  tokenCount?: number;
  cacheHit?: boolean;
  error?: string;
  url?: string;
  platform?: string;
  detail?: string;
}

export function logDiagnostic(log: DiagnosticLog): void {
  console.log(
    JSON.stringify({
      ...log,
      ts: new Date().toISOString(),
      service: 'diagnostic',
    }),
  );
}

export function generateTraceId(): string {
  return crypto.randomUUID();
}
