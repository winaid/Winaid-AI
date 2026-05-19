/**
 * GEO-1.2 — URL fetch + HTML 패턴 6종 분류 (FAQ / 비교표 / 리스트 / 의료진 / 가격 / 사례).
 *
 * 보안 (SSRF + DoS 방어):
 *   - URL validate (http/https only, javascript:/file:/data: 거부)
 *   - private IP / localhost / metadata endpoint / .local TLD 거부 (redirect 매 step 재검증)
 *   - HTML 응답만 (Content-Type text/html 검증)
 *   - 1MB 크기 cap (chunk 스트림 카운트, 초과 시 abort)
 *   - timeout 10s
 *   - User-Agent: Winaid-GEO-Decomposer/1.0
 *
 * fail-safe: 어떤 실패도 throw 하지 않고 PatternResult.status='fetch_failed'/'parse_failed' 반환.
 */

import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { PatternMeta, PatternResult, PatternType } from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_SIZE_BYTES = 1_000_000;
const USER_AGENT = 'Winaid-GEO-Decomposer/1.0';

const SCORE_PRIMARY_THRESHOLD = 40;
const SCORE_SECONDARY_THRESHOLD = 30;

// ── URL 보안 검증 (SSRF 방지) ────────────────────────────────

/** IPv4 / IPv6 정규식 — 보수적. literal IP 차단. */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^\[?[0-9a-f:]+\]?$/i;

function isPrivateIPv4(host: string): boolean {
  const m = host.match(IPV4_RE);
  if (!m) return false;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if (Number.isNaN(a) || Number.isNaN(b)) return true; // malformed → reject
  // 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / 127.0.0.0/8 (loopback) / 169.254.0.0/16 (link-local + metadata)
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/**
 * URL 보안 검증. 통과 시 normalize 된 URL 반환, 거부 시 { ok:false, reason }.
 * - protocol http/https only
 * - hostname literal private IP 차단
 * - localhost / *.local 차단
 * - IPv6 literal 차단 (보수적 — false negative 보다 false positive 안전)
 */
function validateUrlSafety(rawUrl: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol: ${u.protocol}` };
  }
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'empty hostname' };
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost not allowed' };
  }
  if (host.endsWith('.local')) {
    return { ok: false, reason: '.local TLD not allowed' };
  }
  if (IPV4_RE.test(host) && isPrivateIPv4(host)) {
    return { ok: false, reason: `private IPv4: ${host}` };
  }
  // IPv6 literal — 너무 다양한 reserved range. 보수적으로 전체 거부.
  if (host.startsWith('[') || (IPV6_RE.test(host) && host.includes(':'))) {
    return { ok: false, reason: 'IPv6 literal not allowed' };
  }
  return { ok: true, url: u.toString() };
}

// ── fetch — redirect 수동 추적 + 매 step 검증 + size cap ──────────────

async function fetchHtmlGuarded(
  rawUrl: string,
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; reason: string }> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = validateUrlSafety(currentUrl);
    if (!safe.ok) return { ok: false, reason: safe.reason };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = abortSignal
      ? AbortSignal.any([controller.signal, abortSignal])
      : controller.signal;
    let res: Response;
    try {
      res = await fetch(safe.url, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.1' },
      });
    } catch (e) {
      clearTimeout(timeoutId);
      return { ok: false, reason: `fetch error: ${e instanceof Error ? e.message : String(e)}` };
    }
    clearTimeout(timeoutId);

    // redirect status (301 / 302 / 303 / 307 / 308) — Location 헤더 따라 다음 hop
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ok: false, reason: `redirect ${res.status} without Location header` };
      try {
        currentUrl = new URL(loc, safe.url).toString();
      } catch {
        return { ok: false, reason: 'invalid redirect Location' };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html')) {
      return { ok: false, reason: `non-HTML Content-Type: ${contentType || '(none)'}` };
    }

    // Content-Length 1차 cap — 헤더 신뢰는 보조용. 실제 stream chunk 카운트가 본 가드.
    const cl = res.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_SIZE_BYTES) {
      return { ok: false, reason: `Content-Length exceeds 1MB (${cl})` };
    }

    if (!res.body) {
      return { ok: false, reason: 'empty body' };
    }

    // Stream chunk count — 초과 시 reader cancel.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_SIZE_BYTES) {
            await reader.cancel().catch(() => {});
            return { ok: false, reason: `body size exceeds 1MB at ${total} bytes` };
          }
          chunks.push(value);
        }
      }
    } catch (e) {
      return { ok: false, reason: `body read error: ${e instanceof Error ? e.message : String(e)}` };
    }

    // 합치고 UTF-8 디코드. 인코딩 charset 미파싱 — 한국어 사이트 99% utf-8.
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    return { ok: true, html, finalUrl: safe.url };
  }
  return { ok: false, reason: `too many redirects (>${MAX_REDIRECTS})` };
}

// ── 패턴 6종 점수 계산 ──────────────────────────────────────

const DOCTOR_NAME_INLINE = /(원장|부원장|대표원장|진료원장)\s+(?!인사말|소개|안내|정보|진료|메시지|사진|동영상|약력|이력|경력|학력|자격|프로필|인터뷰|일정|휴진|출근|영상|말씀|글)[가-힣]{2,4}/g;
const INTERVIEW_KEYWORDS = /(원장님께서|인터뷰|말씀하셨습니다|밝혔다|전했다|강조했다)/;
const COMPARISON_KEYWORDS = /(비교|vs|차이|장단점|장점|단점)/i;
const PRICE_KEYWORDS = /(요금|진료비|가격|만원|원(?![가-힣]))/g;
const BEFORE_AFTER_KEYWORDS = /(전후|Before|After|치료\s*전|치료\s*후|case|사례)/i;
const Q_MARKER = /(^|\n)\s*Q\s*[.:1-9]/g;
const NUMBERED_LIST_MARKER = /(^|\n)\s*\d+\.\s+\S/g;

/** 점수를 0~100 으로 clamp. */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreFaq($: CheerioAPI, text: string): number {
  let s = 0;
  const detailsCount = $('details').length;
  if (detailsCount >= 2) s += 60;
  else if (detailsCount === 1) s += 20;

  // <dt>+<dd> 쌍 카운트 — 같은 부모 내 dt 다음 dd 인지 단순 카운트
  const dtCount = $('dt').length;
  const ddCount = $('dd').length;
  const pairs = Math.min(dtCount, ddCount);
  if (pairs >= 3) s += 30;
  else if (pairs >= 1) s += 10;

  const qMarkers = (text.match(Q_MARKER) || []).length;
  if (qMarkers >= 5) s += 30;
  else if (qMarkers >= 2) s += 15;

  // FAQPage schema — itemtype 또는 JSON-LD
  const hasFaqSchema = $('[itemtype*="FAQPage"]').length > 0 || /"@type"\s*:\s*"FAQPage"/i.test($.html());
  if (hasFaqSchema) s += 40;

  return clamp(s);
}

function scoreComparisonTable($: CheerioAPI, text: string): number {
  let s = 0;
  const tables = $('table');
  if (tables.length === 0) return 0;

  let goodTable = false;
  tables.each((_, el) => {
    const $t = $(el);
    const tableText = $t.text();
    if (COMPARISON_KEYWORDS.test(tableText)) {
      s += 30;
      goodTable = true;
    }
    // thead/tbody 정렬 구조 — 정렬 비교표의 형식적 마커
    if ($t.find('thead').length > 0 && $t.find('tbody').length > 0) {
      s += 15;
    }
  });

  if (goodTable) s += 20;

  // table 갯수 가중치
  if (tables.length >= 2) s += 15;
  else s += 10;

  // 본문 비교 키워드 빈도
  const compMatches = text.match(new RegExp(COMPARISON_KEYWORDS, 'gi'));
  if (compMatches && compMatches.length >= 3) s += 10;

  return clamp(s);
}

function scoreList($: CheerioAPI, text: string): number {
  let s = 0;
  const olWith5: Cheerio<unknown> = $('ol').filter((_, el) => $(el).find('> li').length >= 5);
  const ulWith5: Cheerio<unknown> = $('ul').filter((_, el) => $(el).find('> li').length >= 5);
  if (olWith5.length >= 1) s += 50;
  else if ($('ol').length >= 1) s += 20;
  if (ulWith5.length >= 2) s += 30;
  else if (ulWith5.length === 1) s += 15;

  const numbered = (text.match(NUMBERED_LIST_MARKER) || []).length;
  if (numbered >= 7) s += 25;
  else if (numbered >= 4) s += 10;

  return clamp(s);
}

function scoreDoctorInterview($: CheerioAPI, text: string): number {
  let s = 0;
  const nameMatches = text.match(DOCTOR_NAME_INLINE) || [];
  if (nameMatches.length >= 1) s += 35;
  if (nameMatches.length >= 3) s += 15;

  if (INTERVIEW_KEYWORDS.test(text)) s += 30;

  // Q&A 구조 — Q 마커 ≥ 2 (인터뷰의 보조 신호)
  const qMarkers = (text.match(Q_MARKER) || []).length;
  if (qMarkers >= 2) s += 15;

  // 의료진 이름 + 인터뷰 단어 동시 등장 (강한 신호)
  if (nameMatches.length >= 1 && INTERVIEW_KEYWORDS.test(text)) s += 20;

  return clamp(s);
}

function scorePricing($: CheerioAPI, text: string): number {
  let s = 0;
  const priceMatches = text.match(PRICE_KEYWORDS) || [];
  if (priceMatches.length >= 5) s += 50;
  else if (priceMatches.length >= 3) s += 25;
  else if (priceMatches.length >= 1) s += 10;

  const tables = $('table');
  if (tables.length === 0) return clamp(s * 0.5); // table 없으면 점수 절반 (가격 정보지만 표 없음)

  // 가격 단어가 있는 table 의 행 수 평균
  let priceTableScore = 0;
  tables.each((_, el) => {
    const $t = $(el);
    if (PRICE_KEYWORDS.test($t.text())) {
      const rowCount = $t.find('tr').length;
      if (rowCount >= 3) priceTableScore += 30;
      else if (rowCount >= 2) priceTableScore += 15;
    }
  });
  s += Math.min(priceTableScore, 50);

  return clamp(s);
}

function scoreCaseStudy($: CheerioAPI, text: string): number {
  let s = 0;
  if (BEFORE_AFTER_KEYWORDS.test(text)) s += 40;

  // 사진 alt 에 case / 사례 / 전후
  let imgCaseHits = 0;
  $('img').each((_, el) => {
    const alt = ($(el).attr('alt') || '').toLowerCase();
    if (/사례|case|전후|before|after/i.test(alt)) imgCaseHits++;
  });
  if (imgCaseHits >= 2) s += 30;
  else if (imgCaseHits === 1) s += 15;

  // 의료진 이름 동시 등장 — 사례글은 보통 의료진 코멘트 동반
  if (DOCTOR_NAME_INLINE.test(text)) s += 20;
  DOCTOR_NAME_INLINE.lastIndex = 0; // global flag — reset for next call

  return clamp(s);
}

function buildMeta($: CheerioAPI): PatternMeta {
  return {
    paragraph_count: $('p').length,
    heading_count: $('h1, h2, h3, h4, h5, h6').length,
    table_count: $('table').length,
    list_count: $('ul, ol').length,
    image_count: $('img').length,
  };
}

// ── public API ───────────────────────────────────────────────

export interface ClassifyOpts {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

/** 단일 URL 분류. 어떤 실패도 throw X — PatternResult.status 로 surface. */
export async function classifyUrlPattern(rawUrl: string, opts: ClassifyOpts = {}): Promise<PatternResult> {
  // 1) URL 보안 게이트
  const safe = validateUrlSafety(rawUrl);
  if (!safe.ok) {
    return { url: rawUrl, status: 'fetch_failed', error: safe.reason };
  }

  // 2) fetch + redirect + size cap
  const fetched = await fetchHtmlGuarded(safe.url, opts.abortSignal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!fetched.ok) {
    return { url: safe.url, status: 'fetch_failed', error: fetched.reason };
  }

  // 3) HTML 파싱
  let $: CheerioAPI;
  try {
    $ = cheerio.load(fetched.html);
  } catch (e) {
    return {
      url: fetched.finalUrl,
      status: 'parse_failed',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // 4) 본문 텍스트 (script/style 제외)
  $('script, style, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim() || $.text();

  // 5) 6 패턴 점수
  const scores: PatternResult['scores'] = {
    faq: scoreFaq($, text),
    comparison_table: scoreComparisonTable($, text),
    list: scoreList($, text),
    doctor_interview: scoreDoctorInterview($, text),
    pricing: scorePricing($, text),
    case_study: scoreCaseStudy($, text),
  };

  // 6) primary / secondary 결정
  const entries = Object.entries(scores) as Array<[PatternType, number]>;
  entries.sort((a, b) => b[1] - a[1]);

  let primary: PatternType | undefined;
  let secondary: PatternType | undefined;
  if (entries[0] && entries[0][1] >= SCORE_PRIMARY_THRESHOLD) {
    primary = entries[0][0];
    if (entries[1] && entries[1][1] >= SCORE_SECONDARY_THRESHOLD) {
      secondary = entries[1][0];
    }
  } else {
    primary = 'unknown';
  }

  return {
    url: fetched.finalUrl,
    status: 'ok',
    primary_pattern: primary,
    secondary_pattern: secondary,
    scores,
    meta: buildMeta($),
  };
}

// ── 테스트 / 다른 caller 용 export — HTML string 직접 분류 ────

/** HTML string 을 받아 fetch 없이 직접 분류 (테스트 / batch 처리용). */
export function classifyHtmlPattern(html: string, sourceUrl: string): PatternResult {
  let $: CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    return {
      url: sourceUrl,
      status: 'parse_failed',
      error: e instanceof Error ? e.message : String(e),
    };
  }
  $('script, style, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim() || $.text();

  const scores: PatternResult['scores'] = {
    faq: scoreFaq($, text),
    comparison_table: scoreComparisonTable($, text),
    list: scoreList($, text),
    doctor_interview: scoreDoctorInterview($, text),
    pricing: scorePricing($, text),
    case_study: scoreCaseStudy($, text),
  };
  const entries = Object.entries(scores) as Array<[PatternType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  let primary: PatternType | undefined;
  let secondary: PatternType | undefined;
  if (entries[0] && entries[0][1] >= SCORE_PRIMARY_THRESHOLD) {
    primary = entries[0][0];
    if (entries[1] && entries[1][1] >= SCORE_SECONDARY_THRESHOLD) {
      secondary = entries[1][0];
    }
  } else {
    primary = 'unknown';
  }

  return {
    url: sourceUrl,
    status: 'ok',
    primary_pattern: primary,
    secondary_pattern: secondary,
    scores,
    meta: buildMeta($),
  };
}

/** 테스트 노출용 — URL 보안 검증 단독 호출. */
export const _internal = { validateUrlSafety };
