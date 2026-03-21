// POST /api/naver/crawl-top-blog — 1위 블로그 본문 크롤링 + 구조 분석
// Ported from functions/api/naver/crawl-top-blog.ts

async function searchForTopBlog(keyword) {
  try {
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&start=1&sm=tab_opt&nso=so:sim,p:from${formatDate(sixMonthsAgo)}to${formatDate(today)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const urlPattern = /https:\/\/(?:blog\.naver\.com|m\.blog\.naver\.com)\/[^\s"<>']*/g;
    const foundUrls = [];
    let match;
    while ((match = urlPattern.exec(html)) !== null) {
      let url = match[0].replace(/[&;].*$/, '');
      if (!foundUrls.includes(url) && url.length > 30 && /\/\d+/.test(url)) foundUrls.push(url);
    }
    const tistoryPattern = /https:\/\/[a-zA-Z0-9-]+\.tistory\.com\/\d+/g;
    while ((match = tistoryPattern.exec(html)) !== null) {
      if (!foundUrls.includes(match[0])) foundUrls.push(match[0]);
    }

    if (foundUrls.length > 0) {
      let title = '';
      const titlePatterns = [
        /<a[^>]*href="[^"]*"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
        /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
      ];
      for (const p of titlePatterns) { const m = p.exec(html); if (m) { title = m[1].replace(/<[^>]*>/g, '').trim(); break; } }
      return { url: foundUrls[0].replace('m.blog.naver.com', 'blog.naver.com'), title, blogger: '' };
    }
    return null;
  } catch (e) {
    console.error('[crawl-top-blog] 검색 에러:', e);
    return null;
  }
}

function parseBlogContent(html, url, fallbackTitle, fallbackBlogger) {
  let title = fallbackTitle;
  for (const p of [/<meta property="og:title" content="([^"]+)"/, /<title>([^<]+)<\/title>/]) {
    const m = p.exec(html);
    if (m) { title = m[1].replace(/<[^>]*>/g, '').trim(); break; }
  }

  let bloggername = fallbackBlogger;
  if (!bloggername) {
    for (const p of [/<meta property="og:author" content="([^"]+)"/, /<span[^>]*class="[^"]*nick[^"]*"[^>]*>([^<]+)<\/span>/]) {
      const m = p.exec(html);
      if (m) { bloggername = m[1].trim(); break; }
    }
  }

  let contentArea = '';
  for (const p of [
    /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/,
    /<div[^>]*id="postViewArea"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*post_ct[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  ]) {
    const m = p.exec(html);
    if (m) { contentArea = m[1]; break; }
  }

  if (!contentArea || contentArea.length < 100) {
    const paragraphPattern = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
    const paragraphs = [];
    let m;
    while ((m = paragraphPattern.exec(html)) !== null) paragraphs.push(m[1]);
    if (paragraphs.length > 0) contentArea = paragraphs.join('\n');
  }

  if (!contentArea) { const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html); contentArea = bodyMatch ? bodyMatch[1] : html; }

  const subtitles = [];
  const subtitlePatterns = [
    /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g,
    /<strong[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/strong>/g,
    /<span[^>]*style="[^"]*font-size:\s*(1[8-9]|[2-9][0-9]|[1-9][0-9]{2,})px[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
  ];
  for (const pattern of subtitlePatterns) {
    let m;
    while ((m = pattern.exec(contentArea)) !== null) {
      const sub = (m[2] || m[1]).replace(/<[^>]*>/g, '').trim();
      if (sub.length > 2 && sub.length < 100 && !subtitles.includes(sub)) subtitles.push(sub);
    }
  }

  const imageCount = (contentArea.match(/<img[^>]*>/g) || []).length;
  const content = contentArea
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  const paragraphCount = (contentArea.match(/<p[^>]*>/g) || []).length || Math.ceil(content.length / 200);

  return {
    title, link: url, bloggername,
    content: content.substring(0, 3000),
    subtitles, charCount: content.replace(/\s/g, '').length,
    paragraphCount, imageCount,
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { keyword, url } = req.body || {};
    if (!keyword && !url) return res.status(400).json({ success: false, error: 'keyword or url is required' });

    let targetUrl = url || '';
    let topBlogTitle = '';
    let topBloggerName = '';

    if (!targetUrl && keyword) {
      console.log(`[crawl-top-blog] 키워드 "${keyword}" 검색으로 1위 블로그 찾기`);
      const searchResult = await searchForTopBlog(keyword);
      if (searchResult) { targetUrl = searchResult.url; topBlogTitle = searchResult.title; topBloggerName = searchResult.blogger; }
    }

    if (!targetUrl) {
      return res.status(200).json({ success: false, keyword: keyword || '', topBlog: null, error: 'No blog URL found' });
    }

    let fetchUrl = targetUrl;
    const naverBlogMatch = targetUrl.match(/https:\/\/(?:m\.)?blog\.naver\.com\/([^\/]+)\/(\d+)/);
    if (naverBlogMatch) {
      const [, blogId, logNo] = naverBlogMatch;
      fetchUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
    }

    const blogResponse = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: 'https://blog.naver.com/',
      },
    });

    if (!blogResponse.ok) {
      return res.status(200).json({
        success: true, keyword: keyword || '',
        topBlog: { title: topBlogTitle, link: targetUrl, bloggername: topBloggerName, content: '', subtitles: [], charCount: 0, paragraphCount: 0, imageCount: 0 },
        error: 'Blog content fetch failed, returning URL only',
      });
    }

    const blogHtml = await blogResponse.text();
    const parsed = parseBlogContent(blogHtml, targetUrl, topBlogTitle, topBloggerName);

    console.log(`[crawl-top-blog] 분석 완료 - ${parsed.charCount}자, 소제목 ${parsed.subtitles.length}개, 이미지 ${parsed.imageCount}개`);

    return res.status(200).json({ success: true, keyword: keyword || '', topBlog: parsed });
  } catch (error) {
    console.error('[crawl-top-blog] 에러:', error);
    return res.status(500).json({ success: false, keyword: '', topBlog: null, error: error.message });
  }
}
