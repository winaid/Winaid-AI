/**
 * 네이버 블로그 크롤러 — Next.js API Route
 *
 * functions/api/naver/crawl-hospital-blog.ts (Cloudflare Function) 로직을
 * Next.js API Route로 이식. 외부 서비스 의존 없이 자체 크롤링 가능.
 *
 * POST /api/naver/crawl-hospital-blog
 * Body: { blogUrl: string, maxPosts?: number }
 */

import { NextRequest, NextResponse } from 'next/server';

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://blog.naver.com/',
};

function extractBlogId(blogUrl: string): string | null {
  const m = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
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

// ── 1단계: logNo 수집 ──

async function fetchLogNos(blogId: string, maxCandidates: number): Promise<string[]> {
  const seenLogNos = new Set<string>();
  const logNos: string[] = [];
  let page = 1;

  while (logNos.length < maxCandidates && page <= 10) {
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&categoryNo=0&postListType=&blogType=B`;
    let html: string;
    try {
      const res = await fetch(listUrl, { headers: FETCH_HEADERS });
      if (!res.ok) {
        console.log(`[Crawl] PostList 페이지 ${page} 실패: ${res.status}`);
        break;
      }
      html = await res.text();
    } catch (err) {
      console.log(`[Crawl] PostList 페이지 ${page} 네트워크 오류: ${(err as Error).message}`);
      break;
    }

    let foundNew = 0;

    const p1 = /logNo=(\d{10,})/g;
    let m: RegExpExecArray | null;
    while ((m = p1.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
        foundNew++;
      }
    }

    const p2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = p2.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
        foundNew++;
      }
    }

    console.log(`[Crawl] 페이지 ${page}: ${foundNew}개 신규 logNo (누적: ${logNos.length}개)`);
    if (foundNew === 0) break;
    page++;
  }

  logNos.sort((a, b) => Number(b) - Number(a));
  console.log(`[Crawl] 총 ${logNos.length}개 logNo 수집`);
  return logNos.slice(0, maxCandidates);
}

// ── 2단계: 개별 글 본문 + 메타데이터 추출 ──

interface PostResult {
  logNo: string;
  url: string;
  content: string;
  title: string;
  publishedAt: string;
  summary: string;
  thumbnail: string;
}

async function fetchPostContent(blogId: string, logNo: string): Promise<PostResult | null> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  let html: string;
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.log(`  [Crawl] PostView ${logNo} HTTP ${res.status}`);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.log(`  [Crawl] PostView ${logNo} 네트워크 오류: ${(err as Error).message}`);
    return null;
  }

  // ── 제목 ──
  let title = '';
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
  if (!title) {
    const seTitleMatch = html.match(
      /<[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
    );
    if (seTitleMatch)
      title = seTitleMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
  }

  // ── 날짜 ──
  let publishedAt = '';
  const ogPatterns = [
    /<meta[^>]*property="og:createdate"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*property="og:createdate"/i,
  ];
  for (const op of ogPatterns) {
    const om = op.exec(html);
    if (om) {
      const d = parseNaverDate(om[1]);
      if (d) {
        publishedAt = d.toISOString();
        break;
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
        if (d) {
          publishedAt = d.toISOString();
          break;
        }
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

  const cleanHtml = (raw: string) =>
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n')
      .trim();

  // 1) se-text-paragraph (스마트에디터 3 / ONE)
  const p1 = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  while ((m = p1.exec(html)) !== null) {
    const text = cleanHtml(m[1]);
    if (text.length > 5) paragraphs.push(text);
  }

  // 2) se-module-text
  if (paragraphs.length === 0) {
    const p2 = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = p2.exec(html)) !== null) {
      const text = cleanHtml(m[1]);
      if (text.length > 5) paragraphs.push(text);
    }
  }

  // 3) se_component_text
  if (paragraphs.length === 0) {
    const p3 = /<div[^>]*class="[^"]*se_component_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = p3.exec(html)) !== null) {
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
        'class="post_footer"',
        'class="post-footer"',
        'class="comment_area"',
        'class="area_sympathy"',
        'id="printPost1"',
        'class="wrap_postdata"',
        'class="post_tag"',
        'class="post-tag"',
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
    const p5 = /<p[^>]*>([\s\S]*?)<\/p>/g;
    const allP: string[] = [];
    while ((m = p5.exec(html)) !== null) {
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
        console.log(`  [Crawl] og:description 폴백: ${logNo} (${desc.length}자)`);
        paragraphs.push(desc);
      }
    }
  }

  const content = paragraphs.join('\n\n');
  if (content.length <= 30) {
    console.log(`  [Crawl] 본문 부족 스킵: ${logNo} (${content.length}자)`);
    return null;
  }

  return {
    logNo,
    url: `https://blog.naver.com/${blogId}/${logNo}`,
    content,
    title,
    publishedAt,
    summary: content
      .substring(0, 200)
      .replace(/\n/g, ' ')
      .trim(),
    thumbnail,
  };
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { blogUrl: string; maxPosts?: number };
    const { blogUrl, maxPosts = 10 } = body;

    if (!blogUrl || !blogUrl.includes('blog.naver.com')) {
      return NextResponse.json(
        { error: 'Invalid URL', message: '네이버 블로그 URL을 입력해주세요. (blog.naver.com/...)' },
        { status: 400 },
      );
    }

    const blogId = extractBlogId(blogUrl);
    if (!blogId) {
      return NextResponse.json(
        { error: 'Cannot extract blogId', message: 'blog.naver.com/아이디 형태의 URL이어야 합니다.' },
        { status: 400 },
      );
    }

    const limited = Math.min(Number(maxPosts) || 10, 20);
    console.log(`[Crawl] 블로그 수집 시작: ${blogId} (목표: ${limited}개)`);

    // 1단계: logNo 수집
    const candidates = Math.min(limited * 3, 60);
    const logNos = await fetchLogNos(blogId, candidates);

    if (logNos.length === 0) {
      return NextResponse.json({
        success: true,
        blogUrl,
        blogId,
        posts: [],
        postsCount: 0,
        message: `블로그 "${blogId}"에서 글 목록을 찾을 수 없습니다. URL을 확인해주세요.`,
        timestamp: new Date().toISOString(),
      });
    }

    // 2단계: 각 글 본문 수집
    const posts: PostResult[] = [];
    let skipped = 0;
    for (const logNo of logNos) {
      if (posts.length >= limited) break;
      const result = await fetchPostContent(blogId, logNo);
      if (result) {
        posts.push(result);
      } else {
        skipped++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[Crawl] 본문 수집: ${posts.length}개 성공, ${skipped}개 스킵`);

    // 3단계: 날짜순 정렬
    posts.sort((a, b) => {
      if (a.publishedAt && b.publishedAt)
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return Number(b.logNo) - Number(a.logNo);
    });

    // logNo 필드 제거
    const output = posts.map(({ logNo: _logNo, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      blogUrl,
      blogId,
      posts: output,
      postsCount: output.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[Crawl] 블로그 크롤링 에러:', err);
    return NextResponse.json(
      { error: 'Crawling Failed', message: (err as Error).message },
      { status: 500 },
    );
  }
}
