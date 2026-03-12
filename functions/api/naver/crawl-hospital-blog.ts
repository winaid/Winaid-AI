/**
 * 병원 네이버 블로그 글 목록 + 본문 수집
 * Cloudflare Pages Function (fetch 기반, Puppeteer 불필요)
 *
 * 전략:
 *  1단계: PostList에서 logNo만 추출 (페이지네이션, 중복 제거)
 *  2단계: logNo 내림차순 정렬 (큰 번호 = 최신, Naver 표준)
 *  3단계: 각 글 페이지에서 본문 + og:createdate로 정확한 날짜 추출
 *  4단계: 본문이 있는 글만 모은 뒤, publishedAt 내림차순으로 최종 재정렬
 *  5단계: 상위 N개 반환
 */

interface Env {}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://blog.naver.com/',
};

/** URL에서 blogId 추출 */
function extractBlogId(blogUrl: string): string | null {
  const m = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ============================================================
// 날짜 파싱
// ============================================================

function parseNaverDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // ISO 8601: "2025-03-12T09:00:00+09:00"
  if (s.includes('T') && s.includes('-')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // "2025. 3. 12." or "2025.03.12."
  const dotMatch = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (dotMatch) return new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));

  // "2025-03-12"
  const dashMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) return new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));

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

// ============================================================
// 1단계: 글 목록에서 logNo만 추출 (단순·확실)
// ============================================================

async function fetchLogNos(blogId: string, maxCandidates: number): Promise<string[]> {
  const seenLogNos = new Set<string>();
  const logNos: string[] = [];
  let page = 1;

  while (logNos.length < maxCandidates && page <= 5) {
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&categoryNo=0&postListType=&blogType=B`;
    const res = await fetch(listUrl, { headers: FETCH_HEADERS });
    if (!res.ok) break;
    const html = await res.text();

    let foundNew = 0;

    // logNo=NNNN 패턴
    const p1 = /logNo=(\d{10,})/g;
    let m: RegExpExecArray | null;
    while ((m = p1.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
        foundNew++;
      }
    }

    // blog.naver.com/blogId/NNNN 패턴
    const p2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = p2.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
        foundNew++;
      }
    }

    console.log(`[Crawl] 페이지 ${page}: ${foundNew}개 신규 logNo 발견 (누적: ${logNos.length}개)`);
    if (foundNew === 0) break;
    page++;
  }

  // logNo 내림차순 정렬 (큰 번호 = 최신 글, Naver 표준)
  logNos.sort((a, b) => Number(b) - Number(a));

  console.log(`[Crawl] 총 ${logNos.length}개 logNo 수집 (내림차순 정렬)`);
  return logNos.slice(0, maxCandidates);
}

// ============================================================
// 2단계: 개별 글 페이지에서 본문 + 정확한 메타데이터 추출
// ============================================================

interface PostResult {
  logNo: string;
  url: string;
  content: string;
  title: string;
  publishedAt: string;  // ISO 8601
  summary: string;
  thumbnail: string;
}

async function fetchPostContent(blogId: string, logNo: string): Promise<PostResult | null> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();

  // ── 제목 ──
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/\s*:\s*네이버\s*블로그$/i, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();
  }
  if (!title) {
    const seTitleMatch = html.match(/<[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    if (seTitleMatch) title = seTitleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // ── 날짜 (og:createdate가 가장 정확) ──
  let publishedAt = '';
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
  // 폴백: se_publishDate, blog_date 등
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
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                   html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
  if (ogImage) thumbnail = ogImage[1];

  // ── 본문 ──
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;

  // se-text-paragraph (스마트에디터 3)
  const paraPattern = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  while ((m = paraPattern.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 10) paragraphs.push(text);
  }

  // 폴백: se-module-text
  if (paragraphs.length === 0) {
    const fallback = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = fallback.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 10) paragraphs.push(text);
    }
  }

  const content = paragraphs.join('\n\n');
  if (content.length <= 50) {
    console.log(`  ⚠️ 본문 부족 스킵: ${logNo} (${content.length}자)`);
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

// ============================================================
// 메인 핸들러
// ============================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await context.request.json() as { blogUrl: string; maxPosts?: number };
    const { blogUrl, maxPosts = 10 } = body;

    if (!blogUrl || !blogUrl.includes('blog.naver.com')) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL', message: '네이버 블로그 URL을 입력해주세요. (blog.naver.com/...)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const blogId = extractBlogId(blogUrl);
    if (!blogId) {
      return new Response(
        JSON.stringify({ error: 'Cannot extract blogId', message: 'blog.naver.com/아이디 형태의 URL이어야 합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const limited = Math.min(Number(maxPosts) || 10, 20);
    console.log(`🏥 블로그 수집 시작: ${blogId} (목표: ${limited}개)`);

    // ── 1단계: logNo 수집 (여분 +10) ──
    const candidates = Math.min(limited + 10, 30);
    const logNos = await fetchLogNos(blogId, candidates);

    // ── 2단계: 각 글 본문 + 날짜 수집 (limited개가 될 때까지) ──
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
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[Crawl] 본문 수집: ${posts.length}개 성공, ${skipped}개 스킵`);

    // ── 3단계: 실제 날짜 기준 최종 재정렬 ──
    const dateCount = posts.filter(p => p.publishedAt).length;

    posts.sort((a, b) => {
      // 둘 다 날짜 있으면 날짜 내림차순
      if (a.publishedAt && b.publishedAt) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      // 날짜 있는 쪽 우선
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      // 둘 다 없으면 logNo 내림차순
      return Number(b.logNo) - Number(a.logNo);
    });

    // ── 4단계: 최종 로그 ──
    console.log(`[Crawl] 날짜 파싱: ${dateCount}/${posts.length}개 성공`);
    console.log(`✅ 최종 ${posts.length}개 (최신순):`);
    posts.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.publishedAt?.substring(0, 10) || 'N/A'}] ${p.title?.substring(0, 40) || p.logNo}`);
    });
    if (posts.length > 0) {
      console.log(`[Crawl] ✅ 1번이 가장 최신: ${posts[0].publishedAt?.substring(0, 10) || posts[0].logNo}`);
    }

    // 반환용으로 logNo 필드 제거
    const output = posts.map(({ logNo: _logNo, ...rest }) => rest);

    return new Response(
      JSON.stringify({
        success: true,
        blogUrl,
        blogId,
        posts: output,
        postsCount: output.length,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('병원 블로그 크롤링 에러:', err);
    return new Response(
      JSON.stringify({ error: 'Crawling Failed', message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
