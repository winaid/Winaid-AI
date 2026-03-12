/**
 * 병원 네이버 블로그 글 목록 + 본문 수집
 * Cloudflare Pages Function (fetch 기반, Puppeteer 불필요)
 *
 * 최신 글 10개를 publishedAt 내림차순으로 반환.
 * 공지글·중복 제거, 날짜 파싱, 페이지네이션 지원.
 */

interface Env {}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://blog.naver.com/',
};

/** 크롤링 결과 타입 */
interface PostEntry {
  logNo: string;
  title: string;
  url: string;
  publishedAt: string;         // ISO 8601
  publishedAtRaw: string;      // 원본 날짜 문자열
  summary: string;
  thumbnail: string;
  listOrder: number;           // 목록 노출 순서 (0-based)
  isNotice: boolean;
}

/** URL에서 blogId 추출 */
function extractBlogId(blogUrl: string): string | null {
  const m = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ============================================================
// 날짜 파싱
// ============================================================

/**
 * 네이버 블로그 날짜 문자열을 Date로 변환
 * 지원 형식:
 *   "2025. 3. 12."  /  "2025.03.12."  /  "2025-03-12"
 *   "3시간 전"  /  "1일 전"  /  "어제"  /  "그저께"
 */
function parseNaverDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // "2025. 3. 12." or "2025.03.12." or "2025. 3. 12"
  const dotMatch = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (dotMatch) {
    return new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));
  }

  // "2025-03-12"
  const dashMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) {
    return new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));
  }

  const now = new Date();

  // "N시간 전"
  const hourAgo = s.match(/(\d+)\s*시간\s*전/);
  if (hourAgo) {
    return new Date(now.getTime() - Number(hourAgo[1]) * 3600000);
  }

  // "N분 전"
  const minAgo = s.match(/(\d+)\s*분\s*전/);
  if (minAgo) {
    return new Date(now.getTime() - Number(minAgo[1]) * 60000);
  }

  // "N일 전"
  const dayAgo = s.match(/(\d+)\s*일\s*전/);
  if (dayAgo) {
    return new Date(now.getTime() - Number(dayAgo[1]) * 86400000);
  }

  // "어제"
  if (s.includes('어제')) {
    return new Date(now.getTime() - 86400000);
  }

  // "그저께" / "그제"
  if (s.includes('그저께') || s.includes('그제')) {
    return new Date(now.getTime() - 172800000);
  }

  return null;
}

// ============================================================
// 블로그 글 목록 수집 (메타데이터 포함)
// ============================================================

/**
 * PostTitleListAsync API 사용하여 글 목록 + 메타데이터 수집
 * 공지글 제외, 날짜 파싱, 중복 제거 포함
 */
async function fetchPostEntries(blogId: string, maxPosts: number): Promise<PostEntry[]> {
  const entries: PostEntry[] = [];
  const seenLogNos = new Set<string>();
  let page = 1;
  let globalOrder = 0;

  while (entries.length < maxPosts * 2) { // 공지 제외를 위해 넉넉하게 수집
    // PostList.naver에서 HTML 수집 (타입 B = 목록형)
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&categoryNo=0&postListType=&blogType=B`;
    const res = await fetch(listUrl, { headers: FETCH_HEADERS });
    if (!res.ok) break;
    const html = await res.text();

    // ── 1단계: logNo 추출 ──
    const logNos: string[] = [];

    // logNo=NNNN 패턴
    const pattern1 = /logNo=(\d{10,})/g;
    let m: RegExpExecArray | null;
    while ((m = pattern1.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
      }
    }

    // blog.naver.com/blogId/NNNN 패턴
    const pattern2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = pattern2.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) {
        seenLogNos.add(m[1]);
        logNos.push(m[1]);
      }
    }

    if (logNos.length === 0) break;

    // ── 2단계: 각 logNo에 대해 제목/날짜 추출 시도 ──
    // HTML에서 제목/날짜를 각 logNo 주변 컨텍스트로 추출
    for (const logNo of logNos) {
      // 공지글 판별: "공지" 클래스나 텍스트가 logNo 근처에 있는지 확인
      const noticePattern = new RegExp(`(?:notice|공지|ico_notice)[^]*?${logNo}|${logNo}[^]*?(?:notice|공지|ico_notice)`, 'i');
      const isNotice = noticePattern.test(html.substring(
        Math.max(0, html.indexOf(logNo) - 500),
        Math.min(html.length, html.indexOf(logNo) + 500)
      ));

      // 제목 추출: logNo 근처의 title 텍스트
      let title = '';
      const titlePatterns = [
        new RegExp(`<a[^>]*${logNo}[^>]*>\\s*(?:<[^>]*>)*\\s*([^<]+)`, 'i'),
        new RegExp(`title[^"]*"[^"]*"[^>]*${logNo}|${logNo}[^"]*title[^"]*"([^"]+)"`, 'i'),
      ];
      for (const tp of titlePatterns) {
        const tm = tp.exec(html);
        if (tm && (tm[1] || tm[2])) {
          title = (tm[1] || tm[2] || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
          if (title.length > 2) break;
        }
      }

      // 날짜 추출: logNo 근처의 날짜 텍스트
      let publishedAtRaw = '';
      let publishedAt: Date | null = null;
      const dateArea = html.substring(
        Math.max(0, html.indexOf(logNo) - 1000),
        Math.min(html.length, html.indexOf(logNo) + 1000)
      );
      // "2025. 3. 12." 형식
      const dateMatch = dateArea.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
      if (dateMatch) {
        publishedAtRaw = dateMatch[0];
        publishedAt = parseNaverDate(publishedAtRaw);
      }
      // 상대 날짜 ("3시간 전" 등)
      if (!publishedAt) {
        const relMatch = dateArea.match(/(\d+\s*(?:시간|분|일)\s*전|어제|그저께|그제)/);
        if (relMatch) {
          publishedAtRaw = relMatch[0];
          publishedAt = parseNaverDate(publishedAtRaw);
        }
      }

      entries.push({
        logNo,
        title,
        url: `https://blog.naver.com/${blogId}/${logNo}`,
        publishedAt: publishedAt?.toISOString() || '',
        publishedAtRaw,
        summary: '',
        thumbnail: '',
        listOrder: globalOrder++,
        isNotice,
      });
    }

    page++;
    if (page > 5) break; // 최대 5페이지
  }

  // ── 3단계: 공지글 제외 ──
  const regularPosts = entries.filter(e => !e.isNotice);
  const noticePosts = entries.filter(e => e.isNotice);
  console.log(`[Crawl] 총 수집: ${entries.length}개, 공지: ${noticePosts.length}개 제외, 일반: ${regularPosts.length}개`);

  // ── 4단계: 정렬 ──
  // 1순위: publishedAt 내림차순, 2순위: listOrder (원본 순서)
  const dateParseCount = regularPosts.filter(e => e.publishedAt).length;

  regularPosts.sort((a, b) => {
    // 날짜가 있으면 날짜 기준
    if (a.publishedAt && b.publishedAt) {
      const diff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (diff !== 0) return diff;
      return a.listOrder - b.listOrder; // 같은 날이면 원본 순서
    }
    // 날짜가 하나만 있으면 있는 쪽 우선
    if (a.publishedAt && !b.publishedAt) return -1;
    if (!a.publishedAt && b.publishedAt) return 1;
    // 둘 다 없으면 logNo 내림차순 (큰 번호 = 최신)
    return Number(b.logNo) - Number(a.logNo);
  });

  // ── 5단계: 중복 제거 후 상위 10개 ──
  const uniqueLogNos = new Set<string>();
  const deduped = regularPosts.filter(e => {
    if (uniqueLogNos.has(e.logNo)) return false;
    uniqueLogNos.add(e.logNo);
    return true;
  });

  const final = deduped.slice(0, maxPosts);

  // ── 로그 출력 ──
  console.log(`[Crawl] 날짜 파싱 성공: ${dateParseCount}/${regularPosts.length}개`);
  console.log(`[Crawl] 중복 제거 후: ${deduped.length}개`);
  console.log(`[Crawl] 최종 ${final.length}개 (최신순):`);
  final.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.publishedAtRaw || e.publishedAt || 'N/A'}] ${e.title || e.logNo}`);
  });

  if (final.length > 0) {
    console.log(`[Crawl] ✅ 1번 글이 가장 최신: ${final[0].publishedAtRaw || final[0].logNo}`);
  }

  return final;
}

// ============================================================
// 개별 글 본문 + 메타데이터 추출
// ============================================================

interface PostContentResult {
  content: string;
  title: string;
  publishedAt: string;
  summary: string;
  thumbnail: string;
}

/** 개별 블로그 글 본문 + 제목/날짜/썸네일 추출 */
async function fetchPostContent(blogId: string, logNo: string): Promise<PostContentResult> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });

  if (!res.ok) return { content: '', title: '', publishedAt: '', summary: '', thumbnail: '' };
  const html = await res.text();

  // ── 제목 추출 ──
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/\s*:\s*네이버\s*블로그$/i, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();
  }
  // se-title 에서도 시도
  if (!title) {
    const seTitleMatch = html.match(/<[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    if (seTitleMatch) {
      title = seTitleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  // ── 날짜 추출 ──
  let publishedAt = '';
  // og:createdate 메타 태그
  const ogDateMatch = html.match(/<meta[^>]*property="og:createdate"[^>]*content="([^"]+)"/i) ||
                       html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:createdate"/i);
  if (ogDateMatch) {
    const d = parseNaverDate(ogDateMatch[1]);
    if (d) publishedAt = d.toISOString();
  }
  // se_publishDate 또는 날짜 영역
  if (!publishedAt) {
    const datePatterns = [
      /class="[^"]*se_publishDate[^"]*"[^>]*>([^<]+)/i,
      /class="[^"]*blog_date[^"]*"[^>]*>([^<]+)/i,
      /class="[^"]*date[^"]*"[^>]*>\s*(\d{4}[\s./-]+\d{1,2}[\s./-]+\d{1,2})/i,
    ];
    for (const dp of datePatterns) {
      const dm = dp.exec(html);
      if (dm) {
        const d = parseNaverDate(dm[1].trim());
        if (d) { publishedAt = d.toISOString(); break; }
      }
    }
  }

  // ── 썸네일 추출 ──
  let thumbnail = '';
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                   html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
  if (ogImage) {
    thumbnail = ogImage[1];
  }

  // ── 본문 추출 ──
  const paragraphs: string[] = [];
  const paraPattern = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  let m: RegExpExecArray | null;
  while ((m = paraPattern.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 10) paragraphs.push(text);
  }

  // fallback: se-module-text
  if (paragraphs.length === 0) {
    const fallback = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((m = fallback.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 10) paragraphs.push(text);
    }
  }

  const content = paragraphs.join('\n\n');
  const summary = content.substring(0, 200).replace(/\n/g, ' ').trim();

  return { content, title, publishedAt, summary, thumbnail };
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
    console.log(`🏥 병원 블로그 수집 시작: ${blogId} (최대 ${limited}개)`);

    // 1. 글 목록 수집 (메타데이터 + 공지 제외 + 최신순 정렬)
    const postEntries = await fetchPostEntries(blogId, limited);
    console.log(`📋 최종 ${postEntries.length}개 글 선정 완료`);

    // 2. 각 글 본문 수집 (순차, 과부하 방지)
    const posts: { url: string; content: string; title: string; publishedAt: string; summary: string; thumbnail: string }[] = [];
    for (const entry of postEntries) {
      const result = await fetchPostContent(blogId, entry.logNo);

      if (result.content.length > 50) {
        posts.push({
          url: entry.url,
          content: result.content,
          title: result.title || entry.title || '',
          publishedAt: result.publishedAt || entry.publishedAt || '',
          summary: result.summary || '',
          thumbnail: result.thumbnail || '',
        });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // 최종 로그
    console.log(`✅ ${posts.length}개 글 본문 수집 완료`);
    posts.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.publishedAt?.substring(0, 10) || 'N/A'}] ${p.title?.substring(0, 40) || p.url}`);
    });

    return new Response(
      JSON.stringify({
        success: true,
        blogUrl,
        blogId,
        posts,
        postsCount: posts.length,
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
