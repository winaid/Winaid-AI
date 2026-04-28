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
} from './types';
import { callLLM } from '@winaid/blog-core';

const CHATGPT_TIMEOUT_MS = 90_000;
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

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
export function hostOf(url: string): string {
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
export function domainMatches(selfHost: string, resultHost: string): boolean {
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

export function isBlockedDomain(domain: string): boolean {
  const d = domain.replace(/^www\./, '').toLowerCase();
  return PLATFORM_OR_NOISE_DOMAINS.some((bad) => d === bad || d.endsWith('.' + bad));
}

// ── 자연어 답변에서 URL 정규식 추출 (selfIncluded 판정용) ───

const URL_REGEX = /https?:\/\/[^\s)>\]"',]+/g;

export function extractUrlsFromText(text: string): CompetitorResult[] {
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

// ── OpenAI Chat Completions (gpt-5-search-api, 검색 내장) ───

/** Chat Completions 응답 형태 최소 shape. */
interface OpenAIChatCompletionsBody {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

// DiscoverRawAnswer / discoverViaChatGPT / discoverViaGemini — 제거됨.
// stream 전환(S-A) 후 사용처 0 (streaming 경로만 사용).

/**
 * 쿼리를 "사용자가 실제로 물어보는 질문" 형태로 감쌈.
 * "안산 치과" → "안산 치과 추천해줘"
 * 이미 "추천/어디/좋은/best" 같은 질문 단어가 들어 있으면 그대로 둠.
 */
function wrapAsQuestion(query: string): string {
  if (/추천|어디|좋은|best/i.test(query)) return query;
  return `${query} 추천해줘`;
}

// buildNaturalLanguagePrompt 함수는 제거됨.
// 실측 철학: "사용자가 ChatGPT/Gemini 웹에 직접 질문했을 때 받는 답변" 을 재현.
// 서버는 형식·글자수·필드 지시를 하지 않고 wrapAsQuestion(query) 한 줄만 user 메시지로 보낸다.
// 답변이 마크다운/각주 링크를 포함해도 클라이언트 경량 파서(AIVisibilityCard.parseAnswer)가 흡수한다.

// ── 쿼리 빌더 (stream 엔드포인트 공용) ──────────────────────

function buildQuery(region: string | null, category: string): string {
  if (region) return `${region} ${category} 추천`;
  return `${category} 추천`;
}

/**
 * customQuery 가 있으면 그대로, 없으면 extractRegion → buildQuery 로 자동 생성.
 * stream 엔드포인트에서 간결히 사용하기 위한 외부용 헬퍼.
 */
export function buildDiscoveryQuery(
  crawl: CrawlResult,
  category: string,
  customQuery?: string,
): string {
  const trimmed = customQuery?.trim();
  if (trimmed) return trimmed;
  const region = extractRegion(crawl);
  return buildQuery(region, category);
}

// ── Phase 3: AEO 다중 쿼리 ──────────────────────────────────

export interface DiscoveryQuery {
  id: string;
  label: string;
  query: string;
}

/**
 * AEO 다중 쿼리 빌더 — 4가지 패턴으로 AI 검색 노출 측정.
 * customQuery 있으면 그것만 반환. 없으면 자동 4개 (지역 없으면 3개) 생성.
 *
 * 패턴: recommend(추천형) · service(시술별) · price(가격) · urgent(야간진료)
 */
export function buildDiscoveryQueries(
  crawl: CrawlResult,
  category: string,
  customQuery?: string,
): DiscoveryQuery[] {
  const trimmed = customQuery?.trim();
  if (trimmed) {
    return [{ id: 'custom', label: '커스텀', query: trimmed }];
  }

  const region = extractRegion(crawl);
  const services = (crawl.detectedServices || []).slice(0, 1);
  const queries: DiscoveryQuery[] = [];

  // 1. 추천형 (기본)
  queries.push({
    id: 'recommend',
    label: '추천형',
    query: region ? `${region} ${category} 추천` : `${category} 추천`,
  });

  // 2. 시술형 (서비스 1개 이상 검출 시)
  if (services[0]) {
    queries.push({
      id: 'service',
      label: '시술별',
      query: region ? `${region} ${services[0]}` : `${category} ${services[0]}`,
    });
  }

  // 3. 가격형
  queries.push({
    id: 'price',
    label: '가격',
    query: region ? `${region} ${category} 가격` : `${category} 비용`,
  });

  // 4. 야간/응급 (지역 있을 때만 의미 있음)
  if (region) {
    queries.push({
      id: 'urgent',
      label: '야간진료',
      query: `야간 진료 ${category} ${region}`,
    });
  }

  return queries;
}

// ── Streaming 버전 (단계 S-A + Gemini 진짜 streaming 핫픽스) ──
// 기본 /api/diagnostic 에서 실측을 분리하고, 사용자가 "실측하기" 를 누를 때
// /api/diagnostic/stream 에서 플랫폼별로 하나씩 호출. SSE 로 chunk 단위 전달.
//
// 양쪽 제너레이터 공통 반환 타입(StreamMeta):
//   - truncated: finishReason 이 MAX_TOKENS/SAFETY 등 비정상 종료를 의미하는가
//   - reason: 실제 finishReason 문자열 (UI 안내용)
//   - sources: 답변 본문·grounding 메타에서 추출한 출처 목록 (본문과 분리 노출용)

export interface StreamSource {
  host: string;       // "cashdoc.me"
  url: string;        // https://… (tracking 쿼리 제거)
  label?: string;     // 페이지 제목 (Gemini grounding 제공 시)
}

export interface StreamMeta {
  truncated: boolean;
  reason?: string;
  sources: StreamSource[];
}

/** 광고·트래킹 쿼리 파라미터 — 출처 URL 에서 제거. */
const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^ref$/i,
  /^gclid$/i,
  /^fbclid$/i,
  /^mc_/i,
  /^yclid$/i,
  /^_hsenc$/i,
  /^_hsmi$/i,
  /^hsCtaTracking$/i,
];

function stripTrackingParams(raw: string): string {
  try {
    const u = new URL(raw);
    const toDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (TRACKING_PARAM_PATTERNS.some((re) => re.test(key))) toDelete.push(key);
    });
    for (const k of toDelete) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

function hostOfUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 답변 본문에서 URL 을 regex 로 추출 → host 기준 dedupe → 등장 순서 유지.
 * Gemini grounding 메타가 없거나 ChatGPT 에서는 이걸로 fallback.
 */
export function extractSourcesFromText(text: string): StreamSource[] {
  const URL_REGEX = /https?:\/\/[^\s)>\]"',]+/g;
  const matches = text.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const out: StreamSource[] = [];
  for (const raw of matches) {
    const host = hostOfUrl(raw);
    if (!host) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push({ host, url: stripTrackingParams(raw) });
  }
  return out;
}

/** Gemini 정상 종료로 간주할 finishReason 값. 이외는 truncated 처리. */
const GEMINI_CLEAN_FINISH = new Set(['STOP', 'OTHER', 'FINISH_REASON_UNSPECIFIED']);

/**
 * OpenAI Chat Completions 실측 — 진짜 SSE 스트림.
 * yield 된 문자열은 delta.content. 생성 완료 후 return 으로 StreamMeta 전달.
 */
export async function* streamChatGPT(
  query: string,
): AsyncGenerator<string, StreamMeta, void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY 미설정');

  const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(300_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-search-api',
      // 실측 철학: 서버는 질문 한 줄만. 형식 지시 금지.
      messages: [{ role: 'user', content: wrapAsQuestion(query) }],
      max_tokens: 8_192,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail += ` · ${body.error.message.slice(0, 200)}`;
    } catch {
      /* ignore */
    }
    throw new Error(`OpenAI stream 실패: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') {
        const truncated = finishReason === 'length';
        return {
          truncated,
          reason: truncated ? 'MAX_TOKENS' : finishReason,
          sources: extractSourcesFromText(fullText),
        };
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: {
            delta?: { content?: string };
            finish_reason?: string | null;
          }[];
        };
        const choice = parsed.choices?.[0];
        const content = choice?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          fullText += content;
          yield content;
        }
        if (typeof choice?.finish_reason === 'string') {
          finishReason = choice.finish_reason;
        }
      } catch {
        /* 불완전 JSON — skip */
      }
    }
  }

  const truncated = finishReason === 'length';
  return {
    truncated,
    reason: truncated ? 'MAX_TOKENS' : finishReason,
    sources: extractSourcesFromText(fullText),
  };
}

// ── Gemini REST streaming (streamGenerateContent?alt=sse) ───
// callLLM 의 fake-stream 을 걷어내고 진짜 SSE 로 전환. 멀티키 로테이션은 최초 연결 시점에만
// 시도 (스트림이 시작되면 키 교체 불가). groundingMetadata 의 web 항목을 sources 로 수집.

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const envName = i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const val = process.env[envName];
    if (val) keys.push(val);
  }
  return keys;
}

/**
 * Gemini 실측 — 진짜 SSE streaming.
 * googleSearch 그라운딩 유지. maxOutputTokens 8192 로 답변 잘림 방지.
 * finishReason MAX_TOKENS/SAFETY 등이면 truncated=true 반환.
 * groundingMetadata 가 있으면 sources 에 우선 사용, 없으면 본문 regex fallback.
 */
export async function* streamGemini(
  query: string,
): AsyncGenerator<string, StreamMeta, void> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_API_KEY 미설정');

  const model = 'gemini-3.1-pro-preview'; // resolveRoute 가 googleSearch=true 에 강제하는 모델과 일치
  // 실측 철학: systemInstruction / temperature 모두 제거. 사용자가 Gemini 웹에 직접 물었을 때와 동등.
  // tools.googleSearch 는 사용자가 웹 UI 에서 검색을 켠 것과 동치라 유지.
  const apiBody = {
    contents: [{ role: 'user', parts: [{ text: wrapAsQuestion(query) }] }],
    generationConfig: {
      maxOutputTokens: 8192, // 답변 중간 잘림(…특히 분야) 방지
    },
    tools: [{ googleSearch: {} }],
  };

  // 연결 단계에서만 키 fallback. 스트림 시작 후엔 교체 불가.
  const maxConnAttempts = Math.min(keys.length, 2);
  let res: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < maxConnAttempts; attempt++) {
    const key = keys[attempt];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(300_000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(apiBody),
      });
      if (r.ok && r.body) {
        res = r;
        break;
      }
      lastErr = `HTTP ${r.status}`;
      try {
        const detail = await r.text();
        if (detail) {
          lastErr += ` · ${detail.slice(0, 200).replace(/key=[A-Za-z0-9_-]+/g, 'key=***')}`;
        }
      } catch {
        /* ignore */
      }
      // 재시도 가능 상태 코드만 다음 키 시도
      if (r.status !== 429 && r.status !== 500 && r.status !== 502 && r.status !== 503 && r.status !== 504) {
        break;
      }
    } catch (e) {
      lastErr = `fetch 실패: ${(e as Error).message.slice(0, 120)}`;
    }
  }
  if (!res || !res.body) {
    throw new Error(`Gemini stream 실패: ${lastErr || 'unknown'}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason: string | undefined;
  const groundingMap = new Map<string, StreamSource>(); // host → source (dedupe)

  const collectGrounding = (chunk: GeminiStreamChunk) => {
    const gm = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!gm) return;
    for (const g of gm) {
      const uri = g.web?.uri;
      if (!uri) continue;
      const host = hostOfUrl(uri);
      if (!host || groundingMap.has(host)) continue;
      groundingMap.set(host, {
        host,
        url: stripTrackingParams(uri),
        label: g.web?.title,
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Gemini SSE 는 CRLF 가능성 있음 — \r?\n\r?\n 로 안전 분리
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (!data || data === '[DONE]') continue;
      let chunk: GeminiStreamChunk;
      try {
        chunk = JSON.parse(data) as GeminiStreamChunk;
      } catch {
        continue;
      }
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      collectGrounding(chunk);
      const parts = candidate?.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p.text === 'string' && p.text.length > 0) {
          fullText += p.text;
          yield p.text;
        }
      }
    }
  }

  const truncated = finishReason !== undefined && !GEMINI_CLEAN_FINISH.has(finishReason);
  const sources =
    groundingMap.size > 0 ? Array.from(groundingMap.values()) : extractSourcesFromText(fullText);
  return { truncated, reason: finishReason, sources };
}

// evaluateFinding / DiscoverOutcome / discoverCompetitors / DiscoverRawAnswer /
// discoverViaChatGPT / discoverViaGemini — 전부 제거됨 (stream 전환(S-A) 후 사용처 0).
// git history 에서 복구 가능.
