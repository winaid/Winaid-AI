// POST /api/naver/crawl-search — 네이버 검색 결과 크롤링 (API 키 불필요)
// Ported from functions/api/naver/crawl-search.ts

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { query, maxResults = 100, includeCafe = true } = req.body || {};
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const formatNaverDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const startDate = formatNaverDate(sixMonthsAgo);
    const endDate = formatNaverDate(today);

    console.log('🔍 네이버 검색 크롤링:', query, '(최대', maxResults, '개, 카페 포함:', includeCafe, ')');

    const blogUrls = [];
    const searchSources = [{ where: 'blog', label: '블로그' }];
    if (includeCafe) searchSources.push({ where: 'cafearticle', label: '카페' });
    const perSourceMax = includeCafe ? Math.ceil(maxResults / 2) : maxResults;

    for (const source of searchSources) {
      const pagesNeeded = Math.ceil(perSourceMax / 10);
      const sourceResults = [];

      for (let page = 1; page <= Math.min(pagesNeeded, 10); page++) {
        const start = (page - 1) * 10 + 1;
        const exactQuery = `"${query}"`;
        const searchUrl = `https://search.naver.com/search.naver?where=${source.where}&query=${encodeURIComponent(exactQuery)}&start=${start}&sm=tab_opt&nso=so:sim,p:from${startDate}to${endDate}`;

        try {
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            },
          });

          if (!response.ok) { console.error('❌ 네이버 검색 페이지 요청 실패:', response.status); break; }
          const html = await response.text();
          const pageResults = [];

          // URL 추출
          const urlPattern = /https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|[a-zA-Z0-9-]+\.tistory\.com|brunch\.co\.kr)\/[^\s"<>]*/g;
          const foundUrls = [];
          let match;
          while ((match = urlPattern.exec(html)) !== null) {
            const url = match[0];
            if (!foundUrls.includes(url) && url.length > 30) foundUrls.push(url);
          }

          // 제목+URL 추출
          const titleLinkPatterns = [
            /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
            /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
            /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([^<]+)</g,
          ];
          for (const pattern of titleLinkPatterns) {
            pattern.lastIndex = 0;
            while ((match = pattern.exec(html)) !== null) {
              let title = match[2].replace(/<mark>/g, '').replace(/<\/mark>/g, '').replace(/<b>/g, '').replace(/<\/b>/g, '').replace(/<[^>]*>/g, '').trim();
              if (title && match[1] && !pageResults.find((r) => r.link === match[1])) {
                pageResults.push({ title, link: match[1], description: '', bloggername: '' });
              }
            }
          }

          // URL만 발견된 것에 기본 제목
          const defaultTitle = source.where === 'cafearticle' ? '네이버 카페' : '네이버 블로그';
          for (const url of foundUrls) {
            if (!pageResults.find((r) => r.link === url)) {
              pageResults.push({ title: defaultTitle, link: url, description: '', bloggername: '', source: source.where === 'cafearticle' ? 'cafe' : 'blog' });
            }
          }

          // 설명 추출
          const descPatterns = [
            /<span[^>]*class="[^"]*sds-comps-text[^"]*body1[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
            /<a[^>]*class="[^"]*dsc_link[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
            /<div[^>]*class="[^"]*api_txt_lines[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
          ];
          const descriptions = [];
          for (const pattern of descPatterns) {
            pattern.lastIndex = 0;
            while ((match = pattern.exec(html)) !== null) {
              const desc = match[1].replace(/<mark>/g, '').replace(/<\/mark>/g, '').replace(/<[^>]*>/g, '').trim();
              if (desc.length > 20) descriptions.push(desc);
            }
          }
          for (let i = 0; i < pageResults.length && i < descriptions.length; i++) {
            if (!pageResults[i].description) pageResults[i].description = descriptions[i];
          }

          // 블로거 이름 추출
          const bloggerPatterns = [
            /<span[^>]*profile-info-title-text[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>[\s\S]*?<\/span>/g,
            /<span[^>]*class="[^"]*name[^"]*"[^>]*>(.*?)<\/span>/g,
          ];
          const bloggers = [];
          for (const pattern of bloggerPatterns) {
            pattern.lastIndex = 0;
            while ((match = pattern.exec(html)) !== null) {
              const blogger = match[1].replace(/<[^>]*>/g, '').trim();
              if (blogger) bloggers.push(blogger);
            }
          }
          for (let i = 0; i < pageResults.length && i < bloggers.length; i++) {
            if (!pageResults[i].bloggername) pageResults[i].bloggername = bloggers[i];
          }

          for (const result of pageResults) {
            if (!result.bloggername) result.bloggername = source.where === 'cafearticle' ? '카페 작성자' : '블로거';
            if (!result.description) result.description = result.title;
            if (!result.source) result.source = source.where === 'cafearticle' ? 'cafe' : 'blog';
          }

          console.log(`✅ [${source.label}] 페이지 ${page}: ${pageResults.length}개 발견`);
          sourceResults.push(...pageResults);
          if (sourceResults.length >= perSourceMax || pageResults.length === 0) break;
          if (page < pagesNeeded) await new Promise((r) => setTimeout(r, 1000));
        } catch (error) {
          console.error(`❌ [${source.label}] 페이지 ${page} 크롤링 에러:`, error);
          break;
        }
      }
      blogUrls.push(...sourceResults);
    }

    // 중복 제거
    const uniqueUrls = new Map();
    for (const item of blogUrls) {
      if (!uniqueUrls.has(item.link)) uniqueUrls.set(item.link, item);
    }
    const dedupedResults = Array.from(uniqueUrls.values());

    console.log(`📊 총 ${dedupedResults.length}개 URL 추출 (블로그+카페, 중복 제거 후)`);

    return res.status(200).json({
      items: dedupedResults.slice(0, maxResults),
      total: dedupedResults.length,
    });
  } catch (error) {
    console.error('네이버 검색 크롤링 에러:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
