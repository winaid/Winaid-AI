/**
 * AEO/GEO 진단 — 우선 조치 계획 생성
 *
 * CategoryScore[] 에서 fail/warning 항목을 뽑아 impact/difficulty/timeframe 메타와
 * 함께 ActionItem 으로 변환. 사용자가 "오늘 바로 손댈 수 있는 큰 한 방"부터 보도록
 * 난이도(쉬움 우선) → 영향도(큼 우선) → 기간(즉시 우선) 순으로 정렬해 최대 10개 반환.
 */

import type { CategoryScore, ActionItem } from './types';
import { LABELS } from './scoring';

interface ActionMeta {
  impact: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  timeframe: '즉시' | '1주' | '2주' | '1개월';
  actionText: string;
  /**
   * 60대 원장님이 직접 제작사에 요청·실행할 수 있도록 한 상세 가이드.
   * 단계 A: 모든 항목 빈 문자열로 시작. 단계 B 에서 LABEL 별로 채움.
   * 형식: "이게 뭐예요? / 어떻게 하나요? / 팁" 3섹션, 마크다운 X.
   */
  detailedGuide: string;
}

// label 기반 액션 메타 (scoring.ts 의 LABELS 와 동일 문자열 키).
// actionText 는 동사 시작 한 문장 제목 역할. 상세 설명은 LLM 이 categoryRecommendations 로 맡음.
// 톤: 중학생 기준 + 제작사 요청 스크립트. suffix 금지 (executor 필드로 분류).
const ACTION_META: Record<string, ActionMeta> = {
  // ① security_tech
  [LABELS.https]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "SSL 인증서 발급 + 전 페이지 HTTPS 리다이렉트" 요청',
    detailedGuide: `이게 뭐예요?
홈페이지 주소 앞 자물쇠 표시(🔒)를 만드는 보안 인증서입니다. 없으면 구글·네이버·AI 가 "안전하지 않은 사이트"로 분류해서 추천에서 밀립니다.

어떻게 하나요?
1. 홈페이지를 만들어준 제작사(업체)에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "SSL 인증서를 발급하고 모든 페이지를 https:// 로 강제 리다이렉트(자동 이동) 해주세요. Let's Encrypt 무료 인증서면 충분합니다."
3. 보통 1~2일이면 끝납니다. 무료 또는 호스팅비에 포함된 경우가 많습니다.

팁
- 작업 후 본인 사이트 주소창 앞에 🔒 자물쇠가 보이는지 확인하세요.
- 호스팅 업체가 자동 발급해주는 곳도 많아 추가 비용 없이 끝나기도 합니다.`,
  },
  [LABELS.viewport]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "head 에 viewport 메타 태그 추가 (모바일 레이아웃)" 요청',
    detailedGuide: `이게 뭐예요?
홈페이지가 스마트폰에서 제대로 보이게 하는 작은 설정입니다. 없으면 글씨가 너무 작게 나오거나 옆으로 스크롤이 생깁니다.

어떻게 하나요?
1. 홈페이지를 만들어준 제작사(업체)에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "head 태그에 viewport 메타 태그 추가 부탁드립니다. width=device-width, initial-scale=1.0"
3. 제작사가 5~10분이면 끝냅니다. 대부분 무료로 해줍니다.

팁
- 본인이 직접 코드를 만지지 않아도 됩니다.
- pagespeed.web.dev 에서 모바일 점수로 효과 확인 가능.`,
  },
  [LABELS.robots]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "사이트 루트에 robots.txt 배치 + Sitemap 디렉티브 포함" 요청',
    detailedGuide: `이게 뭐예요?
검색엔진(구글·네이버) 로봇에게 "이 페이지는 봐도 됩니다 / 안 됩니다"를 알려주는 작은 안내문 파일입니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "사이트 루트에 robots.txt 를 배치해주세요. 내용은 'User-agent: *  Allow: /  Sitemap: https://[우리 사이트 주소]/sitemap.xml' 으로요."
3. 10~15분이면 끝납니다. 무료입니다.

팁
- 작업 후 "[우리 사이트 주소]/robots.txt" 로 직접 접속해서 파일이 보이면 정상입니다.
- 제작사가 잘못 설정하면 사이트가 검색에서 사라질 수도 있어 꼭 확인하세요.`,
  },
  [LABELS.sitemap]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "sitemap.xml 생성" 요청 후 네이버 서치어드바이저·구글 서치콘솔 제출',
    detailedGuide: `이게 뭐예요?
홈페이지 안의 모든 페이지 목록을 정리한 지도 파일입니다. 검색엔진과 AI 가 "이 사이트엔 어떤 페이지들이 있구나" 빠르게 파악합니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "sitemap.xml 을 자동 생성하도록 설정하고 사이트 루트에 배치해주세요. 페이지가 늘어나면 자동 갱신되는 방식이면 좋습니다."
3. 그다음 네이버 서치어드바이저(searchadvisor.naver.com) 와 구글 서치 콘솔(search.google.com/search-console) 에 사이트맵 주소를 등록해주세요.

팁
- 한 번 등록해두면 이후엔 손이 갈 일이 거의 없습니다.
- robots.txt 안에 sitemap 주소가 들어 있으면 검색엔진이 더 빨리 찾습니다.`,
  },
  [LABELS.psi]: {
    impact: 'high', difficulty: 'hard', timeframe: '1개월',
    actionText: '제작사에 "사진 WebP 변환(용량 반 감소) + 지연 로딩 + 코드 분할" 요청 (squoosh.app 활용)',
    detailedGuide: `이게 뭐예요?
홈페이지가 스마트폰에서 얼마나 빨리 뜨는지 점수입니다. 50점 미만이면 사용자가 페이지가 뜨기 전에 떠나고 AI 추천에서도 불리해집니다.

어떻게 하나요?
1. pagespeed.web.dev 에서 본인 홈페이지 주소를 입력해 점수를 확인하세요.
2. 제작사에 다음 문구를 보내세요:
   "PageSpeed Insights 점수가 ___점입니다. 사진을 WebP 로 변환(용량 반 감소)하고 지연 로딩(Lazy Load), 자바스크립트 코드 분할(Code Split) 작업 부탁드립니다."
3. 보통 1~2주가 걸리고 비용이 발생할 수 있습니다.

팁
- squoosh.app 또는 tinypng.com 에서 사진을 직접 압축해 제작사에 보낼 수도 있습니다.
- 점수보다 LCP(가장 큰 요소가 보이는 시간) 가 2.5초 미만인지가 더 중요합니다.`,
  },

  // ② site_structure
  [LABELS.own_domain]: {
    impact: 'high', difficulty: 'hard', timeframe: '1개월',
    actionText: '병원 담당자가 자체 도메인 구매 후 제작사에 홈페이지 이전 의뢰 (모두닥/하이닥 등 플랫폼은 AI 가산점 없음)',
    detailedGuide: `이게 뭐예요?
"우리병원이름.kr" 처럼 본인 소유의 주소입니다. 모두닥·하이닥·네이버 블로그만 쓰면 AI 는 "이 병원만의 공식 정보가 없다"고 판단해 추천에서 밀립니다.

어떻게 하나요?
1. 가비아(gabia.com) 또는 후이즈(whois.co.kr) 에서 도메인을 구매하세요. (.kr 또는 .co.kr 추천, 연 1~2만원)
2. 제작사에 다음 문구를 보내세요:
   "구매한 도메인 [도메인명] 으로 홈페이지를 이전해주세요. 기존 플랫폼에 있던 콘텐츠도 모두 옮겨주시고요."
3. 보통 2~4주 걸리고 비용이 발생합니다(견적 필요).

팁
- 도메인은 한번 사면 5~10년치를 한꺼번에 결제하는 게 갱신 잊을 일 없어 안전합니다.
- 기존 플랫폼은 한동안 같이 운영하다 안정되면 정리하세요.`,
  },
  [LABELS.has_doctor_page]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: 'AI 로 의료진 소개 초안 작성 후 원장 검수 → 홈페이지 업로드 (이름·전공·경력·사진)',
    detailedGuide: `이게 뭐예요?
원장님과 의료진을 소개하는 별도 페이지입니다. AI 가 "이 병원에 어떤 전문의가 있나" 파악하는 가장 중요한 자료입니다.

어떻게 하나요?
1. WINAID "AI 보정" 또는 "블로그 생성" 으로 의료진 소개 초안을 만드세요.
2. 원장님이 직접 검수해 사실 관계를 확인하세요. (이름·전공·졸업·경력·소속 학회·자격증·진료 분야·사진)
3. 제작사 또는 관리자 모드에서 "의료진 소개" 메뉴를 만들고 업로드하세요.

팁
- 사진은 깨끗한 흰 배경에 가운 입은 얼굴 사진이 가장 좋습니다.
- "구강외과 전문의", "치주과 전문의" 같은 공식 타이틀을 꼭 텍스트로 명시하세요.`,
  },
  [LABELS.has_treatment_page]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "진료 안내 페이지를 카테고리로 정리" 요청 또는 관리자 모드에서 메뉴 재배치',
    detailedGuide: `이게 뭐예요?
"임플란트 / 교정 / 충치치료" 같은 진료 카테고리별 안내 페이지입니다. AI 가 "이 병원이 어떤 진료를 하나" 빠르게 파악합니다.

어떻게 하나요?
1. 제작사 또는 관리자 모드에서 메뉴를 진료 카테고리로 정리하세요.
2. 제작사에 다음 문구를 보내세요:
   "진료 안내 메뉴를 '임플란트 / 신경치료 / 보철 / 교정 / 미백 / 보존' 같은 카테고리로 정리하고 각각 상세 페이지로 연결해주세요."
3. 보통 3~7일 정도 걸립니다.

팁
- 한 페이지에 모든 진료를 다 넣지 말고 진료별로 나누세요.
- 카테고리명은 환자가 검색할 때 쓰는 단어로(예: "치아 미백" O, "투스 화이트닝" X).`,
  },
  [LABELS.has_service_details]: {
    impact: 'medium', difficulty: 'hard', timeframe: '2주',
    actionText: 'AI 로 주요 시술별 상세(설명·대상·과정·기간) 초안 작성 → 원장 검수 → 홈페이지 업로드',
    detailedGuide: `이게 뭐예요?
임플란트 같은 주요 시술 하나하나에 대한 자세한 설명 페이지입니다. "임플란트가 뭐예요?" 같은 질문에 AI 가 답할 때 인용할 본문이 됩니다.

어떻게 하나요?
1. WINAID "블로그 생성" 으로 시술별 상세 초안(설명·대상·과정·기간·주의사항)을 만드세요.
2. 원장님이 검수해서 의학적 사실을 확인·보정하세요.
3. 제작사 또는 관리자 모드에서 진료 카테고리 아래 상세 페이지로 업로드하세요.

팁
- 한 시술당 본문 500~1000자 정도가 적정합니다.
- "효과 100%", "통증 없음" 같은 의료광고법 위반 표현은 피하세요. WINAID 의료법 검증 기능을 활용하세요.`,
  },
  [LABELS.has_location_page]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 "오시는 길" 페이지에 네이버 지도 iframe + 도로명 주소 + 교통 안내 추가',
    detailedGuide: `이게 뭐예요?
"오시는 길" 페이지입니다. 주소·지도·교통편을 한 곳에 모아두면 AI 가 "이 병원 위치"를 정확히 파악합니다.

어떻게 하나요?
1. 관리자 모드에서 "오시는 길" 페이지를 만드세요.
2. 다음을 모두 넣으세요:
   - 도로명 주소(텍스트로, 이미지 X)
   - 네이버 지도 또는 카카오 지도 iframe
   - 가까운 지하철역·버스 정류장 + 도보 시간
   - 주차 안내 (있을 경우)
3. 30분 정도면 끝납니다. 무료입니다.

팁
- 네이버 지도는 map.naver.com 에서 본인 병원 검색 → 공유 → "퍼가기" 코드를 받으면 됩니다.
- 주소를 이미지로만 넣으면 AI 가 못 읽습니다. 꼭 텍스트로 적으세요.`,
  },
  [LABELS.has_faq_page]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: 'AI 로 FAQ 10개 초안(비용·예약·진료) 작성 → 원장 검수 → 관리자 모드 업로드',
    detailedGuide: `이게 뭐예요?
환자들이 자주 묻는 질문 모음 페이지입니다. AI 는 FAQ 페이지를 정말 좋아해서 답변을 그대로 인용해 보여주곤 합니다.

어떻게 하나요?
1. WINAID "블로그 생성" 또는 "보도자료" 로 FAQ 10개 초안을 만드세요. (비용·예약·진료시간·주차·통증·기간 등)
2. 원장님이 검수해서 우리 병원에 맞게 답변을 다듬으세요.
3. 관리자 모드에서 "자주 묻는 질문" 페이지로 업로드하세요.

팁
- 질문은 환자가 실제로 쓰는 말투("임플란트 얼마예요?") 로 적으세요.
- 답변은 2~4줄로 짧게, 더 알고 싶으면 진료 페이지로 링크하세요.`,
  },
  [LABELS.has_pricing_page]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '관리자 모드에서 "상담 비용 안내" 페이지 작성 (구체 금액 대신 범위·상담 기준)',
    detailedGuide: `이게 뭐예요?
상담 비용·진료비 안내 페이지입니다. 의료광고법상 구체 금액 표시는 제한이 있어서 "범위 + 상담 안내" 형태로 작성합니다.

어떻게 하나요?
1. 관리자 모드에서 "비용 안내" 페이지를 만드세요.
2. 다음 형식으로 작성하세요:
   - 진료 항목별 일반적 가격대 ("임플란트: 환자 상태에 따라 다름, 상담 후 안내")
   - 보험 적용 여부
   - "정확한 비용은 무료 상담 후 안내드립니다" 문구
3. 1시간 이내면 끝납니다.

팁
- 구체 금액("100만원") 은 의료광고법 위반 소지가 있어 피하세요.
- "상담 무료" 같은 강조 표현보다 "전화·방문 상담 가능" 같은 표현이 안전합니다.`,
  },

  // ③ structured_data
  [LABELS.dentist_schema]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "Dentist 또는 LocalBusiness JSON-LD 를 head 에 추가" 요청 (AI 가 치과로 인식)', detailedGuide: '' },
  [LABELS.organization_schema]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "Organization 스키마로 상호·로고·대표전화·sameAs 마크업" 요청', detailedGuide: '' },
  [LABELS.breadcrumb_schema]: { impact: 'low', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "하위 페이지에 BreadcrumbList JSON-LD 추가" 요청', detailedGuide: '' },
  [LABELS.faq_schema]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "FAQ 섹션에 FAQPage JSON-LD 적용" 요청 (Q&A 를 AI 가 질문 답변으로 인식)', detailedGuide: '' },
  [LABELS.profile_schema]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "의료진 페이지에 Physician 또는 ProfilePage 스키마 추가" 요청', detailedGuide: '' },

  // ④ content_quality
  [LABELS.h1_count]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "페이지마다 핵심 주제를 담은 H1 태그 1개만 두도록" 요청', detailedGuide: '' },
  [LABELS.h2_count]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 본문 섹션 제목을 H2 로 3개 이상 나누기', detailedGuide: '' },
  [LABELS.title_opt]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "title 태그를 \'{지역}구 {병원명} - {업종}\' 형식으로 수정" 요청', detailedGuide: '' },
  [LABELS.meta_desc]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 meta description 을 50~160자로 작성 (어떤 진료·누구에게·어떤 특징)', detailedGuide: '' },
  [LABELS.alt_ratio]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 각 이미지에 alt 텍스트 한 줄 추가 (장식용은 alt="" 빈 값)', detailedGuide: '' },
  [LABELS.doctor_in_text]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 의료진 소개에 "구강외과 전문의"·"치주과 전문의" 식 타이틀 추가', detailedGuide: '' },
  [LABELS.word_count]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: 'AI 로 핵심 페이지 본문 500자 이상 초안 작성 → 원장 검수 → 관리자 모드 업로드', detailedGuide: '' },

  // ⑤ external_channels
  [LABELS.naver]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '병원 담당자가 smartplace.naver.com 에서 네이버 플레이스 등록 + 홈페이지 푸터에 링크', detailedGuide: '' },
  [LABELS.google]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '병원 담당자가 business.google.com 에서 Google 비즈니스 프로필 등록 + 홈페이지 연결', detailedGuide: '' },
  [LABELS.kakao]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '병원 담당자가 카카오비즈니스에서 채널 개설 후 홈페이지 푸터에 채널 ID 링크', detailedGuide: '' },
  [LABELS.youtube]: { impact: 'medium', difficulty: 'hard', timeframe: '1개월', actionText: '병원 담당자가 유튜브 채널 개설 후 진료 안내·의료진 인터뷰 영상 업로드 (AI 로 스크립트 초안)', detailedGuide: '' },
  [LABELS.instagram]: { impact: 'low', difficulty: 'easy', timeframe: '즉시', actionText: '병원 담당자가 Instagram 계정 개설 후 홈페이지 푸터/연락처에 링크', detailedGuide: '' },
  [LABELS.sameas_schema]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "Organization 스키마 sameAs 배열에 네이버·구글·카카오·유튜브·인스타 URL 전부 포함" 요청', detailedGuide: '' },
  [LABELS.news_mentions]: { impact: 'medium', difficulty: 'hard', timeframe: '1개월', actionText: '병원 담당자가 지역 의료 전문지(데일리메디·닥터스뉴스 등) 에 기고 또는 취재 섭외', detailedGuide: '' },
  [LABELS.owned_channels_diversity]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '병원 담당자가 네이버 플레이스·Google 비즈니스 프로필·카카오 채널 중 최소 3개 등록', detailedGuide: '' },

  // ⑥ aeo_geo
  [LABELS.faq_structure]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: 'AI 로 FAQ 섹션 초안 작성 + 제작사에 "FAQPage JSON-LD 스키마 적용" 요청', detailedGuide: '' },
  [LABELS.services_named]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 주요 시술명을 본문·네비게이션에 텍스트로 명시 (이미지 속 문구는 AI 가 못 읽음)', detailedGuide: '' },
  [LABELS.contact_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 헤더·푸터 양쪽에 대표 전화번호 텍스트 노출', detailedGuide: '' },
  [LABELS.address_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 푸터에 "{시/도} {구/군} {동/로}" 도로명 주소 텍스트 입력', detailedGuide: '' },
  [LABELS.hours_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 진료시간·점심시간·휴진일 표로 표시 ("지금 여는 치과" AI 질문 대응)', detailedGuide: '' },
  [LABELS.blog_searchable]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '병원 담당자가 네이버 블로그 관리자 > 관리 > 기본설정 에서 "전체공개 + 외부 검색허용" 스위치 켜기', detailedGuide: '' },
};

// "오늘부터 차근차근" 사용자 관점 정렬 — 난이도 → 영향도 → 기간 순.
// 같은 키가 다른 곳에서 등장해도 안전하도록 fallback 99 (정렬 마지막).
const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const TIMEFRAME_ORDER: Record<string, number> = {
  '즉시': 0, '1주': 1, '2주': 2, '1개월': 3, '90일': 4,
};

export function buildActionPlan(categories: CategoryScore[]): ActionItem[] {
  const items: ActionItem[] = [];

  for (const cat of categories) {
    for (const it of cat.items) {
      if (it.status !== 'fail' && it.status !== 'warning') continue;
      const meta = ACTION_META[it.label];
      if (!meta) continue;
      items.push({
        action: meta.actionText,
        impact: meta.impact,
        difficulty: meta.difficulty,
        timeframe: meta.timeframe,
        category: cat.name,
        detailedGuide: meta.detailedGuide || undefined, // 빈 문자열이면 undefined 로 전달 (UI 가 "준비 중" 표시)
      });
    }
  }

  items.sort((a, b) => {
    const d = (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99);
    if (d !== 0) return d;
    const i = (IMPACT_ORDER[a.impact] ?? 99) - (IMPACT_ORDER[b.impact] ?? 99);
    if (i !== 0) return i;
    return (TIMEFRAME_ORDER[a.timeframe] ?? 99) - (TIMEFRAME_ORDER[b.timeframe] ?? 99);
  });

  return items.slice(0, 10);
}
