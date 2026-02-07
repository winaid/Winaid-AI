/**
 * 네이버 블로그탭에서 키워드 검색 → 1위 블로그 URL 추출 → 본문 크롤링
 * 경쟁 블로그 분석용 API
 *
 * 통합탭(nexearch)은 JS 렌더링이라 fetch로 블로그 URL을 못 잡음.
 * 블로그탭(where=blog) 1위 ≈ 통합탭 블로그 영역 1위이므로 블로그탭 사용.
 */

interface Env {}

interface TopBlogResult {
  success: boolean;
  keyword: string;
  topBlog: {
    title: string;
    link: string;
    bloggername: string;
    content: string;       // 본문 텍스트
    subtitles: string[];   // 소제목 목록
    charCount: number;     // 글자 수
    paragraphCount: number; // 문단 수
    imageCount: number;    // 이미지 수
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

    // Step 1: 네이버 블로그탭 검색 → 1위 블로그 URL 찾기
    // 정확도순(so:sim) 으로 검색하여 가장 관련도 높은 결과 확보
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so:sim`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!searchResponse.ok) {
      return jsonResponse({ success: false, keyword, topBlog: null, error: `Naver search failed: ${searchResponse.status}` });
    }

    const searchHtml = await searchResponse.text();

    // 블로그 URL + 제목 추출 (crawl-search.ts와 동일한 패턴 사용)
    let topBlogUrl: string | null = null;
    let topBlogTitle = '';

    const titleLinkPatterns = [
      // 패턴 1: data-heatmap-target
      /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
      // 패턴 2: title_link 클래스
      /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="(https:\/\/(?:blog\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
      // 패턴 3: 단순 URL과 제목
      /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([^<]+)</g,
    ];

    for (const pattern of titleLinkPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(searchHtml);
      if (match) {
        topBlogUrl = match[1];
        topBlogTitle = match[2]
          .replace(/<mark>/g, '').replace(/<\/mark>/g, '')
          .replace(/<b>/g, '').replace(/<\/b>/g, '')
          .replace(/<[^>]*>/g, '').trim();
        break;
      }
    }

    // 패턴 매칭 실패 시 → URL만이라도 추출
    if (!topBlogUrl) {
      const urlPattern = /https:\/\/(?:blog\.naver\.com|[a-zA-Z0-9-]+\.tistory\.com|brunch\.co\.kr)\/[^\s"<>]*/g;
      const match = urlPattern.exec(searchHtml);
      if (match && match[0].length > 30) {
        topBlogUrl = match[0];
      }
    }

    if (!topBlogUrl) {
      return jsonResponse({ success: false, keyword, topBlog: null, error: 'No blog found in search results' });
    }

    console.log(`[crawl-top-blog] 1위 블로그 발견: ${topBlogUrl} (${topBlogTitle || '제목 미추출'})`);

    // Step 2: 블로그 본문 크롤링 (모바일 버전 사용 - 인라인 콘텐츠)
    let fetchUrl = topBlogUrl;
    if (topBlogUrl.includes('blog.naver.com')) {
      fetchUrl = topBlogUrl.replace('blog.naver.com', 'm.blog.naver.com');
    }

    const blogResponse = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!blogResponse.ok) {
      return jsonResponse({
        success: true,
        keyword,
        topBlog: { title: topBlogTitle, link: topBlogUrl, bloggername: '', content: '', subtitles: [], charCount: 0, paragraphCount: 0, imageCount: 0 },
        error: 'Blog content fetch failed, returning URL only'
      });
    }

    const blogHtml = await blogResponse.text();

    // Step 3: 본문 파싱
    const parsed = parseBlogContent(blogHtml, topBlogUrl, topBlogTitle);

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

function parseBlogContent(html: string, url: string, fallbackTitle: string) {
  // 제목 추출
  let title = fallbackTitle;
  const titlePatterns = [
    /<meta property="og:title" content="([^"]+)"/,
    /<title>([^<]+)<\/title>/,
    /<h3[^>]*class="[^"]*se_textarea[^"]*"[^>]*>([\s\S]*?)<\/h3>/,
  ];
  for (const p of titlePatterns) {
    const m = p.exec(html);
    if (m) { title = m[1].replace(/<[^>]*>/g, '').trim(); break; }
  }

  // 블로거명 추출
  let bloggername = '';
  const bloggerPatterns = [
    /<meta property="og:author" content="([^"]+)"/,
    /<span[^>]*class="[^"]*nick[^"]*"[^>]*>([^<]+)<\/span>/,
  ];
  for (const p of bloggerPatterns) {
    const m = p.exec(html);
    if (m) { bloggername = m[1].trim(); break; }
  }

  // 본문 영역 추출 (SmartEditor 3 / 구버전)
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

  // 본문이 못 잡히면 전체 body에서 추출
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

  // 텍스트 추출 (태그 제거)
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

  // 문단 수 (p 태그 기준)
  const paragraphCount = (contentArea.match(/<p[^>]*>/g) || []).length || Math.ceil(content.length / 200);

  return {
    title,
    link: url,
    bloggername,
    content: content.substring(0, 3000), // 토큰 절약을 위해 3000자까지만
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
