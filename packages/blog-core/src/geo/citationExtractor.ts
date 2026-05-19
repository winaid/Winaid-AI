/**
 * Citation 정규화 + is_ours 매칭 + 단축 URL unwrap 공통 헬퍼.
 *
 * 순수 함수 (unwrapShortUrl 만 fetch). chatgptClient / geminiClient 가 raw API 응답에서
 * URL 을 모은 뒤 본 모듈로 표준화한다.
 */

import type { Citation } from './types';

// ── 단축 URL host suffix list — 1단 unwrap 대상 ────────────────
// 보수적으로 가장 흔한 것만. 운영 데이터 보면서 확장.
const SHORT_URL_HOSTS: readonly string[] = [
  'bit.ly',
  't.co',
  'naver.me',
  'goo.gl',
  'youtu.be',
  'kko.to',
  'tinyurl.com',
  'lnkd.in',
  'rb.gy',
];

/** url → hostname (lowercase, www. 정규화). 실패 시 빈 문자열. */
export function normalizeHostname(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

/** hostname 이 list 의 어느 host 와 일치 또는 그 서브도메인인지 (suffix 매칭). */
export function matchesHostSuffix(hostname: string, hosts: readonly string[]): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return hosts.some(d => {
    const dd = d.toLowerCase().replace(/^www\./, '');
    return h === dd || h.endsWith('.' + dd);
  });
}

/** url 의 hostname 이 ourDomains 중 어느 하나와 (suffix) 매칭되는지. */
export function isOursUrl(url: string, ourDomains: readonly string[]): boolean {
  if (!ourDomains || ourDomains.length === 0) return false;
  const host = normalizeHostname(url);
  if (!host) return false;
  return matchesHostSuffix(host, ourDomains);
}

/** url 이 단축 URL host suffix list 에 매칭되면 true. */
export function isShortUrl(url: string): boolean {
  const host = normalizeHostname(url);
  return matchesHostSuffix(host, SHORT_URL_HOSTS);
}

/**
 * 단축 URL 1단 unwrap (HEAD redirect 추적, timeout fail-safe).
 *
 * 실패 시 원본 url 그대로 반환 (fail-safe — citation 누락 < 잘못 매칭).
 */
export async function unwrapShortUrl(url: string, timeoutMs = 3000): Promise<string> {
  if (timeoutMs <= 0) return url;
  if (!isShortUrl(url)) return url;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // res.url 은 최종 redirect 후 URL. 빈 문자열이면 원본 유지.
    return res.url && res.url !== url ? res.url : url;
  } catch {
    clearTimeout(timeoutId);
    return url; // network / abort / DNS 실패 — 원본 유지
  }
}

/** URL 의 hash / 트래킹 쿼리 (utm_*, fbclid 등) 제거 — 인용 비교의 안정성. */
export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const toRemove: string[] = [];
    u.searchParams.forEach((_, key) => {
      const k = key.toLowerCase();
      if (k.startsWith('utm_') || k === 'fbclid' || k === 'gclid' || k === 'mc_cid' || k === 'mc_eid') {
        toRemove.push(key);
      }
    });
    toRemove.forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * raw URL list → 정규화된 Citation[] (de-dup + is_ours 마킹).
 *
 * - 단축 URL unwrap (병렬)
 * - 트래킹 쿼리 제거
 * - hostname 정규화 후 URL 기준 중복 제거 (첫 등장 메타데이터 우선)
 * - is_ours 마킹 (ourDomains 기준)
 *
 * `extra` 인자: URL 외 메타데이터 (title/snippet/paragraph_index) — 동일 URL 이면 첫 번째만 사용.
 */
export async function normalizeCitations(
  rawUrls: string[],
  ourDomains: readonly string[] = [],
  unwrapTimeoutMs = 3000,
  extra?: Record<string, { title?: string; snippet?: string; paragraph_index?: number }>,
): Promise<Citation[]> {
  if (!rawUrls || rawUrls.length === 0) return [];

  // 1단 unwrap 병렬 — timeout 으로 묶음
  const unwrapped = await Promise.all(
    rawUrls.map(u => unwrapShortUrl(u, unwrapTimeoutMs)),
  );

  const seen = new Set<string>();
  const out: Citation[] = [];
  for (let i = 0; i < unwrapped.length; i++) {
    const cleaned = stripTrackingParams(unwrapped[i]);
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);

    const meta = extra?.[rawUrls[i]] || extra?.[cleaned] || {};
    const cit: Citation = { url: cleaned };
    if (meta.title) cit.title = meta.title;
    if (meta.snippet) cit.snippet = meta.snippet;
    if (typeof meta.paragraph_index === 'number') cit.paragraph_index = meta.paragraph_index;
    cit.is_ours = isOursUrl(cleaned, ourDomains);
    out.push(cit);
  }
  return out;
}
