/**
 * AEO/GEO 진단 — 우선 조치 계획 생성
 *
 * CategoryScore[] 에서 fail/warning 항목을 뽑아 impact/difficulty/timeframe 메타와
 * 함께 ActionItem 으로 변환. 카테고리 가중치 → 항목 배점 → 난이도 순으로 정렬해 최대 10개 반환.
 */

import type { CategoryScore, ActionItem } from './types';
import { LABELS } from './scoring';

interface ActionMeta {
  impact: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  timeframe: '즉시' | '1주' | '2주' | '1개월';
  actionText: string;
}

// label 기반 액션 메타 (scoring.ts 의 LABELS 와 동일 문자열 키)
const ACTION_META: Record<string, ActionMeta> = {
  // ① security_tech
  [LABELS.https]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: 'SSL 인증서 발급 및 HTTPS 리다이렉트 설정' },
  [LABELS.viewport]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '<head> 에 viewport 메타 태그 추가 (width=device-width, initial-scale=1)' },
  [LABELS.robots]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '사이트 루트에 robots.txt 배치 + Sitemap: 디렉티브 포함' },
  [LABELS.sitemap]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: 'sitemap.xml 생성 후 Search Console/네이버 서치어드바이저 제출' },
  [LABELS.psi]: { impact: 'high', difficulty: 'hard', timeframe: '1개월', actionText: '이미지 WebP 전환, 지연 로딩, 코드 분할로 Core Web Vitals 개선' },

  // ② site_structure
  [LABELS.own_domain]: { impact: 'high', difficulty: 'hard', timeframe: '1개월', actionText: '자체 도메인 홈페이지 개설로 플랫폼 의존 구조 탈피 (모두닥/하이닥/blog.naver 는 AEO 가산점 거의 없음)' },
  [LABELS.has_doctor_page]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '의료진 소개 페이지 제작 (이름·전공·경력·사진)' },
  [LABELS.has_treatment_page]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '진료 안내 페이지 제작 — 시술을 카테고리로 정리' },
  [LABELS.has_service_details]: { impact: 'medium', difficulty: 'hard', timeframe: '2주', actionText: '주요 시술별 상세 페이지 제작 (설명·대상·과정·기간)' },
  [LABELS.has_location_page]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '오시는 길 페이지에 지도 iframe + 주소 + 교통 안내 추가' },
  [LABELS.has_faq_page]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: 'FAQ 페이지 신설 — 비용·예약·진료 질문 정리' },
  [LABELS.has_pricing_page]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '상담/비용 안내 페이지 제작으로 가격 투명성 확보' },

  // ③ structured_data
  [LABELS.dentist_schema]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: 'schema.org Dentist 또는 LocalBusiness JSON-LD 를 <head> 에 추가' },
  [LABELS.organization_schema]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: 'Organization 스키마로 상호·로고·연락처·sameAs 마크업' },
  [LABELS.breadcrumb_schema]: { impact: 'low', difficulty: 'medium', timeframe: '1주', actionText: '하위 페이지에 BreadcrumbList JSON-LD 추가' },
  [LABELS.faq_schema]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: 'FAQ 섹션에 FAQPage JSON-LD 적용' },
  [LABELS.profile_schema]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '의료진 각각에 Physician 또는 ProfilePage 스키마 추가' },

  // ④ content_quality
  [LABELS.h1_count]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '페이지마다 단일 H1 을 두고 핵심 주제를 담기' },
  [LABELS.h2_count]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: 'H2 소제목 3개 이상으로 본문 구조화' },
  [LABELS.title_opt]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '<title> 에 지역명(구/동) + 업종(치과/의원)을 함께 넣기' },
  [LABELS.meta_desc]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: 'meta description 을 50~160자로 작성 (검색 스니펫 제어)' },
  [LABELS.alt_ratio]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '모든 의미 있는 <img> 에 alt 텍스트 추가 (장식 이미지는 alt="")' },
  [LABELS.doctor_in_text]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '의료진 소개에 "전문의" 타이틀·전문과(구강외과 전문의·치주과 전문의 등) 명시' },
  [LABELS.word_count]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: '핵심 페이지 본문을 500자 이상으로 확장' },

  // ⑤ external_channels
  [LABELS.naver]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '네이버 플레이스 등록 후 홈페이지에서 외부 링크 연결' },
  [LABELS.google]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: 'Google 비즈니스 프로필 생성 + 홈페이지에 연결' },
  [LABELS.kakao]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '카카오톡 채널 개설 후 홈페이지 연결' },
  [LABELS.youtube]: { impact: 'medium', difficulty: 'hard', timeframe: '1개월', actionText: '병원 유튜브 채널 운영 (진료 안내·의료진 소개)' },
  [LABELS.instagram]: { impact: 'low', difficulty: 'easy', timeframe: '즉시', actionText: 'Instagram 계정 홈페이지 푸터/연락처에 연결' },
  [LABELS.sameas_schema]: { impact: 'medium', difficulty: 'medium', timeframe: '1주', actionText: 'Organization/LocalBusiness 스키마의 sameAs 배열에 SNS/플레이스 URL 추가' },
  [LABELS.news_mentions]: { impact: 'medium', difficulty: 'hard', timeframe: '1개월', actionText: '지역 건강 칼럼·의료 전문지에 기고 또는 취재 기사 1~2건 확보 (외부 인용 경로 구축)' },
  [LABELS.owned_channels_diversity]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '네이버 플레이스·Google 비즈니스 프로필·카카오채널 중 최소 3개 등록' },

  // ⑥ aeo_geo
  [LABELS.faq_structure]: { impact: 'high', difficulty: 'medium', timeframe: '1주', actionText: '페이지 내 FAQ 섹션 + FAQPage 스키마 동시 적용' },
  [LABELS.services_named]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '주요 시술명을 본문과 네비게이션에 명시적으로 노출' },
  [LABELS.contact_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '대표 전화번호를 헤더/푸터에 항상 노출' },
  [LABELS.address_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '한국 표준 주소(시/도 + 구/군 + 동/로)를 푸터에 명시' },
  [LABELS.hours_text]: { impact: 'medium', difficulty: 'easy', timeframe: '즉시', actionText: '진료시간·점심시간·휴진일 표시' },
  [LABELS.blog_searchable]: { impact: 'high', difficulty: 'easy', timeframe: '즉시', actionText: '네이버 블로그 관리자 > 관리 > 기본설정에서 "전체공개 + 외부 검색허용" 스위치 켜기' },
};

const DIFFICULTY_ORDER: Record<'easy' | 'medium' | 'hard', number> = { easy: 0, medium: 1, hard: 2 };

interface Candidate {
  item: ActionItem;
  categoryWeight: number;
  itemMaxPoints: number;
  difficultyRank: number;
}

export function buildActionPlan(categories: CategoryScore[]): ActionItem[] {
  const candidates: Candidate[] = [];

  for (const cat of categories) {
    for (const it of cat.items) {
      if (it.status !== 'fail' && it.status !== 'warning') continue;
      const meta = ACTION_META[it.label];
      if (!meta) continue;
      candidates.push({
        item: {
          action: meta.actionText,
          impact: meta.impact,
          difficulty: meta.difficulty,
          timeframe: meta.timeframe,
          category: cat.name,
        },
        categoryWeight: cat.weight,
        itemMaxPoints: it.maxPoints,
        difficultyRank: DIFFICULTY_ORDER[meta.difficulty],
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.categoryWeight !== a.categoryWeight) return b.categoryWeight - a.categoryWeight;
    if (b.itemMaxPoints !== a.itemMaxPoints) return b.itemMaxPoints - a.itemMaxPoints;
    return a.difficultyRank - b.difficultyRank;
  });

  return candidates.slice(0, 10).map(c => c.item);
}
