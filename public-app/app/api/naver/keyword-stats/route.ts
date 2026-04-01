/**
 * POST /api/naver/keyword-stats
 * 네이버 검색광고 API로 검색량 + 블로그 발행량 조회
 *
 * Env: NAVER_SEARCHAD_CUSTOMER_ID, NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET
 *      NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';

// ── HMAC-SHA256 서명 생성 (네이버 검색광고 API 인증) ──

async function generateSignature(timestamp: string, method: string, uri: string, secret: string): Promise<string> {
  const message = `${timestamp}.${method}.${uri}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ── 검색광고 API 호출 ──

interface SearchAdResult {
  ok: boolean;
  status?: number;
  errorText?: string;
  data?: { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: string | number; monthlyMobileQcCnt: string | number }> };
}

async function callSearchAdAPI(keywordParam: string): Promise<SearchAdResult> {
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID?.trim();
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY?.trim();
  const secret = process.env.NAVER_SEARCHAD_SECRET?.trim();

  if (!customerId || !apiKey || !secret) {
    return { ok: false, status: 0, errorText: 'SearchAd API 키 미설정' };
  }

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
  return { ok: true, data: await response.json() };
}

// ── 키워드 목록 파싱 ──

function parseKeywordList(data: SearchAdResult['data']): Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> {
  const result: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
  for (const item of data?.keywordList || []) {
    const pc = item.monthlyPcQcCnt === '< 10' ? 5 : Number(item.monthlyPcQcCnt) || 0;
    const mobile = item.monthlyMobileQcCnt === '< 10' ? 5 : Number(item.monthlyMobileQcCnt) || 0;
    result[item.relKeyword] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
    const noSpace = item.relKeyword.replace(/\s+/g, '');
    if (noSpace !== item.relKeyword) result[noSpace] = { monthlyPcQcCnt: pc, monthlyMobileQcCnt: mobile };
  }
  return result;
}

// ── 검색량 조회 ──

async function getSearchVolume(keywords: string[]): Promise<{ data: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }>; error?: string }> {
  const cleanKeywords = keywords
    .map(k => k.trim().replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim())
    .filter(k => k.length > 0 && k.length <= 50);
  if (cleanKeywords.length === 0) return { data: {}, error: 'hintKeywords: 유효한 키워드 없음' };

  const noSpaceKeywords = cleanKeywords.map(k => k.replace(/\s+/g, ''));
  const keywordParam = noSpaceKeywords.join(',');

  const result = await callSearchAdAPI(keywordParam);
  if (!result.ok) return { data: {}, error: `SearchAd ${result.status}: ${result.errorText?.substring(0, 100)}` };
  return { data: parseKeywordList(result.data) };
}

// ── 블로그 발행량 조회 ──

async function getBlogPostCount(keyword: string): Promise<{ count: number; error?: string }> {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { count: 0, error: 'Blog API 키 미설정' };

  try {
    const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
    const response = await fetch(searchUrl, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });
    if (!response.ok) return { count: 0, error: `Blog ${response.status}` };
    const data = (await response.json()) as { total?: number };
    return { count: data.total || 0 };
  } catch (e) {
    return { count: 0, error: (e as Error).message };
  }
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { keywords?: string[] };
    const { keywords } = body;

    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const hasSearchAdKeys = !!(process.env.NAVER_SEARCHAD_API_KEY && process.env.NAVER_SEARCHAD_SECRET && process.env.NAVER_SEARCHAD_CUSTOMER_ID);
    const hasBlogKeys = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

    let allVolumes: Record<string, { monthlyPcQcCnt: number; monthlyMobileQcCnt: number }> = {};
    const errors: string[] = [];

    // 검색량 조회 (5개씩 배치)
    if (!hasSearchAdKeys) {
      errors.push('SearchAd API 키가 설정되지 않았습니다. NAVER_SEARCHAD_CUSTOMER_ID, NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET 환경변수를 확인하세요.');
    } else {
      const chunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 5) chunks.push(keywords.slice(i, i + 5));
      for (const chunk of chunks) {
        const { data, error } = await getSearchVolume(chunk);
        allVolumes = { ...allVolumes, ...data };
        if (error) errors.push(error);
      }
    }

    // 블로그 발행량 조회 (3개씩 배치)
    const blogCountMap: Record<string, number> = {};
    if (hasBlogKeys) {
      const blogChunks: string[][] = [];
      for (let i = 0; i < keywords.length; i += 3) blogChunks.push(keywords.slice(i, i + 3));
      for (let ci = 0; ci < blogChunks.length; ci++) {
        if (ci > 0) await new Promise(r => setTimeout(r, 200));
        const results = await Promise.all(
          blogChunks[ci].map(async kw => {
            const { count, error } = await getBlogPostCount(kw);
            if (error) errors.push(`${kw}: ${error}`);
            return { keyword: kw, blogCount: count };
          }),
        );
        for (const { keyword, blogCount } of results) blogCountMap[keyword] = blogCount;
      }
    } else {
      errors.push('블로그 API 키 미설정 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)');
    }

    // 결과 조합
    const results = keywords.map(kw => {
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

    const responseBody: Record<string, unknown> = { results };
    if (errors.length > 0) responseBody.apiErrors = [...new Set(errors)];

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('[keyword-stats] Error:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
