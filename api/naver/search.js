// POST /api/naver/search — 네이버 블로그 검색 API 프록시
// Ported from functions/api/naver/search.ts
// Env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { query, display = 10 } = req.body || {};

    if (!query) {
      return res.status(400).json({ error: '검색어를 입력해주세요.' });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 확인하세요.' });
    }

    const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;

    const response = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`네이버 API 오류: ${response.status}`);
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error('네이버 검색 오류:', error);
    return res.status(500).json({ error: error.message });
  }
}
