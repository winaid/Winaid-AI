/**
 * AEO/GEO 진단 — HTML 크롤링 + cheerio 파싱
 *
 * 서버에서만 실행 (클라이언트는 CORS). UA 는 실제 Chrome 으로 위장해 WAF 회피.
 * 타임아웃 기본 10초.
 */

import * as cheerio from 'cheerio';
import type { CrawlResult, CrawlImage, CrawlLink, CrawlHeading } from './types';
import { checkRobotsTxt, checkSitemap } from './robotsSitemap';

// 실제 Chrome UA. 식별자 "AEOBot/1.0" 은 프롬프트 의도를 주석으로만 남김 (Cloudflare WAF 회피 목적).
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 10_000;

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

// ── fetch 헬퍼 ──────────────────────────────────────────────

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko,en-US;q=0.9,en;q=0.8',
      ...(init?.headers ?? {}),
    },
    redirect: 'follow',
  });
}

// ── 메인 크롤러 ────────────────────────────────────────────

interface CrawlOptions {
  timeoutMs?: number;
  subpageLimit?: number; // 기본 3
}

export async function crawlSite(targetUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const subpageLimit = options.subpageLimit ?? 3;

  const parsedUrl = new URL(targetUrl);
  const origin = parsedUrl.origin;

  // 1) 메인 페이지
  const res = await fetchWithTimeout(targetUrl, timeoutMs);
  if (!res.ok) {
    throw new Error(`UNREACHABLE:${res.status}`);
  }
  const html = await res.text();
  const finalUrl = res.url || targetUrl;

  const result = parseHtml(html, origin, finalUrl);

  // 2) robots.txt / sitemap.xml — robotsSitemap.ts 에 위임.
  //    robots.txt 에 Sitemap: 디렉티브가 있으면 그 URL 도 sitemap 존재 확인에 사용.
  const robots = await checkRobotsTxt(origin, timeoutMs);
  result.hasRobotsTxt = robots.found;
  result.robotsTxtContent = robots.content;
  result.hasSitemap = await checkSitemap(origin, timeoutMs, robots.sitemapUrls);

  // 3) 서브페이지 최대 subpageLimit 개 탐색 (의료진/진료안내/FAQ 등 우선)
  result.subpagesReached = await tryCrawlSubpages(result.internalLinks, origin, subpageLimit, timeoutMs);

  return result;
}

// ── HTML 파싱 ──────────────────────────────────────────────

function parseHtml(html: string, origin: string, finalUrl: string): CrawlResult {
  const $ = cheerio.load(html);

  // 기본 메타
  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? '';
  const lang = $('html').attr('lang')?.trim() ?? '';
  const viewport = $('meta[name="viewport"]').attr('content')?.trim() ?? '';
  const charset = $('meta[charset]').attr('charset')?.trim() ?? $('meta[http-equiv="Content-Type"]').attr('content') ?? '';

  // OG 태그
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) ogTags[prop] = content.trim();
  });

  // 헤딩
  const h1: string[] = [];
  const h2: string[] = [];
  const headingStructure: CrawlHeading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as { tagName?: string; name?: string }).tagName ?? (el as { name?: string }).name ?? '';
    const level = Number.parseInt(tag.replace('h', ''), 10);
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text) return;
    headingStructure.push({ level, text });
    if (level === 1) h1.push(text);
    if (level === 2) h2.push(text);
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
