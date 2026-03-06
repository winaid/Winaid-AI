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

async function callSearchAdAPI(
  keywordParam: string,
  env: Env
): Promise<{ ok: boolean; data?: any; status?: number; errorText?: string }> {
  const customerId = env.NAVER_SEARCHAD_CUSTOMER_ID?.trim();
  const apiKey = env.NAVER_SEARCHAD_API_KEY?.trim();
  const secret = env.NAVER_SEARCHAD_SECRET?.trim();

  const timestamp = String(Date.now());
  const method = 'GET';
  const uri = '/keywordstool';
  const signature = await generateSignature(timestamp, method, uri, secret);

  const fetchUrl = `https://api.searchad.naver.com${uri}?hintKeywords=${keywordParam}&showDetail=1`;
  console.log('[SearchAd v7] URL:', fetchUrl.substring(0, 300));

  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': signature,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, errorText };
  }

  const data = await response.json();
  return { ok: true, data };
}

function parseKeywordList(data: any): Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> {
  const result: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
  for (const item of data.keywordList || []) {
    const pc = item.monthlyPcQcCnt === '< 10' ? 5 : Number(item.monthlyPcQcCnt) || 0;
    const mobile = item.monthlyMobileQcCnt === '< 10' ? 5 : Number(item.monthlyMobileQcCnt) || 0;
    result[item.relKeyword] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
    // 공백 제거 버전도 저장
    const noSpace = item.relKeyword.replace(/\s+/g, '');
    if (noSpace !== item.relKeyword) {
      result[noSpace] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
    }
  }
  return result;
}

async function getSearchVolume(
  keywords: string[],
  env: Env
): Promise<{ data: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }>; error?: string }> {
  // 키워드 정제: 한글, 영문, 숫자, 공백만 허용
  const cleanKeywords = keywords
    .map(k => k.trim().replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim())
    .filter(k => k.length > 0 && k.length <= 50);

  if (cleanKeywords.length === 0) {
    return { data: {}, error: 'hintKeywords: 유효한 키워드 없음' };
  }

  // 방법1: encodeURIComponent로 완전 인코딩 (순수 ASCII URL)
  const encodedParam = cleanKeywords.map(k => encodeURIComponent(k)).join(',');
  console.log('[SearchAd v7] 시도1: encodeURIComponent');
  const result1 = await callSearchAdAPI(encodedParam, env);

  if (result1.ok) {
    console.log('[SearchAd v7] 시도1 성공!');
    return { data: parseKeywordList(result1.data) };
  }

  console.log('[SearchAd v7] 시도1 실패:', result1.status, '시도2: 키워드별 개별 조회');

  // 방법2: 키워드를 1개씩 개별 조회 (공백 없는 버전)
  const allResult: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
  const errors: string[] = [];

  for (const kw of cleanKeywords) {
    // 공백 없는 버전으로 시도
    const noSpaceKw = kw.replace(/\s+/g, '');
    const result = await callSearchAdAPI(noSpaceKw, env);

    if (result.ok) {
      const parsed = parseKeywordList(result.data);
      Object.assign(allResult, parsed);
    } else {
      errors.push(`${kw}: ${result.status}`);
    }
  }

  if (Object.keys(allResult).length > 0) {
    return { data: allResult, error: errors.length > 0 ? errors.join('; ') : undefined };
  }

  return {
    data: {},
    error: `SearchAd 모든 방법 실패. 시도1: ${result1.status} ${result1.errorText?.substring(0, 100)}`,
  };
}

async function getBlogPostCount(keyword: string, env: Env): Promise<number> {
  const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
  const response = await fetch(searchUrl, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID?.trim(),
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET?.trim(),
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

    // 1) 검색량 조회 (5개씩 분할)
    let allVolumes: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
    const errors: string[] = [];

    if (!hasSearchAdKeys) {
      errors.push('SearchAd API 키가 설정되지 않았습니다. (NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET, NAVER_SEARCHAD_CUSTOMER_ID)');
    } else {
      const chunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 5) {
        chunks.push(keywords.slice(i, i + 5));
      }

      for (const chunk of chunks) {
        const { data, error } = await getSearchVolume(chunk, context.env);
        allVolumes = { ...allVolumes, ...data };
        if (error) errors.push(error);
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

    // 3) 결합 (공백 유무 관계없이 매칭)
    const results = keywords.map((kw) => {
      const vol = allVolumes[kw] || allVolumes[kw.replace(/\s+/g, '')];
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

    // 에러가 있으면 응답에 포함 (디버깅용)
    const responseBody: any = { results };
    if (errors.length > 0) {
      responseBody.apiErrors = [...new Set(errors)];
    }

    return new Response(JSON.stringify(responseBody), {
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
