/**
 * 통합 로깅 시스템
 * - 레벨별 필터링 (info, warn, error)
 * - 개발/프로덕션 환경 분리
 * - 메모리 버퍼링 (최근 100개)
 * - 에러 서버 전송 (프로덕션)
 * - 사용자 행동 추적
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: number;
  context: {
    userAgent: string;
    url: string;
    sessionId: string;
  };
  stackTrace?: string;
}

export interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: number;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private events: AnalyticsEvent[] = [];
  private maxLogs = 100;
  private sessionId: string;
  private isDevelopment: boolean;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 세션 ID 생성
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 로그 컨텍스트 생성
   */
  private getContext() {
    return {
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
    };
  }

  /**
   * 로그 기록
   */
  log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
      context: this.getContext(),
    };

    // 에러인 경우 스택 트레이스 추가
    if (level === 'error' && data instanceof Error) {
      entry.stackTrace = data.stack;
    }

    // 메모리 버퍼에 저장
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 개발 모드: 콘솔에 출력
    if (this.isDevelopment) {
      const consoleMethod = level === 'info' ? 'log' : level;
      console[consoleMethod](`[${level.toUpperCase()}]`, message, data || '');
    }

    // 프로덕션 모드: 에러만 서버로 전송
    if (!this.isDevelopment && level === 'error') {
      this.sendErrorToServer(entry);
    }

    // LocalStorage에 저장 (최근 로그 유지)
    this.saveToLocalStorage();
  }

  /**
   * 편의 메서드들
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      this.log('debug', message, data);
    }
  }

  /**
   * 사용자 이벤트 추적
   */
  trackEvent(category: string, action: string, label?: string, value?: number): void {
    const event: AnalyticsEvent = {
      category,
      action,
      label,
      value,
      timestamp: Date.now(),
    };

    this.events.push(event);
    if (this.events.length > this.maxLogs) {
      this.events.shift();
    }

    this.info('Event tracked', event);

    // Google Analytics 또는 Mixpanel 등으로 전송
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
      });
    }
  }

  /**
   * 성능 메트릭 추적
   */
  trackPerformance(metric: string, value: number, unit = 'ms'): void {
    this.info(`Performance: ${metric}`, { value, unit });
    this.trackEvent('Performance', metric, unit, value);
  }

  /**
   * 에러를 서버로 전송 (프로덕션)
   */
  private async sendErrorToServer(entry: LogEntry): Promise<void> {
    try {
      // Supabase 기반 에러 모니터링 연동
      const { trackError } = await import('../services/errorMonitoringService');
      trackError(
        'unknown',
        entry.data instanceof Error ? entry.data : new Error(entry.message),
        { source: 'logger', ...(entry.data && typeof entry.data === 'object' ? entry.data : {}) },
        'medium'
      );
    } catch {
      // 에러 전송 실패 시 무시 (무한 루프 방지)
    }
  }

  /**
   * LocalStorage에 저장
   */
  private saveToLocalStorage(): void {
    try {
      const recentLogs = this.logs.slice(-20); // 최근 20개만
      localStorage.setItem('hospitalai_logs', JSON.stringify(recentLogs));
    } catch {
      // LocalStorage 용량 초과 등
      console.warn('Failed to save logs to localStorage');
    }
  }

  /**
   * LocalStorage에서 로드
   */
  loadFromLocalStorage(): LogEntry[] {
    try {
      const stored = localStorage.getItem('hospitalai_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * 모든 로그 가져오기
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  /**
   * 모든 이벤트 가져오기
   */
  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  /**
   * 로그 삭제
   */
  clear(): void {
    this.logs = [];
    this.events = [];
    localStorage.removeItem('hospitalai_logs');
  }

  /**
   * 로그 통계
   */
  getStats(): {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    eventCount: number;
  } {
    return {
      totalLogs: this.logs.length,
      errorCount: this.logs.filter((log) => log.level === 'error').length,
      warnCount: this.logs.filter((log) => log.level === 'warn').length,
      infoCount: this.logs.filter((log) => log.level === 'info').length,
      eventCount: this.events.length,
    };
  }

  /**
   * 에러 리포트 생성
   */
  generateErrorReport(): string {
    const errors = this.logs.filter((log) => log.level === 'error');
    const stats = this.getStats();

    return `
=== Hospital AI Error Report ===
Session ID: ${this.sessionId}
Total Logs: ${stats.totalLogs}
Errors: ${stats.errorCount}
Warnings: ${stats.warnCount}

Recent Errors:
${errors.slice(-5).map((err, i) => `
${i + 1}. ${new Date(err.timestamp).toISOString()}
   Message: ${err.message}
   Data: ${JSON.stringify(err.data)}
   URL: ${err.context.url}
`).join('')}
    `.trim();
  }
}

// 싱글톤 인스턴스 export
export const logger = Logger.getInstance();

// 편의 함수들
export const log = {
  info: (msg: string, data?: any) => logger.info(msg, data),
  warn: (msg: string, data?: any) => logger.warn(msg, data),
  error: (msg: string, data?: any) => logger.error(msg, data),
  debug: (msg: string, data?: any) => logger.debug(msg, data),
  track: (category: string, action: string, label?: string, value?: number) =>
    logger.trackEvent(category, action, label, value),
  perf: (metric: string, value: number, unit?: string) =>
    logger.trackPerformance(metric, value, unit),
};

// 전역 에러 핸들러 등록
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logger.error('Global error caught', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection', {
      reason: event.reason,
    });
  });
}
