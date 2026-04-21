/**
 * 네이버 블로그 크롤러 — Next.js API Route
 *
 * POST /api/naver/crawl-hospital-blog
 * Body: { blogUrl: string, maxPosts?: number }
 *
 * 전략:
 *  1) RSS 피드에서 글 목록 + 요약 확보 (안정적, 차단 드묾)
 *  2) RSS 실패 시 PostList HTML에서 logNo 추출 (기존 방식)
 *  3) 개별 글 페이지에서 본문 추출 (6단계 selector fallback)
 *  4) 경과 시간 추적 — serverless timeout 전에 조기 종료
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

// ── 상수 ──

const FETCH_TIMEOUT_MS = 8000; // 개별 fetch 8초 제한
const MAX_TOTAL_MS = 25000; // 전체 25초 제한 (Vercel Pro 60초 내 여유)
const POST_FETCH_DELAY_MS = 150; // 글 간 딜레이
const CONCURRENCY = 2; // 동시 fetch 수

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Referer: 'https://blog.naver.com/',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
};

/** request-scoped 타이머 — 동시 요청 시 간섭 방지 */
function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    hasTimeLeft: () => (Date.now() - start) < MAX_TOTAL_MS,
  };
}

// 함수들이 timer를 인자로 받도록 하기 위한 타입
type Timer = ReturnType<typeof createTimer>;

// ── 유틸 ──

/**
 * 네이버 블로그 hostname 화이트리스트.
 * - `blog.naver.com` 데스크톱
 * - `m.blog.naver.com` 모바일 (사용자가 모바일 공유 링크를 붙여넣는 경우 허용)
 */
const NAVER_BLOG_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com']);

/**
 * 네이버 블로그 URL을 hostname 기반으로 엄격하게 검증.
 *
 * 과거의 `blogUrl.includes('blog.naver.com')`은 SSRF 우회 가능:
 *   - http://evil.com/?blog.naver.com       (쿼리스트링 포함)
 *   - http://blog.naver.com.attacker.com    (서브도메인 가장)
 *   - http://attacker.com/blog.naver.com    (경로 포함)
 * 전부 includes 통과 → 서버가 공격자 호스트로 요청.
 *
 * 수정: new URL 파싱 + hostname 화이트리스트 정확 매칭 + http/https만 허용.
 */
function validateNaverBlogUrl(rawUrl: string): { ok: true } | { ok: false; message: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, message: '올바른 URL 형식이 아닙니다.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'http/https URL만 지원합니다.' };
  }
  if (!NAVER_BLOG_HOSTS.has(parsed.hostname)) {
    return { ok: false, message: '네이버 블로그 URL만 지원합니다. (blog.naver.com/...)' };
  }
  return { ok: true };
}

function extractBlogId(blogUrl: string): string | null {
  const m = blogUrl.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * 네이버 블로그 URL에서 특정 글의 logNo를 추출.
 * 지원 포맷:
 *   - https://blog.naver.com/{blogId}/{logNo}          (경로형, logNo는 10자리 이상 숫자)
 *   - https://blog.naver.com/PostView.naver?blogId=X&logNo=Y
 *   - https://m.blog.naver.com/{blogId}/{logNo}
 * 블로그 홈 URL(`/blogId` 까지만)에는 logNo 가 없으므로 null 반환.
 */
function extractLogNo(blogUrl: string): string | null {
  // 1) path 형식: /{blogId}/{logNo}
  const pathMatch = blogUrl.match(/(?:m\.)?blog\.naver\.com\/[^/?#]+\/(\d{8,})/);
  if (pathMatch) return pathMatch[1];
  // 2) 쿼리 형식: ?logNo=...
  const qMatch = blogUrl.match(/[?&]logNo=(\d{8,})/);
  if (qMatch) return qMatch[1];
  return null;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function parseNaverDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  if (s.includes('T') && s.includes('-')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  const dotMatch = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (dotMatch)
    return new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));

  const dashMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch)
    return new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));

  const now = new Date();
  const hourAgo = s.match(/(\d+)\s*시간\s*전/);
  if (hourAgo) return new Date(now.getTime() - Number(hourAgo[1]) * 3600000);
  const minAgo = s.match(/(\d+)\s*분\s*전/);
  if (minAgo) return new Date(now.getTime() - Number(minAgo[1]) * 60000);
  const dayAgo = s.match(/(\d+)\s*일\s*전/);
  if (dayAgo) return new Date(now.getTime() - Number(dayAgo[1]) * 86400000);
  if (s.includes('어제')) return new Date(now.getTime() - 86400000);
  if (s.includes('그저께') || s.includes('그제')) return new Date(now.getTime() - 172800000);
  return null;
}

const cleanHtml = (raw: string) =>
  raw
    // 단락 태그 → 이중 줄바꿈 (단락 경계 보존)
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<\/h[1-6]>\s*/gi, '\n\n')
    .replace(/<\/div>\s*/gi, '\n')
    .replace(/<\/li>\s*/gi, '\n')
    // <br> → 줄바꿈
    .replace(/<br\s*\/?>/gi, '\n')
    // 나머지 태그 → 스페이스
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&bull;/g, '\u2022')
    .replace(/&middot;/g, '\u00B7')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+/g, ' ')
    // 각 줄 trim — 빈 줄은 유지 (단락 간격 보존)
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    // 연속 3줄 이상 빈 줄을 2줄로 축소
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ── 1단계: 글 목록 수집 (RSS 우선, PostList fallback) ──

interface PostEntry {
  logNo: string;
  title?: string;
  publishedAt?: string;
  summary?: string;
}

/** RSS 피드에서 글 목록 추출 */
async function fetchFromRss(blogId: string, maxPosts: number): Promise<PostEntry[]> {
  const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;

  try {
    const res = await fetchWithTimeout(rssUrl, {
      'User-Agent': FETCH_HEADERS['User-Agent'],
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    });
    if (!res.ok) {
      return [];
    }
    const xml = await res.text();

    // <item> 블록 추출
    const items: PostEntry[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxPosts) {
      const block = match[1];

      // logNo 추출 from <link> — \n 뒤에 URL이 오는 경우도 대응
      const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
      if (!linkMatch) continue;
      const link = linkMatch[1].trim();
      const logNoMatch = link.match(/\/(\d{8,})(?:\?|$)/) || link.match(/logNo=(\d+)/);
      if (!logNoMatch) continue;

      // 제목
      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
        || block.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? cleanHtml(titleMatch[1]) : '';

      // 날짜
      const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
      let publishedAt = '';
      if (dateMatch) {
        const d = new Date(dateMatch[1].trim());
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }

      // 요약
      const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
        || block.match(/<description>([^<]+)<\/description>/);
      const summary = descMatch ? cleanHtml(descMatch[1]).slice(0, 300) : '';

      items.push({ logNo: logNoMatch[1], title, publishedAt, summary });
    }

    return items;
  } catch {
    return [];
  }
}

/** PostList HTML에서 logNo 추출 (RSS 실패 시 fallback) */
async function fetchLogNos(blogId: string, maxCandidates: number, timer: Timer): Promise<PostEntry[]> {
  const seenLogNos = new Set<string>();
  const entries: PostEntry[] = [];
  let page = 1;

  while (entries.length < maxCandidates && page <= 5 && timer.hasTimeLeft()) {
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&categoryNo=0&postListType=&blogType=B`;
    let html: string;
    try {
      const res = await fetchWithTimeout(listUrl, FETCH_HEADERS);
      if (!res.ok) {
        break;
      }
      html = await res.text();
    } catch {
      break;
    }

    let foundNew = 0;

    const p1 = /logNo=(\d{10,})/g;
    let m: RegExpExecArray | null;
    while ((m = p1.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        entries.push({ logNo: m[1] });
        foundNew++;
      }
    }

    const p2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = p2.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        entries.push({ logNo: m[1] });
        foundNew++;
      }
    }

    if (foundNew === 0) break;
    page++;
  }

  // logNo 내림차순 정렬 (최신)
  entries.sort((a, b) => Number(b.logNo) - Number(a.logNo));
  return entries.slice(0, maxCandidates);
}

// ── 2단계: 개별 글 본문 추출 ──

interface PostResult {
  logNo: string;
  url: string;
  content: string;
  title: string;
  publishedAt: string;
  summary: string;
  thumbnail: string;
}

async function fetchPostContent(
  blogId: string,
  entry: PostEntry,
): Promise<PostResult | null> {
  const logNo = entry.logNo;
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&directAccess=true`;
  let html: string;
  try {
    const res = await fetchWithTimeout(url, FETCH_HEADERS);
    if (!res.ok) {
      return null;
    }
    html = await res.text();
  } catch {
    return null;
  }

  // ── 제목 ──
  let title = entry.title || '';
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/\s*:\s*네이버\s*블로그$/i, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .trim();
    }
  }
  if (!title) {
    const seTitleMatch = html.match(
      /<[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
    );
    if (seTitleMatch) title = seTitleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // ── 날짜 ──
  let publishedAt = entry.publishedAt || '';
  if (!publishedAt) {
    const ogPatterns = [
      /<meta[^>]*property="og:createdate"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="og:createdate"/i,
    ];
    for (const op of ogPatterns) {
      const om = op.exec(html);
      if (om) {
        const d = parseNaverDate(om[1]);
        if (d) { publishedAt = d.toISOString(); break; }
      }
    }
  }
  if (!publishedAt) {
    const fallbackPatterns = [
      /class="[^"]*se_publishDate[^"]*"[^>]*>([^<]+)/i,
      /class="[^"]*blog_date[^"]*"[^>]*>([^<]+)/i,
      /class="[^"]*date[^"]*"[^>]*>\s*(\d{4}[\s./-]+\d{1,2}[\s./-]+\d{1,2})/i,
    ];
    for (const fp of fallbackPatterns) {
      const fm = fp.exec(html);
      if (fm) {
        const d = parseNaverDate(fm[1].trim());
        if (d) { publishedAt = d.toISOString(); break; }
      }
    }
  }

  // ── 썸네일 ──
  let thumbnail = '';
  const ogImage =
    html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
  if (ogImage) thumbnail = ogImage[1];

  // ── 본문 (6단계 폴백) ──
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;

  // 1) se-text-paragraph (스마트에디터 3 / ONE)
  const r1 = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  while ((m = r1.exec(html)) !== null) {
    const text = cleanHtml(m[1]);
    if (text.length > 5) paragraphs.push(text);
  }

  // 2) se-module-text
  if (paragraphs.length === 0) {
    const r2 = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = r2.exec(html)) !== null) {
      const text = cleanHtml(m[1]);
      if (text.length > 5) paragraphs.push(text);
    }
  }

  // 3) se_component_text
  if (paragraphs.length === 0) {
    const r3 = /<div[^>]*class="[^"]*se_component_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = r3.exec(html)) !== null) {
      const text = cleanHtml(m[1]);
      if (text.length > 5) paragraphs.push(text);
    }
  }

  // 4) postViewArea (구버전 에디터)
  if (paragraphs.length === 0) {
    const areaMatch = html.match(/id="postViewArea"[^>]*>([\s\S]+)/i);
    if (areaMatch) {
      let chunk = areaMatch[1];
      const endMarkers = [
        'class="post_footer"', 'class="post-footer"', 'class="comment_area"',
        'class="area_sympathy"', 'id="printPost1"', 'class="wrap_postdata"',
        'class="post_tag"', 'class="post-tag"',
      ];
      for (const marker of endMarkers) {
        const idx = chunk.indexOf(marker);
        if (idx > 0) chunk = chunk.substring(0, idx);
      }
      const text = cleanHtml(chunk);
      if (text.length > 30) paragraphs.push(text);
    }
  }

  // 5) p 태그 수집
  if (paragraphs.length === 0) {
    const r5 = /<p[^>]*>([\s\S]*?)<\/p>/g;
    const allP: string[] = [];
    while ((m = r5.exec(html)) !== null) {
      const text = cleanHtml(m[1]);
      if (text.length > 15) allP.push(text);
    }
    if (allP.length >= 2) paragraphs.push(...allP);
  }

  // 6) og:description 최종 폴백
  if (paragraphs.length === 0) {
    const ogDesc =
      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
    if (ogDesc) {
      const desc = cleanHtml(ogDesc[1]);
      if (desc.length > 30) {
        paragraphs.push(desc);
      }
    }
  }

  // RSS에서 이미 가져온 요약이 있고 본문 추출 모두 실패한 경우 → RSS 요약 사용
  if (paragraphs.length === 0 && entry.summary && entry.summary.length > 30) {
    paragraphs.push(entry.summary);
  }

  const content = paragraphs.join('\n\n');
  if (content.length <= 30) {
    return null;
  }

  return {
    logNo,
    url: `https://blog.naver.com/${blogId}/${logNo}`,
    content,
    title,
    publishedAt,
    summary: content.substring(0, 200).replace(/\n/g, ' ').trim(),
    thumbnail,
  };
}

// ── 병렬 fetch 유틸 ──

async function fetchPostsBatch(
  blogId: string,
  entries: PostEntry[],
  maxPosts: number,
  timer: Timer,
): Promise<{ posts: PostResult[]; skipped: number; timedOut: boolean }> {
  const posts: PostResult[] = [];
  let skipped = 0;
  let timedOut = false;

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    if (posts.length >= maxPosts || !timer.hasTimeLeft()) {
      timedOut = !timer.hasTimeLeft();
      break;
    }

    const batch = entries.slice(i, i + CONCURRENCY).filter(() => posts.length < maxPosts);
    const results = await Promise.allSettled(
      batch.map((entry) => fetchPostContent(blogId, entry)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        posts.push(r.value);
      } else {
        skipped++;
      }
    }

    if (i + CONCURRENCY < entries.length) {
      await new Promise((r) => setTimeout(r, POST_FETCH_DELAY_MS));
    }
  }

  return { posts, skipped, timedOut };
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  // 게스트 허용: 로그인 쿠키 없으면 IP 기반 분당 10회 제한
  const gate = gateGuestRequest(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const timer = createTimer();
  const diagnostics: string[] = [];

  try {
    const body = (await request.json()) as {
      blogUrl: string;
      maxPosts?: number;
      /** 특정 글의 logNo 를 직접 지정해 해당 글만 가져오기 (URL 모드 지원). */
      targetLogNo?: string;
    };
    const { blogUrl, maxPosts = 10, targetLogNo: rawTargetLogNo } = body;

    if (!blogUrl || typeof blogUrl !== 'string') {
      return NextResponse.json(
        { error: 'Invalid URL', message: '블로그 URL을 입력해주세요.' },
        { status: 400 },
      );
    }

    // hostname 정확 매칭 (SSRF 방어 — includes 매칭 금지)
    const check = validateNaverBlogUrl(blogUrl);
    if (!check.ok) {
      return NextResponse.json({ error: 'Invalid URL', message: check.message }, { status: 400 });
    }

    const blogId = extractBlogId(blogUrl);
    if (!blogId) {
      return NextResponse.json(
        { error: 'Cannot extract blogId', message: 'blog.naver.com/아이디 형태의 URL이어야 합니다.' },
        { status: 400 },
      );
    }

    // targetLogNo: 클라이언트가 명시했거나, 블로그 URL 자체에 포함돼 있으면 추출.
    // 숫자만 허용 (인젝션·path traversal 방어).
    const targetLogNo: string | null = (() => {
      const candidate = (typeof rawTargetLogNo === 'string' && /^\d{8,}$/.test(rawTargetLogNo))
        ? rawTargetLogNo
        : extractLogNo(blogUrl);
      return candidate;
    })();

    // ── 특정 글 직접 fetch 경로 ──
    // logNo 가 명시되면 RSS/PostList 단계를 건너뛰고 해당 글만 가져온다.
    // 이 경로는 "블로그 홈 URL 이 아닌 특정 포스트 URL" 에 대해 정확한 글을
    // 반환하기 위함. maxPosts 1 로 요청했더라도 최신 글이 아닌 지정 글을 돌려줌.
    if (targetLogNo) {
      diagnostics.push(`targetLogNo=${targetLogNo} — 단일 글 직접 fetch`);
      const single = await fetchPostContent(blogId, { logNo: targetLogNo });
      if (!single) {
        return NextResponse.json(
          {
            error: 'Post Not Found',
            message: '해당 글의 본문을 가져올 수 없습니다. 비공개 글이거나 URL 이 잘못됐을 수 있습니다.',
            diagnostics,
          },
          { status: 404 },
        );
      }
      // 공용 응답 포맷과 일치시키기 위해 logNo 필드는 응답에서 제거.
      const { logNo: _logNo, ...rest } = single;
      void _logNo;
      return NextResponse.json({
        success: true,
        blogUrl,
        blogId,
        posts: [rest],
        postsCount: 1,
        diagnostics,
        elapsedMs: timer.elapsed(),
        timestamp: new Date().toISOString(),
      });
    }

    const limited = Math.min(Number(maxPosts) || 10, 20);

    // ── 1단계: 글 목록 수집 (RSS 우선 → PostList fallback) ──
    let entries: PostEntry[] = [];
    const candidates = Math.min(limited * 3, 60);

    // 1-A: RSS 시도
    entries = await fetchFromRss(blogId, candidates);
    if (entries.length > 0) {
      diagnostics.push(`RSS에서 ${entries.length}개 글 목록 확보`);
    }

    // 1-B: RSS 실패 → PostList HTML
    if (entries.length === 0 && timer.hasTimeLeft()) {
      diagnostics.push('RSS 실패 → PostList 시도');
      entries = await fetchLogNos(blogId, candidates, timer);
      if (entries.length > 0) {
        diagnostics.push(`PostList에서 ${entries.length}개 logNo 확보`);
      }
    }

    if (entries.length === 0) {
      diagnostics.push('글 목록 확보 실패');
      const reason = !timer.hasTimeLeft() ? ' (시간 초과)' : '';
      return NextResponse.json({
        success: true,
        blogUrl,
        blogId,
        posts: [],
        postsCount: 0,
        diagnostics,
        message: `블로그 "${blogId}"에서 글 목록을 찾을 수 없습니다${reason}. RSS 공개 여부와 URL을 확인해주세요.`,
        timestamp: new Date().toISOString(),
      });
    }

    // ── 2단계: 본문 수집 (병렬, 시간 제한) ──
    const { posts, skipped, timedOut } = await fetchPostsBatch(blogId, entries, limited, timer);

    diagnostics.push(`본문 수집: ${posts.length}개 성공, ${skipped}개 스킵${timedOut ? ', 시간 초과로 조기 종료' : ''}`);

    // ── 3단계: 날짜순 정렬 ──
    posts.sort((a, b) => {
      if (a.publishedAt && b.publishedAt)
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return Number(b.logNo) - Number(a.logNo);
    });

    const output = posts.map(({ logNo: _logNo, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      blogUrl,
      blogId,
      posts: output,
      postsCount: output.length,
      diagnostics,
      elapsedMs: timer.elapsed(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[Crawl] 에러:', err);
    return NextResponse.json(
      { error: 'Crawling Failed', message: (err as Error).message, diagnostics },
      { status: 500 },
    );
  }
}
