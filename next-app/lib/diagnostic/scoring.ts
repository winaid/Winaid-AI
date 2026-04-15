/**
 * AEO/GEO 진단 — 6 카테고리 채점 로직
 *
 * 순수 함수. 네트워크/DB 접근 없음. types.ts 의 인터페이스에 맞춰 반환.
 * CategoryScore.weight 는 0-100 (전체 가중치). 카테고리 내부 score 는 0-100 (가중 평균).
 *
 * LABELS / WEIGHTS 는 actionPlan.ts 에서 label 기반 조회를 위해 export.
 */

import type { CrawlResult, PsiResult, CategoryScore, CategoryItem, CategoryItemStatus } from './types';

// ── 라벨 상수 (actionPlan.ts 와 공유) ──────────────────────────

export const LABELS = {
  // ① security_tech
  https: 'HTTPS 적용',
  viewport: '모바일 viewport',
  robots: 'robots.txt 존재',
  sitemap: 'sitemap.xml 존재',
  psi: '로딩 성능 (PSI)',
  // ② site_structure
  own_domain: '자체 도메인 사용',
  has_doctor_page: '의료진 소개 페이지',
  has_treatment_page: '진료/서비스 페이지',
  has_service_details: '시술 상세 페이지',
  has_location_page: '오시는 길 페이지',
  has_faq_page: 'FAQ 페이지',
  has_pricing_page: '비용/가격 페이지',
  // ③ structured_data
  dentist_schema: 'Dentist/LocalBusiness 스키마',
  organization_schema: 'Organization 스키마',
  breadcrumb_schema: 'BreadcrumbList 스키마',
  faq_schema: 'FAQPage 스키마',
  profile_schema: 'ProfilePage 스키마',
  // ④ content_quality
  h1_count: 'H1 태그',
  h2_count: 'H2 태그 개수',
  title_opt: '제목 최적화 (지역+업종)',
  meta_desc: '메타 디스크립션',
  alt_ratio: '이미지 alt 비율',
  doctor_in_text: '본문 내 의료진 정보',
  word_count: '본문 글자 수',
  // ⑤ external_channels
  naver: '네이버 플레이스/블로그',
  google: 'Google Maps/Business',
  kakao: '카카오 채널',
  youtube: 'YouTube 채널',
  instagram: 'Instagram',
  sameas_schema: '구조화 데이터 sameAs',
  // ⑥ aeo_geo
  faq_structure: 'FAQ 구조',
  services_named: '시술명 언급',
  contact_text: '연락처 노출',
  address_text: '주소 노출',
  hours_text: '영업시간 노출',
} as const;

export type LabelKey = keyof typeof LABELS;

const WEIGHTS: Record<string, number> = {
  security_tech: 15,
  site_structure: 25,
  structured_data: 15,
  content_quality: 25,
  external_channels: 10,
  aeo_geo: 10,
};

// ── 권장사항 맵 (label 기반) ───────────────────────────────

const RECOMMENDATIONS: Record<string, string> = {
  [LABELS.https]: 'SSL 인증서를 발급하고 전체 페이지를 HTTPS 로 리다이렉트하세요.',
  [LABELS.viewport]: '<meta name="viewport" content="width=device-width, initial-scale=1"> 를 <head> 에 추가하세요.',
  [LABELS.robots]: 'robots.txt 를 사이트 루트(/robots.txt)에 배치하고 Sitemap: 디렉티브를 포함하세요.',
  [LABELS.sitemap]: '/sitemap.xml 또는 /sitemap_index.xml 을 생성하고 Search Console/네이버 서치어드바이저에 제출하세요.',
  [LABELS.psi]: '이미지 최적화(WebP), 지연 로딩, 코드 분할로 Core Web Vitals 를 개선하세요.',
  [LABELS.own_domain]: '독립 도메인(example.com)을 확보하세요. 플랫폼 서브도메인은 AI 크롤링에 불리합니다.',
  [LABELS.has_doctor_page]: '의료진 소개 페이지를 만들고 이름·전공·경력을 명시하세요.',
  [LABELS.has_treatment_page]: '진료/치료 안내 페이지를 만들어 시술을 카테고리로 정리하세요.',
  [LABELS.has_service_details]: '주요 시술마다 개별 상세 페이지를 만들고 설명·대상·과정을 포함하세요.',
  [LABELS.has_location_page]: '오시는 길 페이지에 지도 iframe + 주소 + 대중교통 안내를 포함하세요.',
  [LABELS.has_faq_page]: '자주 묻는 질문 페이지를 별도로 두고 비용·예약·진료 관련 질문을 정리하세요.',
  [LABELS.has_pricing_page]: '상담/비용 안내 페이지를 만들어 투명한 가격 정보를 제시하세요.',
  [LABELS.dentist_schema]: 'schema.org Dentist 또는 LocalBusiness JSON-LD 를 <head> 에 추가하세요.',
  [LABELS.organization_schema]: 'Organization 스키마로 상호·로고·연락처·sameAs 를 마크업하세요.',
  [LABELS.breadcrumb_schema]: 'BreadcrumbList 스키마를 각 하위 페이지에 추가하세요.',
  [LABELS.faq_schema]: 'FAQ 섹션에 FAQPage JSON-LD 를 적용하세요.',
  [LABELS.profile_schema]: '의료진 각각에 Physician 또는 ProfilePage 스키마를 추가하세요.',
  [LABELS.h1_count]: '페이지마다 단일 H1 을 두고 핵심 주제를 담으세요.',
  [LABELS.h2_count]: 'H2 소제목을 3개 이상 두어 콘텐츠 구조를 명확히 하세요.',
  [LABELS.title_opt]: '<title> 에 지역명(구/동/지역)과 업종(치과/의원/병원)을 모두 포함하세요.',
  [LABELS.meta_desc]: 'meta description 을 50-160자로 작성해 검색 스니펫을 제어하세요.',
  [LABELS.alt_ratio]: '모든 의미 있는 <img> 에 alt 텍스트를 추가하세요 (장식 이미지는 alt="").',
  [LABELS.doctor_in_text]: '본문에 의료진 이름·전문 분야·진료 철학을 서술하세요.',
  [LABELS.word_count]: '핵심 페이지 본문을 500자 이상으로 작성하세요.',
  [LABELS.naver]: '네이버 플레이스 등록 후 홈페이지에서 외부 링크로 연결하세요.',
  [LABELS.google]: 'Google 비즈니스 프로필을 설정하고 홈페이지에 연결하세요.',
  [LABELS.kakao]: '카카오톡 채널을 개설하고 홈페이지에 채널 링크를 노출하세요.',
  [LABELS.youtube]: '병원 유튜브 채널을 만들어 진료 안내/의료진 소개 영상을 올리세요.',
  [LABELS.instagram]: 'Instagram 계정을 홈페이지 푸터/연락처에 연결하세요.',
  [LABELS.sameas_schema]: 'Organization/LocalBusiness 스키마의 sameAs 배열에 SNS/플레이스 URL 을 넣으세요.',
  [LABELS.faq_structure]: '페이지 내 FAQ 섹션을 구성하고 FAQPage 스키마로 마크업하세요.',
  [LABELS.services_named]: '시술명을 본문과 네비게이션에 명시적으로 노출하세요.',
  [LABELS.contact_text]: '대표 전화번호를 헤더/푸터에 항상 노출하세요.',
  [LABELS.address_text]: '한국 표준 주소(시/도 + 구/군 + 동/로)를 푸터에 명시하세요.',
  [LABELS.hours_text]: '진료시간·점심시간·휴진일을 명확히 표시하세요.',
};

// ── 헬퍼 ───────────────────────────────────────────────────

function makeItem(
  label: string,
  maxPoints: number,
  earnedPoints: number,
  status: CategoryItemStatus,
  detail: string,
  rawValue?: string,
): CategoryItem {
  const item: CategoryItem = { label, status, detail, maxPoints, earnedPoints };
  if (rawValue !== undefined) item.rawValue = rawValue;
  return item;
}

function buildRecommendations(items: CategoryItem[]): string[] {
  const recs: string[] = [];
  for (const it of items) {
    if (it.status !== 'fail' && it.status !== 'warning') continue;
    const r = RECOMMENDATIONS[it.label];
    if (r && !recs.includes(r)) recs.push(r);
    if (recs.length >= 4) break;
  }
  return recs;
}

function toCategoryScore(id: string, name: string, items: CategoryItem[]): CategoryScore {
  // totalMax 에서 unknown 항목은 제외 — unknown 은 측정 불가라 감점 대신 가중치에서 제외.
  const effective = items.filter(i => i.status !== 'unknown');
  const totalMax = effective.reduce((a, b) => a + b.maxPoints, 0);
  const totalEarned = effective.reduce((a, b) => a + b.earnedPoints, 0);
  const score = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
  return {
    id,
    name,
    score,
    weight: WEIGHTS[id] ?? 0,
    items,
    recommendations: buildRecommendations(items),
  };
}

// ── 링크 매칭 유틸 ────────────────────────────────────────

function hasInternalLinkMatch(crawl: CrawlResult, re: RegExp): boolean {
  return crawl.internalLinks.some(l => re.test(l.text) || re.test(l.href));
}

function externalLinksHaystack(crawl: CrawlResult): string {
  return crawl.externalLinks.map(l => `${l.href} ${l.text}`).join(' ').toLowerCase();
}

// schemaMarkup 재귀 탐색으로 sameAs 배열 수집
function collectSameAs(schemaMarkup: Record<string, unknown>[]): string[] {
  const urls: string[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    const rec = v as Record<string, unknown>;
    const sa = rec['sameAs'];
    if (typeof sa === 'string') urls.push(sa);
    else if (Array.isArray(sa)) {
      for (const s of sa) if (typeof s === 'string') urls.push(s);
    }
    for (const k of Object.keys(rec)) {
      if (k === 'sameAs') continue;
      walk(rec[k]);
    }
  };
  walk(schemaMarkup);
  return urls;
}

// ── ① security_tech ────────────────────────────────────────

function scoreSecurityTech(crawl: CrawlResult, psi: PsiResult | null, hasRobotsTxt: boolean, hasSitemap: boolean): CategoryScore {
  const items: CategoryItem[] = [];

  items.push(crawl.hasSSL
    ? makeItem(LABELS.https, 25, 25, 'pass', 'HTTPS 로 제공 중.')
    : makeItem(LABELS.https, 25, 0, 'fail', 'HTTP 프로토콜 — 보안 불충분.'));

  items.push(crawl.viewport
    ? makeItem(LABELS.viewport, 20, 20, 'pass', `viewport: ${crawl.viewport}`, crawl.viewport)
    : makeItem(LABELS.viewport, 20, 0, 'fail', 'viewport 메타 태그 없음 — 모바일 렌더링 불리.'));

  items.push(hasRobotsTxt
    ? makeItem(LABELS.robots, 15, 15, 'pass', 'robots.txt 접근 가능.')
    : makeItem(LABELS.robots, 15, 0, 'fail', 'robots.txt 없음 — 크롤러 정책 부재.'));

  items.push(hasSitemap
    ? makeItem(LABELS.sitemap, 15, 15, 'pass', 'sitemap.xml 접근 가능.')
    : makeItem(LABELS.sitemap, 15, 0, 'fail', 'sitemap.xml 없음 — 색인 효율 저하.'));

  // PSI — psi.ts 에서 이미 0-100 범위로 저장됨
  if (psi === null || psi.score === null) {
    items.push(makeItem(LABELS.psi, 25, 10, 'unknown', 'PSI 미측정 (API 미동작).'));
  } else if (psi.score >= 90) {
    items.push(makeItem(LABELS.psi, 25, 25, 'pass', `우수 (${psi.score}/100).`, String(psi.score)));
  } else if (psi.score >= 50) {
    items.push(makeItem(LABELS.psi, 25, 15, 'warning', `보통 (${psi.score}/100) — 개선 여지 있음.`, String(psi.score)));
  } else {
    items.push(makeItem(LABELS.psi, 25, 5, 'fail', `저조 (${psi.score}/100) — 즉시 개선 필요.`, String(psi.score)));
  }

  return toCategoryScore('security_tech', '보안 및 기술 기반', items);
}

// ── ② site_structure ──────────────────────────────────────

const PLATFORM_SUBDOMAINS = /(?:^|\.)(blog\.naver\.com|tistory\.com|wixsite\.com|cafe24\.com|modoo\.at|imweb\.me|goorm\.io|weebly\.com|strikingly\.com)$/i;

function scoreSiteStructure(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];

  let ownDomain = false;
  try {
    const u = new URL(crawl.finalUrl);
    ownDomain = !PLATFORM_SUBDOMAINS.test(u.hostname);
  } catch { ownDomain = true; }
  items.push(ownDomain
    ? makeItem(LABELS.own_domain, 20, 20, 'pass', '독립 도메인 사용 중.')
    : makeItem(LABELS.own_domain, 20, 0, 'fail', '플랫폼 서브도메인 — AI 노출에 불리.'));

  const docRegex = /의료진|원장|doctor|medical-team|staff/i;
  items.push(crawl.hasDoctorInfo || hasInternalLinkMatch(crawl, docRegex)
    ? makeItem(LABELS.has_doctor_page, 20, 20, 'pass', '의료진 정보/링크 감지됨.')
    : makeItem(LABELS.has_doctor_page, 20, 0, 'fail', '의료진 소개 경로 없음.'));

  const trtRegex = /진료|치료|서비스|services|treatment/i;
  items.push(crawl.hasServicePages || hasInternalLinkMatch(crawl, trtRegex)
    ? makeItem(LABELS.has_treatment_page, 15, 15, 'pass', '진료/치료 페이지 감지됨.')
    : makeItem(LABELS.has_treatment_page, 15, 0, 'fail', '진료 안내 경로 없음.'));

  const svcCount = crawl.detectedServices.length;
  items.push(svcCount >= 2
    ? makeItem(LABELS.has_service_details, 15, 15, 'pass', `시술명 ${svcCount}개 감지.`, String(svcCount))
    : makeItem(LABELS.has_service_details, 15, 0, 'fail', `시술명 ${svcCount}개만 감지 — 상세 부족.`, String(svcCount)));

  const locRegex = /오시는|위치|location|찾아오|map|contact/i;
  items.push(hasInternalLinkMatch(crawl, locRegex) || crawl.hasMap
    ? makeItem(LABELS.has_location_page, 10, 10, 'pass', '오시는 길/지도 감지됨.')
    : makeItem(LABELS.has_location_page, 10, 0, 'fail', '오시는 길 경로 없음.'));

  const faqRegex = /faq|자주|질문|궁금/i;
  items.push(crawl.hasFAQ || hasInternalLinkMatch(crawl, faqRegex)
    ? makeItem(LABELS.has_faq_page, 10, 10, 'pass', 'FAQ 섹션/링크 감지됨.')
    : makeItem(LABELS.has_faq_page, 10, 0, 'fail', 'FAQ 경로 없음.'));

  const priceRegex = /비용|가격|price|상담|수가/i;
  items.push(hasInternalLinkMatch(crawl, priceRegex)
    ? makeItem(LABELS.has_pricing_page, 10, 10, 'pass', '비용/가격 안내 링크 감지됨.')
    : makeItem(LABELS.has_pricing_page, 10, 0, 'fail', '비용 안내 경로 없음.'));

  return toCategoryScore('site_structure', '사이트 구조', items);
}

// ── ③ structured_data ────────────────────────────────────

function scoreStructuredData(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const types = crawl.schemaTypes;
  const has = (t: string): boolean => types.some(x => x.toLowerCase() === t.toLowerCase());

  items.push(has('Dentist') || has('LocalBusiness') || has('MedicalBusiness') || has('MedicalClinic')
    ? makeItem(LABELS.dentist_schema, 30, 30, 'pass', `업종 스키마 감지: ${types.join(', ') || '없음'}`)
    : makeItem(LABELS.dentist_schema, 30, 0, 'fail', 'Dentist/LocalBusiness 스키마 없음.'));

  items.push(has('Organization')
    ? makeItem(LABELS.organization_schema, 20, 20, 'pass', 'Organization 스키마 감지됨.')
    : makeItem(LABELS.organization_schema, 20, 0, 'fail', 'Organization 스키마 없음.'));

  items.push(has('BreadcrumbList')
    ? makeItem(LABELS.breadcrumb_schema, 15, 15, 'pass', 'BreadcrumbList 스키마 감지됨.')
    : makeItem(LABELS.breadcrumb_schema, 15, 0, 'fail', 'BreadcrumbList 스키마 없음.'));

  items.push(has('FAQPage')
    ? makeItem(LABELS.faq_schema, 20, 20, 'pass', 'FAQPage 스키마 감지됨.')
    : makeItem(LABELS.faq_schema, 20, 0, 'fail', 'FAQPage 스키마 없음.'));

  items.push(has('ProfilePage') || has('Physician')
    ? makeItem(LABELS.profile_schema, 15, 15, 'pass', 'Profile/Physician 스키마 감지됨.')
    : makeItem(LABELS.profile_schema, 15, 0, 'fail', 'ProfilePage/Physician 스키마 없음.'));

  return toCategoryScore('structured_data', '구조화 데이터', items);
}

// ── ④ content_quality ────────────────────────────────────

const KOREAN_REGIONS = /서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|(시|군|구|동|읍|면|로|길)\s/;
const CLINIC_KIND = /치과|의원|병원|클리닉|한의원/;

function scoreContentQuality(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];

  if (crawl.h1.length === 1) {
    items.push(makeItem(LABELS.h1_count, 15, 15, 'pass', 'H1 단일 — 정상.', '1'));
  } else {
    items.push(makeItem(LABELS.h1_count, 15, 5, 'warning', `H1 ${crawl.h1.length}개 — 단일 H1 권장.`, String(crawl.h1.length)));
  }

  if (crawl.h2.length >= 3) {
    items.push(makeItem(LABELS.h2_count, 15, 15, 'pass', `H2 ${crawl.h2.length}개.`, String(crawl.h2.length)));
  } else if (crawl.h2.length >= 1) {
    items.push(makeItem(LABELS.h2_count, 15, 8, 'warning', `H2 ${crawl.h2.length}개 — 3개 이상 권장.`, String(crawl.h2.length)));
  } else {
    items.push(makeItem(LABELS.h2_count, 15, 0, 'fail', 'H2 없음 — 구조 부실.', '0'));
  }

  const hasRegion = KOREAN_REGIONS.test(crawl.title);
  const hasKind = CLINIC_KIND.test(crawl.title);
  if (hasRegion && hasKind) {
    items.push(makeItem(LABELS.title_opt, 15, 15, 'pass', `title 에 지역+업종 포함.`, crawl.title));
  } else if (hasRegion || hasKind) {
    items.push(makeItem(LABELS.title_opt, 15, 8, 'warning', `title 에 ${hasRegion ? '지역' : '업종'}만 포함.`, crawl.title));
  } else {
    items.push(makeItem(LABELS.title_opt, 15, 0, 'fail', 'title 에 지역/업종 모두 없음.', crawl.title));
  }

  const descLen = crawl.metaDescription.length;
  if (descLen >= 50 && descLen <= 160) {
    items.push(makeItem(LABELS.meta_desc, 15, 15, 'pass', `description ${descLen}자 — 적정.`, String(descLen)));
  } else {
    items.push(makeItem(LABELS.meta_desc, 15, 0, 'fail', descLen === 0 ? 'description 없음.' : `description ${descLen}자 — 50~160 권장.`, String(descLen)));
  }

  if (crawl.totalImages === 0) {
    items.push(makeItem(LABELS.alt_ratio, 15, 0, 'unknown', '이미지 없음 — 측정 불가.', '0'));
  } else {
    const ratio = (crawl.totalImages - crawl.imagesWithoutAlt) / crawl.totalImages;
    const pct = Math.round(ratio * 100);
    if (ratio >= 0.8) items.push(makeItem(LABELS.alt_ratio, 15, 15, 'pass', `alt 비율 ${pct}%.`, `${pct}%`));
    else if (ratio >= 0.5) items.push(makeItem(LABELS.alt_ratio, 15, 8, 'warning', `alt 비율 ${pct}% — 80% 권장.`, `${pct}%`));
    else items.push(makeItem(LABELS.alt_ratio, 15, 0, 'fail', `alt 비율 ${pct}% — 다수 이미지 alt 누락.`, `${pct}%`));
  }

  items.push(crawl.hasDoctorInfo
    ? makeItem(LABELS.doctor_in_text, 15, 15, 'pass', '본문에 의료진 관련 키워드 감지.')
    : makeItem(LABELS.doctor_in_text, 15, 0, 'fail', '본문에 의료진 정보 부족.'));

  items.push(crawl.wordCount >= 500
    ? makeItem(LABELS.word_count, 10, 10, 'pass', `본문 ${crawl.wordCount}자.`, String(crawl.wordCount))
    : makeItem(LABELS.word_count, 10, 0, 'fail', `본문 ${crawl.wordCount}자 — 500자 이상 권장.`, String(crawl.wordCount)));

  return toCategoryScore('content_quality', '콘텐츠 품질', items);
}

// ── ⑤ external_channels ──────────────────────────────────

function scoreExternalChannels(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const haystack = externalLinksHaystack(crawl);
  const sameAs = collectSameAs(crawl.schemaMarkup).join(' ').toLowerCase();
  const all = `${haystack} ${sameAs}`;

  const checks: Array<{ key: LabelKey; points: number; re: RegExp }> = [
    { key: 'naver', points: 20, re: /place\.map\.naver|blog\.naver|naver\.me|m\.place\.naver/i },
    { key: 'google', points: 20, re: /maps\.google|goo\.gl\/maps|g\.co\/kgs|business\.google/i },
    { key: 'kakao', points: 15, re: /pf\.kakao|kakao\.com\/_|kko\.to/i },
    { key: 'youtube', points: 15, re: /youtube\.com\/@|youtu\.be/i },
    { key: 'instagram', points: 10, re: /instagram\.com\//i },
  ];

  for (const c of checks) {
    if (c.re.test(haystack)) {
      items.push(makeItem(LABELS[c.key], c.points, c.points, 'pass', `외부 링크에서 감지됨.`));
    } else {
      items.push(makeItem(LABELS[c.key], c.points, 0, 'fail', `외부 링크에서 감지 안 됨.`));
    }
  }

  // sameAs 에 위 5개 채널 중 하나라도 포함되면 통과
  const anyChannelRe = /place\.map\.naver|blog\.naver|naver\.me|maps\.google|goo\.gl\/maps|business\.google|pf\.kakao|kakao\.com\/_|youtube\.com|instagram\.com/i;
  items.push(anyChannelRe.test(sameAs)
    ? makeItem(LABELS.sameas_schema, 20, 20, 'pass', '스키마 sameAs 에 채널 URL 포함.')
    : makeItem(LABELS.sameas_schema, 20, 0, 'fail', '스키마 sameAs 미설정.'));

  return toCategoryScore('external_channels', '외부 채널 연결', items);
}

// ── ⑥ aeo_geo ────────────────────────────────────────────

function scoreAeoGeo(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const hasFaqSchema = crawl.schemaTypes.some(t => t.toLowerCase() === 'faqpage');

  items.push(crawl.hasFAQ || hasFaqSchema
    ? makeItem(LABELS.faq_structure, 25, 25, 'pass', 'FAQ 구조 감지됨.')
    : makeItem(LABELS.faq_structure, 25, 0, 'fail', 'FAQ 구조 없음.'));

  items.push(crawl.detectedServices.length >= 1
    ? makeItem(LABELS.services_named, 25, 25, 'pass', `시술명 ${crawl.detectedServices.length}개 감지.`)
    : makeItem(LABELS.services_named, 25, 0, 'fail', '시술명 언급 없음.'));

  items.push(crawl.hasContactInfo
    ? makeItem(LABELS.contact_text, 15, 15, 'pass', '연락처 텍스트 감지됨.')
    : makeItem(LABELS.contact_text, 15, 0, 'fail', '연락처 텍스트 없음.'));

  items.push(crawl.hasAddress
    ? makeItem(LABELS.address_text, 15, 15, 'pass', '주소 텍스트 감지됨.')
    : makeItem(LABELS.address_text, 15, 0, 'fail', '주소 텍스트 없음.'));

  items.push(crawl.hasBusinessHours
    ? makeItem(LABELS.hours_text, 20, 20, 'pass', '영업시간 텍스트 감지됨.')
    : makeItem(LABELS.hours_text, 20, 0, 'fail', '영업시간 텍스트 없음.'));

  return toCategoryScore('aeo_geo', 'AEO/GEO 특화', items);
}

// ── public API ───────────────────────────────────────────

export function scoreCategories(args: {
  crawl: CrawlResult;
  psi: PsiResult | null;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
}): CategoryScore[] {
  return [
    scoreSecurityTech(args.crawl, args.psi, args.hasRobotsTxt, args.hasSitemap),
    scoreSiteStructure(args.crawl),
    scoreStructuredData(args.crawl),
    scoreContentQuality(args.crawl),
    scoreExternalChannels(args.crawl),
    scoreAeoGeo(args.crawl),
  ];
}

export function computeOverallScore(categories: CategoryScore[]): number {
  const totalWeight = categories.reduce((a, b) => a + b.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = categories.reduce((a, b) => a + b.score * b.weight, 0);
  return Math.round(weighted / totalWeight);
}
