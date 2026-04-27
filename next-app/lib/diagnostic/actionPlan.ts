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
  [LABELS.dentist_schema]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "Dentist 또는 LocalBusiness JSON-LD 를 head 에 추가" 요청 (AI 가 치과로 인식)',
    detailedGuide: `이게 뭐예요?
AI 에게 "이 사이트는 치과입니다" 라고 정확히 알려주는 코드 표식(JSON-LD) 입니다. 추가하면 AI 가 일반 가게가 아닌 의료기관으로 분류합니다.

어떻게 하나요?
1. 제작사에 연락하세요. (사용자가 직접 코드를 만지지 않아도 됩니다)
2. 다음 문구를 복사해서 보내세요:
   "head 태그에 schema.org 의 Dentist 또는 LocalBusiness 타입 JSON-LD 를 추가해주세요. 항목은 name, address, telephone, openingHours, geo 좌표, priceRange, sameAs(SNS 링크) 입니다."
3. 30~60분이면 끝납니다. 보통 무료입니다.

팁
- 작업 후 search.google.com/test/rich-results 에 본인 사이트 주소를 넣어 인식되는지 확인하세요.
- "Dentist" 가 가장 정확하고, 일반 의원이면 "MedicalClinic" 도 가능합니다.`,
  },
  [LABELS.organization_schema]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "Organization 스키마로 상호·로고·대표전화·sameAs 마크업" 요청',
    detailedGuide: `이게 뭐예요?
병원의 기본 정보(상호·로고·전화·SNS) 를 AI 에게 한 번에 알려주는 코드 표식입니다. "병원 명함을 코드로 박아두는 것" 이라고 보시면 됩니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "Organization 또는 LocalBusiness 스키마(JSON-LD) 를 head 에 추가해주세요. 항목은 name(상호), logo(로고 URL), telephone(대표 전화), url(홈페이지 주소), sameAs(네이버·구글·카카오·인스타 URL 배열) 입니다."
3. 20~30분이면 끝납니다.

팁
- 작업 후 search.google.com/test/rich-results 로 검증하면 누락 항목을 확인할 수 있습니다.
- sameAs 에 모든 외부 채널 URL 을 넣으면 AI 가 "이 병원의 공식 채널" 임을 더 확실히 인식합니다.`,
  },
  [LABELS.breadcrumb_schema]: {
    impact: 'low', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "하위 페이지에 BreadcrumbList JSON-LD 추가" 요청',
    detailedGuide: `이게 뭐예요?
"홈 > 진료안내 > 임플란트" 같은 경로 표시를 AI 에게 알려주는 코드 표식입니다. 검색 결과에 경로가 함께 노출되기도 합니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "하위 페이지(진료/의료진/오시는 길 등) 에 BreadcrumbList JSON-LD 스키마를 추가해주세요. 각 페이지의 상위 경로가 보이도록요."
3. 보통 3~7일 정도 걸립니다.

팁
- 영향도는 다른 항목보다 작아서 우선순위는 낮은 편입니다.
- 작업 후 search.google.com/test/rich-results 에서 인식되는지 확인하세요.`,
  },
  [LABELS.faq_schema]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "FAQ 섹션에 FAQPage JSON-LD 적용" 요청 (Q&A 를 AI 가 질문 답변으로 인식)',
    detailedGuide: `이게 뭐예요?
FAQ 섹션의 질문·답변을 AI 가 "Q&A 쌍" 으로 인식하게 만드는 코드 표식입니다. AI 검색 답변에 그대로 인용되는 일이 많아 효과 큽니다.

어떻게 하나요?
1. 먼저 "자주 묻는 질문" 페이지가 있어야 합니다. (없으면 "has_faq_page" 항목 먼저)
2. 제작사에 다음 문구를 보내세요:
   "FAQ 섹션에 schema.org 의 FAQPage JSON-LD 를 적용해주세요. 각 질문·답변 쌍이 mainEntity 배열에 들어가도록요."
3. 30~60분이면 끝납니다.

팁
- 작업 후 search.google.com/test/rich-results 에서 인식되는지 꼭 확인하세요.
- 답변 길이는 너무 짧지(50자 미만) 너무 길지(500자 초과) 않게 유지하세요.`,
  },
  [LABELS.profile_schema]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "의료진 페이지에 Physician 또는 ProfilePage 스키마 추가" 요청',
    detailedGuide: `이게 뭐예요?
의료진 한 분 한 분의 정보(이름·전공·소속) 를 AI 에게 알려주는 코드 표식입니다. AI 가 "이 병원에 어떤 전문의가 있나" 파악할 때 결정적입니다.

어떻게 하나요?
1. 의료진 소개 페이지가 있어야 합니다. (없으면 "has_doctor_page" 먼저)
2. 제작사에 다음 문구를 보내세요:
   "의료진 페이지에 각 의사별로 schema.org 의 Physician 또는 ProfilePage 스키마를 추가해주세요. name, jobTitle, alumniOf, memberOf 항목 포함이요."
3. 보통 1주일 정도 걸립니다.

팁
- 의료진이 여러 분이면 한 명씩 따로 표시해야 합니다.
- 학회 회원·자격증 정보가 있으면 더 풍부해집니다. search.google.com/test/rich-results 로 검증하세요.`,
  },

  // ④ content_quality
  [LABELS.h1_count]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "페이지마다 핵심 주제를 담은 H1 태그 1개만 두도록" 요청',
    detailedGuide: `이게 뭐예요?
페이지 맨 위 큰 제목(H1) 입니다. 책으로 치면 "장 제목". 한 페이지에 H1 은 1개만 있어야 검색엔진과 AI 가 "이 페이지의 핵심 주제" 를 명확히 파악합니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "각 페이지마다 핵심 주제를 담은 H1 태그가 1개만 있도록 해주세요. H1 이 여러 개거나 0개인 페이지는 1개로 정리해주세요."
3. 페이지 수에 따라 1시간~하루 정도면 끝납니다.

팁
- H1 은 페이지 제목과 같거나 비슷하면 자연스럽습니다.
- H1 안에 핵심 키워드(병원명·진료명·지역명) 를 포함하면 효과 큼.`,
  },
  [LABELS.h2_count]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 본문 섹션 제목을 H2 로 3개 이상 나누기',
    detailedGuide: `이게 뭐예요?
본문 중간 제목(H2) 입니다. 책으로 치면 "절 제목". 글이 길 때 H2 로 섹션을 나눠야 AI 가 "이 부분이 어떤 내용인지" 빠르게 파악합니다.

어떻게 하나요?
1. 관리자 모드에서 본문 작성 화면을 여세요.
2. 본문이 긴 페이지(특히 진료 안내·블로그) 에 섹션 제목을 H2 로 3개 이상 나누세요.
   예: "임플란트란?" / "치료 과정" / "주의사항" / "비용 안내"
3. 페이지당 5~10분이면 끝납니다.

팁
- 편집기 툴바에 "H2" 또는 "제목 2" 버튼이 있을 겁니다.
- 한 페이지에 H1 은 1개, H2 는 3~7개 정도가 적정합니다.`,
  },
  [LABELS.title_opt]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "title 태그를 \'{지역}구 {병원명} - {업종}\' 형식으로 수정" 요청',
    detailedGuide: `이게 뭐예요?
브라우저 탭과 검색 결과 첫 줄에 보이는 페이지 제목(title) 입니다. AI 노출의 시작점이라 매우 중요합니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 복사해서 보내세요:
   "각 페이지의 title 태그를 다음 형식으로 수정해주세요: '[지역(구·동)] [병원명] - [업종]'. 예: '강남구 오라클치과 - 임플란트 전문'. 길이는 30~60자."
3. 페이지 수에 따라 1~3시간이면 끝납니다.

팁
- 모든 페이지가 같은 title 이면 안 됩니다. 페이지마다 달라야 합니다.
- 핵심은 "지역 + 병원명 + 진료" 세 가지를 다 넣는 것.`,
  },
  [LABELS.meta_desc]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 meta description 을 50~160자로 작성 (어떤 진료·누구에게·어떤 특징)',
    detailedGuide: `이게 뭐예요?
검색 결과에서 제목 아래 보이는 한두 줄 요약(meta description) 입니다. 사용자가 클릭할지 말지 결정하는 결정적 자리입니다.

어떻게 하나요?
1. 관리자 모드에서 각 페이지의 "SEO" 또는 "메타 설명" 항목을 찾으세요.
2. 50~160자로 작성하세요. 다음 3가지를 꼭 포함:
   - 어떤 진료를 하는지
   - 누구를 위한 곳인지 (지역·전문 분야)
   - 우리 병원만의 특징
   예: "강남구 ○○치과 - 야간 진료, 토요일 운영. 임플란트·교정 전문의 상주. 무료 상담 가능."
3. 페이지당 5~10분이면 끝납니다.

팁
- 모든 페이지가 같은 설명이면 안 됩니다.
- "광고 표현"(최고·1위·100%) 은 의료광고법 위반이라 피하세요.`,
  },
  [LABELS.alt_ratio]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 각 이미지에 alt 텍스트 한 줄 추가 (장식용은 alt="" 빈 값)',
    detailedGuide: `이게 뭐예요?
이미지마다 붙이는 짧은 설명문(alt 텍스트) 입니다. 시각장애인 음성 안내용이지만, 동시에 AI 가 "이 사진이 뭔지" 이해하는 자료가 됩니다.

어떻게 하나요?
1. 관리자 모드에서 각 이미지를 클릭하세요.
2. "대체 텍스트" 또는 "alt" 항목에 한 줄 설명을 적으세요.
   예: "원장님이 환자를 진료하는 모습", "임플란트 시술 전후 비교 사진"
3. 장식용 이미지(아이콘·구분선 등) 는 alt 를 빈 값(alt="") 으로 두세요.

팁
- 설명에 핵심 키워드("임플란트", "치과") 를 자연스럽게 포함하세요.
- "사진", "이미지" 같은 단어는 빼는 게 더 깔끔합니다.`,
  },
  [LABELS.doctor_in_text]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 의료진 소개에 "구강외과 전문의"·"치주과 전문의" 식 타이틀 추가',
    detailedGuide: `이게 뭐예요?
의료진 소개 본문에 "○○과 전문의" 같은 공식 자격을 텍스트로 명시하는 것입니다. AI 가 "이 병원에 진짜 전문의가 있나" 를 본문에서 찾습니다.

어떻게 하나요?
1. WINAID "AI 보정" 또는 "블로그 생성" 으로 의료진 소개 초안을 만드세요.
2. 다음 정보를 텍스트로 적으세요:
   - 정식 자격명: "구강외과 전문의", "치주과 전문의", "보철과 전문의" 등
   - 출신 학교 + 졸업 연도
   - 소속 학회 (대한구강악안면임프란트학회 등)
3. 관리자 모드에서 의료진 소개 페이지에 업로드. 페이지당 30분 정도.

팁
- 자격증·인증서를 사진으로만 올리면 AI 가 못 읽습니다. 꼭 텍스트로 적으세요.
- 전문의가 아닌 일반의는 "치과의사" 로 명시하면 됩니다.`,
  },
  [LABELS.word_count]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: 'AI 로 핵심 페이지 본문 500자 이상 초안 작성 → 원장 검수 → 관리자 모드 업로드',
    detailedGuide: `이게 뭐예요?
페이지 본문의 글자 수입니다. 너무 짧으면(200자 미만) AI 가 "정보가 부족하다" 고 판단해 추천에서 밀립니다.

어떻게 하나요?
1. 글자 수가 부족한 페이지(특히 진료 안내·의료진 소개) 를 찾으세요.
2. WINAID "블로그 생성" 또는 "AI 보정" 으로 본문을 500자 이상으로 보강하세요.
3. 원장님 검수 후 관리자 모드로 업로드하세요.

팁
- 단순 나열보다 "왜 이 진료가 필요한가 / 우리 병원의 특징 / 절차 / 주의사항" 구조로 풀면 자연스럽게 길어집니다.
- 너무 길어도(2000자 이상) 가독성이 떨어집니다. 500~1500자가 적정.`,
  },

  // ⑤ external_channels
  [LABELS.naver]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '병원 담당자가 smartplace.naver.com 에서 네이버 플레이스 등록 + 홈페이지 푸터에 링크',
    detailedGuide: `이게 뭐예요?
네이버 플레이스(지도 검색에 뜨는 가게 정보) 입니다. 한국에서 검색량이 가장 많은 채널이라 환자 유입의 핵심 창구입니다.

어떻게 하나요?
1. smartplace.naver.com 에 네이버 계정으로 접속해 사업자 인증을 받으세요. (사업자등록증·의료기관 개설신고증·진료실 사진 필요)
2. 본인 병원을 등록하고 영업시간·전화·주소·진료 항목을 빠짐없이 채우세요.
3. "웹사이트" 항목에 본인 홈페이지 주소를 꼭 입력하고, 본인 홈페이지 푸터에도 네이버 플레이스 링크를 거세요.

팁
- 사업자 인증은 1~3일 걸립니다.
- 주소·전화는 건강보험심사평가원(HIRA) 등록 정보와 일치해야 합니다.
- 사진(외관·내부·진료실·의료진) 을 5장 이상 올리면 노출이 더 잘됩니다.`,
  },
  [LABELS.google]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '병원 담당자가 business.google.com 에서 Google 비즈니스 프로필 등록 + 홈페이지 연결',
    detailedGuide: `이게 뭐예요?
Google 비즈니스 프로필(GBP) 입니다. 구글 검색·구글 지도에 우리 병원이 뜨는 데 필수이고, 글로벌 AI(ChatGPT 포함) 가 가장 잘 인용하는 채널입니다.

어떻게 하나요?
1. business.google.com 에 구글 계정으로 접속해 본인 병원을 등록하세요.
2. 인증을 받으세요. 보통 우편엽서(7~14일 소요) 또는 전화 인증입니다.
3. 영업시간·전화·주소·진료 항목을 채우고, 사진을 5장 이상 올리고, 본인 홈페이지 푸터에 GBP 링크를 거세요.

팁
- 우편엽서가 안 오면 한 번 더 신청 가능합니다.
- 영어 가능하면 영문 병원명도 같이 등록하세요. 외국인 환자·영문 검색에 노출됩니다.`,
  },
  [LABELS.kakao]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '병원 담당자가 카카오비즈니스에서 채널 개설 후 홈페이지 푸터에 채널 ID 링크',
    detailedGuide: `이게 뭐예요?
카카오톡 채널입니다. 환자 상담·예약 알림용으로 쓰면서 동시에 본인 병원의 공식 채널 신호를 AI 에게 줍니다.

어떻게 하나요?
1. center-pf.kakao.com 에 카카오 계정으로 접속해 채널을 개설하세요.
2. 사업자 정보로 인증을 받고, 채널 홈에 병원 정보(영업시간·전화·주소·진료) 를 채우세요.
3. 본인 홈페이지 푸터에 카카오 채널 링크를 거세요.

팁
- 채널 ID 는 짧고 외우기 쉽게 정하세요.
- 자동 응답(영업시간 안내 등) 을 설정해두면 야간 문의에도 대응됩니다.`,
  },
  [LABELS.youtube]: {
    impact: 'medium', difficulty: 'hard', timeframe: '1개월',
    actionText: '병원 담당자가 유튜브 채널 개설 후 진료 안내·의료진 인터뷰 영상 업로드 (AI 로 스크립트 초안)',
    detailedGuide: `이게 뭐예요?
유튜브 공식 채널입니다. 영상 콘텐츠는 AI 가 자막을 읽어 인용하기도 해서 장기적으로 큰 자산이 됩니다.

어떻게 하나요?
1. youtube.com 에서 구글 계정으로 채널을 개설하세요. (병원 이름으로)
2. WINAID "촬영 영상 편집" 으로 진료 안내·시술 후기·의료진 인터뷰 영상을 만드세요. 자막을 꼭 넣으세요.
3. 영상 설명란에 본인 홈페이지 주소·전화·주소를 적고, 본인 홈페이지 푸터에 유튜브 링크를 거세요.

팁
- 영상 1~2개부터 시작해도 됩니다. 꾸준함이 중요.
- 제목을 "[지역명] [병원명] [주제]" 구조로 적으면 검색 노출이 좋아집니다.`,
  },
  [LABELS.instagram]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '병원 담당자가 Instagram 계정 개설 후 홈페이지 푸터/연락처에 링크',
    detailedGuide: `이게 뭐예요?
인스타그램 공식 계정입니다. 직접 효과는 작지만 "본인 병원의 공식 채널이 다양하다" 신호를 AI 에게 줍니다.

어떻게 하나요?
1. instagram.com 에서 비즈니스 계정으로 가입하세요. (병원 이름으로)
2. 프로필에 병원 소개·전화·홈페이지 주소를 적으세요.
3. 진료실·의료진·시술 전후 사진(환자 동의 받은 것만) 을 정기적으로 올리고, 본인 홈페이지 푸터에 인스타그램 링크를 거세요.

팁
- 환자 사진은 반드시 서면 동의를 받으세요. 의료법 위반 소지가 큽니다.
- "효과 100%" · "통증 없음" 같은 광고 표현은 의료광고법 위반이니 피하세요.
- 자주 못 올리면 만들지 않는 게 차라리 낫습니다(빈 채널은 신뢰도 -).`,
  },
  [LABELS.sameas_schema]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "Organization 스키마 sameAs 배열에 네이버·구글·카카오·유튜브·인스타 URL 전부 포함" 요청',
    detailedGuide: `이게 뭐예요?
"이 SNS 채널들이 모두 우리 병원 공식 채널입니다" 라고 AI 에게 한 번에 알려주는 코드 표식입니다. 모든 외부 채널을 한 줄로 묶어주는 장치라고 보시면 됩니다.

어떻게 하나요?
1. 먼저 외부 채널(네이버·구글·카카오·유튜브·인스타) 을 등록해두세요.
2. 제작사에 다음 문구를 보내세요:
   "Organization 스키마의 sameAs 배열에 다음 URL 을 모두 포함해주세요: 네이버 플레이스 / 구글 비즈니스 프로필 / 카카오 채널 / 유튜브 채널 / 인스타그램. 각각 본인 병원의 정확한 URL 입니다."
3. 30분 이내면 끝납니다.

팁
- 채널을 새로 만들 때마다 sameAs 에 추가해달라고 요청하세요.
- 작업 후 search.google.com/test/rich-results 로 인식되는지 검증하세요.`,
  },
  [LABELS.news_mentions]: {
    impact: 'medium', difficulty: 'hard', timeframe: '1개월',
    actionText: '병원 담당자가 지역 의료 전문지(데일리메디·닥터스뉴스 등) 에 기고 또는 취재 섭외',
    detailedGuide: `이게 뭐예요?
지역 신문·의료 전문지에 본인 병원이 언급되거나 기고/취재되는 것입니다. "외부에서 인정한 신뢰할 만한 곳" 이라는 강력한 신호입니다.

어떻게 하나요?
1. 지역 의료 전문지(데일리메디·청년의사·메디컬타임즈·닥터스뉴스) 또는 지역 신문의 제보 이메일·게시판을 찾으세요.
2. WINAID "보도자료 생성" 으로 건강 칼럼 또는 보도자료 초안을 만드세요. (신규 진료 도입·지역 봉사·계절별 건강 정보 등)
3. 원장님 검수 후 각 매체에 송부하세요. 게재되면 홈페이지 "언론 보도" 메뉴에 링크하세요.

팁
- "광고형 보도자료" 는 거의 안 실립니다. 진짜 의미 있는 활동·소식이어야 합니다.
- 한 번 좋은 관계를 맺어두면 다음 번 보도자료도 잘 실립니다.`,
  },
  [LABELS.owned_channels_diversity]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: '병원 담당자가 네이버 플레이스·Google 비즈니스 프로필·카카오 채널 중 최소 3개 등록',
    detailedGuide: `이게 뭐예요?
본인 병원의 공식 채널을 여러 곳에 분산해서 운영하는 것입니다. AI 는 "여러 곳에서 일관되게 등장하는 병원" 을 더 신뢰합니다.

어떻게 하나요?
1. 다음 채널 중 최소 3개 등록을 목표로 하세요:
   - 네이버 플레이스 (smartplace.naver.com)
   - Google 비즈니스 프로필 (business.google.com)
   - 카카오 채널 (center-pf.kakao.com)
   - 유튜브 채널 / 인스타그램
2. 모든 채널의 정보(영업시간·전화·주소) 를 똑같이 채우세요.
3. 본인 홈페이지의 sameAs 스키마에 모든 채널 URL 을 포함하도록 제작사에 요청하세요.

팁
- 정보가 채널마다 다르면 오히려 AI 가 헷갈립니다. 한 번 정한 정보는 모든 곳에 동일하게.
- 채널을 새로 추가했으면 홈페이지 푸터 링크와 sameAs 스키마도 같이 갱신하세요.`,
  },

  // ⑥ aeo_geo
  [LABELS.faq_structure]: {
    impact: 'high', difficulty: 'medium', timeframe: '1주',
    actionText: 'AI 로 FAQ 섹션 초안 작성 + 제작사에 "FAQPage JSON-LD 스키마 적용" 요청',
    detailedGuide: `이게 뭐예요?
FAQ 섹션을 본문(화면에 보이는 글) 에 만드는 것입니다. faq_schema(코드 표식) 와 별도인데, 둘 다 있어야 AI 가 제대로 인식합니다.

어떻게 하나요?
1. WINAID "블로그 생성" 또는 "보도자료" 로 FAQ 10개 초안을 만드세요. (비용·예약·통증·기간·보험 등)
2. 원장님 검수해서 우리 병원에 맞게 답변을 다듬으세요.
3. 관리자 모드 또는 제작사에 다음 문구를 보내세요:
   "FAQ 섹션을 본문에 만들고, 동시에 FAQPage JSON-LD 스키마도 같이 적용해주세요."
4. 보통 3~7일이면 끝납니다.

팁
- 질문은 환자가 실제로 쓰는 말투로.
- 답변은 2~4줄, 더 알고 싶으면 진료 페이지로 링크.
- 작업 후 search.google.com/test/rich-results 에서 인식되는지 꼭 확인.`,
  },
  [LABELS.services_named]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 주요 시술명을 본문·네비게이션에 텍스트로 명시 (이미지 속 문구는 AI 가 못 읽음)',
    detailedGuide: `이게 뭐예요?
"임플란트", "치아 미백" 같은 시술 이름을 본문 텍스트와 메뉴에 명확히 적는 것입니다. 이미지 배너·아이콘 속 글자는 AI 가 못 읽습니다.

어떻게 하나요?
1. 관리자 모드에서 메뉴와 본문을 점검하세요.
2. 시술명이 이미지에만 있으면 텍스트로도 추가하세요.
   예: 메뉴에 "임플란트" 텍스트 + 본문 첫 줄에도 "임플란트" 명시
3. 페이지당 10~20분이면 끝납니다.

팁
- "투스 화이트닝" 같은 영문보다 "치아 미백" 같이 환자가 검색할 단어를 쓰세요.
- 페이지 내에서 핵심 시술명이 3~5번 자연스럽게 반복되면 좋습니다.`,
  },
  [LABELS.contact_text]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 헤더·푸터 양쪽에 대표 전화번호 텍스트 노출',
    detailedGuide: `이게 뭐예요?
대표 전화번호를 헤더(상단) 와 푸터(하단) 양쪽에 텍스트로 노출하는 것입니다. 이미지로만 있으면 AI 가 못 읽습니다.

어떻게 하나요?
1. 관리자 모드에서 헤더와 푸터를 모두 확인하세요.
2. 양쪽 모두 대표 전화번호를 텍스트로 적으세요. 예: "02-1234-5678"
3. 제작사에 다음 문구를 보내세요:
   "전화번호를 tel: 링크로 감싸주세요. 모바일에서 클릭하면 바로 전화가 걸리게요."
4. 30분 이내면 끝납니다.

팁
- 전화번호 형식은 모든 페이지에서 일관되게(예: 모두 02-XXXX-XXXX).
- 2개 이상이면 "예약 전화 / 상담 전화" 등으로 구분 표기하세요.`,
  },
  [LABELS.address_text]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 푸터에 "{시/도} {구/군} {동/로}" 도로명 주소 텍스트 입력',
    detailedGuide: `이게 뭐예요?
도로명 주소를 푸터에 텍스트로 노출하는 것입니다. AI 는 이미지 속 주소를 못 읽지만 텍스트는 정확히 인식합니다.

어떻게 하나요?
1. 관리자 모드에서 푸터(하단) 영역을 여세요.
2. 도로명 주소를 텍스트로 적으세요.
   예: "서울특별시 강남구 테헤란로 123, 4층 (역삼동)"
3. 오시는 길 페이지에도 같은 주소를 텍스트로 넣으세요.
4. 5분 이내면 끝납니다.

팁
- 지번 주소(예: 역삼동 123-4) 는 보조용. 도로명 주소가 메인입니다.
- 시·구·동(또는 로) 모두 적어야 AI 가 지역 검색에 매칭합니다.
- 우편번호도 같이 적으면 더 좋습니다.`,
  },
  [LABELS.hours_text]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '관리자 모드에서 진료시간·점심시간·휴진일 표로 표시 ("지금 여는 치과" AI 질문 대응)',
    detailedGuide: `이게 뭐예요?
진료시간·점심시간·휴진일을 텍스트로 명시하는 것입니다. "지금 여는 치과" 같은 AI 질문에 답하려면 텍스트로 있어야 합니다. AEO 의 핵심 항목입니다.

어떻게 하나요?
1. 관리자 모드에서 푸터 또는 "오시는 길" 페이지를 여세요.
2. 다음 형식으로 표·텍스트로 적으세요:
   "평일 09:30 ~ 18:30 / 토요일 09:30 ~ 14:00 / 일·공휴일 휴진 / 점심시간 13:00 ~ 14:00"
3. 야간 진료·휴일 진료 여부도 명시하세요.
4. 10분이면 끝납니다.

팁
- 이미지(영업시간 그림) 에만 있으면 AI 가 못 읽으므로 꼭 텍스트로.
- 임시 휴진(연휴·학회 참석) 도 가능하면 알리미로 노출하세요.
- Dentist 스키마의 openingHours 항목과 일치해야 AI 신뢰도 올라갑니다.`,
  },
  [LABELS.blog_searchable]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '병원 담당자가 네이버 블로그 관리자 > 관리 > 기본설정 에서 "전체공개 + 외부 검색허용" 스위치 켜기',
    detailedGuide: `이게 뭐예요?
네이버 블로그를 외부(구글·AI) 에서도 검색되도록 공개 설정하는 것입니다. 꺼져 있으면 본인 블로그 글이 AI 에 인용되지 않습니다.

어떻게 하나요?
1. blog.naver.com 에 로그인하세요.
2. 본인 블로그 우측 상단 "관리" 클릭 → "기본설정" 메뉴 진입.
3. "공개설정" 항목에서 "전체공개" + "외부 검색허용" 두 스위치를 모두 켜세요.
4. 1분 이내면 끝납니다.

팁
- 글 단위로도 공개/비공개 설정이 따로 있습니다. 핵심 글은 모두 공개로.
- 네이버 서치어드바이저(searchadvisor.naver.com) 에 블로그도 등록해두면 더 좋습니다.`,
  },

  // ── Tier 3-A 확장 7항목 ────────────────────────────────
  [LABELS.content_freshness]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '콘텐츠에 최근 수정 날짜를 표시하고 정기적으로 갱신하세요',
    detailedGuide: `이게 뭐예요?
홈페이지 글에 "마지막 수정: 2026-04-15" 같은 날짜가 표시되는 것입니다. AI 는 최근에 업데이트된 페이지를 더 신뢰합니다.

어떻게 하나요?
1. 관리자 모드에서 주요 페이지(진료 안내·의료진 소개) 의 수정일을 갱신하세요.
2. 제작사에 다음 문구를 보내세요:
   "각 페이지에 article:modified_time 메타 태그를 추가해주세요. 수정할 때마다 자동 갱신되게요."
3. 3개월에 한 번 이상 주요 페이지 내용을 점검·수정하세요.

팁
- 내용을 바꾸지 않아도 날짜만 바꾸는 건 검색엔진이 감지합니다. 실제로 문구를 보강하세요.`,
  },
  [LABELS.author_info]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '글 작성자(의료진) 이름과 약력을 메타 태그로 표시하세요',
    detailedGuide: `이게 뭐예요?
글을 누가 썼는지(저자 정보) AI 에게 알려주는 것입니다. 의료 분야에서 전문의가 쓴 글은 AI 신뢰도가 높아집니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "각 페이지에 meta name='author' content='원장님 이름' 태그를 추가해주세요."
2. JSON-LD 에 author 항목도 같이 넣으면 더 좋습니다:
   "author": { "@type": "Person", "name": "홍길동", "jobTitle": "구강외과 전문의" }

팁
- 의료진 여러 분이면 대표 저자 한 명만 넣어도 됩니다.
- author 정보는 Google 의 E-E-A-T (전문성·경험·권위·신뢰) 평가에 직접 반영됩니다.`,
  },
  [LABELS.image_optimization]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '이미지를 WebP 포맷으로 변환하고 lazy loading 을 적용하세요',
    detailedGuide: `이게 뭐예요?
사진 파일을 더 작고 빠른 형식(WebP)으로 바꾸고, 스크롤해야 보이는 사진은 나중에 불러오는(Lazy Load) 설정입니다.

어떻게 하나요?
1. squoosh.app 또는 tinypng.com 에서 사진을 WebP 로 변환하세요.
2. 제작사에 다음 문구를 보내세요:
   "모든 img 태그에 loading='lazy' 속성을 추가하고, 가능하면 srcset 으로 반응형 이미지를 제공해주세요."
3. 변환한 WebP 파일을 제작사에 전달하거나 관리자 모드에서 교체하세요.

팁
- 첫 화면에 바로 보이는 이미지(히어로 배너 등)는 lazy 를 빼세요 (바로 보여야 하므로).
- WebP 변환만으로 용량이 평균 50% 줄어들어 페이지 속도가 체감됩니다.`,
  },
  [LABELS.ai_crawler_access]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: 'robots.txt 에 GPTBot, ClaudeBot 등 AI 크롤러 접근을 허용하세요',
    detailedGuide: `이게 뭐예요?
robots.txt 파일에서 ChatGPT(GPTBot)·Claude(ClaudeBot) 등 AI 크롤러의 접근을 허용·차단하는 설정입니다. 차단하면 AI 가 홈페이지 내용을 못 읽어 추천에서 빠집니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "robots.txt 에 GPTBot, ClaudeBot, Google-Extended, PerplexityBot 에 대해 Disallow: / 가 있으면 제거해주세요. 또는 Allow: / 로 바꿔주세요."
2. 5분이면 끝납니다. 무료입니다.

팁
- AI 크롤러를 차단하면 ChatGPT·Gemini 검색에서 우리 병원이 아예 안 나옵니다.
- 개인정보 페이지만 차단하고 나머지는 열어두는 게 최선입니다.`,
  },
  [LABELS.llms_txt]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '/llms.txt 파일을 만들어 AI 가 사이트 정보를 올바르게 파악하게 하세요',
    detailedGuide: `이게 뭐예요?
AI 에게 "이 사이트는 이런 곳입니다" 라고 알려주는 텍스트 파일입니다. robots.txt 의 AI 버전이라고 생각하시면 됩니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "사이트 루트에 /llms.txt 파일을 만들어주세요. 내용은 병원명, 주소, 진료과목, 대표 시술, 의료진 이름·전공을 plain text 로 적어주세요."
2. 10~15분이면 끝납니다. 무료입니다.

팁
- 형식은 자유입니다. AI 가 읽기 쉽게 간결한 텍스트로 적으세요.
- 참고: llmstxt.org 에서 형식 가이드를 확인할 수 있습니다.`,
  },
  [LABELS.review_schema]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '환자 리뷰를 Review/AggregateRating 구조화 데이터로 마크업하세요',
    detailedGuide: `이게 뭐예요?
환자 리뷰·평점을 AI 가 "이 병원은 평점 4.5, 리뷰 120건" 처럼 인식하게 만드는 코드 표식입니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "홈페이지의 후기/리뷰 섹션에 schema.org 의 Review 또는 AggregateRating JSON-LD 를 적용해주세요. ratingValue, reviewCount, bestRating 항목 포함이요."
2. 보통 1주일 정도 걸립니다.

팁
- 가짜 리뷰를 마크업하면 구글 페널티 대상입니다. 실제 환자 리뷰만 사용하세요.
- search.google.com/test/rich-results 에서 마크업이 인식되는지 확인하세요.`,
  },
  [LABELS.howto_schema]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '시술 과정 설명을 HowTo 구조화 데이터로 마크업하세요',
    detailedGuide: `이게 뭐예요?
"임플란트는 어떤 과정으로 진행되나요?" 같은 질문에 AI 가 단계별로 인용할 수 있게 만드는 코드 표식입니다.

어떻게 하나요?
1. 시술 설명 페이지에 단계별 과정이 이미 텍스트로 있어야 합니다. (없으면 WINAID 블로그 생성으로 초안 작성)
2. 제작사에 다음 문구를 보내세요:
   "시술 과정 페이지에 schema.org 의 HowTo JSON-LD 를 적용해주세요. step 배열에 각 단계(name, text) 를 포함이요."
3. 보통 1주일 정도 걸립니다.

팁
- 임플란트·교정·미백 같은 주요 시술만 3~5개 적용해도 효과 큽니다.
- search.google.com/test/rich-results 에서 확인하세요.`,
  },

  // ── Phase 1 — security_tech 추가 항목 ─────────────────────
  [LABELS.canonical]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "각 페이지 head 에 canonical link 태그 추가" 요청 (중복 URL 방지)',
    detailedGuide: `이게 뭐예요?
같은 내용의 페이지가 여러 주소로 열릴 때 "이게 진짜 대표 주소예요" 라고 알려주는 코드입니다. 없으면 검색엔진·AI 가 어떤 주소가 공식인지 몰라 점수가 흩어집니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "각 페이지의 <head> 안에 <link rel='canonical' href='이 페이지의 정식 URL'> 을 추가해주세요."
2. 30분 이내면 끝납니다. 무료입니다.

팁
- 홈페이지, 진료 안내 페이지, 의료진 소개 페이지 등 주요 페이지 우선으로 적용하세요.
- 작업 후 구글 서치콘솔에서 canonical 이 제대로 인식되는지 확인하세요.`,
  },

  // ── Phase 1 — content_quality 추가 항목 ─────────────────────
  [LABELS.favicon]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "파비콘(favicon.ico 또는 PNG 32×32) 추가" 요청 — 브라우저 탭 아이콘',
    detailedGuide: `이게 뭐예요?
브라우저 탭 왼쪽에 보이는 작은 아이콘입니다. 없으면 하얀 빈 칸이 나와 신뢰도가 낮아 보입니다.

어떻게 하나요?
1. 병원 로고를 32×32 픽셀 PNG 또는 ICO 파일로 변환하세요. (무료 도구: favicon.io)
2. 제작사에 다음 문구를 보내세요:
   "사이트 루트에 favicon.ico 를 올리고 <head> 에 <link rel='icon' href='/favicon.ico'> 를 추가해주세요."
3. 5~10분이면 끝납니다. 무료입니다.

팁
- 로고가 복잡하면 단순화한 심볼(이니셜·마크) 로 만드세요.
- PNG 버전(192×192, 512×512) 도 같이 추가하면 모바일 홈화면 아이콘에도 활용됩니다.`,
  },

  // ── Phase 1 — external_channels 추가 항목 ─────────────────────
  [LABELS.og_bundle]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "og:title·og:description·og:image 메타 태그 추가" 요청 — 카카오·페이스북 미리보기',
    detailedGuide: `이게 뭐예요?
카카오톡이나 SNS 에 링크를 공유했을 때 제목·설명·사진이 미리보기로 나오게 만드는 코드입니다. 없으면 그냥 URL 만 보여 클릭이 줄어듭니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "각 페이지의 head 에 og:title, og:description, og:image 메타 태그를 추가해주세요. og:image 는 가로 1200×세로 630px 이상 권장입니다."
2. 30분이면 끝납니다.

팁
- og:image 는 메인 로고나 대표 진료 사진으로 설정하세요.
- 작업 후 developers.facebook.com/tools/debug 또는 카카오 공유 테스트로 확인하세요.`,
  },
  [LABELS.twitter_card]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "Twitter Card 메타 태그(twitter:card·title·image) 추가" 요청',
    detailedGuide: `이게 뭐예요?
X(구 트위터) 에 링크를 공유했을 때 카드 형식으로 미리보기가 나오게 하는 코드입니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "head 에 meta name='twitter:card' content='summary_large_image', meta name='twitter:title', meta name='twitter:description', meta name='twitter:image' 를 추가해주세요."
2. 20분이면 끝납니다.

팁
- OG 태그가 이미 있으면 Twitter Card 는 OG 태그를 fallback 으로 씁니다. 둘 다 있으면 더 완벽합니다.
- cards.twitter.com/validator 에서 미리보기를 테스트할 수 있습니다.`,
  },
  [LABELS.charset_utf8]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "head 맨 위에 <meta charset=\'UTF-8\'> 추가" 요청 — 한글 깨짐 방지',
    detailedGuide: `이게 뭐예요?
페이지의 문자 인코딩을 명시하는 한 줄 코드입니다. 없거나 잘못 설정되면 한글이 깨져서 보일 수 있습니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "<head> 태그의 가장 첫 번째 줄에 <meta charset='UTF-8'> 을 추가해주세요."
2. 5분이면 끝납니다. 무료입니다.

팁
- 이미 있지만 다른 인코딩(EUC-KR 등) 이라면 UTF-8 로 변경해달라고 요청하세요.
- 변경 후 한글 페이지를 모두 확인해 깨지는 곳이 없는지 점검하세요.`,
  },

  // ── Phase 1 — security_headers 카테고리 (신규) ────────────────
  [LABELS.response_status]: {
    impact: 'high', difficulty: 'hard', timeframe: '1주',
    actionText: '제작사에 메인 페이지가 HTTP 200 OK 를 반환하는지 확인 및 수정 요청',
    detailedGuide: `이게 뭐예요?
웹 서버가 브라우저에게 보내는 "정상 응답" 신호입니다. 200은 정상, 404는 "없음", 500은 "서버 오류"입니다.

어떻게 하나요?
1. 제작사에 연락하세요.
2. 다음 문구를 보내세요:
   "메인 페이지 https://[우리 사이트 주소]/ 를 curl 또는 PageSpeed Insights 로 확인해 HTTP 200 OK 를 반환하는지 점검하고 수정해주세요."
3. 보통 1~7일 걸립니다 (원인에 따라 다름).

팁
- 리다이렉트(301/302) 가 많으면 최종 페이지가 200 인지 확인하세요.
- 브라우저 개발자도구(F12) → Network 탭에서 직접 확인할 수도 있습니다.`,
  },
  [LABELS.csp_header]: {
    impact: 'medium', difficulty: 'medium', timeframe: '1주',
    actionText: '제작사에 "응답 헤더에 Content-Security-Policy 설정" 요청 (XSS 방어)',
    detailedGuide: `이게 뭐예요?
악성 스크립트가 홈페이지에 실행되지 못하게 막는 보안 헤더입니다. 없으면 XSS(크로스 사이트 스크립팅) 공격에 노출될 수 있습니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "HTTP 응답 헤더에 Content-Security-Policy 를 추가해주세요. 처음엔 Content-Security-Policy: default-src 'self' 으로 시작해 문제 없으면 점진 강화하는 방식으로요."
2. 보통 3~7일 걸립니다. 잘못 설정하면 사이트가 깨질 수 있어 테스트가 중요합니다.

팁
- CSP 는 설정이 복잡할 수 있어 제작사와 충분히 소통하세요.
- Mozilla Observatory(observatory.mozilla.org) 에서 현재 보안 헤더 상태를 무료로 확인할 수 있습니다.`,
  },
  [LABELS.hsts_header]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "Strict-Transport-Security 헤더 추가 (max-age=31536000)" 요청 — HTTPS 강제',
    detailedGuide: `이게 뭐예요?
HTTPS 가 있어도 처음 접속 순간 잠깐 HTTP 로 노출될 수 있습니다. HSTS 는 브라우저에게 "항상 HTTPS 로만 접속하세요" 라고 강제하는 보안 헤더입니다.

어떻게 하나요?
1. SSL 인증서(HTTPS) 가 먼저 설정되어 있어야 합니다.
2. 제작사에 다음 문구를 보내세요:
   "HTTP 응답 헤더에 Strict-Transport-Security: max-age=31536000; includeSubDomains 를 추가해주세요."
3. 30분이면 끝납니다.

팁
- 반드시 HTTPS 가 정상 동작하는 상태에서 적용하세요. HTTPS 없이 HSTS 만 켜면 사이트 접속이 안 됩니다.
- 작업 후 securityheaders.com 에서 본인 사이트 주소를 입력해 확인하세요.`,
  },
  [LABELS.x_frame_header]: {
    impact: 'medium', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "X-Frame-Options: SAMEORIGIN 헤더 추가" 요청 — 클릭재킹 방어',
    detailedGuide: `이게 뭐예요?
다른 사이트가 우리 홈페이지를 iframe 으로 몰래 삽입해 클릭을 가로채는(클릭재킹) 공격을 막는 헤더입니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "HTTP 응답 헤더에 X-Frame-Options: SAMEORIGIN 을 추가해주세요. (외부 삽입 차단, 같은 도메인만 허용)"
2. 10~20분이면 끝납니다. 무료입니다.

팁
- 우리 사이트를 iframe 으로 쓸 외부 파트너가 없다면 DENY 로 해도 됩니다.
- 작업 후 securityheaders.com 에서 확인하세요.`,
  },
  [LABELS.x_content_type_header]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "X-Content-Type-Options: nosniff 헤더 추가" 요청 — MIME 스니핑 방어',
    detailedGuide: `이게 뭐예요?
브라우저가 파일 타입을 멋대로 추측해 실행하는(MIME 스니핑) 것을 막는 헤더입니다. 악성 파일이 정상 파일처럼 실행되는 공격을 차단합니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "HTTP 응답 헤더에 X-Content-Type-Options: nosniff 를 추가해주세요."
2. 5~10분이면 끝납니다. 무료입니다.

팁
- 이 헤더는 가장 쉽고 빠르게 적용할 수 있는 보안 강화 항목입니다.
- securityheaders.com 에서 설정 여부를 확인하세요.`,
  },
  [LABELS.referrer_policy_header]: {
    impact: 'low', difficulty: 'easy', timeframe: '즉시',
    actionText: '제작사에 "Referrer-Policy: no-referrer-when-downgrade 헤더 추가" 요청',
    detailedGuide: `이게 뭐예요?
우리 사이트에서 외부 링크를 클릭했을 때 "어디서 왔는지(Referrer)" 를 얼마나 전달할지 정하는 헤더입니다. 적절히 설정해 불필요한 정보 유출을 막습니다.

어떻게 하나요?
1. 제작사에 다음 문구를 보내세요:
   "HTTP 응답 헤더에 Referrer-Policy: no-referrer-when-downgrade 를 추가해주세요."
2. 5~10분이면 끝납니다. 무료입니다.

팁
- 이 설정이 없어도 사이트가 바로 위험해지는 건 아니지만, 보안 모범 사례로 권장됩니다.
- securityheaders.com 에서 현재 상태를 확인하세요.`,
  },

  // ── Phase 3 — 의료광고법 준수 ─────────────────────────────
  [LABELS.medical_law_compliance]: {
    impact: 'high', difficulty: 'easy', timeframe: '즉시',
    actionText: '본문에서 "100%·최고·유일·완치·부작용 없는" 등 절대 표현을 일반화 표현으로 교체',
    detailedGuide: `이게 뭐예요?
의료법 제56조는 의료광고에서 "치료 효과를 보장하는 표현", "다른 의료기관과 비교하는 표현", "최고·유일 같은 절대 표현" 을 금지합니다. 위반 시 보건복지부 행정처분(시정명령·업무정지) 또는 환자 민원 대상이 될 수 있습니다. 검색엔진·AI 도 이런 표현을 광고성 콘텐츠로 분류해 검색 노출이 떨어집니다.

어떻게 하나요?
1. 본문·진료 안내 페이지에서 검출된 표현을 다음과 같이 교체하세요:
   - "100% 성공" → "대부분의 경우 만족"
   - "최고의 치과" → "신뢰할 수 있는 치과"
   - "유일한 시술" → "주력으로 진행하는 시술"
   - "완치" → "호전·증상 관리"
   - "부작용 없는" → "부작용 위험을 줄인"
   - "통증 없는" → "불편감을 줄인"
   - "획기적인" → "효과적인"
2. 관리자 페이지에서 직접 수정하거나, 제작사에 본문 일괄 수정 요청.
3. 새 글·블로그 작성 시에도 동일 기준 유지.

팁
- 의료광고 사전심의(대한의사협회·치과의사협회) 자율심의 가이드도 참고하세요.
- 환자 후기 인용도 같은 기준 적용 — "100% 만족" 같은 후기 그대로 게시 금지.
- 위나이드 블로그 작성 도구를 사용하면 이런 표현이 자동 필터링됩니다.`,
  },
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
