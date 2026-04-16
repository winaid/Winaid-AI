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

// ── 지역 추출 — 시·구·동 모두 추출 ───────────────────────

/** 빈도 기반 3순위에서 시/구/군/동/읍/면 모두 매칭 (앞은 한글 아닌 경계). */
// ── 한국 행정구역 화이트리스트 ──────────────────────────────
// blacklist(가짜 제외) 대신 화이트리스트(진짜만 허용). "대한구", "진료시", "악안면" 자동 제외.
// 시: bare name (시 제거). 구·군: 접미사 포함.

const KNOWN_SI = new Set([
  // 특별시·광역시·특별자치시
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  // 경기
  '수원', '성남', '안양', '안산', '용인', '부천', '광명', '평택', '과천', '오산',
  '시흥', '군포', '의왕', '하남', '이천', '안성', '김포', '화성', '파주', '양주',
  '포천', '고양', '남양주', '구리', '의정부', '동두천', '여주',
  // 강원
  '춘천', '원주', '강릉', '속초', '삼척', '태백', '동해',
  // 충북
  '청주', '충주', '제천',
  // 충남
  '천안', '아산', '서산', '논산', '계룡', '당진', '공주', '보령',
  // 전북
  '전주', '익산', '군산', '정읍', '남원', '김제',
  // 전남
  '목포', '여수', '순천', '나주', '광양',
  // 경북
  '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산',
  // 경남
  '창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산',
  // 제주
  '제주', '서귀포',
]);

const KNOWN_GU = new Set([
  // 서울 25구
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구',
  '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구',
  '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구',
  // 부산 15구
  '영도구', '부산진구', '동래구', '해운대구', '사하구', '금정구', '연제구', '수영구', '사상구',
  // 대구
  '수성구', '달서구',
  // 인천
  '미추홀구', '연수구', '남동구', '부평구', '계양구',
  // 광주
  '광산구',
  // 대전
  '유성구', '대덕구',
  // 경기 시 산하 구
  '장안구', '권선구', '팔달구', '영통구',    // 수원
  '수정구', '중원구', '분당구',              // 성남
  '만안구', '동안구',                        // 안양
  '단원구', '상록구',                        // 안산
  '처인구', '기흥구', '수지구',              // 용인
  '덕양구', '일산동구', '일산서구',          // 고양
  // 청주
  '상당구', '서원구', '흥덕구', '청원구',
  // 천안
  '동남구', '서북구',
  // 전주
  '완산구', '덕진구',
  // 포항·창원
  '의창구', '성산구', '마산합포구', '마산회원구', '진해구',
  // 공통(중복 허용 — Set)
  '동구', '서구', '남구', '북구',
]);

const KNOWN_GUN = new Set([
  // 경기
  '양평군', '가평군', '연천군',
  // 강원
  '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군',
  '양구군', '인제군', '고성군', '양양군',
  // 충북
  '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군',
  // 충남
  '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군',
  // 전북
  '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군',
  // 전남
  '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군',
  '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군',
  // 경북
  '군위군', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군',
  '칠곡군', '예천군', '봉화군', '울진군', '울릉군',
  // 경남
  '의령군', '함안군', '창녕군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
  // 부산·대구·인천·울산 산하 군
  '기장군', '달성군', '강화군', '옹진군', '울주군',
]);

/** 텍스트에서 word 등장 횟수. */
function countOccurrences(text: string, word: string): number {
  let count = 0;
  let idx = text.indexOf(word);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(word, idx + 1);
  }
  return count;
}

// ── 주소 패턴 (0순위 schema · 1순위 텍스트 공용) ──────────

const ADDR_FULL_PREFIX = '(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도?|강원(?:특별자치)?도?|충[남북]도?|전[남북]도?|경[남북]도?|제주(?:특별자치)?도?)';

const ADDR_FULL_PATTERN = new RegExp(
  `${ADDR_FULL_PREFIX}[가-힣\\s]{0,15}?([가-힣]{1,5}시)?[\\s·,]*([가-힣]{1,5}구)?[\\s·,]*([가-힣]{1,5}(?:동|읍|면))?`,
);

/** "안산시"→"안산". 구/동/군/읍/면은 유지. */
function cleanRegionSuffix(raw: string): string {
  if (raw.endsWith('시') && raw.length > 1) return raw.slice(0, -1);
  return raw;
}

/** 주소 패턴 매치 → 동>구>시 우선 + 화이트리스트 검증. */
function pickFromAddrMatch(m: RegExpMatchArray): string | null {
  const dong = m[3]; // 동은 화이트리스트 없어 그대로 (주소 패턴 컨텍스트라 신뢰)
  const gu = m[2];
  const si = m[1];
  if (dong && dong.length >= 2) return dong;
  if (gu && gu.length >= 2 && KNOWN_GU.has(gu)) return gu;
  if (si && si.length >= 2) {
    const bare = cleanRegionSuffix(si);
    if (KNOWN_SI.has(bare)) return bare;
  }
  return null;
}

// ── 0순위: schema address 파싱 ──────────────────────────

function findSchemaAddress(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findSchemaAddress(item);
      if (found) return found;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  const addr = rec['address'];
  if (addr) {
    if (typeof addr === 'string' && addr.trim().length > 3) return addr.trim();
    if (typeof addr === 'object' && !Array.isArray(addr)) {
      const pa = addr as Record<string, unknown>;
      const parts = [pa['addressRegion'], pa['addressLocality'], pa['streetAddress']]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map(s => s.trim())
        .join(' ');
      if (parts.length > 3) return parts;
    }
  }
  for (const key of Object.keys(rec)) {
    if (key === 'address') continue;
    const v = rec[key];
    if (v && typeof v === 'object') {
      const found = findSchemaAddress(v);
      if (found) return found;
    }
  }
  return null;
}

function parseAddressToRegion(addr: string): string | null {
  const m = addr.match(ADDR_FULL_PATTERN);
  if (m) {
    const result = pickFromAddrMatch(m);
    if (result) return result;
  }
  // fallback: 단순 매치
  const simple = addr.match(/([가-힣]{1,5}(?:동|구|군|시))/);
  if (simple) {
    const w = simple[1];
    if (w.endsWith('구') && KNOWN_GU.has(w)) return w;
    if (w.endsWith('군') && KNOWN_GUN.has(w)) return w;
    if (w.endsWith('시')) { const b = cleanRegionSuffix(w); if (KNOWN_SI.has(b)) return b; }
    if (w.endsWith('동')) return w; // 주소 컨텍스트라 신뢰
  }
  return null;
}

/**
 * crawl 에서 한국 행정구역 추출.
 * 0순위: schema JSON-LD address — 100% 정확.
 * 1순위: 텍스트 정식 주소 패턴 (시/도 접두사) — 동>구>시.
 * 2순위: 화이트리스트 매칭 — 시·구·군만 (동은 ~3000개라 비현실적).
 */
export function extractRegion(crawl: CrawlResult): string | null {
  // 0순위: schema
  if (crawl.schemaMarkup && crawl.schemaMarkup.length > 0) {
    const schemaAddr = findSchemaAddress(crawl.schemaMarkup);
    if (schemaAddr) {
      const region = parseAddressToRegion(schemaAddr);
      if (region) return region;
    }
  }

  const haystack = `${crawl.textContent.slice(0, 5000)} ${crawl.title}`;

  // 1순위: 주소 패턴
  const addrMatch = haystack.match(ADDR_FULL_PATTERN);
  if (addrMatch) {
    const result = pickFromAddrMatch(addrMatch);
    if (result) return result;
  }

  // 2순위: 화이트리스트 매칭 (구 > 시 우선)
  const candidates = new Map<string, number>();
  for (const gu of KNOWN_GU) {
    const c = countOccurrences(haystack, gu);
    if (c > 0) candidates.set(gu, c);
  }
  if (candidates.size > 0) {
    return [...candidates.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  for (const si of KNOWN_SI) {
    const c = countOccurrences(haystack, si);
    if (c > 0) candidates.set(si, c);
  }
  for (const gun of KNOWN_GUN) {
    const c = countOccurrences(haystack, gun);
    if (c > 0) candidates.set(gun, c);
  }
  if (candidates.size === 0) return null;
  return [...candidates.entries()].sort((a, b) => b[1] - a[1])[0][0];
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

/**
 * 환각·노이즈 필터 — 병원 공식 URL 이 아닌 플랫폼/블로그/포털은 제외.
 * ChatGPT 가 URL 과 병원명을 임의 조합해 보고하는 케이스(예: "반월바른플란트치과"↔postincome.co.kr)를
 * 도메인 단위로 원천 차단. 프롬프트 강화와 병행(이중 방어).
 */
const PLATFORM_OR_NOISE_DOMAINS: readonly string[] = [
  // 병원 검색·리뷰 플랫폼
  'cashdoc.me', 'placeview.co.kr', 'modoodoc.com', 'ddocdoc.com', 'hidoc.co.kr', 'medius.me',
  // 실측 샘플에서 환각 URL 호스트로 관측됨
  'postincome.co.kr', 'peterspickpick.com',
  // 일반 블로그·카페·포털
  'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'naver.me', 'kakao.com',
  // 의료 포털 / 해외 대행
  'medicalkoreaguide.com', 'koreahealthtrip.com',
];

function isBlockedDomain(domain: string): boolean {
  const d = domain.replace(/^www\./, '').toLowerCase();
  return PLATFORM_OR_NOISE_DOMAINS.some((bad) => d === bad || d.endsWith('.' + bad));
}

/** raw 결과 배열을 CompetitorResult[] 로 정규화. 최대 5개. 플랫폼·노이즈 도메인은 드롭. */
function normalizeResults(arr: unknown[]): CompetitorResult[] {
  const out: CompetitorResult[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    if (!url) continue;
    const domain = hostOf(url);
    if (!domain) continue;
    if (isBlockedDomain(domain)) continue; // 플랫폼·환각 노이즈 도메인 제거
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
  const out: CompetitorResult[] = [];
  for (const url of urls) {
    const domain = hostOf(url);
    if (!domain) continue;
    if (isBlockedDomain(domain)) continue; // 플랫폼·환각 노이즈 제거 (fallback 경로에서도 동일)
    // URL 앞 텍스트에서 병원명 추출 시도 (한글 + 치과/병원/의원 등)
    const idx = text.indexOf(url);
    const before = text.slice(Math.max(0, idx - 60), idx);
    const nameMatch = before.match(/([가-힣]{2,15}(?:치과|병원|의원|클리닉|센터|한의원))/);
    const title = nameMatch ? nameMatch[1] : domain;
    out.push({ url, title, snippet: '', domain, rank: out.length + 1 });
    if (out.length >= 5) break;
  }
  return out;
}

// ── 환각 URL 실 접속 검증 ────────────────────────────────
/**
 * LLM 이 반환한 (url, title) 쌍이 실제로 병원 사이트인지 HTTP HEAD/GET 으로 검증.
 * 환각 사례: ChatGPT 가 "서울그랑치과"를 cashdoc.me 에 매핑 → 실제 title 이 "캐시닥" → drop.
 *
 * 검증 절차 (각 URL 병렬, 3초 타임아웃):
 *   1. fetch → <title> 추출
 *   2. title 에 병원 키워드(치과/의원/병원/…) 포함 여부 확인
 *   3. 미포함 또는 fetch 실패 → drop
 *   4. 통과 시 실제 title 로 r.title 보정 + rank 재계산
 *
 * 양쪽 LLM(ChatGPT/Gemini) + fallback 경로 모두 사용.
 * PLATFORM_OR_NOISE_DOMAINS 정적 필터 이후 단계라서 이중 방어.
 */
const CLINIC_KEYWORDS = ['치과', '의원', '병원', '클리닉', '한의원', 'dental', 'clinic', 'hospital'];
const URL_CHECK_TIMEOUT_MS = 3_000;

async function validateHospitalUrls(results: CompetitorResult[]): Promise<CompetitorResult[]> {
  if (results.length === 0) return results;

  const checks = await Promise.allSettled(
    results.map(async (r): Promise<CompetitorResult | null> => {
      try {
        const res = await fetch(r.url, {
          signal: AbortSignal.timeout(URL_CHECK_TIMEOUT_MS),
          redirect: 'follow',
          headers: {
            // 일부 사이트는 bot UA 를 차단 — 일반 브라우저 UA 로 위장
            'User-Agent':
              'Mozilla/5.0 (compatible; WinaidAEO/1.0; +https://winai.kr)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const actualTitle = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
        if (!actualTitle) return null;
        const lower = actualTitle.toLowerCase();
        const hasClinicKeyword = CLINIC_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
        if (!hasClinicKeyword) return null; // 환각: 제목에 병원 단서 없음
        // 실제 title 로 보정 (OpenAI 가 준 title 이 틀렸을 수 있음). 60자 컷.
        return { ...r, title: actualTitle.slice(0, 60) };
      } catch {
        // timeout / DNS 실패 / 네트워크 오류 → 가짜 URL 가능성, drop
        return null;
      }
    }),
  );

  const passed: CompetitorResult[] = [];
  for (const c of checks) {
    if (c.status === 'fulfilled' && c.value) passed.push(c.value);
  }
  return passed.map((r, i) => ({ ...r, rank: i + 1 })); // rank 재계산
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
  const input = `"${query}" 를 웹 검색해서 관련 병원/치과 상위 5곳의 정보를 JSON 배열로 반환하세요.
형식: [{"url": "...", "title": "병원명", "snippet": "한 줄 설명"}]

URL 우선순위:
1. 병원 공식 홈페이지가 있으면 그 URL
2. 공식 홈페이지를 못 찾으면 네이버 플레이스, 블로그, 또는 병원 정보가 나오는 URL이라도 포함

출력 규칙:
- JSON 배열만 출력. 마크다운·설명·코드펜스 금지.
- 최소 1개 이상 반환. 5개 미만이어도 있는 만큼.
- 정말 아무것도 못 찾을 때만 빈 배열 [].

⚠️ 환각 금지 — 매우 중요:
- 각 결과의 URL 과 병원명은 반드시 web_search 에서 실제로 찾은 페어여야 합니다.
- URL 과 병원명을 임의로 조합·추측·생성하지 마세요. (예: A 병원을 B 회사 URL 에 매핑)
- 한 쌍(URL, 병원명)의 일치 여부가 확실하지 않으면 그 결과를 제외하세요.
- 5개 미만이어도 됩니다. 정확성이 최우선이고, 빈 배열도 허용합니다.`;

  try {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(CHATGPT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        tools: [{ type: 'web_search_preview' }],
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
    if (arr && arr.length > 0) return await validateHospitalUrls(normalizeResults(arr));
    // fallback: 텍스트에서 URL 정규식 추출
    const fallback = extractUrlsFromText(text);
    if (fallback.length > 0) {
      console.warn('[discovery/chatgpt] JSON 추출 실패 → URL 정규식 fallback 사용');
      return await validateHospitalUrls(fallback);
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
    if (arr && arr.length > 0) return await validateHospitalUrls(normalizeResults(arr));
    // fallback: 텍스트에서 URL 정규식 추출
    const fallback = extractUrlsFromText(res.text);
    if (fallback.length > 0) {
      console.warn('[discovery/gemini] JSON 추출 실패 → URL 정규식 fallback 사용');
      return await validateHospitalUrls(fallback);
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
  customQuery?: string,
): Promise<DiscoverOutcome> {
  try {
    // 사용자 직접 입력 검색어가 있으면 지역 추출 로직을 우회(오탐 0 보장).
    // 없을 때만 기존 extractRegion → buildQuery 폴백.
    const trimmedCustom = customQuery?.trim();
    const region = trimmedCustom ? null : extractRegion(crawl);
    const query = trimmedCustom || buildQuery(region, category);
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
