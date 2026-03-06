/**
 * 네이버 검색광고 API - 키워드 검색량 + 블로그 발행량 조회
 *
 * 1) 검색광고 API (keywordstool) -> 월간 검색량 (PC + Mobile)
 * 2) 네이버 블로그 검색 API -> 블로그 누적 발행량 (total)
 */

interface Env {
  NAVER_SEARCHAD_CUSTOMER_ID: string;
  NAVER_SEARCHAD_API_KEY: string;
  NAVER_SEARCHAD_SECRET: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
}

async function generateSignature(timestamp: string, method: string, uri: string, secret: string): Promise<string> {
  const message = `${timestamp}.${method}.${uri}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function getSearchVolume(
  keywords: string[],
  env: Env
): Promise<Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }>> {
  const timestamp = String(Date.now());
  const method = 'GET';
  const uri = '/keywordstool';
  const signature = await generateSignature(timestamp, method, uri, env.NAVER_SEARCHAD_SECRET);

  // hintKeywords: 각 키워드를 개행(\n)으로 구분
  const params = new URLSearchParams({
    hintKeywords: keywords.join('\n'),
    showDetail: '1',
  });

  const url = `https://api.searchad.naver.com${uri}?${params.toString()}`;
  console.log('[SearchAd] Request URL:', url.substring(0, 200));
  console.log('[SearchAd] Customer ID:', env.NAVER_SEARCHAD_CUSTOMER_ID?.substring(0, 5) + '...');
  console.log('[SearchAd] API Key exists:', !!env.NAVER_SEARCHAD_API_KEY);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': env.NAVER_SEARCHAD_API_KEY,
      'X-Customer': env.NAVER_SEARCHAD_CUSTOMER_ID,
      'X-Signature': signature,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SearchAd] API error:', response.status, errorText);
    throw new Error(`검색광고 API 오류: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    keywordList: Array<{
      relKeyword: string;
      monthlyPcQcCnt: number | string;
      monthlyMobileQcCnt: number | string;
    }>;
  };

  console.log('[SearchAd] Got', data.keywordList?.length || 0, 'keywords');

  const result: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
  for (const item of data.keywordList || []) {
    const pc = item.monthlyPcQcCnt === '< 10' ? 5 : Number(item.monthlyPcQcCnt) || 0;
    const mobile = item.monthlyMobileQcCnt === '< 10' ? 5 : Number(item.monthlyMobileQcCnt) || 0;
    result[item.relKeyword] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
  }
  return result;
}

async function getBlogPostCount(keyword: string, env: Env): Promise<number> {
  const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
  const response = await fetch(searchUrl, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
    },
  });

  if (!response.ok) return 0;
  const data = await response.json() as { total: number };
  return data.total || 0;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { keywords } = await context.request.json() as { keywords: string[] };

    if (!keywords || keywords.length === 0) {
      return new Response(JSON.stringify({ error: '키워드를 입력해주세요.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hasSearchAdKeys = context.env.NAVER_SEARCHAD_API_KEY && context.env.NAVER_SEARCHAD_SECRET && context.env.NAVER_SEARCHAD_CUSTOMER_ID;
    const hasBlogKeys = context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET;

    console.log('[keyword-stats] SearchAd keys:', hasSearchAdKeys ? 'OK' : 'MISSING');
    console.log('[keyword-stats] Blog keys:', hasBlogKeys ? 'OK' : 'MISSING');
    console.log('[keyword-stats] Keywords count:', keywords.length);

    // 1) 검색량 조회 (5개씩 분할)
    let allVolumes: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};

    if (hasSearchAdKeys) {
      const chunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 5) {
        chunks.push(keywords.slice(i, i + 5));
      }

      for (const chunk of chunks) {
        try {
          const volumes = await getSearchVolume(chunk, context.env);
          allVolumes = { ...allVolumes, ...volumes };
        } catch (e: any) {
          console.error('[keyword-stats] SearchAd chunk error:', e.message);
          // 한 청크 실패해도 계속 진행
        }
      }
    }

    // 2) 블로그 발행량 조회 (병렬, 최대 10개씩)
    const blogCountMap: Record<string, number> = {};

    if (hasBlogKeys) {
      const blogChunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 10) {
        blogChunks.push(keywords.slice(i, i + 10));
      }

      for (const chunk of blogChunks) {
        const results = await Promise.all(
          chunk.map(async (kw) => {
            const count = await getBlogPostCount(kw, context.env);
            return { keyword: kw, blogCount: count };
          })
        );
        for (const { keyword, blogCount } of results) {
          blogCountMap[keyword] = blogCount;
        }
      }
    }

    // 3) 결합
    const results = keywords.map((kw) => {
      const vol = allVolumes[kw];
      const pc = vol?.monthlyPcQcCnt || 0;
      const mobile = vol?.monthlyMobileQcCnt || 0;
      return {
        keyword: kw,
        monthlySearchVolume: pc + mobile,
        monthlyPcVolume: pc,
        monthlyMobileVolume: mobile,
        blogPostCount: blogCountMap[kw] || 0,
      };
    });

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('[keyword-stats] Error:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
