/**
 * 네이버 블로그 본문 크롤링 + 구조 분석
 *
 * 사용법:
 * - { url: "https://blog.naver.com/..." } → 해당 블로그 본문을 크롤링하여 분석
 * - { keyword: "검색어" } → crawl-search와 동일한 크롤링으로 1위 URL 찾기 → 본문 분석
 *
 * 2026년 기준: 네이버 검색 결과는 CSR이라 직접 파싱 어려움.
 * URL을 직접 받는 모드를 우선 사용하고, 검색은 crawl-search.ts 로직을 재활용.
 */

interface Env {}

interface TopBlogResult {
  success: boolean;
  keyword: string;
  topBlog: {
    title: string;
    link: string;
    bloggername: string;
    content: string;
    subtitles: string[];
    charCount: number;
    paragraphCount: number;
    imageCount: number;
  } | null;
  error?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { keyword?: string; url?: string };
    const { keyword, url } = body;

    if (!keyword && !url) {
      return new Response(JSON.stringify({ success: false, error: 'keyword or url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let targetUrl = url || '';
    let topBlogTitle = '';
    let topBloggerName = '';

    // URL이 직접 제공되지 않은 경우: 검색으로 찾기
    if (!targetUrl && keyword) {
      console.log(`[crawl-top-blog] 키워드 "${keyword}" 검색으로 1위 블로그 찾기`);
      const searchResult = await searchForTopBlog(keyword);
      if (searchResult) {
        targetUrl = searchResult.url;
        topBlogTitle = searchResult.title;
        topBloggerName = searchResult.blogger;
        console.log(`[crawl-top-blog] 검색 성공: ${targetUrl}`);
      }
    }

    if (!targetUrl) {
      return jsonResponse({
        success: false,
        keyword: keyword || '',
        topBlog: null,
        error: 'No blog URL found'
      });
    }

    // ===== 블로그 본문 크롤링 =====
    console.log(`[crawl-top-blog] 본문 크롤링: ${targetUrl}`);

    // 네이버 블로그: PostView URL로 변환 (iframe 대신 직접 본문 접근)
    let fetchUrl = targetUrl;
    const naverBlogMatch = targetUrl.match(/https:\/\/(?:m\.)?blog\.naver\.com\/([^\/]+)\/(\d+)/);
    if (naverBlogMatch) {
      const [, blogId, logNo] = naverBlogMatch;
      fetchUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
      console.log(`[crawl-top-blog] PostView URL 변환: ${fetchUrl}`);
    }

    const blogResponse = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://blog.naver.com/',
      },
    });

    if (!blogResponse.ok) {
      return jsonResponse({
        success: true, keyword: keyword || '',
        topBlog: { title: topBlogTitle, link: targetUrl, bloggername: topBloggerName, content: '', subtitles: [], charCount: 0, paragraphCount: 0, imageCount: 0 },
        error: 'Blog content fetch failed, returning URL only'
      });
    }

    const blogHtml = await blogResponse.text();
    const parsed = parseBlogContent(blogHtml, targetUrl, topBlogTitle, topBloggerName);

    console.log(`[crawl-top-blog] 분석 완료 - ${parsed.charCount}자, 소제목 ${parsed.subtitles.length}개, 이미지 ${parsed.imageCount}개`);

    return jsonResponse({ success: true, keyword: keyword || '', topBlog: parsed });

  } catch (error: any) {
    console.error('[crawl-top-blog] 에러:', error);
    return new Response(
      JSON.stringify({ success: false, keyword: '', topBlog: null, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ===== 검색으로 1위 블로그 찾기 (crawl-search.ts와 동일한 로직) =====
async function searchForTopBlog(keyword: string): Promise<{ url: string; title: string; blogger: string } | null> {
  try {
    // 날짜 필터: 6개월 전 ~ 오늘
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const formatDate = (d: Date) => {
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };

    const startDate = formatDate(sixMonthsAgo);
    const endDate = formatDate(today);

    // 네이버 블로그탭 검색 (정확도순)
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&start=1&sm=tab_opt&nso=so:sim,p:from${startDate}to${endDate}`;

    console.log(`[crawl-top-blog] 검색 URL: ${searchUrl}`);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      console.error(`[crawl-top-blog] 검색 실패: ${response.status}`);
      return null;
    }

    const html = await response.text();
    console.log(`[crawl-top-blog] 검색 HTML 크기: ${html.length}자`);

    // 블로그 URL 추출 (crawl-search.ts와 동일한 패턴)
    const urlPattern = /https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^\s"<>']*/g;
    const foundUrls: string[] = [];
    let match;

    while ((match = urlPattern.exec(html)) !== null) {
      let url = match[0];
      // 쿼리 파라미터 등 불필요한 부분 제거
      url = url.replace(/[&;].*$/, '');
      if (!foundUrls.includes(url) && url.length > 30 && /\/\d+/.test(url)) {
        foundUrls.push(url);
      }
    }

    // 티스토리도 검색
    const tistoryPattern = /https:\/\/[a-zA-Z0-9-]+\.tistory\.com\/\d+/g;
    while ((match = tistoryPattern.exec(html)) !== null) {
      const url = match[0];
      if (!foundUrls.includes(url)) {
        foundUrls.push(url);
      }
    }

    console.log(`[crawl-top-blog] 검색에서 ${foundUrls.length}개 블로그 URL 발견`);

    if (foundUrls.length > 0) {
      // 제목 추출 시도
      const titlePatterns = [
        /<a[^>]*href="[^"]*"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
        /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
      ];

      let title = '';
      for (const pattern of titlePatterns) {
        const m = pattern.exec(html);
        if (m) {
          title = m[1].replace(/<[^>]*>/g, '').trim();
          break;
        }
      }

      const url = foundUrls[0].replace('m.blog.naver.com', 'blog.naver.com');
      return { url, title, blogger: '' };
    }

    return null;
  } catch (e) {
    console.error('[crawl-top-blog] 검색 에러:', e);
    return null;
  }
}

// ===== 블로그 본문 파싱 =====
function parseBlogContent(html: string, url: string, fallbackTitle: string, fallbackBlogger: string) {
  let title = fallbackTitle;
  const titlePatterns = [
    /<meta property="og:title" content="([^"]+)"/,
    /<title>([^<]+)<\/title>/,
  ];
  for (const p of titlePatterns) {
    const m = p.exec(html);
    if (m) { title = m[1].replace(/<[^>]*>/g, '').trim(); break; }
  }

  let bloggername = fallbackBlogger;
  if (!bloggername) {
    const bloggerPatterns = [
      /<meta property="og:author" content="([^"]+)"/,
      /<span[^>]*class="[^"]*nick[^"]*"[^>]*>([^<]+)<\/span>/,
    ];
    for (const p of bloggerPatterns) {
      const m = p.exec(html);
      if (m) { bloggername = m[1].trim(); break; }
    }
  }

  // 네이버 블로그 본문 영역 추출
  let contentArea = '';
  const contentPatterns = [
    /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/,
    /<div[^>]*id="postViewArea"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*post_ct[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  ];
  for (const p of contentPatterns) {
    const m = p.exec(html);
    if (m) { contentArea = m[1]; break; }
  }

  // 네이버 블로그 se-text-paragraph 추출 (PostView.naver 대응)
  if (!contentArea || contentArea.length < 100) {
    const paragraphPattern = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
    const paragraphs: string[] = [];
    let m;
    while ((m = paragraphPattern.exec(html)) !== null) {
      paragraphs.push(m[1]);
    }
    if (paragraphs.length > 0) {
      contentArea = paragraphs.join('\n');
    }
  }

  if (!contentArea) {
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html);
    contentArea = bodyMatch ? bodyMatch[1] : html;
  }

  // 소제목 추출
  const subtitles: string[] = [];
  const subtitlePatterns = [
    /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g,
    /<strong[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/strong>/g,
    /<span[^>]*style="[^"]*font-size:\s*(1[8-9]|[2-9][0-9]|[1-9][0-9]{2,})px[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
  ];
  for (const pattern of subtitlePatterns) {
    let m;
    while ((m = pattern.exec(contentArea)) !== null) {
      const sub = (m[2] || m[1]).replace(/<[^>]*>/g, '').trim();
      if (sub.length > 2 && sub.length < 100 && !subtitles.includes(sub)) {
        subtitles.push(sub);
      }
    }
  }

  // 이미지 수
  const imageCount = (contentArea.match(/<img[^>]*>/g) || []).length;

  // 텍스트 추출
  const content = contentArea
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  const paragraphCount = (contentArea.match(/<p[^>]*>/g) || []).length || Math.ceil(content.length / 200);

  return {
    title,
    link: url,
    bloggername,
    content: content.substring(0, 3000),
    subtitles,
    charCount: content.replace(/\s/g, '').length,
    paragraphCount,
    imageCount,
  };
}

function jsonResponse(data: TopBlogResult) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
