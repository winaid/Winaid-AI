// POST /api/google/search — Google Custom Search JSON API
// Ported from functions/api/google/search.ts
// Env: GOOGLE_API_KEY, GOOGLE_SEARCH_ENGINE_ID

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
    const { q, num = 10, start = 1 } = req.body || {};
    if (!q) return res.status(400).json({ error: 'Query is required' });

    const API_KEY = process.env.GOOGLE_API_KEY;
    const CX = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!API_KEY || !CX) {
      return res.status(500).json({ error: 'Google API credentials not configured. GOOGLE_API_KEY, GOOGLE_SEARCH_ENGINE_ID 환경변수를 설정하세요.' });
    }

    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('key', API_KEY);
    searchUrl.searchParams.append('cx', CX);
    searchUrl.searchParams.append('q', q);
    searchUrl.searchParams.append('num', Math.min(num, 10).toString());
    searchUrl.searchParams.append('start', start.toString());

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Google Search API Error:', errorData);
      return res.status(response.status).json({ error: 'Google Search API failed', details: errorData });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Google Search Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
