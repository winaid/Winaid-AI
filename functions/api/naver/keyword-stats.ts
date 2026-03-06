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
    // 공백 제거 버전도 저장 (매칭 보강)
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
  const cleanKeywords = keywords
    .map(k => k.trim().replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim())
    .filter(k => k.length > 0 && k.length <= 50);

  if (cleanKeywords.length === 0) {
    return { data: {}, error: 'hintKeywords: 유효한 키워드 없음' };
  }

  // 공백 제거하여 API 호출 (공백 있으면 400 에러 발생)
  const noSpaceKeywords = cleanKeywords.map(k => k.replace(/\s+/g, ''));
  const keywordParam = noSpaceKeywords.join(',');

  console.log('[SearchAd v8] 원본:', cleanKeywords.join(', '));
  console.log('[SearchAd v8] 전송:', noSpaceKeywords.join(', '));

  const result = await callSearchAdAPI(keywordParam, env);

  if (!result.ok) {
    return {
      data: {},
      error: `SearchAd ${result.status}: ${result.errorText?.substring(0, 100)}`,
    };
  }

  // API 응답 디버깅
  const kwList = result.data.keywordList || [];
  console.log(`[SearchAd v8] 응답 키워드 수: ${kwList.length}`);
  for (const kw of cleanKeywords) {
    const noSpace = kw.replace(/\s+/g, '');
    const exactMatch = kwList.find((item: any) => item.relKeyword === kw);
    const noSpaceMatch = kwList.find((item: any) => item.relKeyword === noSpace);
    const spaceMatch = kwList.find((item: any) => item.relKeyword.replace(/\s+/g, '') === noSpace && item.relKeyword !== noSpace);
    console.log(`[SearchAd v8] "${kw}" → exact:${exactMatch ? exactMatch.monthlyPcQcCnt + '/' + exactMatch.monthlyMobileQcCnt : 'X'}, noSpace:${noSpaceMatch ? noSpaceMatch.monthlyPcQcCnt + '/' + noSpaceMatch.monthlyMobileQcCnt : 'X'}, spaceVar:${spaceMatch ? spaceMatch.relKeyword + '=' + spaceMatch.monthlyPcQcCnt + '/' + spaceMatch.monthlyMobileQcCnt : 'X'}`);
  }

  return { data: parseKeywordList(result.data) };
}

async function getBlogPostCount(keyword: string, env: Env): Promise<{ count: number; error?: string }> {
  try {
    const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
    const response = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': env.NAVER_CLIENT_ID?.trim(),
        'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET?.trim(),
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[Blog] "${keyword}" 실패: ${response.status} ${errText.substring(0, 100)}`);
      return { count: 0, error: `Blog ${response.status}: ${errText.substring(0, 50)}` };
    }
    const data = await response.json() as { total: number };
    return { count: data.total || 0 };
  } catch (e: any) {
    console.error(`[Blog] "${keyword}" 예외:`, e.message);
    return { count: 0, error: e.message };
  }
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
      errors.push('SearchAd API 키가 설정되지 않았습니다.');
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

    // 2) 블로그 발행량 조회 (3개씩 병렬 + 청크 간 200ms 딜레이 - 429 방지)
    const blogCountMap: Record<string, number> = {};

    if (hasBlogKeys) {
      console.log(`[Blog v9] 블로그 조회 시작: ${keywords.length}개, CLIENT_ID: ${context.env.NAVER_CLIENT_ID?.substring(0, 6)}...`);
      const blogChunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 3) {
        blogChunks.push(keywords.slice(i, i + 3));
      }

      const blogErrors: string[] = [];
      for (let ci = 0; ci < blogChunks.length; ci++) {
        if (ci > 0) await new Promise(r => setTimeout(r, 200));
        const results = await Promise.all(
          blogChunks[ci].map(async (kw) => {
            const { count, error } = await getBlogPostCount(kw, context.env);
            if (error) blogErrors.push(`${kw}: ${error}`);
            return { keyword: kw, blogCount: count };
          })
        );
        for (const { keyword, blogCount } of results) {
          blogCountMap[keyword] = blogCount;
        }
      }
      if (blogErrors.length > 0) {
        console.error(`[Blog v8] 에러 ${blogErrors.length}건:`, blogErrors.slice(0, 3).join('; '));
        errors.push(`Blog API 에러: ${blogErrors[0]}`);
      }
      console.log(`[Blog v8] 완료:`, Object.entries(blogCountMap).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(', '));
    } else {
      console.error('[Blog v8] 블로그 API 키 미설정! CLIENT_ID:', !!context.env.NAVER_CLIENT_ID, 'CLIENT_SECRET:', !!context.env.NAVER_CLIENT_SECRET);
      errors.push('블로그 API 키 미설정 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)');
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

    // 디버깅: allVolumes 키 목록
    const volKeys = Object.keys(allVolumes).slice(0, 20);
    console.log('[SearchAd v8] allVolumes keys (first 20):', volKeys.join(', '));

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
