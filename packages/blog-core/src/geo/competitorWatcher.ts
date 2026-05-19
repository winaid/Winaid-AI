/**
 * GEO-9 — 경쟁사 신규 콘텐츠 자동 감지.
 *
 * 흐름:
 *   1. extractCompetitorsFromCitations: geo_citations citation hostname 중 우리
 *      도메인 제외 + 빈도 ≥ 2 인 경쟁사 도메인 추출
 *   2. fetchCompetitorNewContent: 도메인 RSS / sitemap.xml fetch → URL list
 *   3. searchNaverCompetitorPosts: 네이버 검색 API (NAVER_CLIENT_ID/SECRET 필요) →
 *      블로그/카페 신규 글
 *   4. detectNewContent: 위 통합 → 이미 알고있는 URL 제외 → ContentItem[] 반환
 *
 * 순수 함수 — 네트워크 X 인 헬퍼만 (extract*). fetch* 는 외부 fetch 사용 (fail-safe).
 *
 * 환경 변수:
 *   - NAVER_CLIENT_ID + NAVER_CLIENT_SECRET (네이버 검색) — 미설정 시 naver 채널 skip
 */

import { normalizeHostname } from './citationExtractor';
import type { Citation, CitationRow } from './types';

const FETCH_TIMEOUT_MS = 10_000;
const NAVER_DISPLAY_DEFAULT = 10;

// ── 타입 ──────────────────────────────────────────────────────

/** 추적 도메인 (competitor_domains 1 row 의 application-level 표현). */
export interface CompetitorDomain {
  hospital_name: string;
  domain: string;
  source: 'auto_citation' | 'manual';
  enabled?: boolean;
}

/** 감지된 신규 콘텐츠 1건 (competitor_contents 1 row). */
export interface CompetitorContentItem {
  hospital_name?: string;
  competitor_domain: string;
  url: string;
  title?: string;
  snippet?: string;
  published_at?: string;
  source: 'citation' | 'naver_blog' | 'naver_cafe' | 'website';
}

export interface ExtractCompetitorsOpts {
  /** 빈도 임계값 — 같은 도메인이 ≥ N 회 citation 매칭되면 추적 대상. 기본 2. */
  minFrequency?: number;
  /** 비교 윈도우 일수 (rows 의 created_at 으로 필터). 미지정 시 전체. */
  windowDays?: number;
}

// ── 1) citation → competitor domain 추출 ─────────────────────

/**
 * geo_citations 의 citation hostname 중 우리 도메인 제외 + 빈도 ≥ 2 인 도메인을
 * 경쟁사 후보로 추출. 동일 hostname 빈도 합산.
 */
export function extractCompetitorsFromCitations(
  rows: CitationRow[],
  ourDomains: string[],
  hospitalName: string,
  opts: ExtractCompetitorsOpts = {},
): CompetitorDomain[] {
  const minFreq = opts.minFrequency ?? 2;
  const windowDays = opts.windowDays;
  const oursSet = new Set(ourDomains.map(d => normalizeHostname('https://' + d) || d.toLowerCase()));

  const cutoff = windowDays
    ? Date.now() - windowDays * 86_400_000
    : 0;

  const freq = new Map<string, number>();
  for (const r of rows) {
    if (cutoff > 0 && r.created_at) {
      const t = new Date(r.created_at).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
    }
    for (const c of (r.citations || []) as Citation[]) {
      const host = normalizeHostname(c.url);
      if (!host) continue;
      if (c.is_ours === true) continue;
      if (oursSet.has(host)) continue;
      freq.set(host, (freq.get(host) ?? 0) + 1);
    }
  }

  const out: CompetitorDomain[] = [];
  for (const [domain, count] of freq.entries()) {
    if (count >= minFreq) {
      out.push({ hospital_name: hospitalName, domain, source: 'auto_citation', enabled: true });
    }
  }
  // 빈도 높은 순 정렬 — UI 상단에 자주 등장하는 경쟁사
  out.sort((a, b) => (freq.get(b.domain) ?? 0) - (freq.get(a.domain) ?? 0));
  return out;
}

// ── 2) RSS / sitemap fetch ────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** RSS XML 의 <item> 들에서 link/title/pubDate 추출. cheerio 미사용 (RSS 만 간단 파싱). */
function parseRssItems(xml: string): Array<{ url: string; title?: string; published_at?: string; snippet?: string }> {
  const items: Array<{ url: string; title?: string; published_at?: string; snippet?: string }> = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRe) || [];
  for (const block of matches) {
    const link = block.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim()
      || block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]?.trim();
    if (!link) continue;
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim();
    const description = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim();
    items.push({
      url: link,
      title,
      published_at: pubDate ? new Date(pubDate).toISOString() : undefined,
      snippet: description ? description.replace(/<[^>]+>/g, '').slice(0, 200) : undefined,
    });
  }
  return items;
}

/** sitemap.xml 의 <loc> 추출 (URL 만). pub date 없음. */
function parseSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

/**
 * 경쟁사 도메인의 RSS / sitemap 에서 신규 URL list fetch.
 *
 * 시도 순서: /rss → /feed → /rss.xml → /sitemap.xml.
 * 첫 성공 응답만 사용. 모든 fetch 실패 → 빈 배열 (fail-safe).
 *
 * `since` 이후 published 만 필터 (RSS pubDate 기준 — sitemap 은 필터 X, 호출자가 DB 비교).
 */
export async function fetchCompetitorNewContent(
  domain: string,
  since?: Date,
): Promise<CompetitorContentItem[]> {
  const base = `https://${domain}`;
  const candidates = ['/rss', '/feed', '/rss.xml', '/atom.xml', '/sitemap.xml'];

  for (const path of candidates) {
    const res = await fetchWithTimeout(base + path);
    if (!res || !res.ok) continue;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!/xml|rss|atom|text/.test(ct)) continue;
    let body: string;
    try {
      body = await res.text();
    } catch {
      continue;
    }
    if (body.length > 2_000_000) continue; // 2MB cap

    // RSS / Atom
    if (/<rss|<feed|<channel/i.test(body)) {
      const items = parseRssItems(body);
      const filtered = since
        ? items.filter(i => {
            if (!i.published_at) return true; // 보수적 — 날짜 없으면 포함
            const t = new Date(i.published_at).getTime();
            return !Number.isNaN(t) && t >= since.getTime();
          })
        : items;
      return filtered.map(i => ({
        competitor_domain: domain,
        url: i.url,
        title: i.title,
        snippet: i.snippet,
        published_at: i.published_at,
        source: 'website' as const,
      }));
    }

    // sitemap.xml
    if (/<urlset|<sitemapindex/i.test(body)) {
      const locs = parseSitemapLocs(body).slice(0, 50);
      return locs.map(url => ({
        competitor_domain: domain,
        url,
        source: 'website' as const,
      }));
    }
  }

  return [];
}

// ── 3) 네이버 검색 API ────────────────────────────────────────

interface NaverSearchItem {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  cafename?: string;
  postdate?: string;  // 'YYYYMMDD' (블로그)
}

interface NaverSearchResponse {
  items?: NaverSearchItem[];
}

function naverKeys(): { id: string; secret: string } | null {
  const id = process.env.NAVER_CLIENT_ID?.trim();
  const secret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return { id, secret };
}

function naverPostDateToIso(s: string | undefined): string | undefined {
  if (!s || !/^\d{8}$/.test(s)) return undefined;
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return `${y}-${m}-${d}T00:00:00Z`;
}

function stripNaverHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/<\/?b>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

/**
 * 네이버 검색 (blog / cafe).
 * - NAVER_CLIENT_ID/SECRET 미설정 → 빈 배열 (silent skip)
 * - HTTP 실패 → 빈 배열 (fail-safe)
 */
export async function searchNaverCompetitorPosts(
  competitorName: string,
  opts: { searchType?: 'blog' | 'cafearticle'; display?: number; since?: Date } = {},
): Promise<CompetitorContentItem[]> {
  const keys = naverKeys();
  if (!keys) return [];
  if (!competitorName || !competitorName.trim()) return [];

  const searchType = opts.searchType ?? 'blog';
  const display = Math.min(Math.max(opts.display ?? NAVER_DISPLAY_DEFAULT, 1), 100);
  const url = `https://openapi.naver.com/v1/search/${searchType}.json?query=${encodeURIComponent(competitorName)}&display=${display}&sort=date`;

  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, {
    headers: { 'X-Naver-Client-Id': keys.id, 'X-Naver-Client-Secret': keys.secret },
  });
  if (!res || !res.ok) return [];
  let data: NaverSearchResponse;
  try {
    data = (await res.json()) as NaverSearchResponse;
  } catch {
    return [];
  }
  const items = (data.items || []).filter(i => !!i.link);

  const out: CompetitorContentItem[] = [];
  for (const i of items) {
    const publishedIso = naverPostDateToIso(i.postdate);
    if (opts.since && publishedIso) {
      const t = new Date(publishedIso).getTime();
      if (Number.isNaN(t) || t < opts.since.getTime()) continue;
    }
    const host = normalizeHostname(i.link!);
    out.push({
      competitor_domain: host || competitorName,
      url: i.link!,
      title: stripNaverHtml(i.title),
      snippet: stripNaverHtml(i.description),
      published_at: publishedIso,
      source: searchType === 'blog' ? 'naver_blog' : 'naver_cafe',
    });
  }
  return out;
}

// ── 4) 통합 detect (호출자가 DB 와 비교해서 신규만 insert) ─────

export interface DetectNewContentResult {
  domain: string;
  /** RSS / sitemap / 네이버 결과 통합. 호출자가 DB 의 이미 알고있는 URL 제외 처리. */
  items: CompetitorContentItem[];
  /** 채널별 시도 / 성공 count — UI 디버깅용. */
  meta: {
    websiteAttempted: boolean;
    websiteFound: number;
    naverBlogFound: number;
    naverCafeFound: number;
  };
}

/**
 * 단일 경쟁사 도메인의 신규 콘텐츠 통합 detect.
 *
 * @param domain 경쟁사 hostname (예: 'naver-clinic.com')
 * @param competitorName 네이버 검색용 키워드 (예: 병원명 또는 hostname). 미지정 시 domain 사용.
 * @param sinceDays  N일 이내 발행만 (기본 7일)
 */
export async function detectNewContent(
  domain: string,
  competitorName?: string,
  sinceDays = 7,
): Promise<DetectNewContentResult> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const websiteItems = await fetchCompetitorNewContent(domain, since);
  const naverBlog = await searchNaverCompetitorPosts(competitorName || domain, { searchType: 'blog', since });
  const naverCafe = await searchNaverCompetitorPosts(competitorName || domain, { searchType: 'cafearticle', since });

  const combined: CompetitorContentItem[] = [...websiteItems, ...naverBlog, ...naverCafe];

  // 중복 URL 제거 (같은 글이 여러 채널 매칭되면 첫 등장 채널만 유지)
  const seen = new Set<string>();
  const deduped: CompetitorContentItem[] = [];
  for (const i of combined) {
    if (seen.has(i.url)) continue;
    seen.add(i.url);
    deduped.push(i);
  }

  return {
    domain,
    items: deduped,
    meta: {
      websiteAttempted: true,
      websiteFound: websiteItems.length,
      naverBlogFound: naverBlog.length,
      naverCafeFound: naverCafe.length,
    },
  };
}
