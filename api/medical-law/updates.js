// GET /api/medical-law/updates — 의료광고법 관련 최신 뉴스 확인
// Ported from functions/api/medical-law/updates.ts

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function extractMedicalAdNews(html) {
  const news = [];
  const medicalAdKeywords = ['의료광고', '의료법', '불법광고', '불법 광고', '의료기관 광고', '의료광고법'];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = rowHtml.match(/<a\s+href=["']([^"']*list_no=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const title = linkMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const dateMatch = rowHtml.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const isRelevant = medicalAdKeywords.some((kw) => title.includes(kw));
    if (!isRelevant) continue;

    const url = href.startsWith('http') ? href : `https://www.mohw.go.kr${href.startsWith('/') ? '' : '/'}${href}`;
    news.push({ date: dateMatch[1], title, url, summary: `${dateMatch[1]} 보건복지부 보도자료: ${title}` });
  }

  news.sort((a, b) => b.date.localeCompare(a.date));
  return news.slice(0, 10);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    console.log('📰 의료광고법 업데이트 확인 중...');
    const mohwNewsUrl = 'https://www.mohw.go.kr/board.es?mid=a10503000000&bid=0027';

    const response = await fetch(mohwNewsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedicalLawBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn('⚠️ 보건복지부 사이트 접근 실패');
      return res.status(200).json({ hasUpdates: false, recentNews: [] });
    }

    const html = await response.text();
    const newsItems = extractMedicalAdNews(html);

    console.log('✅ 업데이트 확인 완료:', newsItems.length, '개 뉴스');

    return res.status(200).json({
      hasUpdates: newsItems.length > 0,
      latestUpdate: newsItems.length > 0 ? newsItems[0] : undefined,
      recentNews: newsItems.slice(0, 5),
    });
  } catch (error) {
    console.error('❌ 업데이트 확인 실패:', error);
    return res.status(200).json({ hasUpdates: false, recentNews: [] });
  }
}
