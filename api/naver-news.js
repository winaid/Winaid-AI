// GET /api/naver-news — 네이버 뉴스 검색 API 프록시
// Ported from functions/api/naver-news.js
// Env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const query = req.query.query;
    const display = req.query.display || '10';

    if (!query) {
      return res.status(400).json({ error: 'query parameter required' });
    }

    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Naver API credentials not configured',
        message: 'NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 설정하세요.',
      });
    }

    const naverUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;

    const response = await fetch(naverUrl, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('네이버 API 오류:', response.status, errorText);
      return res.status(response.status).json({ error: `Naver API error: ${response.status}`, details: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('프록시 오류:', error);
    return res.status(500).json({ error: 'Proxy error', message: error.message });
  }
}
