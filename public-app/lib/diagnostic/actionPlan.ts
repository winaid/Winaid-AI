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
  [LABELS.https]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "SSL 인증서 발급 + 전 페이지 HTTPS 리다이렉트" 요청', detailedGuide: '' },
  [LABELS.viewport]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "head 에 viewport 메타 태그 추가 (모바일 레이아웃)" 요청', detailedGuide: '' },
  [LABELS.robots]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '제작사에 "사이트 루트에 robots.txt 배치 + Sitemap 디렉티브 포함" 요청', detailedGuide: '' },
  [LABELS.sitemap]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "sitemap.xml 생성" 요청 후 네이버 서치어드바이저·구글 서치콘솔 제출', detailedGuide: '' },
  [LABELS.psi]: { impact: 'high', difficulty: 'hard', timeframe: '1개월', actionText: '제작사에 "사진 WebP 변환(용량 반 감소) + 지연 로딩 + 코드 분할" 요청 (squoosh.app 활용)', detailedGuide: '' },

  // ② site_structure
  [LABELS.own_domain]: { impact: 'high', difficulty: 'hard', timeframe: '1개월', actionText: '병원 담당자가 자체 도메인 구매 후 제작사에 홈페이지 이전 의뢰 (모두닥/하이닥 등 플랫폼은 AI 가산점 없음)', detailedGuide: '' },
  [LABELS.has_doctor_page]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: 'AI 로 의료진 소개 초안 작성 후 원장 검수 → 홈페이지 업로드 (이름·전공·경력·사진)', detailedGuide: '' },
  [LABELS.has_treatment_page]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '제작사에 "진료 안내 페이지를 카테고리로 정리" 요청 또는 관리자 모드에서 메뉴 재배치', detailedGuide: '' },
  [LABELS.has_service_details]: { impact: 'medium', difficulty: 'hard', timeframe: '2주', actionText: 'AI 로 주요 시술별 상세(설명·대상·과정·기간) 초안 작성 → 원장 검수 → 홈페이지 업로드', detailedGuide: '' },
  [LABELS.has_location_page]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '관리자 모드에서 "오시는 길" 페이지에 네이버 지도 iframe + 도로명 주소 + 교통 안내 추가', detailedGuide: '' },
  [LABELS.has_faq_page]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: 'AI 로 FAQ 10개 초안(비용·예약·진료) 작성 → 원장 검수 → 관리자 모드 업로드', detailedGuide: '' },
  [LABELS.has_pricing_page]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '관리자 모드에서 "상담 비용 안내" 페이지 작성 (구체 금액 대신 범위·상담 기준)', detailedGuide: '' },

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
