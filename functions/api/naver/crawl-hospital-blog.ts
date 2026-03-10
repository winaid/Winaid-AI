/**
 * 병원 네이버 블로그 글 목록 + 본문 수집
 * Cloudflare Pages Function (fetch 기반, Puppeteer 불필요)
 */

interface Env {}

/** URL에서 blogId 추출 */
function extractBlogId(blogUrl: string): string | null {
  // blog.naver.com/blogId 또는 blog.naver.com/blogId/postNo
  const m = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** 블로그 글 목록 페이지에서 postNo 추출 */
async function fetchPostNos(blogId: string, maxPosts: number): Promise<string[]> {
  const postNos: string[] = [];
  let page = 1;

  while (postNos.length < maxPosts) {
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&postListType=&blogType=B`;
    const res = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://blog.naver.com/',
      },
    });

    if (!res.ok) break;
    const html = await res.text();

    // logNo 파라미터에서 글 번호 추출
    const pattern = /logNo=(\d{10,})/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      found.add(m[1]);
    }

    // blog.naver.com/blogId/postNo 형태도 추출
    const pattern2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = pattern2.exec(html)) !== null) {
      found.add(m[1]);
    }

    const newNos = Array.from(found).filter(n => !postNos.includes(n));
    if (newNos.length === 0) break; // 더 이상 새 글 없음

    postNos.push(...newNos);
    page++;

    if (page > 5) break; // 최대 5페이지
  }

  return postNos.slice(0, maxPosts);
}

/** 개별 블로그 글 본문 추출 */
async function fetchPostContent(blogId: string, logNo: string): Promise<string> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': 'https://blog.naver.com/',
    },
  });

  if (!res.ok) return '';
  const html = await res.text();

  // se-text-paragraph 본문 추출
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

  return paragraphs.join('\n\n');
}

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

    // 1. 글 목록 수집
    const postNos = await fetchPostNos(blogId, limited);
    console.log(`📋 글 번호 ${postNos.length}개 수집됨`);

    // 2. 각 글 본문 수집 (순차, 과부하 방지)
    const posts: { url: string; content: string }[] = [];
    for (const logNo of postNos) {
      const content = await fetchPostContent(blogId, logNo);
      if (content.length > 50) {
        posts.push({ url: `https://blog.naver.com/${blogId}/${logNo}`, content });
      }
      // 간단한 딜레이
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`✅ ${posts.length}개 글 본문 수집 완료`);

    return new Response(
      JSON.stringify({ success: true, blogUrl, blogId, posts, postsCount: posts.length, timestamp: new Date().toISOString() }),
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
