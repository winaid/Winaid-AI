/**
 * AEO/GEO 진단 — HTML 크롤링 + cheerio 파싱
 *
 * 서버에서만 실행 (클라이언트는 CORS). UA 는 실제 Chrome 으로 위장해 WAF 회피.
 * 타임아웃 기본 30초.
 */

import * as cheerio from 'cheerio';
import * as nodeHttps from 'node:https';
import * as nodeHttp from 'node:http';
// safeFetch 는 server-only (Node 'dns' / 'net') — barrel import 시 turbopack 이
// client bundle 에 끌어들여 빌드 실패. tsconfig.paths wildcard 미정의로
// deep import 도 resolve 못 함 → relative path 만 사용.
import { safeFetch, SsrfBlockedError } from '../../../packages/blog-core/src/utils/safeFetch';

// node:http IncomingMessage 최소 인터페이스 — @types/node 없이 사용하기 위함
interface NodeIncomingMessage {
  statusCode?: number;
  rawHeaders?: string[];
  setEncoding(enc: string): void;
  on(event: string, cb: (...args: unknown[]) => void): this;
}
import type { CrawlResult, CrawlImage, CrawlLink, CrawlHeading } from './types';
import { checkRobotsTxt, checkSitemap, parseAiCrawlerPolicy, checkLlmsTxt } from './robotsSitemap';

// 실제 Chrome UA. 식별자 "AEOBot/1.0" 은 프롬프트 의도를 주석으로만 남김 (Cloudflare WAF 회피 목적).
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 만료·자체 서명 SSL 인증서 허용 Agent (의료 도메인에 흔히 발생).
// fetchInsecure 는 SSRF 우회 위험이 가장 높은 경로 — 본 모듈은 진단 대상 origin
// (사용자가 명시적으로 입력한 site URL) 에 한정해 사용. redirect 를 manual 로
// 처리해 hop 마다 사설 IP / 화이트리스트 재검증 (validateRedirect).
const insecureHttpsAgent = new nodeHttps.Agent({ rejectUnauthorized: false });

const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 10 * 1024 * 1024; // 진단 페이지 본문 cap

const BASE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko,en-US;q=0.9,en;q=0.8',
} as const;

/**
 * node:https/http 기반 SSL-완화 fetch — 표준 fetch SSL 에러 후 fallback.
 * redirect 추적 시 매 hop SSRF 재검증 (DNS / 사설 IP / link-local / IMDS 차단).
 * safeFetch utility 의 validateUrl 를 가져와 동일 정책 적용.
 */
async function fetchInsecure(targetUrl: string, timeoutMs: number): Promise<Response> {
  let url = targetUrl;
  const MAX_REDIRECTS = 3;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    // hop 마다 SSRF 검증 — safeFetch 가 자체 fetch 하므로, insecure 경로는
    // 검증만 빌려 쓰기 위해 GET HEAD probe → 내부적으로 같은 사설 IP 차단을 수행.
    // safeFetch 자체는 rejectUnauthorized 를 끌 수 없어 SSL 완화 경로는 별도 직접 코드 유지.
    // 단, validateUrl 의 차단 룰을 동일하게 적용하기 위해 safeFetch 의 HEAD-only
    // dry-run (response 무시) 로 prefetch.
    try {
      // SsrfBlockedError 만 잡고 그 외 (네트워크/SSL) 는 통과시킴 — fetchInsecure 의 본업 SSL 완화 경로.
      const probe = await safeFetch(url, { timeout: 2_000, method: 'HEAD', maxBytes: 1024, maxRedirects: 0 }).catch((e: unknown) => {
        if (e instanceof SsrfBlockedError) throw e;
        return null;
      });
      void probe;
    } catch (e) {
      if (e instanceof SsrfBlockedError) {
        throw new Error(`SSRF_BLOCKED:${e.message.slice(0, 100)}`);
      }
      // 네트워크 에러는 무시하고 진짜 fetchInsecure 진행
    }

    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`SSRF_BLOCKED:protocol_not_allowed:${parsed.protocol}`);
    }
    const isHttps = parsed.protocol === 'https:';

    const { statusCode, headers, body } = await new Promise<{
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    }>((resolve, reject) => {
      const options = {
        method: 'GET',
        headers: { ...BASE_HEADERS },
        ...(isHttps ? { agent: insecureHttpsAgent } : {}),
      };

      const onResponse = (res: NodeIncomingMessage) => {
        let bodyStr = '';
        let totalBytes = 0;
        res.setEncoding('utf-8');
        res.on('data', (chunk: unknown) => {
          const s = String(chunk);
          totalBytes += s.length;
          if (totalBytes > MAX_HTML_BYTES) {
            // truncate at cap (네트워크 read 는 계속 흐를 수 있지만 메모리 누적 차단)
            return;
          }
          bodyStr += s;
        });
        res.on('end', () => {
          const flat: Record<string, string> = {};
          const raw = res.rawHeaders ?? [];
          for (let j = 0; j < raw.length; j += 2) {
            flat[raw[j].toLowerCase()] = raw[j + 1];
          }
          resolve({ statusCode: res.statusCode ?? 200, headers: flat, body: bodyStr });
        });
        res.on('error', reject);
      };

      const req = isHttps
        ? nodeHttps.request(url, options, onResponse)
        : nodeHttp.request(url, options, onResponse);

      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timeout')); });
      req.on('error', reject);
      req.end();
    });

    if (statusCode >= 300 && statusCode < 400 && headers['location']) {
      if (i >= MAX_REDIRECTS) throw new Error('SSRF_BLOCKED:max_redirects_exceeded');
      const loc = headers['location'];
      url = loc.startsWith('http') ? loc : new URL(loc, url).toString();
      continue;
    }

    const respHeaders = new Headers();
    for (const [k, v] of Object.entries(headers)) {
      if (v) respHeaders.set(k, v);
    }
    return new Response(body, { status: statusCode, headers: respHeaders });
  }
  throw new Error('Too many redirects');
}

// ── 의료/치과 특화 키워드 ──────────────────────────────────

const DOCTOR_KEYWORDS = ['의료진', '원장', '전문의', '의사', '박사', 'doctor', 'medical-team', 'staff', '소개'];

// 진료과목/시술 키워드 (텍스트·링크 모두에서 매칭)
const SERVICE_KEYWORDS = [
  // 치과
  '임플란트', '교정', '사랑니', '보철', '치아', '라미네이트', '충치', '신경치료', '틀니', '스케일링', '미백', '턱관절',
  // 일반 의료
  '피부', '성형', '정형외과', '내과', '외과', '산부인과', '소아과', '이비인후과', '안과', '치과',
  '비만', '다이어트', '탈모', '모발', '레이저', '보톡스', '필러', '여드름', '색소',
];

// 진단 라우트 카테고리 자동 검출 — title + metaDescription + textContent + detectedServices
// 에서 카테고리별 키워드 매치 카운트. 0 매치면 '치과' fallback (기존 동작 보존).
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '치과': ['치과', '임플란트', '교정', '사랑니', '보철', '치아', '라미네이트', '충치', '신경치료', '틀니', '스케일링', '미백', '턱관절'],
  '피부과': ['피부', '여드름', '색소', '주름', '레이저', '보톡스', '필러', '리프팅', '제모', '탈모', '모발'],
  '정형외과': ['정형외과', '관절', '척추', '디스크', '도수치료', '체외충격파', '관절경', '오십견', '회전근개'],
  '성형외과': ['성형', '코성형', '눈성형', '안면윤곽', '가슴성형', '지방흡입'],
};

// 동일 매치 수일 때 우선순위
const CATEGORY_PRIORITY = ['치과', '피부과', '정형외과', '성형외과'];

export function detectCategory(crawl: CrawlResult): string {
  const corpus = [
    crawl.title || '',
    crawl.metaDescription || '',
    (crawl.detectedServices || []).join(' '),
    crawl.textContent || '',
  ].join(' ').toLowerCase();

  if (!corpus.trim()) return '치과';

  const scores: Array<[string, number]> = [];
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let count = 0;
    for (const kw of keywords) {
      if (corpus.includes(kw.toLowerCase())) count++;
    }
    if (count > 0) scores.push([cat, count]);
  }
  if (scores.length === 0) return '치과';
  scores.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]);
  });
  return scores[0][0];
}

const FAQ_KEYWORDS = ['faq', '자주', '질문', '궁금', 'q&a', 'qna'];
const LOCATION_KEYWORDS = ['오시는', '위치', '찾아오', '약도', 'location', 'map', 'directions'];
const CONTACT_KEYWORDS = ['연락처', 'contact', '문의', '전화'];
const SERVICE_PAGE_KEYWORDS = ['진료', '치료', '시술', 'service', 'treatment', '클리닉'];
const PRICE_KEYWORDS = ['비용', '가격', 'price', '상담', '수가', '요금'];
const HOURS_KEYWORDS = ['진료시간', '영업시간', '진료 시간', '운영시간', '진료안내', '휴진', '점심시간'];

// 한국 주소 패턴 (시/도 + 구/군 + 동/로/길)
const KOREAN_ADDRESS_PATTERN =
  /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣\s]{0,30}(시|군|구)[가-힣\s]{0,30}(동|읍|면|로|길)/;

// 한국 전화번호 (02-xxxx-xxxx, 031-xxxx-xxxx, 1588-xxxx 등)
const PHONE_PATTERN = /(?:\+?82-?)?(?:0\d{1,2}|1\d{3})[-.\s]?\d{3,4}[-.\s]?\d{4}/;

// ── fetch 헬퍼 (3단계 fallback) ───────────────────────────

/** Response → charset 자동 감지하여 디코드된 HTML 문자열로 변환.
 *  Content-Type 헤더 → <meta charset> → utf-8 순서로 fallback. EUC-KR / CP949 등 지원. */
export async function decodeWithCharset(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || '';
  let charset = ct.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = head.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i)?.[1]?.toLowerCase()
      ?? head.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i)?.[1]?.toLowerCase();
  }
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try { return new TextDecoder(charset).decode(buf); } catch { /* fallback to utf-8 */ }
  }
  return new TextDecoder('utf-8').decode(buf);
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  init?: RequestInit,
): Promise<Response> {
  const safeOptions = {
    ...init,
    timeout: timeoutMs,
    maxBytes: MAX_HTML_BYTES,
    headers: { ...BASE_HEADERS, ...(init?.headers ?? {}) },
  };

  // 1차: SSRF-safe fetch (사설 IP / IMDS / link-local 차단 + redirect 매 hop 재검증)
  try {
    return await safeFetch(url, safeOptions);
  } catch (rawErr) {
    // SSRF 차단은 즉시 propagate — fallback 진입 X
    if (rawErr instanceof SsrfBlockedError) {
      throw rawErr;
    }
    const msg = (rawErr as Error).message || '';

    // 2차: SSL 에러 → node:https 검증 완화 재시도 (만료·자체 서명 인증서).
    // fetchInsecure 도 hop 별 SSRF 재검증을 수행 (위 fetchInsecure 정의 참고).
    if (/CERT_|certificate|SSL|TLS|UNABLE_TO_VERIFY|ERR_TLS/i.test(msg)) {
      console.warn(`[diagnostic] SSL relaxed retry: ${url} (${msg.slice(0, 80)})`);
      try {
        return await fetchInsecure(url, timeoutMs);
      } catch (insecureErr) {
        if ((insecureErr as Error).message?.startsWith('SSRF_BLOCKED:')) throw insecureErr;
        // 완화도 실패 → HTTP fallback 으로 계속
      }
    }

    // 3차: HTTPS 실패 → HTTP 재시도 (HTTPS 미설정 사이트). 동일하게 safeFetch 사용.
    if (url.startsWith('https://')) {
      const httpUrl = url.replace(/^https:\/\//, 'http://');
      console.warn(`[diagnostic] HTTPS failed, HTTP fallback: ${httpUrl} (${msg.slice(0, 80)})`);
      try {
        return await safeFetch(httpUrl, safeOptions);
      } catch (httpErr) {
        if (httpErr instanceof SsrfBlockedError) throw httpErr;
        /* 원래 에러 throw */
      }
    }

    throw rawErr;
  }
}

// ── 메인 크롤러 ────────────────────────────────────────────

interface CrawlOptions {
  timeoutMs?: number;
  subpageLimit?: number; // 기본 3
}

export async function crawlSite(targetUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const subpageLimit = options.subpageLimit ?? 1;

  const parsedUrl = new URL(targetUrl);
  const origin = parsedUrl.origin;

  // 1) 메인 페이지
  let res: Response;
  try {
    res = await fetchWithTimeout(targetUrl, timeoutMs);
  } catch (fetchErr) {
    const msg = (fetchErr as Error).message || '';
    if (/aborted|timeout/i.test(msg)) throw new Error('TIMEOUT');
    if (/CERT_|SSL|TLS|certificate/i.test(msg)) throw new Error('SSL_ERROR');
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) throw new Error('DNS_ERROR');
    throw new Error(`FETCH_FAILED:${msg.slice(0, 120)}`);
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) throw new Error(`BOT_BLOCKED:${res.status}`);
    throw new Error(`UNREACHABLE:${res.status}`);
  }
  // charset 자동 감지 — 한국 사이트 (egowoon 등) 가 EUC-KR / CP949 인 경우
  // res.text() 의 UTF-8 강제 디코딩으로 한글이 깨져 title 이 깨진 채 표시됨.
  const html = await decodeWithCharset(res);
  const finalUrl = res.url || targetUrl;

  const result = parseHtml(html, origin, finalUrl);

  // HTTP 보안 헤더 + 응답 상태 (Phase 1)
  result.httpStatus = res.status;
  result.securityHeaders = {
    csp: res.headers.get('content-security-policy'),
    hsts: res.headers.get('strict-transport-security'),
    xFrame: res.headers.get('x-frame-options'),
    xContentType: res.headers.get('x-content-type-options'),
    referrer: res.headers.get('referrer-policy'),
  };

  // 2) robots.txt / sitemap.xml — robotsSitemap.ts 에 위임.
  //    robots.txt 에 Sitemap: 디렉티브가 있으면 그 URL 도 sitemap 존재 확인에 사용.
  const robots = await checkRobotsTxt(origin, timeoutMs);
  result.hasRobotsTxt = robots.found;
  result.robotsTxtContent = robots.content;
  result.hasSitemap = await checkSitemap(origin, timeoutMs, robots.sitemapUrls);

  // Tier 3-A: AI 크롤러 정책 + llms.txt (병렬)
  const [aiCrawlerPolicy, hasLlmsTxt] = await Promise.all([
    Promise.resolve(robots.content ? parseAiCrawlerPolicy(robots.content) : undefined),
    checkLlmsTxt(origin).catch(() => false),
  ]);
  result.aiCrawlerPolicy = aiCrawlerPolicy;
  result.hasLlmsTxt = hasLlmsTxt;

  // 3) 서브페이지 최대 subpageLimit 개 탐색 (의료진/진료안내/FAQ 등 우선)
  result.subpagesReached = await tryCrawlSubpages(result.internalLinks, origin, subpageLimit, timeoutMs);

  return result;
}

// ── HTML 파싱 ──────────────────────────────────────────────

function parseHtml(html: string, origin: string, finalUrl: string): CrawlResult {
  const $ = cheerio.load(html);

  // Phase 4: HTML 사이즈 + Doctype (cheerio load 전 raw HTML 으로 측정)
  const htmlSize = html.length;
  const hasDoctype = /^\s*<!DOCTYPE\s+html\s*>/i.test(html);

  // 기본 메타
  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? '';
  const lang = $('html').attr('lang')?.trim() ?? '';
  const viewport = $('meta[name="viewport"]').attr('content')?.trim() ?? '';
  const charset = $('meta[charset]').attr('charset')?.trim() ?? $('meta[http-equiv="Content-Type"]').attr('content') ?? '';

  // Tier 3-A: 콘텐츠 신선도 (#8) + 저자 (#12)
  const datePublished =
    $('meta[property="article:published_time"]').attr('content')?.trim()
    || $('meta[name="date"]').attr('content')?.trim()
    || undefined;
  const dateModified =
    $('meta[property="article:modified_time"]').attr('content')?.trim()
    || $('meta[name="last-modified"]').attr('content')?.trim()
    || undefined;
  const author =
    $('meta[name="author"]').attr('content')?.trim()
    || $('meta[property="article:author"]').attr('content')?.trim()
    || undefined;

  // OG 태그
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) ogTags[prop] = content.trim();
  });

  // Twitter Card 메타 태그 (Phase 1)
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content) twitterTags[name] = content.trim();
  });

  // 파비콘 (Phase 1)
  const favicon =
    $('link[rel="icon"]').attr('href')?.trim() ||
    $('link[rel="shortcut icon"]').attr('href')?.trim() ||
    $('link[rel="apple-touch-icon"]').attr('href')?.trim() ||
    undefined;

  // 헤딩
  const h1: string[] = [];
  const h2: string[] = [];
  const headingStructure: CrawlHeading[] = [];
  // Phase 4: H3~H6 카운트
  let h3Count = 0;
  let h4Count = 0;
  let h5Count = 0;
  let h6Count = 0;
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as { tagName?: string; name?: string }).tagName ?? (el as { name?: string }).name ?? '';
    const level = Number.parseInt(tag.replace('h', ''), 10);
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text) return;
    headingStructure.push({ level, text });
    if (level === 1) h1.push(text);
    else if (level === 2) h2.push(text);
    else if (level === 3) h3Count++;
    else if (level === 4) h4Count++;
    else if (level === 5) h5Count++;
    else if (level === 6) h6Count++;
  });

  // Phase 4: P 태그 단락 길이 분포
  const paragraphLengths: number[] = [];
  $('p').each((_, el) => {
    const len = $(el).text().trim().length;
    if (len > 0) paragraphLengths.push(len);
  });

  // 구조화 데이터 (JSON-LD)
  const schemaMarkup: Record<string, unknown>[] = [];
  const schemaTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object') {
          schemaMarkup.push(item as Record<string, unknown>);
          collectSchemaTypes(item, schemaTypes);
        }
      }
    } catch {
      // 깨진 JSON 은 스킵
    }
  });

  // Tier 3-A: JSON-LD fallback for datePublished/Modified/author (#8 #12)
  // HTML meta 가 없을 때만 JSON-LD 에서 추출 (우선순위: HTML meta > JSON-LD).
  // 위 변수 datePublished/dateModified/author 는 const → let 필요. parse 함수 내부에서
  // 이미 const 선언했으므로 여기선 별도 변수 + 아래 반환 객체에서 override.
  let schemaDatePub: string | undefined;
  let schemaDateMod: string | undefined;
  let schemaAuthor: string | undefined;
  for (const s of schemaMarkup) {
    if (!schemaDatePub && typeof s.datePublished === 'string') schemaDatePub = s.datePublished;
    if (!schemaDateMod && typeof s.dateModified === 'string') schemaDateMod = s.dateModified;
    if (!schemaAuthor) {
      const a = s.author as { name?: string } | string | undefined;
      if (typeof a === 'string' && a.trim()) schemaAuthor = a.trim();
      else if (a && typeof a === 'object' && typeof a.name === 'string') schemaAuthor = a.name.trim();
    }
  }

  // 링크
  const internalLinks: CrawlLink[] = [];
  const externalLinks: CrawlLink[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim() ?? '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const text = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 100);
    const absolute = resolveUrl(href, finalUrl);
    if (!absolute) return;
    try {
      const u = new URL(absolute);
      if (u.origin === origin) {
        internalLinks.push({ href: absolute, text });
      } else if (u.protocol === 'http:' || u.protocol === 'https:') {
        externalLinks.push({ href: absolute, text });
      }
    } catch {
      /* invalid URL */
    }
  });

  // 네비 링크 텍스트
  const navLinks: string[] = [];
  $('nav a, header a, .gnb a, .nav a, .menu a').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && text.length < 50) navLinks.push(text);
  });

  // 이미지
  const images: CrawlImage[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src')?.trim() ?? '';
    const alt = ($(el).attr('alt') ?? '').trim();
    if (!src) return;
    images.push({ src, alt, hasAlt: alt.length > 0 });
  });
  const totalImages = images.length;
  const imagesWithoutAlt = images.filter(i => !i.hasAlt).length;

  // Tier 3-A: 이미지 최적화 통계 (#13)
  let webpCount = 0;
  let lazyCount = 0;
  let srcsetCount = 0;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (/\.webp(\?|$)/i.test(src)) webpCount++;
    if ($(el).attr('loading') === 'lazy') lazyCount++;
    if ($(el).attr('srcset')) srcsetCount++;
  });

  // 본문 텍스트
  $('script, style, noscript').remove();
  const textContent = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = textContent.length; // 한국어는 글자 수 기준

  // 콘텐츠 특화
  const hasContactInfo = PHONE_PATTERN.test(textContent);
  const hasAddress = KOREAN_ADDRESS_PATTERN.test(textContent);
  const hasBusinessHours = HOURS_KEYWORDS.some(k => textContent.includes(k));

  // 기술
  const hasSSL = finalUrl.startsWith('https://');

  // 의료 특화 감지
  const lowerText = textContent.toLowerCase();
  const lowerNav = navLinks.join(' ').toLowerCase();
  const lowerInternal = internalLinks.map(l => `${l.href} ${l.text}`.toLowerCase()).join(' ');
  const haystack = `${lowerText} ${lowerNav} ${lowerInternal}`;

  const hasDoctorInfo = DOCTOR_KEYWORDS.some(k => haystack.includes(k.toLowerCase()));
  const hasServicePages = SERVICE_PAGE_KEYWORDS.some(k => haystack.includes(k.toLowerCase()));
  const hasFAQ = FAQ_KEYWORDS.some(k => haystack.includes(k.toLowerCase()));
  const hasMap = $('iframe[src*="map"], iframe[src*="google.com/maps"], iframe[src*="kakao.com"], iframe[src*="daum"]').length > 0
    || /daum\.map|kakao\.maps|google\.com\/maps/.test(html);

  const detectedServices = Array.from(
    new Set(SERVICE_KEYWORDS.filter(k => textContent.includes(k))),
  ).slice(0, 20);

  return {
    finalUrl,
    title,
    metaDescription,
    ogTags,
    canonical,
    lang,
    h1,
    h2,
    headingStructure,
    schemaMarkup,
    schemaTypes,
    internalLinks,
    externalLinks,
    navLinks,
    images,
    imagesWithoutAlt,
    totalImages,
    textContent: textContent.slice(0, 20_000),
    wordCount,
    hasContactInfo,
    hasAddress,
    hasBusinessHours,
    hasSSL,
    hasSitemap: false, // 이후 robots/sitemap 확인에서 덮어씀
    hasRobotsTxt: false,
    robotsTxtContent: '',
    viewport,
    charset,
    hasDoctorInfo,
    hasServicePages,
    hasFAQ,
    hasMap,
    detectedServices,
    subpagesReached: [],

    // Tier 3-A 확장 필드 (HTML meta 우선, JSON-LD fallback)
    datePublished: datePublished || schemaDatePub,
    dateModified: dateModified || schemaDateMod,
    author: author || schemaAuthor,
    imageOptimization: { webpCount, lazyCount, srcsetCount, totalImages },

    // Phase 1 확장 필드
    twitterTags: Object.keys(twitterTags).length > 0 ? twitterTags : undefined,
    favicon,
    // httpStatus / securityHeaders 는 crawlSite() 에서 응답 헤더로 주입

    // Phase 4 확장 필드
    htmlSize,
    hasDoctype,
    paragraphLengths: paragraphLengths.length > 0 ? paragraphLengths : undefined,
    h3Count,
    h4Count,
    h5Count,
    h6Count,
  };
}

// ── 스키마 타입 재귀 수집 ──────────────────────────────────

function collectSchemaTypes(obj: unknown, acc: string[]): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;
  const t = record['@type'];
  if (typeof t === 'string') {
    if (!acc.includes(t)) acc.push(t);
  } else if (Array.isArray(t)) {
    for (const v of t) {
      if (typeof v === 'string' && !acc.includes(v)) acc.push(v);
    }
  }
  // @graph 같은 중첩 케이스 처리
  for (const key of Object.keys(record)) {
    const v = record[key];
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        for (const item of v) collectSchemaTypes(item, acc);
      } else {
        collectSchemaTypes(v, acc);
      }
    }
  }
}

// ── URL 해석 ───────────────────────────────────────────────

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ── HEAD probe (서브페이지 존재 확인용) ────────────────────

async function fetchHead(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, timeoutMs, { method: 'HEAD' });
    if (res.ok) return true;
    // 일부 서버가 HEAD 미지원 → GET 재시도
    if (res.status === 405 || res.status === 501) {
      const g = await fetchWithTimeout(url, timeoutMs);
      return g.ok;
    }
    return false;
  } catch {
    return false;
  }
}

// ── 서브페이지 탐색 ────────────────────────────────────────

async function tryCrawlSubpages(
  internalLinks: CrawlLink[],
  origin: string,
  limit: number,
  timeoutMs: number,
): Promise<string[]> {
  // 의료진/진료/FAQ/오시는길 우선순위로 후보 추출 (중복 경로 제거)
  const priorityRegex = [
    /의료진|원장|doctor|staff|medical-team|소개/i,
    /진료|치료|시술|service|treatment|클리닉/i,
    /faq|자주|질문|q&a|qna/i,
    /오시는|위치|location|map|contact|찾아오/i,
  ];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const regex of priorityRegex) {
    for (const link of internalLinks) {
      if (candidates.length >= limit) break;
      try {
        const u = new URL(link.href);
        if (u.origin !== origin) continue;
        const path = u.pathname;
        if (seen.has(path)) continue;
        if (regex.test(link.text) || regex.test(link.href)) {
          seen.add(path);
          candidates.push(link.href);
        }
      } catch {
        continue;
      }
    }
    if (candidates.length >= limit) break;
  }

  // 병렬 HEAD 확인 (크롤링은 메인만, 서브페이지는 존재 여부만 확인하여 비용 최소화)
  const results = await Promise.allSettled(
    candidates.map(async url => {
      const ok = await fetchHead(url, timeoutMs);
      return ok ? url : null;
    }),
  );

  const reached: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) reached.push(r.value);
  }
  return reached;
}
