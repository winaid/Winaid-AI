// POST /api/web-search/search — Google Custom Search (web-search variant)
// Ported from functions/api/web-search/search.ts
// Env: GOOGLE_API_KEY, GOOGLE_SEARCH_ENGINE_ID
// NOTE: Functionally near-identical to /api/google/search but uses {query,num} params instead of {q,num,start}

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
    const { query, num = 10 } = req.body || {};
    if (!query) return res.status(400).json({ error: '검색어를 입력해주세요.' });

    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
      return res.status(500).json({
        error: '구글 API 키가 설정되지 않았습니다.',
        details: {
          GOOGLE_API_KEY: apiKey ? '설정됨' : '없음',
          GOOGLE_SEARCH_ENGINE_ID: searchEngineId ? '설정됨' : '없음',
        },
      });
    }

    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${num}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('구글 API 오류:', response.status, errorText);
      return res.status(500).json({ error: `구글 API 오류: ${response.status}`, details: errorText, query });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error('구글 검색 오류:', error);
    return res.status(500).json({ error: error.message });
  }
}
