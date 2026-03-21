// POST /api/naver/keyword-stats — 검색량 + 블로그 발행량 조회
// Ported from functions/api/naver/keyword-stats.ts
// Env: NAVER_SEARCHAD_CUSTOMER_ID, NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET,
//      NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

async function generateSignature(timestamp, method, uri, secret) {
  const message = `${timestamp}.${method}.${uri}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function callSearchAdAPI(keywordParam, env) {
  const customerId = env.NAVER_SEARCHAD_CUSTOMER_ID?.trim();
  const apiKey = env.NAVER_SEARCHAD_API_KEY?.trim();
  const secret = env.NAVER_SEARCHAD_SECRET?.trim();

  const timestamp = String(Date.now());
  const method = 'GET';
  const uri = '/keywordstool';
  const signature = await generateSignature(timestamp, method, uri, secret);
  const fetchUrl = `https://api.searchad.naver.com${uri}?hintKeywords=${keywordParam}&showDetail=1`;

  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: { 'X-Timestamp': timestamp, 'X-API-KEY': apiKey, 'X-Customer': customerId, 'X-Signature': signature },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, errorText };
  }
  return { ok: true, data: await response.json() };
}

function parseKeywordList(data) {
  const result = {};
  for (const item of data.keywordList || []) {
    const pc = item.monthlyPcQcCnt === '< 10' ? 5 : Number(item.monthlyPcQcCnt) || 0;
    const mobile = item.monthlyMobileQcCnt === '< 10' ? 5 : Number(item.monthlyMobileQcCnt) || 0;
    result[item.relKeyword] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
    const noSpace = item.relKeyword.replace(/\s+/g, '');
    if (noSpace !== item.relKeyword) result[noSpace] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
  }
  return result;
}

async function getSearchVolume(keywords, env) {
  const cleanKeywords = keywords.map((k) => k.trim().replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim()).filter((k) => k.length > 0 && k.length <= 50);
  if (cleanKeywords.length === 0) return { data: {}, error: 'hintKeywords: 유효한 키워드 없음' };

  const noSpaceKeywords = cleanKeywords.map((k) => k.replace(/\s+/g, ''));
  const keywordParam = noSpaceKeywords.join(',');

  const result = await callSearchAdAPI(keywordParam, env);
  if (!result.ok) return { data: {}, error: `SearchAd ${result.status}: ${result.errorText?.substring(0, 100)}` };
  return { data: parseKeywordList(result.data) };
}

async function getBlogPostCount(keyword, env) {
  try {
    const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
    const response = await fetch(searchUrl, {
      headers: { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID?.trim(), 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET?.trim() },
    });
    if (!response.ok) return { count: 0, error: `Blog ${response.status}` };
    const data = await response.json();
    return { count: data.total || 0 };
  } catch (e) {
    return { count: 0, error: e.message };
  }
}

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
    const { keywords } = req.body || {};
    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ error: '키워드를 입력해주세요.' });
    }

    const env = {
      NAVER_SEARCHAD_CUSTOMER_ID: process.env.NAVER_SEARCHAD_CUSTOMER_ID,
      NAVER_SEARCHAD_API_KEY: process.env.NAVER_SEARCHAD_API_KEY,
      NAVER_SEARCHAD_SECRET: process.env.NAVER_SEARCHAD_SECRET,
      NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
      NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
    };

    const hasSearchAdKeys = env.NAVER_SEARCHAD_API_KEY && env.NAVER_SEARCHAD_SECRET && env.NAVER_SEARCHAD_CUSTOMER_ID;
    const hasBlogKeys = env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET;

    let allVolumes = {};
    const errors = [];

    if (!hasSearchAdKeys) {
      errors.push('SearchAd API 키가 설정되지 않았습니다. NAVER_SEARCHAD_CUSTOMER_ID, NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET 환경변수를 확인하세요.');
    } else {
      const chunks = [];
      for (let i = 0; i < keywords.length; i += 5) chunks.push(keywords.slice(i, i + 5));
      for (const chunk of chunks) {
        const { data, error } = await getSearchVolume(chunk, env);
        allVolumes = { ...allVolumes, ...data };
        if (error) errors.push(error);
      }
    }

    const blogCountMap = {};
    if (hasBlogKeys) {
      const blogChunks = [];
      for (let i = 0; i < keywords.length; i += 3) blogChunks.push(keywords.slice(i, i + 3));
      for (let ci = 0; ci < blogChunks.length; ci++) {
        if (ci > 0) await new Promise((r) => setTimeout(r, 200));
        const results = await Promise.all(
          blogChunks[ci].map(async (kw) => {
            const { count, error } = await getBlogPostCount(kw, env);
            if (error) errors.push(`${kw}: ${error}`);
            return { keyword: kw, blogCount: count };
          })
        );
        for (const { keyword, blogCount } of results) blogCountMap[keyword] = blogCount;
      }
    } else {
      errors.push('블로그 API 키 미설정 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)');
    }

    const results = keywords.map((kw) => {
      const vol = allVolumes[kw] || allVolumes[kw.replace(/\s+/g, '')];
      const pc = vol?.monthlyPcQcCnt || 0;
      const mobile = vol?.monthlyMobileQcCnt || 0;
      return { keyword: kw, monthlySearchVolume: pc + mobile, monthlyPcVolume: pc, monthlyMobileVolume: mobile, blogPostCount: blogCountMap[kw] || 0 };
    });

    const responseBody = { results };
    if (errors.length > 0) responseBody.apiErrors = [...new Set(errors)];

    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('[keyword-stats] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
