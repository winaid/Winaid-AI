/**
 * 네이버 블로그 검색 → 1위 블로그 URL 추출 → 본문 크롤링
 * 경쟁 블로그 분석용 API
 *
 * 2026년 기준: PC/모바일 네이버 검색 모두 CSR이라 HTML 파싱 불가.
 * 네이버 내부 AJAX API를 직접 호출하여 JSON으로 검색 결과를 받음.
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
    const { keyword } = await context.request.json() as { keyword: string };

    if (!keyword) {
      return new Response(JSON.stringify({ success: false, error: 'Keyword is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[crawl-top-blog] 키워드: "${keyword}" 1위 블로그 분석 시작`);

    // ===== Step 1: 1위 블로그 URL 찾기 =====
    let topBlogUrl: string | null = null;
    let topBlogTitle = '';
    let topBloggerName = '';

    // 전략 A: 네이버 AJAX API (api_type=1) - JSON 응답
    const ajaxResult = await tryNaverAjaxApi(keyword);
    if (ajaxResult) {
      topBlogUrl = ajaxResult.url;
      topBlogTitle = ajaxResult.title;
      topBloggerName = ajaxResult.blogger;
      console.log(`[crawl-top-blog] 전략A(AJAX API) 성공: ${topBlogUrl}`);
    }

    // 전략 B: 네이버 모바일 AJAX
    if (!topBlogUrl) {
      const mobileResult = await tryNaverMobileAjax(keyword);
      if (mobileResult) {
        topBlogUrl = mobileResult.url;
        topBlogTitle = mobileResult.title;
        topBloggerName = mobileResult.blogger;
        console.log(`[crawl-top-blog] 전략B(모바일 AJAX) 성공: ${topBlogUrl}`);
      }
    }

    // 전략 C: RSS 피드
    if (!topBlogUrl) {
      const rssResult = await tryNaverBlogRss(keyword);
      if (rssResult) {
        topBlogUrl = rssResult.url;
        topBlogTitle = rssResult.title;
        console.log(`[crawl-top-blog] 전략C(RSS) 성공: ${topBlogUrl}`);
      }
    }

    if (!topBlogUrl) {
      return jsonResponse({ success: false, keyword, topBlog: null, error: 'All search strategies failed' });
    }

    // ===== Step 2: 블로그 본문 크롤링 =====
    console.log(`[crawl-top-blog] 본문 크롤링: ${topBlogUrl}`);

    let fetchUrl = topBlogUrl;
    if (topBlogUrl.includes('blog.naver.com') && !topBlogUrl.includes('m.blog.naver.com')) {
      fetchUrl = topBlogUrl.replace('blog.naver.com', 'm.blog.naver.com');
    }

    const blogResponse = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!blogResponse.ok) {
      return jsonResponse({
        success: true, keyword,
        topBlog: { title: topBlogTitle, link: topBlogUrl, bloggername: topBloggerName, content: '', subtitles: [], charCount: 0, paragraphCount: 0, imageCount: 0 },
        error: 'Blog content fetch failed, returning URL only'
      });
    }

    const blogHtml = await blogResponse.text();
    const parsed = parseBlogContent(blogHtml, topBlogUrl, topBlogTitle, topBloggerName);

    console.log(`[crawl-top-blog] 분석 완료 - ${parsed.charCount}자, 소제목 ${parsed.subtitles.length}개, 이미지 ${parsed.imageCount}개`);

    return jsonResponse({ success: true, keyword, topBlog: parsed });

  } catch (error: any) {
    console.error('[crawl-top-blog] 에러:', error);
    return new Response(
      JSON.stringify({ success: false, keyword: '', topBlog: null, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ===== 전략 A: 네이버 PC AJAX API =====
async function tryNaverAjaxApi(keyword: string): Promise<{ url: string; title: string; blogger: string } | null> {
  // 네이버 검색 프론트엔드가 호출하는 내부 API 엔드포인트들
  const apiUrls = [
    // AJAX API (api_type 파라미터 사용)
    `https://search.naver.com/search.naver?where=blog&sm=tab_jum&query=${encodeURIComponent(keyword)}&api_type=1&search_type=blog&`,
    `https://search.naver.com/search.naver?where=blog&sm=tab_jum&query=${encodeURIComponent(keyword)}&api_type=4&search_type=blog&`,
    // s.search 도메인 (SERP API)
    `https://s.search.naver.com/p/blog/search.naver?ssc=tab.blog.all&api_type=1&query=${encodeURIComponent(keyword)}`,
    `https://s.search.naver.com/p/blog/search.naver?ssc=tab.blog.all&api_type=4&query=${encodeURIComponent(keyword)}&start=1&display=1`,
  ];

  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://search.naver.com/',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) continue;

      const text = await response.text();

      // JSON 응답인 경우
      const blogUrl = extractBlogUrlFromResponse(text);
      if (blogUrl) return blogUrl;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ===== 전략 B: 네이버 모바일 AJAX =====
async function tryNaverMobileAjax(keyword: string): Promise<{ url: string; title: string; blogger: string } | null> {
  const apiUrls = [
    `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(keyword)}&sm=mtb_jum&api_type=1`,
    `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(keyword)}&sm=mtb_jum&api_type=4`,
  ];

  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://m.search.naver.com/',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) continue;

      const text = await response.text();
      const blogUrl = extractBlogUrlFromResponse(text);
      if (blogUrl) return blogUrl;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ===== 전략 C: 네이버 블로그 RSS/Atom 피드 =====
async function tryNaverBlogRss(keyword: string): Promise<{ url: string; title: string } | null> {
  try {
    // 네이버 블로그 검색 RSS
    const rssUrl = `https://rss.blog.naver.com/SearchBlog.nhn?searchValue=${encodeURIComponent(keyword)}&orderType=sim`;

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) return null;

    const xml = await response.text();

    // RSS에서 첫 번째 <item> 추출
    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) return null;

    const linkMatch = itemMatch[1].match(/<link>([^<]+)<\/link>/);
    const titleMatch = itemMatch[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);

    if (linkMatch) {
      return {
        url: linkMatch[1].trim(),
        title: titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '',
      };
    }
  } catch (e) {
    console.log('[crawl-top-blog] RSS 실패:', e);
  }
  return null;
}

// ===== 응답에서 블로그 URL 추출 (JSON/HTML 통합) =====
function extractBlogUrlFromResponse(text: string): { url: string; title: string; blogger: string } | null {
  // 1. JSON 파싱 시도
  try {
    const json = JSON.parse(text);
    const items = json?.items || json?.result?.items || json?.data?.items
      || json?.contents || json?.result?.contents || json?.data?.contents
      || json?.result?.blogList || json?.blogList || [];

    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      const url = first.link || first.url || first.blogUrl || first.postUrl || '';
      if (url && (url.includes('blog.naver.com') || url.includes('tistory.com'))) {
        return {
          url: url.replace('m.blog.naver.com', 'blog.naver.com'),
          title: (first.title || '').replace(/<[^>]*>/g, ''),
          blogger: first.bloggername || first.bloggerName || first.nickname || '',
        };
      }
    }
  } catch (e) {
    // JSON이 아닌 경우 HTML로 처리
  }

  // 2. HTML에서 블로그 URL 직접 추출
  const urlPatterns = [
    /href="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
    /data-url="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
    /"(?:url|link|blogUrl|postUrl|href)"\s*:\s*"(https?:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
    /(https:\/\/blog\.naver\.com\/[a-zA-Z0-9_-]+\/\d+)/,
    /(https:\/\/m\.blog\.naver\.com\/[a-zA-Z0-9_-]+\/\d+)/,
    // 이스케이프된 URL
    /https?:\\\/\\\/(?:blog|m\.blog)\.naver\.com\\\/[^"'\s\\]+/,
  ];

  for (const pattern of urlPatterns) {
    const match = pattern.exec(text);
    if (match) {
      let url = match[1] || match[0];
      url = url.replace(/\\\//g, '/').replace('m.blog.naver.com', 'blog.naver.com');
      // 제목 추출 시도
      const titleMatch = text.substring(Math.max(0, (match.index || 0) - 200), (match.index || 0) + 200)
        .match(/"title"\s*:\s*"([^"]+)"|<title>([^<]+)<\/title>|class="[^"]*title[^"]*"[^>]*>([^<]+)/);
      return {
        url,
        title: titleMatch ? (titleMatch[1] || titleMatch[2] || titleMatch[3] || '').replace(/<[^>]*>/g, '').trim() : '',
        blogger: '',
      };
    }
  }

  return null;
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

  if (!contentArea) {
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html);
    contentArea = bodyMatch ? bodyMatch[1] : html;
  }

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

  const imageCount = (contentArea.match(/<img[^>]*>/g) || []).length;

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
