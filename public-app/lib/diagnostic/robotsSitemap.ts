/**
 * robots.txt / sitemap.xml 존재·내용 확인
 *
 * 크롤러에서 분리한 이유:
 *   - 관심사 분리: HTML 파싱(crawler.ts) ↔ 크롤러 정책 파일(이 파일)
 *   - robots.txt 안의 "Sitemap:" 디렉티브를 파싱해서 실제 sitemap URL 까지 확인
 *     (많은 사이트가 /sitemap.xml 대신 /sitemap_index.xml 이나 CDN 경로 사용)
 *   - 향후 robots.txt 기반 허용·차단 경로 분석(예: "Disallow: /") 으로 확장 여지
 *
 * fetch 는 crawler.ts 의 fetchWithTimeout 재사용 — UA / Accept-Language 를 한 곳에서 관리.
 */

import { fetchWithTimeout } from './crawler';

const DEFAULT_TIMEOUT_MS = 10_000;

// ── robots.txt ─────────────────────────────────────────────

export interface RobotsTxtResult {
  /** robots.txt 파일이 200으로 접근 가능한가 */
  found: boolean;
  /** 본문 (최대 2000자로 캡. 저장·표시 비용 방어) */
  content: string;
  /** "Sitemap: <url>" 디렉티브에서 파싱한 URL 들 (대소문자 무시, 중복 제거) */
  sitemapUrls: string[];
}

export async function checkRobotsTxt(
  origin: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RobotsTxtResult> {
  const url = `${origin.replace(/\/$/, '')}/robots.txt`;
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) {
      return { found: false, content: '', sitemapUrls: [] };
    }
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
    // robots.txt 는 text/plain 이어야 정상. HTML 이 오면 404 대체 페이지일 가능성 높음 → 무효 처리.
    if (contentType.includes('text/html')) {
      return { found: false, content: '', sitemapUrls: [] };
    }

    const raw = await res.text();
    const sitemapUrls = parseSitemapDirectives(raw);
    return {
      found: true,
      content: raw.slice(0, 2000),
      sitemapUrls,
    };
  } catch {
    return { found: false, content: '', sitemapUrls: [] };
  }
}

/** robots.txt 본문에서 "Sitemap: <url>" 줄을 모두 뽑는다. */
function parseSitemapDirectives(robotsTxt: string): string[] {
  const urls = new Set<string>();
  // 주석(#...) 제거 후 라인 단위 처리. 디렉티브는 대소문자 무시 (RFC 9309)
  const lines = robotsTxt.split(/\r?\n/);
  for (const line of lines) {
    const clean = line.split('#')[0].trim();
    if (!clean) continue;
    const match = /^sitemap\s*:\s*(\S+)/i.exec(clean);
    if (match) {
      const url = match[1].trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        urls.add(url);
      }
    }
  }
  return [...urls];
}

// ── sitemap.xml ────────────────────────────────────────────

/**
 * sitemap 존재 여부 확인.
 *
 * 확인 순서:
 *   1) hintUrls (robots.txt 의 Sitemap: 디렉티브)
 *   2) /sitemap.xml (표준 경로)
 *   3) /sitemap_index.xml (WordPress / Yoast 등에서 흔함)
 *
 * 하나라도 200 이면 true. HEAD 가 막힌 서버는 GET 으로 fallback.
 */
export async function checkSitemap(
  origin: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  hintUrls: string[] = [],
): Promise<boolean> {
  const base = origin.replace(/\/$/, '');
  const candidates = [
    ...hintUrls,
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
  ];

  // 중복 제거
  const unique = [...new Set(candidates)];

  // 순차 확인 — 보통 robots 힌트에서 바로 히트해서 전체 실행 안 됨.
  // 병렬로 돌려 모두 체크하는 것보다 힌트 우선순위를 살리는 순차 호출이 나음.
  for (const url of unique) {
    try {
      const ok = await probeUrl(url, timeoutMs);
      if (ok) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** HEAD 요청 → 405/501 이면 GET 재시도 → 200대면 true */
async function probeUrl(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const head = await fetchWithTimeout(url, timeoutMs, { method: 'HEAD' });
    if (head.ok) return true;
    if (head.status === 405 || head.status === 501) {
      const get = await fetchWithTimeout(url, timeoutMs);
      return get.ok;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Tier 3-A: AI 크롤러 정책 + llms.txt ────────────────────

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'Bingbot'] as const;

function extractUserAgentSection(txt: string, agent: string): string | null {
  const re = new RegExp(`User-agent:\\s*${agent}\\b[\\s\\S]*?(?=User-agent:|$)`, 'i');
  const m = txt.match(re);
  return m ? m[0] : null;
}

/**
 * robots.txt 원문에서 주요 AI 크롤러별 허용/차단 정책 파싱.
 * User-agent 섹션에 "Disallow: /" 가 있으면 blocked, 아니면 allowed.
 * 섹션 자체가 없으면 unknown (일반 "*" 정책 따름).
 */
export function parseAiCrawlerPolicy(
  robotsTxt: string,
): Record<string, 'allowed' | 'blocked' | 'unknown'> {
  const result: Record<string, 'allowed' | 'blocked' | 'unknown'> = {};
  for (const bot of AI_BOTS) {
    const section = extractUserAgentSection(robotsTxt, bot);
    if (!section) {
      result[bot] = 'unknown';
      continue;
    }
    result[bot] = /Disallow:\s*\/\s*$/m.test(section) ? 'blocked' : 'allowed';
  }
  return result;
}

/**
 * /llms.txt 또는 /.well-known/llms.txt 존재 여부.
 * LLM 이 사이트 정보를 올바르게 파악하도록 도와주는 표준 제안 파일.
 */
export async function checkLlmsTxt(baseUrl: string): Promise<boolean> {
  for (const path of ['/llms.txt', '/.well-known/llms.txt']) {
    try {
      const res = await fetchWithTimeout(new URL(path, baseUrl).href, 5_000, {
        headers: { 'User-Agent': 'WinaidBot/1.0' },
      });
      if (res.ok) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}
