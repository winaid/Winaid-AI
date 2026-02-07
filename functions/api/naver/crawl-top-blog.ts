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

    // 디버깅: 검색 결과 HTML 분석
    console.log(`[crawl-top-blog] HTML 길이: ${searchHtml.length}`);
    console.log(`[crawl-top-blog] HTML 시작 500자: ${searchHtml.substring(0, 500)}`);

    // HTML에서 href 속성이 포함된 모든 URL 패턴 확인
    const allHrefs = searchHtml.match(/href="([^"]+)"/g) || [];
    const blogHrefs = allHrefs.filter(h => h.includes('blog.naver.com') || h.includes('tistory.com'));
    console.log(`[crawl-top-blog] 전체 href: ${allHrefs.length}개, 블로그 href: ${blogHrefs.length}개`);
    if (blogHrefs.length > 0) {
      console.log(`[crawl-top-blog] 블로그 href 샘플:`, blogHrefs.slice(0, 3));
    }

    // 블로그 URL 추출 - 여러 전략 시도
    let topBlogUrl: string | null = null;
    let topBlogTitle = '';

    // 전략 1: 제목+링크 패턴 (crawl-search.ts와 동일)
    const titleLinkPatterns = [
      /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
      /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="(https:\/\/(?:blog\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
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
        console.log(`[crawl-top-blog] 전략1 성공: ${topBlogUrl}`);
        break;
      }
    }

    // 전략 2: URL만 추출 (패턴 매칭 실패 시)
    if (!topBlogUrl) {
      const urlPattern = /https:\/\/(?:blog\.naver\.com|[a-zA-Z0-9-]+\.tistory\.com|brunch\.co\.kr)\/[^\s"<>']*/g;
      const match = urlPattern.exec(searchHtml);
      if (match && match[0].length > 30) {
        topBlogUrl = match[0];
        console.log(`[crawl-top-blog] 전략2 성공: ${topBlogUrl}`);
      }
    }

    // 전략 3: href에서 blog URL 추출 (인코딩된 URL 포함)
    if (!topBlogUrl) {
      for (const href of allHrefs) {
        const decoded = decodeURIComponent(href);
        const blogMatch = decoded.match(/(https:\/\/blog\.naver\.com\/[^\s"<>'&]+)/);
        if (blogMatch) {
          topBlogUrl = blogMatch[1];
          console.log(`[crawl-top-blog] 전략3 성공 (디코딩): ${topBlogUrl}`);
          break;
        }
      }
    }

    if (!topBlogUrl) {
      // 디버깅: 실패 시 HTML 중간 부분도 로그
      console.log(`[crawl-top-blog] URL 추출 실패. HTML 중간 500자: ${searchHtml.substring(Math.floor(searchHtml.length / 2), Math.floor(searchHtml.length / 2) + 500)}`);
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
