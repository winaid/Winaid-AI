/**
 * AEO/GEO 진단 — 6 카테고리 채점 로직
 *
 * 순수 함수. 네트워크/DB 접근 없음. types.ts 의 인터페이스에 맞춰 반환.
 * CategoryScore.weight 는 0-100 (전체 가중치). 카테고리 내부 score 는 0-100 (가중 평균).
 *
 * LABELS / WEIGHTS 는 actionPlan.ts 에서 label 기반 조회를 위해 export.
 */

import type { CrawlResult, PsiResult, CategoryScore, CategoryItem, CategoryItemStatus } from './types';
import { filterMedicalLawViolations } from '../medicalLawFilter';

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
  news_mentions: '언론·건강칼럼 인용',
  owned_channels_diversity: '공식 채널 다양성',
  // ⑥ aeo_geo
  faq_structure: 'FAQ 구조',
  services_named: '시술명 언급',
  contact_text: '연락처 노출',
  address_text: '주소 노출',
  hours_text: '영업시간 노출',
  blog_searchable: '블로그 외부 검색 허용',
  // Tier 3-A 확장
  content_freshness: '콘텐츠 신선도',
  author_info: '저자(Author) 정보',
  image_optimization: '이미지 최적화 (WebP · Lazy)',
  ai_crawler_access: 'AI 크롤러 접근 허용',
  llms_txt: 'llms.txt 파일',
  review_schema: 'Review/평점 스키마',
  howto_schema: 'HowTo 스키마',
  // Phase 1 — security_tech 추가 항목
  canonical: 'Canonical URL 선언',
  // Phase 1 — content_quality 추가 항목
  favicon: '파비콘(사이트 아이콘)',
  // Phase 3 — content_quality 의료광고법
  medical_law_compliance: '의료광고법 준수',
  // Phase 4 — content_quality 추가 (NXT 동등 수준)
  title_length: '제목(Title) 길이',
  keyword_density: '본문 키워드 밀도',
  heading_hierarchy: '헤딩 계층 구조 (H1~H6)',
  paragraph_structure: '단락 구조 (P 태그 길이)',
  // Phase 4 — security_tech 추가
  html_size: 'HTML 페이지 사이즈',
  doctype: 'HTML5 Doctype 선언',
  // Phase 1 — external_channels 추가 항목
  og_bundle: 'OG 소셜 미리보기 (og:title·description·image)',
  twitter_card: 'Twitter Card 메타태그',
  charset_utf8: '문자 인코딩 (UTF-8)',
  // Phase 1 — security_headers 카테고리 (신규)
  response_status: 'HTTP 응답 상태 (200)',
  csp_header: 'Content-Security-Policy 헤더',
  hsts_header: 'Strict-Transport-Security 헤더',
  x_frame_header: 'X-Frame-Options 헤더',
  x_content_type_header: 'X-Content-Type-Options 헤더',
  referrer_policy_header: 'Referrer-Policy 헤더',
} as const;

export type LabelKey = keyof typeof LABELS;

const WEIGHTS: Record<string, number> = {
  security_tech: 12,
  security_headers: 8,
  site_structure: 22,
  structured_data: 12,
  content_quality: 23,
  external_channels: 13,
  aeo_geo: 10,
};

// ── 권장사항 맵 (label 기반) ───────────────────────────────

// LLM 실패 시 노출되는 fallback 문구. 톤: 중학생 기준 + 제작사 요청 스크립트.
// 상세 문구는 Sonnet 이 categoryRecommendations 로 덮어씀.
const RECOMMENDATIONS: Record<string, string> = {
  [LABELS.https]: '사이트가 http:// 로 열리면 브라우저가 "안전하지 않음" 경고를 띄웁니다. 제작사에 "전체 페이지 HTTPS 로 리다이렉트 + SSL 인증서 발급" 요청하세요.',
  [LABELS.viewport]: '모바일에서 글자가 작게 나옵니다. 제작사에 "head 에 viewport 메타 태그(width=device-width) 추가" 요청하세요.',
  [LABELS.robots]: '검색엔진·AI 가 이 사이트를 어디까지 읽어도 되는지 모릅니다. 제작사에 "사이트 루트에 robots.txt 배치 + 안에 Sitemap: 주소 포함" 요청하세요.',
  [LABELS.sitemap]: '페이지 지도(sitemap.xml) 가 없어 검색 색인이 누락될 수 있어요. 제작사에 요청: /sitemap.xml 생성 후 네이버 서치어드바이저·구글 서치콘솔에 제출.',
  [LABELS.psi]: '모바일 로딩이 느립니다. 제작사에 요청: 사진을 WebP(용량 반으로 줄이는 이미지 포맷) 로 변환(squoosh.app 무료 사용 가능), 화면 아래 이미지는 지연 로딩 적용.',
  [LABELS.own_domain]: '모두닥/하이닥/blog.naver 같은 플랫폼 페이지는 AI 가 "병원 공식 홈페이지" 로 인식하지 않아요. 병원 담당자가 가비아·호스팅케이알 등에서 자체 도메인(예: mysmile.co.kr) 을 구매하고 제작사에 홈페이지 제작 의뢰.',
  [LABELS.has_doctor_page]: '의료진 소개 페이지가 없으면 AI 가 이 병원 의사를 "누군가" 로 처리합니다. 홈페이지 관리자 모드에서 원장님 사진·이름·전공(또는 전문의 타이틀)·경력을 직접 업로드하거나, AI 로 초안 작성 후 검수해 게시.',
  [LABELS.has_treatment_page]: '진료 안내가 흩어져 있습니다. 제작사에 "진료 카테고리(일반진료/보철/교정 등) 별 페이지 정리" 요청하거나, 관리자 모드에서 직접 메뉴 구조 재배치.',
  [LABELS.has_service_details]: '주요 시술별 상세 페이지가 부족해 AI 가 "이 병원 뭐가 강점이냐" 에 답하지 못합니다. AI 로 시술별 설명·대상·과정 초안 작성 → 원장 검수 → 홈페이지 업로드.',
  [LABELS.has_location_page]: '"오시는 길" 이 없으면 AI 가 위치 질문에 답하기 어렵습니다. 관리자 모드에서 네이버 지도 iframe + 도로명 주소 + 주변 지하철/버스 안내 직접 추가.',
  [LABELS.has_faq_page]: '"자주 묻는 질문" 섹션이 없어 AI 가 인용할 출처가 부족합니다. AI 로 비용·예약·진료 관련 FAQ 10개 초안 작성 → 원장 검수 → 관리자 모드에서 업로드.',
  [LABELS.has_pricing_page]: '가격 정보가 불투명하면 AI 검색 대신 모두닥/하이닥이 추천됩니다. 관리자 모드에서 "상담 비용 안내" 페이지 작성 (구체 금액보다 범위·상담 기준).',
  [LABELS.dentist_schema]: 'AI 가 이 사이트를 "치과" 로 구분하지 못합니다. 제작사에 "Dentist 또는 LocalBusiness JSON-LD(검색엔진·AI 가 읽는 병원 명함 코드) 를 head 에 추가" 요청. search.google.com/test/rich-results 로 검증 가능.',
  [LABELS.organization_schema]: 'AI 가 병원 공식 계정을 연결하지 못합니다. 제작사에 요청: Organization 스키마 추가 — 상호·로고·대표전화·sameAs 배열에 네이버/카카오/인스타 URL 넣기.',
  [LABELS.breadcrumb_schema]: '하위 페이지가 검색 결과에서 경로 없이 뜹니다. 제작사에 "BreadcrumbList 스키마를 각 하위 페이지에 추가" 요청.',
  [LABELS.faq_schema]: 'FAQ 가 있어도 AI 가 Q&A 로 인식 못 합니다. 제작사에 "FAQPage JSON-LD 적용" 요청. 워드프레스면 플러그인으로 5분 안에 적용 가능.',
  [LABELS.profile_schema]: '의료진 정보가 있어도 AI 가 "실제 의사" 로 판단 못 합니다. 제작사에 "의료진 페이지에 Physician 또는 ProfilePage 스키마 추가" 요청.',
  [LABELS.h1_count]: '페이지 주제를 AI 가 찾기 어렵습니다. 제작사에 "각 페이지에 핵심 주제를 담은 H1 태그 1개만 두도록" 요청.',
  [LABELS.h2_count]: '본문 구조가 평평해 AI 가 핵심 정보를 놓칩니다. 관리자 모드에서 섹션 제목을 H2 로 3개 이상 나누거나, 제작사에 구조 개선 요청.',
  [LABELS.title_opt]: '검색 결과 제목에 지역·업종이 빠져 클릭이 적습니다. 제작사에 "title 태그를 \'{지역명}구 {병원명} - {업종}\' 형식으로 수정" 요청.',
  [LABELS.meta_desc]: '검색 미리보기가 자동 발췌라 매력도가 낮아요. 관리자 모드(또는 제작사 요청) 로 meta description 을 50~160자 내에 "어떤 진료·누구에게·어떤 특징" 이 드러나게 작성.',
  [LABELS.alt_ratio]: '이미지에 설명(alt 텍스트) 이 없어 AI 가 사진 내용을 모릅니다. 관리자 모드에서 각 이미지에 한 줄 설명 추가 (장식용은 alt="").',
  [LABELS.doctor_in_text]: '"원장" 만 있고 "전문의" 표기가 없어 AI 신뢰도가 떨어집니다. 관리자 모드 의료진 소개에 "구강외과 전문의", "치주과 전문의" 식으로 전문과 타이틀 명시.',
  [LABELS.word_count]: '본문이 짧아 AI 가 인용할 거리가 부족해요. AI 로 페이지당 500자 이상 초안 작성 → 원장 검수 후 업로드. 핵심 시술 설명부터 시작.',
  [LABELS.naver]: '네이버 플레이스에 등록 안 되어 있으면 한국 환자 검색에서 거의 노출 안 됩니다. 병원 담당자가 smartplace.naver.com 에서 직접 등록 후 홈페이지 푸터에 링크.',
  [LABELS.google]: 'Google 비즈니스 프로필이 없으면 Gemini 답변 후보에서 탈락합니다. 병원 담당자가 business.google.com 에서 직접 등록·사진/영업시간 업로드 → 홈페이지에 링크.',
  [LABELS.kakao]: '카카오톡 상담 경로가 없으면 젊은 환자층이 이탈합니다. 병원 담당자가 카카오비즈니스에서 채널 개설 → 홈페이지 푸터에 채널 ID 링크.',
  [LABELS.youtube]: 'AI 가 영상 콘텐츠로 병원 소개를 풍부하게 학습할 기회가 없습니다. 병원 담당자가 채널 개설 → 진료 안내/의료진 인터뷰 영상 업로드.',
  [LABELS.instagram]: 'Instagram 계정 링크가 없어 SNS 신호가 단절됩니다. 병원 담당자가 instagram.com 에서 개설 → 홈페이지 푸터에 링크.',
  [LABELS.sameas_schema]: 'AI 가 홈페이지·SNS·플레이스를 "같은 병원" 으로 연결하지 못합니다. 제작사에 "Organization 스키마의 sameAs 배열에 네이버·구글·카카오·유튜브·인스타 URL 전부 포함" 요청.',
  [LABELS.news_mentions]: '외부 인용 경로가 없으면 AI 가 이 병원을 "검증된 정보" 로 판단 안 해요. 병원 담당자가 지역 의료 전문지·건강 칼럼에 기고 요청 (데일리메디·닥터스뉴스 등).',
  [LABELS.owned_channels_diversity]: '공식 채널이 부족하면 AI 답변에 출처 후보가 좁아집니다. 병원 담당자가 네이버 플레이스·Google 비즈니스 프로필·카카오 채널 중 최소 3개 등록.',
  [LABELS.faq_structure]: 'AI 가 질문형 검색("{시술} 비용?") 에 답할 근거가 없어요. AI 로 FAQ 10개 초안 작성 → 원장 검수 → 관리자 모드 업로드 + 제작사에 FAQPage 스키마 적용 요청.',
  [LABELS.services_named]: 'AI 가 이 병원의 시술 종류를 모릅니다. 관리자 모드에서 본문·네비게이션 메뉴에 주요 시술명을 텍스트로 명시 (이미지 속 텍스트는 AI 가 읽지 못함).',
  [LABELS.contact_text]: '대표 전화번호가 드러나지 않아 AI 가 "연락처 질문" 에 답하지 못합니다. 관리자 모드에서 헤더·푸터 양쪽에 전화번호 텍스트 노출.',
  [LABELS.address_text]: '주소가 이미지로만 있거나 누락되면 AI 위치 검색에서 탈락합니다. 관리자 모드에서 푸터에 "{시/도} {구/군} {동/로}" 텍스트 직접 입력.',
  [LABELS.hours_text]: '"지금 여는 치과" 같은 AI 질문에 답하려면 영업시간 데이터가 필요합니다. 관리자 모드에서 진료시간·점심시간·휴진일 표로 표시.',
  [LABELS.blog_searchable]: '네이버 블로그가 기본적으로 검색 차단되어 있으면 AI 답변에 인용 안 됩니다. 병원 담당자가 네이버 블로그 관리자 > 기본설정 에서 "전체공개 + 외부 검색허용" 스위치 켜기.',
  // Phase 1 추가
  [LABELS.canonical]: '중복 URL 문제가 생길 수 있습니다. 제작사에 "각 페이지 head 에 canonical link 태그를 추가해주세요" 요청하세요.',
  [LABELS.favicon]: '파비콘이 없으면 브라우저 탭·즐겨찾기에 아이콘이 없어 신뢰도가 낮아 보입니다. 제작사에 "favicon.ico 또는 PNG 파비콘 추가" 요청하세요.',
  [LABELS.og_bundle]: 'OG 태그가 부족해 카카오·페이스북 등에 링크를 공유했을 때 미리보기가 제대로 안 나옵니다. 제작사에 "og:title·og:description·og:image 메타 태그 추가" 요청하세요.',
  [LABELS.twitter_card]: 'Twitter(X) 에 공유했을 때 카드가 나오지 않습니다. 제작사에 "meta name=\'twitter:card\' content=\'summary_large_image\' 추가" 요청하세요.',
  [LABELS.charset_utf8]: '문자 인코딩 선언이 없거나 UTF-8 이 아닙니다. 제작사에 "<meta charset=\'UTF-8\'> 을 head 맨 위에 추가" 요청하세요.',
  [LABELS.response_status]: 'HTTP 응답이 비정상입니다. 제작사에 메인 페이지가 200 OK 를 반환하는지 확인 요청하세요.',
  [LABELS.csp_header]: 'Content-Security-Policy(CSP) 헤더가 없어 XSS 공격에 취약할 수 있습니다. 제작사에 "응답 헤더에 Content-Security-Policy 설정" 요청하세요.',
  [LABELS.hsts_header]: 'Strict-Transport-Security(HSTS) 헤더가 없습니다. HTTPS 가 있어도 첫 접속 시 HTTP 로 잠시 노출될 수 있습니다. 제작사에 "HSTS 헤더 추가 (max-age=31536000)" 요청하세요.',
  [LABELS.x_frame_header]: 'X-Frame-Options 헤더가 없어 클릭재킹(Clickjacking) 공격에 취약할 수 있습니다. 제작사에 "X-Frame-Options: DENY 또는 SAMEORIGIN 헤더 추가" 요청하세요.',
  [LABELS.x_content_type_header]: 'X-Content-Type-Options 헤더가 없습니다. 브라우저의 MIME 스니핑이 활성화되어 취약점이 생길 수 있습니다. 제작사에 "X-Content-Type-Options: nosniff 헤더 추가" 요청하세요.',
  [LABELS.referrer_policy_header]: 'Referrer-Policy 헤더가 없습니다. 외부 링크 클릭 시 불필요한 정보가 전달될 수 있습니다. 제작사에 "Referrer-Policy: no-referrer-when-downgrade 헤더 추가" 요청하세요.',
  [LABELS.medical_law_compliance]: '"100%", "최고", "유일한", "완치", "부작용 없는" 같은 절대·단정 표현은 의료법 제56조(의료광고 금지) 위반 가능성이 있습니다. "대부분의 경우", "주력 시술", "환자 만족도 높은" 같은 일반화 표현으로 교체하세요.',
  [LABELS.title_length]: '제목은 30~60자 권장. 너무 짧으면 정보 부족, 너무 길면 검색 결과에서 잘립니다. 제작사에 "title 태그를 30~60자 범위로 조정 (지역+업종+특화 키워드)" 요청하세요.',
  [LABELS.keyword_density]: '주요 키워드는 본문의 0.5~3% 정도가 자연스럽습니다. 5% 초과하면 SEO 키워드 스터핑으로 페널티 가능. 자연스러운 문장 안에 분산 배치하세요.',
  [LABELS.heading_hierarchy]: 'H1 → H2 → H3 순서로 계층을 지키세요. H2 없이 H3 직접 사용은 SEO·접근성 저하. 제작사에 "헤딩 계층(H1 1개, H2 다음 H3) 정리" 요청하세요.',
  [LABELS.paragraph_structure]: '단락 평균 50~200자가 모바일 가독성 양호. 너무 긴 단락(400자+)은 모바일에서 읽기 부담. 관리자 모드에서 긴 단락을 의미 단위로 끊어 짧게 재구성하세요.',
  [LABELS.html_size]: '페이지 사이즈 200KB 이내 권장. 큰 사이트는 모바일 로딩이 느려 환자 이탈 위험. 제작사에 "이미지 압축(WebP) + 사용 안 하는 CSS/JS 제거" 요청하세요.',
  [LABELS.doctype]: 'HTML 첫 줄에 <!DOCTYPE html> 선언 필수. 없으면 브라우저 호환 모드(quirks mode) 로 동작해 레이아웃이 깨질 수 있습니다. 제작사에 "HTML5 Doctype 선언 추가" 요청하세요.',
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

  // canonical (Phase 1)
  items.push(crawl.canonical
    ? makeItem(LABELS.canonical, 10, 10, 'pass', `canonical: ${crawl.canonical}`, crawl.canonical)
    : makeItem(LABELS.canonical, 10, 0, 'fail', 'canonical link 없음 — 중복 URL 발생 시 SEO 불이익.'));

  // Phase 4: HTML 사이즈
  const sizeKb = (crawl.htmlSize ?? 0) / 1024;
  if (crawl.htmlSize === undefined || crawl.htmlSize === 0) {
    items.push(makeItem(LABELS.html_size, 6, 0, 'unknown', 'HTML 사이즈 측정 불가.'));
  } else if (sizeKb < 200) {
    items.push(makeItem(LABELS.html_size, 6, 6, 'pass', `${sizeKb.toFixed(0)}KB (가벼움)`, `${sizeKb.toFixed(0)}KB`));
  } else if (sizeKb < 500) {
    items.push(makeItem(LABELS.html_size, 6, 4, 'warning', `${sizeKb.toFixed(0)}KB — 200KB 이내 권장`, `${sizeKb.toFixed(0)}KB`));
  } else {
    items.push(makeItem(LABELS.html_size, 6, 1, 'fail', `${sizeKb.toFixed(0)}KB — 너무 큼, 모바일 로딩 느림`, `${sizeKb.toFixed(0)}KB`));
  }

  // Phase 4: HTML5 Doctype
  items.push(crawl.hasDoctype
    ? makeItem(LABELS.doctype, 4, 4, 'pass', '<!DOCTYPE html> 선언 OK')
    : makeItem(LABELS.doctype, 4, 0, 'fail', 'Doctype 선언 없음 — 브라우저 호환 모드(quirks mode) 위험.'));

  return toCategoryScore('security_tech', '보안 및 기술 기반', items);
}

// ── ⑦ security_headers (Phase 1) ─────────────────────────

function scoreSecurityHeaders(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const sh = crawl.securityHeaders;

  // HTTP 응답 상태 — 크롤 성공 시 항상 2xx. httpStatus 없으면 200 으로 가정.
  const status = crawl.httpStatus ?? 200;
  items.push(status >= 200 && status < 300
    ? makeItem(LABELS.response_status, 15, 15, 'pass', `HTTP ${status} — 정상 응답.`, String(status))
    : makeItem(LABELS.response_status, 15, 0, 'fail', `HTTP ${status} — 비정상 응답.`, String(status)));

  // CSP
  items.push(sh?.csp
    ? makeItem(LABELS.csp_header, 20, 20, 'pass', 'Content-Security-Policy 헤더 설정됨.')
    : makeItem(LABELS.csp_header, 20, 0, 'fail', 'Content-Security-Policy 없음 — XSS 취약 가능성.'));

  // HSTS
  items.push(sh?.hsts
    ? makeItem(LABELS.hsts_header, 20, 20, 'pass', `Strict-Transport-Security: ${sh.hsts}`)
    : makeItem(LABELS.hsts_header, 20, 0, 'fail', 'Strict-Transport-Security 없음 — HTTPS 강제 미적용.'));

  // X-Frame-Options
  items.push(sh?.xFrame
    ? makeItem(LABELS.x_frame_header, 15, 15, 'pass', `X-Frame-Options: ${sh.xFrame}`)
    : makeItem(LABELS.x_frame_header, 15, 0, 'fail', 'X-Frame-Options 없음 — Clickjacking 취약 가능성.'));

  // X-Content-Type-Options
  items.push(sh?.xContentType
    ? makeItem(LABELS.x_content_type_header, 15, 15, 'pass', `X-Content-Type-Options: ${sh.xContentType}`)
    : makeItem(LABELS.x_content_type_header, 15, 0, 'fail', 'X-Content-Type-Options 없음 — MIME 스니핑 취약 가능성.'));

  // Referrer-Policy
  items.push(sh?.referrer
    ? makeItem(LABELS.referrer_policy_header, 15, 15, 'pass', `Referrer-Policy: ${sh.referrer}`)
    : makeItem(LABELS.referrer_policy_header, 15, 0, 'fail', 'Referrer-Policy 없음 — 브라우저 기본값 사용 중.'));

  return toCategoryScore('security_headers', '보안 헤더', items);
}

// ── ② site_structure ──────────────────────────────────────

const PLATFORM_SUBDOMAINS = /(?:^|\.)(blog\.naver\.com|tistory\.com|wixsite\.com|cafe24\.com|modoo\.at|imweb\.me|goorm\.io|weebly\.com|strikingly\.com|modoodoc\.com|haidoc\.co\.kr|ddocdoc\.com|medius\.me)$/i;

/** 의료 플랫폼 외부 URL 패턴 — externalLinks 중 이 비중이 높으면 의존도 판정 */
const PLATFORM_DEPENDENCY_URL = /(modoodoc\.com|haidoc\.co\.kr|ddocdoc\.com|medius\.me|blog\.naver\.com)/i;

/** 언론·건강 칼럼 도메인 — news_mentions 판정 */
const NEWS_DOMAIN = /(news\.naver\.com|news\.daum\.net|yna\.co\.kr|newsis\.com|hankookilbo\.com|chosun\.com|joongang\.co\.kr|hani\.co\.kr|donga\.com|khan\.co\.kr|ohmynews\.com|edaily\.co\.kr|mk\.co\.kr|fnnews\.co\.kr|mt\.co\.kr|asiae\.co\.kr|dailymedi\.com|dentalnews\.or\.kr|doctorsnews\.co\.kr|mdtoday\.co\.kr|monews\.co\.kr|healthcare\.co\.kr|hidoc\.co\.kr|kormedi\.com|medicaltimes\.com)/i;

/** 전문의 타이틀 — specialist_mentioned 판정 */
const SPECIALIST_TITLE = /구강외과\s*전문의|구강악안면외과\s*전문의|치주과\s*전문의|보존과\s*전문의|교정과\s*전문의|소아치과\s*전문의|통합치의학과\s*전문의|보철과\s*전문의|치과보철과\s*전문의|피부과\s*전문의|성형외과\s*전문의|정형외과\s*전문의|내과\s*전문의|이비인후과\s*전문의|가정의학과\s*전문의|안과\s*전문의/;

/** 네이버 블로그 URL — blog_searchable 판정용 휴리스틱 */
const NAVER_BLOG_URL = /(?:^|\/\/)(?:m\.)?blog\.naver\.com\//i;

function scoreSiteStructure(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];

  // ── own_domain 3단계 판정 (25점) ──
  // pass: 자체 도메인 / warning: 플랫폼 서브도메인이지만 외부링크 플랫폼 의존 < 80%
  // fail: 플랫폼 서브도메인 + 외부링크 플랫폼 의존 80%+
  let ownDomainHost = '';
  let isPlatform = false;
  try {
    const u = new URL(crawl.finalUrl);
    ownDomainHost = u.hostname;
    isPlatform = PLATFORM_SUBDOMAINS.test(u.hostname);
  } catch { /* ownDomainHost='' → pass 처리 */ }

  if (!isPlatform) {
    items.push(makeItem(LABELS.own_domain, 25, 25, 'pass', `자체 도메인 사용 중 (${ownDomainHost || 'unknown'}).`));
  } else {
    const ext = crawl.externalLinks;
    const platformHits = ext.filter(l => PLATFORM_DEPENDENCY_URL.test(l.href)).length;
    const ratio = ext.length > 0 ? platformHits / ext.length : 0;
    if (ratio >= 0.8 || ext.length === 0) {
      items.push(makeItem(LABELS.own_domain, 25, 0, 'fail',
        `플랫폼 서브도메인 + 외부 링크의 ${Math.round(ratio * 100)}% 가 의료 플랫폼(모두닥/하이닥 등) 의존 — AI 검색에 가장 불리.`, ownDomainHost));
    } else {
      items.push(makeItem(LABELS.own_domain, 25, 10, 'warning',
        `플랫폼 서브도메인 사용 중 (자체 채널 일부 존재) — 자체 도메인으로 이전 권장.`, ownDomainHost));
    }
  }

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
    ? makeItem(LABELS.has_service_details, 10, 10, 'pass', `시술명 ${svcCount}개 감지.`, String(svcCount))
    : makeItem(LABELS.has_service_details, 10, 0, 'fail', `시술명 ${svcCount}개만 감지 — 상세 부족.`, String(svcCount)));

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

  // Tier 3-A #11: Review/AggregateRating + HowTo 스키마
  items.push(crawl.schemaTypes.some((t) => /review|aggregaterating/i.test(t))
    ? makeItem(LABELS.review_schema, 10, 10, 'pass', 'Review/AggregateRating 스키마 발견.')
    : makeItem(LABELS.review_schema, 10, 0, 'fail', 'Review/AggregateRating 스키마 없음 — 환자 리뷰를 구조화 데이터로 마크업하면 AI 답변에 인용됩니다.'));

  items.push(crawl.schemaTypes.some((t) => /howto/i.test(t))
    ? makeItem(LABELS.howto_schema, 10, 10, 'pass', 'HowTo 스키마 발견.')
    : makeItem(LABELS.howto_schema, 10, 0, 'fail', 'HowTo 스키마 없음 — 시술 과정을 HowTo 로 마크업하면 "임플란트 과정" 같은 질문에 AI 가 인용합니다.'));

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
    items.push(makeItem(LABELS.alt_ratio, 10, 0, 'unknown', '이미지 없음 — 측정 불가.', '0'));
  } else {
    const ratio = (crawl.totalImages - crawl.imagesWithoutAlt) / crawl.totalImages;
    const pct = Math.round(ratio * 100);
    if (ratio >= 0.8) items.push(makeItem(LABELS.alt_ratio, 10, 10, 'pass', `alt 비율 ${pct}%.`, `${pct}%`));
    else if (ratio >= 0.5) items.push(makeItem(LABELS.alt_ratio, 10, 5, 'warning', `alt 비율 ${pct}% — 80% 권장.`, `${pct}%`));
    else items.push(makeItem(LABELS.alt_ratio, 10, 0, 'fail', `alt 비율 ${pct}% — 다수 이미지 alt 누락.`, `${pct}%`));
  }

  // ── doctor_in_text 3단계 판정 (20점) ──
  // pass: 전문의 + 전문과 타이틀 명시 / warning: 의료진 키워드만 / fail: 없음
  const hasSpecialist = SPECIALIST_TITLE.test(crawl.textContent);
  if (hasSpecialist) {
    items.push(makeItem(LABELS.doctor_in_text, 20, 20, 'pass', '본문에 전문의 + 전문과 타이틀 명시 — AI 가 의료 권위 인식 가능.'));
  } else if (crawl.hasDoctorInfo) {
    items.push(makeItem(LABELS.doctor_in_text, 20, 10, 'warning', '의료진 키워드는 있지만 "전문의" 타이틀·전문과 명시 부족.'));
  } else {
    items.push(makeItem(LABELS.doctor_in_text, 20, 0, 'fail', '본문에 의료진·전문의 정보 부족.'));
  }

  items.push(crawl.wordCount >= 500
    ? makeItem(LABELS.word_count, 10, 10, 'pass', `본문 ${crawl.wordCount}자.`, String(crawl.wordCount))
    : makeItem(LABELS.word_count, 10, 0, 'fail', `본문 ${crawl.wordCount}자 — 500자 이상 권장.`, String(crawl.wordCount)));

  // Tier 3-A #8: 콘텐츠 신선도
  const freshDate = crawl.dateModified || crawl.datePublished;
  if (freshDate) {
    const age = Date.now() - new Date(freshDate).getTime();
    items.push(age < 90 * 86_400_000
      ? makeItem(LABELS.content_freshness, 10, 10, 'pass', `최근 수정: ${freshDate.slice(0, 10)}.`)
      : age < 365 * 86_400_000
        ? makeItem(LABELS.content_freshness, 10, 5, 'warning', `마지막 수정: ${freshDate.slice(0, 10)} (3개월 이상 경과).`)
        : makeItem(LABELS.content_freshness, 10, 0, 'fail', `마지막 수정: ${freshDate.slice(0, 10)} (1년 이상 경과).`));
  } else {
    items.push(makeItem(LABELS.content_freshness, 10, 0, 'unknown', '수정 날짜 정보 없음.'));
  }

  // Tier 3-A #12: Author
  items.push(crawl.author
    ? makeItem(LABELS.author_info, 10, 10, 'pass', `저자: ${crawl.author}`)
    : makeItem(LABELS.author_info, 10, 0, 'warning', '저자(Author) 정보가 표시되지 않았습니다.'));

  // Tier 3-A #13: 이미지 최적화
  const opt = crawl.imageOptimization;
  if (opt && opt.totalImages > 0) {
    const webpR = opt.webpCount / opt.totalImages;
    const lazyR = opt.lazyCount / opt.totalImages;
    items.push(webpR >= 0.5 && lazyR >= 0.5
      ? makeItem(LABELS.image_optimization, 10, 10, 'pass', `WebP ${Math.round(webpR * 100)}% · Lazy ${Math.round(lazyR * 100)}%.`)
      : webpR >= 0.3 || lazyR >= 0.3
        ? makeItem(LABELS.image_optimization, 10, 5, 'warning', `WebP ${Math.round(webpR * 100)}% · Lazy ${Math.round(lazyR * 100)}% — 50% 이상 권장.`)
        : makeItem(LABELS.image_optimization, 10, 0, 'fail', `WebP ${Math.round(webpR * 100)}% · Lazy ${Math.round(lazyR * 100)}% — 이미지 최적화 필요.`));
  } else {
    items.push(makeItem(LABELS.image_optimization, 10, 0, 'unknown', '이미지가 없거나 분석할 수 없습니다.'));
  }

  // favicon (Phase 1)
  items.push(crawl.favicon
    ? makeItem(LABELS.favicon, 8, 8, 'pass', `파비콘 감지: ${crawl.favicon}`, crawl.favicon)
    : makeItem(LABELS.favicon, 8, 0, 'warning', '파비콘 없음 — 브라우저 탭·북마크에 아이콘이 없어 신뢰도가 낮아 보임.'));

  // ── Phase 4 — Title 길이 (6점) ──
  const titleLen = (crawl.title || '').length;
  if (titleLen === 0) {
    items.push(makeItem(LABELS.title_length, 6, 0, 'fail', '<title> 태그 없음', '0자'));
  } else if (titleLen >= 30 && titleLen <= 60) {
    items.push(makeItem(LABELS.title_length, 6, 6, 'pass', `제목 ${titleLen}자 (적정)`, `${titleLen}자`));
  } else if ((titleLen >= 20 && titleLen < 30) || (titleLen > 60 && titleLen <= 80)) {
    items.push(makeItem(LABELS.title_length, 6, 4, 'warning', `제목 ${titleLen}자 — 30~60자 권장`, `${titleLen}자`));
  } else {
    items.push(makeItem(LABELS.title_length, 6, 1, 'fail', `제목 ${titleLen}자 — 검색 결과 노출에 부적합`, `${titleLen}자`));
  }

  // ── Phase 4 — 키워드 밀도 (6점) ──
  // title 첫 단어(파이프/콜론/하이픈 이전 부분)를 핵심 키워드로 간주.
  const titleFirst = (crawl.title || '').replace(/[|\-:].*$/, '').trim().split(/\s+/)[0] ?? '';
  if (!titleFirst || titleFirst.length < 2) {
    items.push(makeItem(LABELS.keyword_density, 6, 3, 'warning', '제목에서 키워드 추출 불가.', ''));
  } else {
    const text = crawl.textContent || '';
    const safePat = titleFirst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(safePat, 'gi')) ?? [];
    const totalWords = text.split(/\s+/).filter(Boolean).length || 1;
    const density = (matches.length / totalWords) * 100;
    const dPct = density.toFixed(1);
    if (density >= 0.5 && density <= 3) {
      items.push(makeItem(LABELS.keyword_density, 6, 6, 'pass', `"${titleFirst}" 키워드 밀도 ${dPct}%`, `${dPct}%`));
    } else if (density > 3 && density <= 5) {
      items.push(makeItem(LABELS.keyword_density, 6, 3, 'warning', `"${titleFirst}" 밀도 ${dPct}% — 살짝 높음`, `${dPct}%`));
    } else if (density > 5) {
      items.push(makeItem(LABELS.keyword_density, 6, 1, 'fail', `"${titleFirst}" 밀도 ${dPct}% — 키워드 스터핑 의심`, `${dPct}%`));
    } else {
      items.push(makeItem(LABELS.keyword_density, 6, 2, 'warning', `"${titleFirst}" 밀도 ${dPct}% — 부족 (0.5~3% 권장)`, `${dPct}%`));
    }
  }

  // ── Phase 4 — 헤딩 계층 (6점) ──
  const h1n = crawl.h1.length;
  const h2n = crawl.h2.length;
  const h3n = crawl.h3Count ?? 0;
  const h4n = crawl.h4Count ?? 0;
  const skipsH2 = h3n > 0 && h2n === 0;
  const skipsH1 = h2n > 0 && h1n === 0;
  if (h1n === 1 && !skipsH2 && !skipsH1) {
    items.push(makeItem(LABELS.heading_hierarchy, 6, 6, 'pass', `계층 정상 (H1×${h1n}, H2×${h2n}, H3×${h3n}${h4n ? `, H4×${h4n}` : ''}).`));
  } else if (skipsH2 || skipsH1) {
    items.push(makeItem(LABELS.heading_hierarchy, 6, 2, 'warning', `계층 건너뜀 (H1×${h1n}, H2×${h2n}, H3×${h3n}) — 순서 어긋남.`));
  } else if (h1n !== 1) {
    items.push(makeItem(LABELS.heading_hierarchy, 6, 3, 'warning', `H1 ${h1n}개 — 페이지당 1개 권장.`, `H1×${h1n}`));
  } else {
    items.push(makeItem(LABELS.heading_hierarchy, 6, 4, 'pass', `H1×${h1n}, H2×${h2n}, H3×${h3n}.`));
  }

  // ── Phase 4 — 단락 구조 (6점) ──
  const pLengths = crawl.paragraphLengths ?? [];
  if (pLengths.length === 0) {
    items.push(makeItem(LABELS.paragraph_structure, 6, 1, 'fail', 'P 태그 단락 없음 — 본문이 평탄하거나 div/span 으로만 구성됨.'));
  } else {
    const avgP = pLengths.reduce((a, b) => a + b, 0) / pLengths.length;
    const avgRound = Math.round(avgP);
    if (avgP >= 50 && avgP <= 200) {
      items.push(makeItem(LABELS.paragraph_structure, 6, 6, 'pass', `단락 ${pLengths.length}개, 평균 ${avgRound}자.`, `평균 ${avgRound}자`));
    } else if (avgP > 200 && avgP <= 400) {
      items.push(makeItem(LABELS.paragraph_structure, 6, 3, 'warning', `단락 평균 ${avgRound}자 — 모바일에서 읽기 부담.`, `평균 ${avgRound}자`));
    } else if (avgP > 400) {
      items.push(makeItem(LABELS.paragraph_structure, 6, 1, 'fail', `단락 평균 ${avgRound}자 — 매우 김.`, `평균 ${avgRound}자`));
    } else {
      items.push(makeItem(LABELS.paragraph_structure, 6, 2, 'warning', `단락 평균 ${avgRound}자 — 너무 짧음.`, `평균 ${avgRound}자`));
    }
  }

  // Phase 3 — 의료광고법 위반 검출 (filterMedicalLawViolations 재활용)
  const violations = filterMedicalLawViolations(crawl.textContent || '');
  const violationCount = violations.replacedCount;
  if (violationCount === 0) {
    items.push(makeItem(LABELS.medical_law_compliance, 12, 12, 'pass', '의료광고법 위반 가능 표현이 발견되지 않음.', '0건'));
  } else if (violationCount <= 3) {
    items.push(makeItem(
      LABELS.medical_law_compliance, 12, 8, 'warning',
      `의료광고법 위반 가능 표현 ${violationCount}건 검출 (예: ${violations.foundTerms.slice(0, 3).join(', ')}).`,
      `${violationCount}건`,
    ));
  } else {
    items.push(makeItem(
      LABELS.medical_law_compliance, 12, 3, 'fail',
      `의료광고법 위반 가능 표현 ${violationCount}건 검출 (예: ${violations.foundTerms.slice(0, 3).join(', ')}). 환자 민원·처분 위험.`,
      `${violationCount}건`,
    ));
  }

  return toCategoryScore('content_quality', '콘텐츠 품질', items);
}

// ── ⑤ external_channels ──────────────────────────────────

function scoreExternalChannels(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const haystack = externalLinksHaystack(crawl);
  const sameAs = collectSameAs(crawl.schemaMarkup).join(' ').toLowerCase();

  const checks: Array<{ key: LabelKey; points: number; re: RegExp }> = [
    { key: 'naver', points: 12, re: /place\.map\.naver|blog\.naver|naver\.me|m\.place\.naver/i },
    { key: 'google', points: 12, re: /maps\.google|goo\.gl\/maps|g\.co\/kgs|business\.google/i },
    { key: 'kakao', points: 10, re: /pf\.kakao|kakao\.com\/_|kko\.to/i },
    { key: 'youtube', points: 10, re: /youtube\.com\/@|youtu\.be/i },
    { key: 'instagram', points: 8, re: /instagram\.com\//i },
  ];

  let channelPassCount = 0;
  for (const c of checks) {
    if (c.re.test(haystack)) {
      items.push(makeItem(LABELS[c.key], c.points, c.points, 'pass', `외부 링크에서 감지됨.`));
      channelPassCount++;
    } else {
      items.push(makeItem(LABELS[c.key], c.points, 0, 'fail', `외부 링크에서 감지 안 됨.`));
    }
  }

  // sameAs (13점)
  const anyChannelRe = /place\.map\.naver|blog\.naver|naver\.me|maps\.google|goo\.gl\/maps|business\.google|pf\.kakao|kakao\.com\/_|youtube\.com|instagram\.com/i;
  items.push(anyChannelRe.test(sameAs)
    ? makeItem(LABELS.sameas_schema, 13, 13, 'pass', '스키마 sameAs 에 채널 URL 포함.')
    : makeItem(LABELS.sameas_schema, 13, 0, 'fail', '스키마 sameAs 미설정.'));

  // ── news_mentions (15점) — 언론·건강 칼럼 인용 ──
  const newsHit = crawl.externalLinks.filter(l => NEWS_DOMAIN.test(l.href)).length;
  items.push(newsHit > 0
    ? makeItem(LABELS.news_mentions, 15, 15, 'pass', `언론/건강칼럼 링크 ${newsHit}건 감지 — 외부 인용 경로 확보.`, String(newsHit))
    : makeItem(LABELS.news_mentions, 15, 0, 'fail', '언론·건강칼럼 인용 없음 — AI 가 외부 출처로 참조할 근거 부족.'));

  // ── owned_channels_diversity (20점) — 공식 채널 다양성 ──
  if (channelPassCount >= 3) {
    items.push(makeItem(LABELS.owned_channels_diversity, 20, 20, 'pass', `공식 채널 ${channelPassCount}개 확보 — 다양성 우수.`, `${channelPassCount}/5`));
  } else if (channelPassCount >= 1) {
    items.push(makeItem(LABELS.owned_channels_diversity, 20, 10, 'warning', `공식 채널 ${channelPassCount}개 — 3개 이상 권장.`, `${channelPassCount}/5`));
  } else {
    items.push(makeItem(LABELS.owned_channels_diversity, 20, 0, 'fail', '공식 채널 0개 — 네이버 플레이스/GBP/카카오 등록 필요.', '0/5'));
  }

  // OG 번들 (Phase 1)
  const ogHasTitle = !!crawl.ogTags['og:title'];
  const ogHasDesc = !!crawl.ogTags['og:description'];
  const ogHasImage = !!crawl.ogTags['og:image'];
  const ogScore = (ogHasTitle ? 1 : 0) + (ogHasDesc ? 1 : 0) + (ogHasImage ? 1 : 0);
  if (ogScore === 3) {
    items.push(makeItem(LABELS.og_bundle, 10, 10, 'pass', 'og:title·description·image 모두 설정됨.'));
  } else if (ogScore >= 1) {
    const missing = ['og:title', 'og:description', 'og:image'].filter(k => !crawl.ogTags[k]).join(', ');
    items.push(makeItem(LABELS.og_bundle, 10, 5, 'warning', `OG 태그 일부 누락 (${missing}).`));
  } else {
    items.push(makeItem(LABELS.og_bundle, 10, 0, 'fail', 'OG 태그 없음 — 소셜 미리보기 불가.'));
  }

  // Twitter Card (Phase 1)
  const hasTwitterCard = !!(crawl.twitterTags?.['twitter:card']);
  items.push(hasTwitterCard
    ? makeItem(LABELS.twitter_card, 8, 8, 'pass', `twitter:card="${crawl.twitterTags!['twitter:card']}" 설정됨.`)
    : makeItem(LABELS.twitter_card, 8, 0, 'fail', 'Twitter Card 메타태그 없음 — X(트위터) 공유 미리보기 불가.'));

  // charset (Phase 1)
  const charsetVal = crawl.charset || '';
  if (/utf-?8/i.test(charsetVal)) {
    items.push(makeItem(LABELS.charset_utf8, 5, 5, 'pass', `charset: ${crawl.charset}`, crawl.charset));
  } else if (charsetVal) {
    items.push(makeItem(LABELS.charset_utf8, 5, 2, 'warning', `charset: ${crawl.charset} — UTF-8 권장.`, crawl.charset));
  } else {
    items.push(makeItem(LABELS.charset_utf8, 5, 0, 'fail', 'charset 선언 없음 — 한글 깨짐 가능성.'));
  }

  return toCategoryScore('external_channels', '외부 채널 연결', items);
}

// ── ⑥ aeo_geo ────────────────────────────────────────────

function scoreAeoGeo(crawl: CrawlResult): CategoryScore {
  const items: CategoryItem[] = [];
  const hasFaqSchema = crawl.schemaTypes.some(t => t.toLowerCase() === 'faqpage');

  items.push(crawl.hasFAQ || hasFaqSchema
    ? makeItem(LABELS.faq_structure, 22, 22, 'pass', 'FAQ 구조 감지됨.')
    : makeItem(LABELS.faq_structure, 22, 0, 'fail', 'FAQ 구조 없음.'));

  items.push(crawl.detectedServices.length >= 1
    ? makeItem(LABELS.services_named, 22, 22, 'pass', `시술명 ${crawl.detectedServices.length}개 감지.`)
    : makeItem(LABELS.services_named, 22, 0, 'fail', '시술명 언급 없음.'));

  items.push(crawl.hasContactInfo
    ? makeItem(LABELS.contact_text, 13, 13, 'pass', '연락처 텍스트 감지됨.')
    : makeItem(LABELS.contact_text, 13, 0, 'fail', '연락처 텍스트 없음.'));

  items.push(crawl.hasAddress
    ? makeItem(LABELS.address_text, 13, 13, 'pass', '주소 텍스트 감지됨.')
    : makeItem(LABELS.address_text, 13, 0, 'fail', '주소 텍스트 없음.'));

  items.push(crawl.hasBusinessHours
    ? makeItem(LABELS.hours_text, 18, 18, 'pass', '영업시간 텍스트 감지됨.')
    : makeItem(LABELS.hours_text, 18, 0, 'fail', '영업시간 텍스트 없음.'));

  // ── blog_searchable (12점, 기본 unknown — 크롤러로 정확 검증 불가) ──
  // 네이버 블로그 URL 감지 시 "수동 확인 필요" detail 로 안내
  const hasNaverBlog = crawl.externalLinks.some(l => NAVER_BLOG_URL.test(l.href));
  items.push(makeItem(
    LABELS.blog_searchable, 12, 0, 'unknown',
    hasNaverBlog
      ? '네이버 블로그 감지됨. 관리자 페이지에서 "전체공개 + 외부 검색허용" 설정 직접 확인 필요 (크롤러로 측정 불가).'
      : '네이버 블로그 링크가 없어 외부 검색 허용 설정을 점검할 수 없습니다.',
    hasNaverBlog ? '수동 확인 필요' : '대상 없음',
  ));

  // Tier 3-A #9: AI 크롤러 허용
  const aip = crawl.aiCrawlerPolicy;
  if (aip) {
    const allowed = Object.values(aip).filter((v) => v === 'allowed').length;
    items.push(allowed >= 3
      ? makeItem(LABELS.ai_crawler_access, 12, 12, 'pass', `AI 크롤러 ${allowed}/5 허용.`)
      : allowed >= 1
        ? makeItem(LABELS.ai_crawler_access, 12, 6, 'warning', `AI 크롤러 ${allowed}/5 만 허용 — 나머지 차단됨.`)
        : makeItem(LABELS.ai_crawler_access, 12, 0, 'fail', 'robots.txt 에서 주요 AI 크롤러가 모두 차단됨.'));
  } else {
    items.push(makeItem(LABELS.ai_crawler_access, 12, 6, 'unknown', 'robots.txt 에 AI 크롤러 관련 설정 없음 (기본 허용 추정).'));
  }

  // Tier 3-A #10: llms.txt
  items.push(crawl.hasLlmsTxt
    ? makeItem(LABELS.llms_txt, 8, 8, 'pass', '/llms.txt 발견 — AI 가 사이트 정보를 올바르게 파악 가능.')
    : makeItem(LABELS.llms_txt, 8, 0, 'fail', '/llms.txt 없음 — AI 가 사이트 구조를 별도로 학습해야 합니다.'));

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
    scoreSecurityHeaders(args.crawl),
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
