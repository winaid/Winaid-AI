/**
 * AEO/GEO 진단 — AI 실측 discovery 모듈 (단계 C-a-1)
 *
 * OpenAI Responses API (web_search_preview) + Gemini Search grounding 으로
 * "{지역} {업종} 추천" 쿼리 상위 5곳 + 본인 도메인 노출 여부 수집.
 *
 * 핵심 원칙:
 *  - 모든 호출은 **실패 허용**. 타임아웃/키 누락/파싱 실패 → null 또는 빈 배열 반환.
 *  - throw 를 route 까지 전파하지 않음 (진단 파이프라인 회귀 0).
 */

import type {
  CrawlResult,
  AIPlatform,
  CompetitorResult,
  CompetitorFinding,
} from './types';
import { callLLM } from '../llm';

const CHATGPT_TIMEOUT_MS = 30_000;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// ── 지역 추출 ──────────────────────────────────────────────

// 앞은 한글 아닌 경계, 뒤는 허용 (한국어 조사 "시에/시에서/구의/군을" 등 뒤에 한글이 자주 붙음)
const REGION_GU_GUN_SI = /(?<![가-힣])([가-힣]{2,5}(?:시|구|군))/g;

/**
 * crawl 본문에서 한국 행정구역(시/구/군) 추출.
 * 여러 후보가 있으면 빈도 1위 반환. 없으면 null.
 */
export function extractRegion(crawl: CrawlResult): string | null {
  const haystack = `${crawl.textContent.slice(0, 3000)} ${crawl.title}`;
  const freq = new Map<string, number>();
  let m: RegExpExecArray | null;
  REGION_GU_GUN_SI.lastIndex = 0;
  while ((m = REGION_GU_GUN_SI.exec(haystack)) !== null) {
    const name = m[1];
    // 일반어 제외 (예: "안내시", "당사", "병원시" 등 흔한 오탐)
    if (/(안내|당사|저희|병원|의원|치과|서비스|세)시$/.test(name)) continue;
    freq.set(name, (freq.get(name) ?? 0) + 1);
  }
  if (freq.size === 0) return null;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ── 본인 도메인 매치 ─────────────────────────────────────

/** 제거할 서브도메인 접두사. www/m/blog/mobile/app/web 순서대로 첫 매치만 제거. */
const STRIP_SUBDOMAINS = ['www.', 'm.', 'blog.', 'mobile.', 'app.', 'web.'];

/** strip 후 bare domain 이 플랫폼 자체 도메인이면 strip 하지 않음 (blog.naver.com ≠ naver.com). */
const PLATFORM_BARE_DOMAINS = [
  'naver.com', 'daum.net', 'kakao.com', 'tistory.com',
  'google.com', 'youtube.com', 'instagram.com', 'facebook.com',
];

/**
 * URL 에서 bare 호스트명 추출. m./www./blog. 같은 알려진 서브도메인 접두사 제거.
 * 단 strip 결과가 플랫폼 bare domain(naver.com 등) 이면 원본 유지
 * (blog.naver.com/myId 가 naver.com 과 매치되는 오탐 방지).
 */
function hostOf(url: string): string {
  try {
    const raw = new URL(url).hostname.toLowerCase();
    for (const prefix of STRIP_SUBDOMAINS) {
      if (raw.startsWith(prefix)) {
        const stripped = raw.slice(prefix.length);
        // 플랫폼 bare domain 이면 strip 하지 않고 원본 반환
        if (PLATFORM_BARE_DOMAINS.includes(stripped)) return raw;
        return stripped;
      }
    }
    return raw;
  } catch { return ''; }
}

/** host 매치 — hostOf 정규화 후 완전 일치 + 커스텀 서브도메인 suffix 매치.
 *  플랫폼 도메인(naver.com, tistory.com 등) 간에는 suffix 매치 안 함 (blog.naver.com ≠ naver.com 보장). */
function domainMatches(selfHost: string, resultHost: string): boolean {
  if (!selfHost || !resultHost) return false;
  const a = hostOf(`https://${selfHost}`);
  const b = hostOf(`https://${resultHost}`);
  if (!a || !b) return false;
  if (a === b) return true;
  // 양쪽 중 하나라도 플랫폼 도메인을 포함하면 완전 일치만 (suffix 매치로 오탐 방지)
  const isPlatform = (h: string) => PLATFORM_BARE_DOMAINS.some(p => h === p || h.endsWith(`.${p}`));
  if (isPlatform(a) || isPlatform(b)) return false;
  // 커스텀 도메인 간 서브도메인 대응 (clinic.brplant.co.kr vs brplant.co.kr)
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

// ── 공통 JSON 파서 (enrich.ts 와 독립) ───────────────────

function tryExtractJsonArray<T>(raw: string): T[] | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch { return null; }
}

/** raw 결과 배열을 CompetitorResult[] 로 정규화. 최대 5개. */
function normalizeResults(arr: unknown[]): CompetitorResult[] {
  const out: CompetitorResult[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    if (!url) continue;
    const domain = hostOf(url);
    if (!domain) continue;
    out.push({
      url,
      title: typeof r.title === 'string' ? r.title.trim().slice(0, 150) : '',
      snippet: typeof r.snippet === 'string' ? r.snippet.trim().slice(0, 300) : '',
      domain,
      rank: out.length + 1,
    });
    if (out.length >= 5) break;
  }
  return out;
}

// ── Fallback: JSON 추출 실패 시 텍스트에서 URL 정규식 추출 ───

const URL_REGEX = /https?:\/\/[^\s)>\]"',]+/g;

function extractUrlsFromText(text: string): CompetitorResult[] {
  const urls = [...new Set(text.match(URL_REGEX) || [])];
  return urls.slice(0, 5).map((url, i) => {
    const domain = hostOf(url);
    // URL 앞 텍스트에서 병원명 추출 시도 (한글 + 치과/병원/의원 등)
    const idx = text.indexOf(url);
    const before = text.slice(Math.max(0, idx - 60), idx);
    const nameMatch = before.match(/([가-힣]{2,15}(?:치과|병원|의원|클리닉|센터|한의원))/);
    const title = nameMatch ? nameMatch[1] : domain;
    return { url, title, snippet: '', domain, rank: i + 1 };
  }).filter(r => r.domain);
}

// ── OpenAI Responses + web_search ────────────────────────

interface OpenAIResponsesOutputTextContent { type: string; text?: string }
interface OpenAIResponsesOutputMessage { type: string; content?: OpenAIResponsesOutputTextContent[] }
interface OpenAIResponsesBody { output?: OpenAIResponsesOutputMessage[]; output_text?: string }

function extractOpenAIText(body: OpenAIResponsesBody): string {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  const parts: string[] = [];
  for (const o of body.output ?? []) {
    if (o.type !== 'message') continue;
    for (const c of o.content ?? []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n');
}

export async function discoverViaChatGPT(query: string): Promise<CompetitorResult[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('[discovery/chatgpt] OPENAI_API_KEY 미설정 — 스킵');
    return null;
  }
  const input = `"${query}" 를 웹 검색으로 찾아서 상위 5곳 병원의 공식 홈페이지 URL, 병원명(title), 한 줄 설명(snippet) 을 JSON 배열로만 반환하세요.
형식: [{"url": "...", "title": "...", "snippet": "..."}]
주의: 모두닥/하이닥/네이버플레이스 같은 플랫폼 URL 이 아니라 병원 **공식 홈페이지** URL 을 우선.

출력 규칙:
- 반드시 JSON 배열만 출력하라. [{url, title, snippet}] 형태.
- 마크다운·설명 텍스트·코드펜스(\`\`\`) 절대 금지.
- JSON 외 글자가 한 글자라도 들어가면 실패로 처리됨.
- 결과가 없으면 빈 배열 [] 반환.`;

  try {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(CHATGPT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        tools: [{ type: 'web_search' }],
        input,
      }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json() as { error?: { message?: string } };
        if (body.error?.message) detail += ` · ${body.error.message}`;
      } catch { /* ignore */ }
      console.warn(`[discovery/chatgpt] 응답 실패: ${detail}`);
      return null;
    }
    const body = await res.json() as OpenAIResponsesBody;

    // ── 디버그 로그 — 파싱 실패 원인 추적용 ──
    const hasSearchCall = Array.isArray(body.output) && body.output.some((o) => o.type === 'web_search_call');
    const text = extractOpenAIText(body);
    console.warn(`[discovery/chatgpt] web_search_call 존재: ${hasSearchCall}`);
    console.warn(`[discovery/chatgpt] 응답 전체 키: ${JSON.stringify(Object.keys(body))}`);
    console.warn(`[discovery/chatgpt] 응답 원문 (앞 500자): ${(text || '').slice(0, 500)}`);

    const arr = tryExtractJsonArray<unknown>(text);
    if (arr && arr.length > 0) return normalizeResults(arr);
    // fallback: 텍스트에서 URL 정규식 추출
    const fallback = extractUrlsFromText(text);
    if (fallback.length > 0) {
      console.warn('[discovery/chatgpt] JSON 추출 실패 → URL 정규식 fallback 사용');
      return fallback;
    }
    console.warn('[discovery/chatgpt] JSON + URL fallback 모두 실패');
    return null;
  } catch (e) {
    const name = (e as Error)?.name || 'Error';
    const msg = (e as Error)?.message || 'unknown';
    console.warn(`[discovery/chatgpt] 호출 예외: ${name} · ${msg.slice(0, 200)}`);
    return null;
  }
}

// ── Gemini Search grounding (callLLM search_ground task 재사용) ─

export async function discoverViaGemini(query: string): Promise<CompetitorResult[] | null> {
  const prompt = `"${query}" 로 최신 웹 검색을 수행해 상위 5곳 병원의 공식 홈페이지 URL, 병원명, 한 줄 설명을 JSON 배열로만 반환하세요.
다른 설명 없이 JSON 배열 하나만.
형식: [{"url": "...", "title": "...", "snippet": "..."}]
모두닥/하이닥/네이버플레이스 같은 플랫폼 URL 말고 병원 공식 홈페이지를 우선하세요.`;

  try {
    const res = await callLLM({
      task: 'search_ground',
      systemBlocks: [{ type: 'text', text: '한국 병원 정보를 최신 웹 검색으로 찾아 JSON 배열로만 응답하는 분석자입니다.', cacheable: false }],
      userPrompt: prompt,
      temperature: 0.2,
      maxOutputTokens: 2000,
      googleSearch: true,
    });
    const arr = tryExtractJsonArray<unknown>(res.text);
    if (arr && arr.length > 0) return normalizeResults(arr);
    // fallback: 텍스트에서 URL 정규식 추출
    const fallback = extractUrlsFromText(res.text);
    if (fallback.length > 0) {
      console.warn('[discovery/gemini] JSON 추출 실패 → URL 정규식 fallback 사용');
      return fallback;
    }
    console.warn('[discovery/gemini] JSON + URL fallback 모두 실패');
    return null;
  } catch (e) {
    console.warn(`[discovery/gemini] 호출 예외: ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

// ── 조립: 쿼리 + 병렬 호출 + 본인 매치 ────────────────────

function buildQuery(region: string | null, category: string): string {
  if (region) return `${region} ${category} 추천`;
  return `${category} 추천`;
}

function evaluateFinding(
  platform: AIPlatform,
  query: string,
  results: CompetitorResult[] | null,
  selfHost: string,
): CompetitorFinding {
  const timestamp = new Date().toISOString();
  if (results === null) {
    return {
      platform,
      queryUsed: query,
      topResults: [],
      selfIncluded: false,
      selfRank: null,
      timestamp,
      rawError: 'call_failed_or_parse_failed',
    };
  }
  let selfRank: number | null = null;
  for (const r of results) {
    if (domainMatches(selfHost, r.domain)) {
      selfRank = r.rank;
      break;
    }
  }
  return {
    platform,
    queryUsed: query,
    topResults: results,
    selfIncluded: selfRank !== null,
    selfRank,
    timestamp,
  };
}

export interface DiscoverOutcome {
  findings: CompetitorFinding[];
  detectedRegion: string | null;
  detectedCategory: string;
}

export async function discoverCompetitors(
  crawl: CrawlResult,
  category: string = '치과',
): Promise<DiscoverOutcome> {
  try {
    const region = extractRegion(crawl);
    // 지역 추출 실패해도 category 만으로 진행 (결과 품질 ↓이지만 완전 스킵보다 낫다)
    const query = buildQuery(region, category);
    const selfHost = hostOf(crawl.finalUrl);

    // 두 플랫폼 병렬 — Promise.allSettled 로 상호 실패 격리
    const [chatgptRes, geminiRes] = await Promise.allSettled([
      discoverViaChatGPT(query),
      discoverViaGemini(query),
    ]);
    const chatgptResults = chatgptRes.status === 'fulfilled' ? chatgptRes.value : null;
    const geminiResults = geminiRes.status === 'fulfilled' ? geminiRes.value : null;

    const findings: CompetitorFinding[] = [
      evaluateFinding('ChatGPT', query, chatgptResults, selfHost),
      evaluateFinding('Gemini', query, geminiResults, selfHost),
    ];

    // 양쪽 모두 topResults 비어있으면 findings 자체를 비워 UI 가 섹션을 숨길 수 있게 함
    const anyResults = findings.some(f => f.topResults.length > 0);
    return {
      findings: anyResults ? findings : [],
      detectedRegion: region,
      detectedCategory: category,
    };
  } catch (e) {
    // 내부 호출이 이미 try/catch. 최후 안전망.
    console.warn(`[diagnostic/discovery] 치명적 실패: ${(e as Error).message.slice(0, 200)}`);
    return { findings: [], detectedRegion: null, detectedCategory: category };
  }
}
