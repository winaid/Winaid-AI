/**
 * 네이버 블로그 검색 → 1위 블로그 URL 추출 → 본문 크롤링
 * 경쟁 블로그 분석용 API
 *
 * PC 블로그탭(where=blog)은 2026년 기준 완전 CSR이라 fetch로 URL 추출 불가.
 * 전략:
 *  1) 모바일 블로그 검색(m.search.naver.com) - 모바일은 SSR 가능성
 *  2) script 태그 내 JSON 데이터 파싱
 *  3) PC 검색 HTML 내 인코딩/이스케이프된 URL 탐색
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

    // ===== 1위 블로그 URL 찾기 (다중 전략) =====
    let topBlogUrl: string | null = null;
    let topBlogTitle = '';

    // 전략 A: 모바일 블로그 검색 (SSR 기대)
    topBlogUrl = await tryMobileSearch(keyword);
    if (topBlogUrl) {
      console.log(`[crawl-top-blog] 전략A(모바일) 성공: ${topBlogUrl}`);
    }

    // 전략 B: PC 블로그 검색 → script 태그 내 JSON 파싱
    if (!topBlogUrl) {
      const pcResult = await tryPcSearchWithJsonParsing(keyword);
      if (pcResult) {
        topBlogUrl = pcResult.url;
        topBlogTitle = pcResult.title;
        console.log(`[crawl-top-blog] 전략B(PC JSON) 성공: ${topBlogUrl}`);
      }
    }

    // 전략 C: PC 블로그 검색 → 모든 가능한 URL 패턴 탐색
    if (!topBlogUrl) {
      const pcHtml = await fetchPcSearchHtml(keyword);
      if (pcHtml) {
        const extracted = extractBlogUrlFromHtml(pcHtml);
        if (extracted) {
          topBlogUrl = extracted.url;
          topBlogTitle = extracted.title || '';
          console.log(`[crawl-top-blog] 전략C(PC 패턴) 성공: ${topBlogUrl}`);
        } else {
          // 디버그 정보 반환
          const debugInfo = buildDebugInfo(pcHtml);
          return jsonResponse({
            success: false, keyword, topBlog: null,
            error: 'No blog found in search results',
            _debug: debugInfo
          } as any);
        }
      }
    }

    if (!topBlogUrl) {
      return jsonResponse({ success: false, keyword, topBlog: null, error: 'All search strategies failed' });
    }

    // ===== 블로그 본문 크롤링 =====
    console.log(`[crawl-top-blog] 1위 블로그 본문 크롤링: ${topBlogUrl}`);

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
        topBlog: { title: topBlogTitle, link: topBlogUrl, bloggername: '', content: '', subtitles: [], charCount: 0, paragraphCount: 0, imageCount: 0 },
        error: 'Blog content fetch failed, returning URL only'
      });
    }

    const blogHtml = await blogResponse.text();
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

// ===== 전략 A: 모바일 블로그 검색 =====
async function tryMobileSearch(keyword: string): Promise<string | null> {
  try {
    const url = `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(keyword)}&sm=mtb_opt&sortby=sim`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) return null;
    const html = await response.text();

    // 모바일 검색 결과에서 블로그 URL 추출
    const patterns = [
      // 직접 블로그 URL
      /href="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
      // 티스토리
      /href="(https:\/\/[a-zA-Z0-9-]+\.tistory\.com\/[^"]+)"/,
      // data-url 속성
      /data-url="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
      // JSON 내 URL
      /"link"\s*:\s*"(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
      /"url"\s*:\s*"(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
      // 일반 URL 패턴 (HTML 어딘가)
      /(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^\s"<>'\\]{10,})/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match) {
        let blogUrl = match[1];
        // 모바일 URL을 PC URL로 정규화
        blogUrl = blogUrl.replace('m.blog.naver.com', 'blog.naver.com');
        return blogUrl;
      }
    }

    console.log(`[crawl-top-blog] 모바일: blog URL 미발견 (HTML ${html.length}자)`);
    return null;
  } catch (e) {
    console.error('[crawl-top-blog] 모바일 검색 에러:', e);
    return null;
  }
}

// ===== 전략 B: PC 검색 → script 태그 내 JSON 파싱 =====
async function tryPcSearchWithJsonParsing(keyword: string): Promise<{ url: string; title: string } | null> {
  try {
    const html = await fetchPcSearchHtml(keyword);
    if (!html) return null;

    // script 태그 안에 JSON 형태로 블로그 데이터가 있는지 탐색
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];

    for (const block of scriptBlocks) {
      const content = block.replace(/<\/?script[^>]*>/gi, '');

      // blog.naver.com URL이 JSON 값으로 포함된 경우
      const jsonUrlPatterns = [
        /"(?:url|link|blogUrl|postUrl|href)"\s*:\s*"(https?:\/\/blog\.naver\.com\/[^"]+)"/,
        /"(?:url|link|blogUrl|postUrl|href)"\s*:\s*"(https?:\/\/[a-zA-Z0-9-]+\.tistory\.com\/[^"]+)"/,
        // 이스케이프된 URL: https:\/\/blog.naver.com\/...
        /https?:\\\/\\\/blog\.naver\.com\\\/[^"'\s\\]+/,
        // unicode escaped
        /https?:\/\/blog\u002enaver\u002ecom\/[^"'\s]+/,
      ];

      for (const pattern of jsonUrlPatterns) {
        const match = pattern.exec(content);
        if (match) {
          let url = match[1] || match[0];
          // 이스케이프 해제
          url = url.replace(/\\\//g, '/');
          // 제목 추출 시도 (같은 JSON 객체에서)
          const titleMatch = content.substring(Math.max(0, (match.index || 0) - 300), (match.index || 0) + 300)
            .match(/"(?:title|blogTitle|postTitle)"\s*:\s*"([^"]+)"/);
          return {
            url,
            title: titleMatch ? titleMatch[1].replace(/\\u[\dA-Fa-f]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16))) : '',
          };
        }
      }
    }

    return null;
  } catch (e) {
    console.error('[crawl-top-blog] PC JSON 파싱 에러:', e);
    return null;
  }
}

// ===== 전략 C: PC HTML에서 모든 가능한 URL 패턴 추출 =====
function extractBlogUrlFromHtml(html: string): { url: string; title?: string } | null {
  // 1. href 속성에서 직접 추출
  const hrefPatterns = [
    /href="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com|[a-zA-Z0-9-]+\.tistory\.com|brunch\.co\.kr)\/[^"]+)"/,
    /data-url="(https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^"]+)"/,
  ];
  for (const p of hrefPatterns) {
    const m = p.exec(html);
    if (m) return { url: m[1].replace('m.blog.naver.com', 'blog.naver.com') };
  }

  // 2. HTML 전체에서 블로그 URL 문자열 탐색 (어디든)
  const rawPatterns = [
    /(https:\/\/blog\.naver\.com\/[a-zA-Z0-9_-]+\/\d+)/,
    /(https:\/\/blog\.naver\.com\/PostView\.naver\?blogId=[^&"'\s]+&logNo=\d+)/,
    /(https:\/\/blog\.naver\.com\/[a-zA-Z0-9_-]+)/,
    /(https:\/\/[a-zA-Z0-9-]+\.tistory\.com\/\d+)/,
  ];
  for (const p of rawPatterns) {
    const m = p.exec(html);
    if (m) return { url: m[1] };
  }

  // 3. 이스케이프된 URL (\/ → /)
  const escapedMatch = html.match(/https?:\\\/\\\/blog\.naver\.com\\\/[^"'\s\\]+/);
  if (escapedMatch) {
    return { url: escapedMatch[0].replace(/\\\//g, '/') };
  }

  return null;
}

// ===== 유틸리티 함수들 =====
let _cachedPcHtml: string | null = null;

async function fetchPcSearchHtml(keyword: string): Promise<string | null> {
  if (_cachedPcHtml) return _cachedPcHtml;
  try {
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so:sim`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!response.ok) return null;
    _cachedPcHtml = await response.text();
    return _cachedPcHtml;
  } catch (e) {
    return null;
  }
}

function buildDebugInfo(html: string) {
  const allHrefs = html.match(/href="([^"]+)"/g) || [];

  // blog 관련 문자열 탐색 (어디든)
  const blogAny: string[] = [];
  const blogAnyRegex = /.{0,60}blog[._]naver.{0,60}/gi;
  let m;
  while ((m = blogAnyRegex.exec(html)) !== null && blogAny.length < 5) {
    blogAny.push(m[0].substring(0, 120));
  }

  // script 태그 내 URL 패턴
  const scriptUrls: string[] = [];
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const s of scripts) {
    const urlMatch = s.match(/blog\.naver\.com|tistory\.com|brunch\.co\.kr/);
    if (urlMatch) {
      const idx = s.indexOf(urlMatch[0]);
      scriptUrls.push(s.substring(Math.max(0, idx - 40), idx + 80));
    }
  }

  return {
    htmlLength: html.length,
    totalHrefs: allHrefs.length,
    hrefSamples: allHrefs.slice(0, 10),
    blogAnyMentions: blogAny,
    scriptBlogUrls: scriptUrls,
    hasBlogInHtml: html.includes('blog.naver.com'),
    hasBlogEscaped: html.includes('blog\\.naver\\.com') || html.includes('blog\\/naver'),
  };
}

function parseBlogContent(html: string, url: string, fallbackTitle: string) {
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

  let bloggername = '';
  const bloggerPatterns = [
    /<meta property="og:author" content="([^"]+)"/,
    /<span[^>]*class="[^"]*nick[^"]*"[^>]*>([^<]+)<\/span>/,
  ];
  for (const p of bloggerPatterns) {
    const m = p.exec(html);
    if (m) { bloggername = m[1].trim(); break; }
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
