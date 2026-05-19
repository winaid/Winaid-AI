/**
 * GEO-8 — AI 인용률 변동 자동 감지 엔진.
 *
 * geo_citations 누적 데이터에서:
 *   - cite_drop: 우리 인용률 -threshold % 이상 (7일 전 대비)
 *   - cite_rise: 우리 인용률 +threshold % 이상
 *   - new_competitor: 최근 windowDays 에 처음 등장한 경쟁 도메인 ≥ 1
 *
 * 순수 함수. 네트워크/DB 접근 X. 호출자가 geo_citations rows 를 전달.
 */

import type { Citation, CitationRow } from './types';
import { isOursUrl, normalizeHostname } from './citationExtractor';

export type AlertType = 'cite_drop' | 'cite_rise' | 'new_competitor' | 'sentiment_drop';

export interface AlertPayload {
  /** 현재 윈도우 평균/비율 (cite_drop / cite_rise). */
  current?: number;
  /** 비교 윈도우 평균/비율. */
  previous?: number;
  /** 변동 % — current/previous - 1 (signed). */
  deltaPct?: number;
  /** 비교 기간 (일). */
  windowDays?: number;
  /** new_competitor 알림 — 신규 경쟁사 hostname list. */
  newDomains?: string[];
  /** 알림 메시지 한 줄 요약. */
  summary?: string;
}

export interface Alert {
  type: AlertType;
  payload: AlertPayload;
  /** 사람이 읽는 한국어 메시지 (Slack/Email/카톡 본문). */
  message: string;
}

export interface AlertSubscription {
  id?: string;
  hospital_name: string;
  our_domains: string[];
  threshold_pct: number;
  compare_window_days: number;
  /** { email?, slack_webhook?, kakao_token? } — null/undefined 채널은 발송 skip. */
  channels: Record<string, string | undefined>;
  enabled?: boolean;
}

// ── 통계 헬퍼 ─────────────────────────────────────────────────

/** rows 중 created_at 이 [from, to) 범위 안인 것만 필터. */
function inWindow(rows: CitationRow[], from: Date, to: Date): CitationRow[] {
  return rows.filter(r => {
    if (!r.created_at) return false;
    const t = new Date(r.created_at).getTime();
    return !Number.isNaN(t) && t >= from.getTime() && t < to.getTime();
  });
}

/**
 * 한 윈도우의 "우리 인용률" = (is_ours 매칭 citation 수) / (전체 citation 수).
 * rows 0개 → null (계산 불가).
 */
function citeRateForWindow(rows: CitationRow[], ourDomains: string[]): number | null {
  if (rows.length === 0) return null;
  let total = 0;
  let ours = 0;
  for (const r of rows) {
    for (const c of (r.citations || []) as Citation[]) {
      total++;
      // is_ours 가 row 에 저장돼있으면 그대로, 없으면 ourDomains 로 재계산
      if (c.is_ours === true) ours++;
      else if (c.is_ours === undefined && isOursUrl(c.url, ourDomains)) ours++;
    }
  }
  if (total === 0) return null;
  return ours / total;
}

/** rows 의 unique non-our hostname list (경쟁사 도메인). */
function competitorHostnames(rows: CitationRow[], ourDomains: string[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    for (const c of (r.citations || []) as Citation[]) {
      const host = normalizeHostname(c.url);
      if (!host) continue;
      // is_ours 매칭은 application 레벨 + ourDomains 양쪽 체크
      if (c.is_ours === true) continue;
      if (c.is_ours === undefined && isOursUrl(c.url, ourDomains)) continue;
      set.add(host);
    }
  }
  return set;
}

// ── public — 변동 감지 ────────────────────────────────────────

export interface DetectCiteRateChangeResult {
  current: number | null;
  previous: number | null;
  deltaPct: number | null;
  alertType?: 'cite_drop' | 'cite_rise';
}

/**
 * 우리 인용률 변동 감지.
 *
 * window = [now-windowDays, now)
 * previous = [now-2*windowDays, now-windowDays)
 *
 * 어느 한쪽이라도 데이터 없으면 alertType undefined (감지 불가).
 */
export function detectCiteRateChange(
  rows: CitationRow[],
  ourDomains: string[],
  thresholdPct: number,
  windowDays: number,
  now: Date = new Date(),
): DetectCiteRateChangeResult {
  const wMs = windowDays * 86_400_000;
  const currentWindow = inWindow(rows, new Date(now.getTime() - wMs), now);
  const previousWindow = inWindow(rows, new Date(now.getTime() - 2 * wMs), new Date(now.getTime() - wMs));

  const current = citeRateForWindow(currentWindow, ourDomains);
  const previous = citeRateForWindow(previousWindow, ourDomains);

  if (current === null || previous === null) {
    return { current, previous, deltaPct: null };
  }
  if (previous === 0) {
    // 0 → 양수 = 신규 등장. cite_rise 로 분류 (이전 0%, 현재 > 0%).
    if (current > 0) {
      return { current, previous, deltaPct: 100, alertType: 'cite_rise' };
    }
    return { current, previous, deltaPct: 0 };
  }
  const deltaPct = Math.round(((current / previous) - 1) * 100);
  if (deltaPct <= -thresholdPct) return { current, previous, deltaPct, alertType: 'cite_drop' };
  if (deltaPct >= thresholdPct) return { current, previous, deltaPct, alertType: 'cite_rise' };
  return { current, previous, deltaPct };
}

export interface DetectNewCompetitorsResult {
  newDomains: string[];
}

/**
 * 새 경쟁사 hostname 감지 — 최근 windowDays 에 처음 등장한 것.
 *
 * 비교: [now-windowDays, now) 의 경쟁 hostname set 에서
 *      [-∞, now-windowDays) 에 한 번도 없던 것만 추출.
 */
export function detectNewCompetitors(
  rows: CitationRow[],
  ourDomains: string[],
  windowDays: number,
  now: Date = new Date(),
): DetectNewCompetitorsResult {
  const wMs = windowDays * 86_400_000;
  const recent = inWindow(rows, new Date(now.getTime() - wMs), now);
  const older = inWindow(rows, new Date(0), new Date(now.getTime() - wMs));

  const recentSet = competitorHostnames(recent, ourDomains);
  const olderSet = competitorHostnames(older, ourDomains);

  const newDomains: string[] = [];
  for (const h of recentSet) {
    if (!olderSet.has(h)) newDomains.push(h);
  }
  return { newDomains };
}

// ── public — Subscription 평가 ────────────────────────────────

/**
 * 1 구독에 대해 모든 alert 종류 평가 → 트리거된 Alert[] 반환.
 *
 * subscription.enabled === false → 빈 배열.
 * 임계값 미달 / 데이터 부족 → 그 alert 종류 skip.
 */
export function evaluateSubscription(
  subscription: AlertSubscription,
  rows: CitationRow[],
  now: Date = new Date(),
): Alert[] {
  if (subscription.enabled === false) return [];

  const alerts: Alert[] = [];

  // 1) 인용률 변동
  const change = detectCiteRateChange(
    rows,
    subscription.our_domains,
    subscription.threshold_pct,
    subscription.compare_window_days,
    now,
  );
  if (change.alertType) {
    const payload: AlertPayload = {
      current: change.current ?? undefined,
      previous: change.previous ?? undefined,
      deltaPct: change.deltaPct ?? undefined,
      windowDays: subscription.compare_window_days,
    };
    alerts.push({
      type: change.alertType,
      payload,
      message: formatAlertMessage({ type: change.alertType, payload, message: '' }, 'ko'),
    });
  }

  // 2) 새 경쟁사
  const newComp = detectNewCompetitors(rows, subscription.our_domains, subscription.compare_window_days, now);
  if (newComp.newDomains.length > 0) {
    const payload: AlertPayload = {
      newDomains: newComp.newDomains,
      windowDays: subscription.compare_window_days,
    };
    alerts.push({
      type: 'new_competitor',
      payload,
      message: formatAlertMessage({ type: 'new_competitor', payload, message: '' }, 'ko'),
    });
  }

  return alerts;
}

// ── public — 메시지 포맷 ──────────────────────────────────────

/** Alert → Slack/Email/카톡 본문. locale 기본 'ko'. */
export function formatAlertMessage(alert: Alert, locale: 'ko' = 'ko'): string {
  const p = alert.payload;
  if (alert.type === 'cite_drop') {
    const delta = typeof p.deltaPct === 'number' ? `${p.deltaPct}%` : '?';
    const curPct = typeof p.current === 'number' ? `${Math.round(p.current * 100)}%` : '?';
    return `🚨 우리 사이트 인용률 ${delta} (${p.windowDays ?? '?'}일 전 대비). 현재 ${curPct}.`;
  }
  if (alert.type === 'cite_rise') {
    const delta = typeof p.deltaPct === 'number' ? `+${p.deltaPct}%` : '?';
    const curPct = typeof p.current === 'number' ? `${Math.round(p.current * 100)}%` : '?';
    return `✅ 우리 사이트 인용률 ${delta} (${p.windowDays ?? '?'}일 전 대비). 현재 ${curPct}.`;
  }
  if (alert.type === 'new_competitor') {
    const list = (p.newDomains || []).slice(0, 5).join(', ');
    const more = (p.newDomains || []).length > 5 ? ` 외 ${(p.newDomains || []).length - 5}건` : '';
    return `📌 신규 경쟁사 ${list}${more} (${p.windowDays ?? '?'}일 이내 처음 등장).`;
  }
  if (alert.type === 'sentiment_drop') {
    return `⚠️ 평판 신호 하락 감지 (${p.windowDays ?? '?'}일 윈도우).`;
  }
  return p.summary || '인용 변동 감지.';
}
