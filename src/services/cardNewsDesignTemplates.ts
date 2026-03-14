/**
 * cardNewsDesignTemplates.ts - 카드뉴스 디자인 템플릿 8종
 *
 * v2.0 전면 교체 — 의료 마케팅 실사용 기준
 * 패턴 출처: Canva Healthcare Templates, 한국 병원 인스타그램 카드뉴스, Behance Medical Branding
 *
 * 각 템플릿은 서로 다른 사용 목적을 가지며, 공통 디자인 시스템을 따른다.
 * 공통 규칙:
 *   - 안전영역: 상하좌우 10% 이상
 *   - 제목: 최대 20자
 *   - 서브카피: 최대 30자
 *   - 본문: 최대 3줄
 *   - CTA: 과장 금지, 의료광고법 준수
 *   - 모바일 우선 (정사각형 1:1 기준)
 */
import type { CardNewsDesignTemplateId } from '../types';

export interface CardNewsDesignTemplate {
  id: CardNewsDesignTemplateId;
  name: string;
  description: string;
  icon: string;
  // 색상
  colors: {
    background: string;
    accent: string;
    text: string;
    subtitle: string;
    tagBg: string;
    tagText: string;
  };
  // AI 이미지 프롬프트에 추가되는 스타일 지시
  stylePrompt: string;
  // assembleCardNewsHtml에 전달할 AnalyzedStyle 호환 객체
  styleConfig: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: string;
    borderRadius: string;
    boxShadow: string;
    hasWindowButtons: boolean;
    mood: string;
    keyFeatures: string[];
    subtitleStyle: { color: string; fontSize: string; fontWeight: string };
    mainTitleStyle: { color: string; fontSize: string; fontWeight: string };
    highlightStyle: { color: string; backgroundColor: string };
    descStyle: { color: string; fontSize: string };
    tagStyle: { backgroundColor: string; color: string; borderRadius: string };
  };
  // SVG 미리보기 (인라인 SVG 문자열)
  previewSvg: string;
}

// =============================================
// 1. 정보 카드 (Info Card)
// 용도: 질환 정보, 시술 안내, 증상 설명
// 의료 적합성: 높음 — 깔끔하고 신뢰감 있는 정보 전달
// =============================================
const infoCard: CardNewsDesignTemplate = {
  id: 'info-card',
  name: '정보 카드',
  description: '깔끔한 의료 정보 전달',
  icon: '📋',
  colors: {
    background: '#F8FAFC',
    accent: '#2563EB',
    text: '#1E293B',
    subtitle: '#3B82F6',
    tagBg: '#EFF6FF',
    tagText: '#2563EB',
  },
  stylePrompt: `[디자인 템플릿: 정보 카드]
- 배경: 밝은 그레이-화이트(#F8FAFC) 전체 배경
- 상단 12% 영역에 블루(#2563EB) 가로 띠 + 카테고리 라벨 (흰색 텍스트)
- 중앙 큰 제목: 네이비(#1E293B), 굵은 산세리프, 28px 이상
- 제목 아래 1px 블루 구분선
- 본문: 슬레이트 그레이, 14px, 좌측 정렬, 최대 3줄
- 하단에 블루 태그 뱃지 1~2개 (둥근 모서리, 작은 크기)
- 전체적으로 여백이 넉넉한 깔끔한 정보 카드
- 장식 최소화, 텍스트 가독성 최우선`,
  styleConfig: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: '1px',
    borderRadius: '16px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    hasWindowButtons: false,
    mood: '깔끔하고 신뢰감 있는 정보 전달',
    keyFeatures: ['블루 상단 띠', '넉넉한 여백', '명확한 타이포 계층', '태그 뱃지'],
    subtitleStyle: { color: '#3B82F6', fontSize: '13px', fontWeight: '600' },
    mainTitleStyle: { color: '#1E293B', fontSize: '28px', fontWeight: '800' },
    highlightStyle: { color: '#2563EB', backgroundColor: '#EFF6FF' },
    descStyle: { color: '#475569', fontSize: '14px' },
    tagStyle: { backgroundColor: '#EFF6FF', color: '#2563EB', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#F8FAFC"/>
    <rect width="120" height="16" rx="12" fill="#2563EB"/>
    <rect x="0" y="8" width="120" height="8" fill="#2563EB"/>
    <text x="60" y="12" text-anchor="middle" fill="white" font-size="5" font-weight="600">HEALTH INFO</text>
    <rect x="20" y="30" width="80" height="10" rx="2" fill="#1E293B" opacity="0.85"/>
    <rect x="24" y="44" width="72" height="8" rx="2" fill="#1E293B" opacity="0.55"/>
    <line x1="20" y1="58" x2="100" y2="58" stroke="#2563EB" stroke-width="0.8" opacity="0.4"/>
    <rect x="20" y="66" width="80" height="4" rx="1" fill="#64748B" opacity="0.4"/>
    <rect x="20" y="74" width="70" height="4" rx="1" fill="#64748B" opacity="0.3"/>
    <rect x="20" y="82" width="60" height="4" rx="1" fill="#64748B" opacity="0.25"/>
    <rect x="20" y="98" width="28" height="10" rx="5" fill="#EFF6FF"/>
    <text x="34" y="105" text-anchor="middle" fill="#2563EB" font-size="4">#건강정보</text>
    <rect x="52" y="98" width="28" height="10" rx="5" fill="#EFF6FF"/>
    <text x="66" y="105" text-anchor="middle" fill="#2563EB" font-size="4">#의료</text>
  </svg>`,
};

// =============================================
// 2. 전문가 코멘트 (Expert Quote)
// 용도: 원장 코멘트, 전문가 의견, 의료진 메시지
// 의료 적합성: 높음 — 전문성과 신뢰 강조
// =============================================
const expertQuote: CardNewsDesignTemplate = {
  id: 'expert-quote',
  name: '전문가 코멘트',
  description: '원장/전문가 코멘트 강조',
  icon: '💬',
  colors: {
    background: '#FAFAF5',
    accent: '#065F46',
    text: '#1C1917',
    subtitle: '#059669',
    tagBg: '#ECFDF5',
    tagText: '#065F46',
  },
  stylePrompt: `[디자인 템플릿: 전문가 코멘트]
- 배경: 웜 화이트(#FAFAF5) 전체 배경
- 좌측에 굵은 딥 그린(#065F46) 세로 인용 바 (4px 너비, 높이 40%)
- 인용 바 옆에 큰 " 기호 (그린, 낮은 투명도)
- 중앙에 굵은 다크 타이틀 (핵심 메시지/코멘트)
- 타이틀 아래 그린 서브타이틀 (출처/직함)
- 하단에 연한 구분선 + 작은 그린 원형 뱃지
- 장식 최소화, 권위와 신뢰감 강조
- 의료 전문가의 조언을 담는 느낌`,
  styleConfig: {
    backgroundColor: '#FAFAF5',
    borderColor: '#D1D5C8',
    borderWidth: '1px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
    hasWindowButtons: false,
    mood: '권위 있고 신뢰감 있는 전문가 코멘트',
    keyFeatures: ['인용 바', '큰 따옴표', '딥 그린 포인트', '미니멀'],
    subtitleStyle: { color: '#059669', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#1C1917', fontSize: '26px', fontWeight: '700' },
    highlightStyle: { color: '#065F46', backgroundColor: '#ECFDF5' },
    descStyle: { color: '#57534E', fontSize: '14px' },
    tagStyle: { backgroundColor: '#ECFDF5', color: '#065F46', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="10" fill="#FAFAF5"/>
    <rect x="16" y="24" width="4" height="50" rx="2" fill="#065F46"/>
    <text x="26" y="36" fill="#065F46" font-size="24" opacity="0.15" font-weight="900">"</text>
    <rect x="28" y="40" width="76" height="8" rx="2" fill="#1C1917" opacity="0.8"/>
    <rect x="28" y="52" width="68" height="7" rx="2" fill="#1C1917" opacity="0.55"/>
    <rect x="28" y="63" width="50" height="6" rx="2" fill="#1C1917" opacity="0.35"/>
    <line x1="28" y1="78" x2="100" y2="78" stroke="#D1D5C8" stroke-width="0.5"/>
    <text x="28" y="90" fill="#059669" font-size="5" font-weight="600">OO병원 대표원장</text>
    <circle cx="100" cy="100" r="6" fill="#ECFDF5"/>
    <text x="100" y="103" text-anchor="middle" fill="#065F46" font-size="5">+</text>
  </svg>`,
};

// =============================================
// 3. 체크리스트 (Checklist)
// 용도: 자가진단, 증상 체크, 준비물, 주의사항
// 의료 적합성: 높음 — 실용적 정보 전달
// =============================================
const checklist: CardNewsDesignTemplate = {
  id: 'checklist',
  name: '체크리스트',
  description: '자가진단/증상체크/주의사항',
  icon: '✅',
  colors: {
    background: '#FFFFFF',
    accent: '#7C3AED',
    text: '#18181B',
    subtitle: '#8B5CF6',
    tagBg: '#F5F3FF',
    tagText: '#7C3AED',
  },
  stylePrompt: `[디자인 템플릿: 체크리스트]
- 배경: 순수 화이트(#FFFFFF) 전체 배경
- 상단에 퍼플(#7C3AED) 둥근 아이콘 원 (체크마크)
- 아이콘 아래 굵은 다크 타이틀 (체크리스트 제목)
- 본문 영역: 좌측에 퍼플 체크박스 아이콘 + 항목 텍스트 세로 나열
- 각 항목 간 연한 구분선
- 하단에 퍼플 배경 둥근 뱃지 (요약 또는 CTA)
- 전체적으로 깔끔하고 구조화된 목록 형태
- 항목 간 간격 넉넉하게, 모바일에서 읽기 편하게`,
  styleConfig: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E4E7',
    borderWidth: '1px',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    hasWindowButtons: false,
    mood: '구조화된 실용적 체크리스트',
    keyFeatures: ['체크박스 아이콘', '목록 구조', '퍼플 포인트', '깔끔한 여백'],
    subtitleStyle: { color: '#8B5CF6', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#18181B', fontSize: '26px', fontWeight: '800' },
    highlightStyle: { color: '#7C3AED', backgroundColor: '#F5F3FF' },
    descStyle: { color: '#3F3F46', fontSize: '14px' },
    tagStyle: { backgroundColor: '#F5F3FF', color: '#7C3AED', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="white" stroke="#E4E4E7" stroke-width="0.5"/>
    <circle cx="60" cy="20" r="10" fill="#F5F3FF"/>
    <path d="M55 20 L58 23 L65 17" stroke="#7C3AED" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="24" y="36" width="72" height="8" rx="2" fill="#18181B" opacity="0.8"/>
    <g transform="translate(20, 52)">
      <rect x="0" y="0" width="8" height="8" rx="2" fill="#F5F3FF" stroke="#7C3AED" stroke-width="0.5"/>
      <rect x="12" y="1" width="60" height="5" rx="1" fill="#3F3F46" opacity="0.5"/>
    </g>
    <g transform="translate(20, 66)">
      <rect x="0" y="0" width="8" height="8" rx="2" fill="#F5F3FF" stroke="#7C3AED" stroke-width="0.5"/>
      <rect x="12" y="1" width="55" height="5" rx="1" fill="#3F3F46" opacity="0.5"/>
    </g>
    <g transform="translate(20, 80)">
      <rect x="0" y="0" width="8" height="8" rx="2" fill="#F5F3FF" stroke="#7C3AED" stroke-width="0.5"/>
      <rect x="12" y="1" width="50" height="5" rx="1" fill="#3F3F46" opacity="0.5"/>
    </g>
    <rect x="30" y="100" width="60" height="12" rx="6" fill="#7C3AED" opacity="0.9"/>
    <text x="60" y="108" text-anchor="middle" fill="white" font-size="4.5" font-weight="600">자가진단</text>
  </svg>`,
};

// =============================================
// 4. Q&A 카드 (Q&A Card)
// 용도: 자주 묻는 질문, 궁금증 해소, 오해 바로잡기
// 의료 적합성: 높음 — 환자 궁금증 해소
// =============================================
const qnaCard: CardNewsDesignTemplate = {
  id: 'qna-card',
  name: 'Q&A 카드',
  description: '자주 묻는 질문/궁금증 해소',
  icon: '❓',
  colors: {
    background: '#FFF7ED',
    accent: '#EA580C',
    text: '#1C1917',
    subtitle: '#F97316',
    tagBg: '#FFF7ED',
    tagText: '#EA580C',
  },
  stylePrompt: `[디자인 템플릿: Q&A 카드]
- 배경: 웜 크림(#FFF7ED) 전체 배경
- 상단에 큰 Q 글자 (오렌지, 반투명, 장식용)
- Q 영역: 오렌지(#EA580C) 말풍선 형태에 질문 텍스트 (흰색)
- A 영역: 화이트 카드에 답변 텍스트 (다크 그레이)
- Q와 A 사이 작은 화살표 또는 간격
- 하단에 오렌지 태그 뱃지
- 전체적으로 따뜻하면서 읽기 편한 Q&A 구조
- 질문-답변 시각 구분이 명확해야 함`,
  styleConfig: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: '1px',
    borderRadius: '16px',
    boxShadow: '0 4px 16px rgba(234,88,12,0.06)',
    hasWindowButtons: false,
    mood: '따뜻하고 친근한 Q&A',
    keyFeatures: ['말풍선 Q', '카드 A', '오렌지 포인트', '웜 톤'],
    subtitleStyle: { color: '#F97316', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#1C1917', fontSize: '24px', fontWeight: '700' },
    highlightStyle: { color: '#EA580C', backgroundColor: '#FFF7ED' },
    descStyle: { color: '#44403C', fontSize: '14px' },
    tagStyle: { backgroundColor: '#FFF7ED', color: '#EA580C', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#FFF7ED"/>
    <text x="16" y="28" fill="#EA580C" font-size="20" font-weight="900" opacity="0.12">Q</text>
    <rect x="14" y="18" width="92" height="30" rx="10" fill="#EA580C"/>
    <path d="M40 48 L46 54 L52 48" fill="#EA580C"/>
    <text x="60" y="30" text-anchor="middle" fill="white" font-size="5" font-weight="600">임플란트 수명은?</text>
    <text x="60" y="40" text-anchor="middle" fill="white" font-size="4.5" opacity="0.9">어떻게 관리해야 하나요</text>
    <rect x="14" y="58" width="92" height="42" rx="10" fill="white"/>
    <text x="22" y="68" fill="#EA580C" font-size="6" font-weight="800">A.</text>
    <rect x="34" y="64" width="64" height="4" rx="1" fill="#44403C" opacity="0.5"/>
    <rect x="34" y="72" width="58" height="4" rx="1" fill="#44403C" opacity="0.4"/>
    <rect x="34" y="80" width="52" height="4" rx="1" fill="#44403C" opacity="0.3"/>
    <rect x="34" y="88" width="40" height="4" rx="1" fill="#44403C" opacity="0.25"/>
    <rect x="20" y="106" width="24" height="8" rx="4" fill="#FFF7ED" stroke="#FED7AA" stroke-width="0.5"/>
    <text x="32" y="112" text-anchor="middle" fill="#EA580C" font-size="3.5">FAQ</text>
  </svg>`,
};

// =============================================
// 5. 공지 보드 (Notice Board)
// 용도: 진료 안내, 휴진 공지, 이벤트 안내
// 의료 적합성: 높음 — 공식 안내 느낌
// =============================================
const noticeBoard: CardNewsDesignTemplate = {
  id: 'notice-board',
  name: '공지 보드',
  description: '진료 안내/휴진/이벤트 공지',
  icon: '📢',
  colors: {
    background: '#F0F4F8',
    accent: '#1E40AF',
    text: '#1E293B',
    subtitle: '#3B82F6',
    tagBg: '#DBEAFE',
    tagText: '#1E40AF',
  },
  stylePrompt: `[디자인 템플릿: 공지 보드]
- 배경: 쿨 그레이(#F0F4F8) 전체 배경
- 상단에 다크 블루(#1E40AF) 배너 바 (NOTICE 라벨, 가운데 정렬)
- 배너 아래 흰색 카드 영역
- 카드 상단에 강조 아이콘 (메가폰 또는 벨)
- 큰 굵은 네이비 제목
- 본문: 좌측 정렬, 핵심 정보 강조 (날짜/시간/장소 등)
- 하단에 블루 계열 뱃지 또는 구분 바
- 공식적이고 정돈된 안내문 느낌
- 중요 정보가 한눈에 보여야 함`,
  styleConfig: {
    backgroundColor: '#F0F4F8',
    borderColor: '#CBD5E1',
    borderWidth: '1px',
    borderRadius: '12px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    hasWindowButtons: false,
    mood: '공식적이고 정돈된 안내',
    keyFeatures: ['다크 블루 배너', '안내문 구조', '강조 아이콘', '정보 중심'],
    subtitleStyle: { color: '#3B82F6', fontSize: '13px', fontWeight: '600' },
    mainTitleStyle: { color: '#1E293B', fontSize: '28px', fontWeight: '800' },
    highlightStyle: { color: '#1E40AF', backgroundColor: '#DBEAFE' },
    descStyle: { color: '#475569', fontSize: '14px' },
    tagStyle: { backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '8px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="10" fill="#F0F4F8"/>
    <rect x="10" y="10" width="100" height="18" rx="4" fill="#1E40AF"/>
    <text x="60" y="22" text-anchor="middle" fill="white" font-size="6" font-weight="700">NOTICE</text>
    <rect x="10" y="32" width="100" height="78" rx="4" fill="white"/>
    <circle cx="60" cy="46" r="7" fill="#DBEAFE"/>
    <text x="60" y="49" text-anchor="middle" fill="#1E40AF" font-size="7">!</text>
    <rect x="24" y="58" width="72" height="8" rx="2" fill="#1E293B" opacity="0.8"/>
    <rect x="28" y="70" width="64" height="5" rx="1" fill="#475569" opacity="0.4"/>
    <rect x="28" y="78" width="58" height="5" rx="1" fill="#475569" opacity="0.3"/>
    <rect x="32" y="94" width="56" height="10" rx="5" fill="#DBEAFE"/>
    <text x="60" y="101" text-anchor="middle" fill="#1E40AF" font-size="4">안내사항</text>
  </svg>`,
};

// =============================================
// 6. 숫자 강조 (Number Highlight)
// 용도: 통계, 수치 강조, 비율, 핵심 숫자
// 의료 적합성: 높음 — 객관적 데이터 전달
// =============================================
const numberHighlight: CardNewsDesignTemplate = {
  id: 'number-highlight',
  name: '숫자 강조',
  description: '통계/수치/핵심 숫자 강조',
  icon: '🔢',
  colors: {
    background: '#0F172A',
    accent: '#38BDF8',
    text: '#F1F5F9',
    subtitle: '#7DD3FC',
    tagBg: '#1E293B',
    tagText: '#38BDF8',
  },
  stylePrompt: `[디자인 템플릿: 숫자 강조]
- 배경: 다크 네이비(#0F172A) 전체 배경
- 중앙에 매우 큰 스카이 블루(#38BDF8) 숫자 (48px 이상, 볼드)
- 숫자 위에 작은 밝은 그레이 카테고리 라벨
- 숫자 아래 밝은 화이트 설명 텍스트 (16px)
- 하단에 연한 구분선 + 출처/참고 텍스트 (작은 회색)
- 전체적으로 다크 모드 + 포인트 컬러 숫자
- 숫자가 가장 먼저 눈에 들어와야 함
- 깔끔하고 임팩트 있는 데이터 시각화 느낌`,
  styleConfig: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
    borderWidth: '0',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    hasWindowButtons: false,
    mood: '임팩트 있는 데이터 시각화',
    keyFeatures: ['다크 배경', '큰 숫자', '스카이블루 포인트', '데이터 중심'],
    subtitleStyle: { color: '#7DD3FC', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#38BDF8', fontSize: '48px', fontWeight: '900' },
    highlightStyle: { color: '#38BDF8', backgroundColor: '#1E293B' },
    descStyle: { color: '#CBD5E1', fontSize: '14px' },
    tagStyle: { backgroundColor: '#1E293B', color: '#38BDF8', borderRadius: '8px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#0F172A"/>
    <text x="60" y="30" text-anchor="middle" fill="#94A3B8" font-size="5" font-weight="500">임플란트 생존율</text>
    <text x="60" y="65" text-anchor="middle" fill="#38BDF8" font-size="32" font-weight="900">97%</text>
    <line x1="30" y1="78" x2="90" y2="78" stroke="#1E293B" stroke-width="1"/>
    <text x="60" y="90" text-anchor="middle" fill="#CBD5E1" font-size="5">10년 기준 평균 수치</text>
    <text x="60" y="108" text-anchor="middle" fill="#64748B" font-size="3.5">출처: 대한치과의사협회</text>
  </svg>`,
};

// =============================================
// 7. 미니멀 그라디언트 (Minimal Gradient)
// 용도: 브랜딩, 썸네일, 일반 홍보
// 의료 적합성: 중간 — 범용적이면서 세련된 느낌
// =============================================
const minimalGradient: CardNewsDesignTemplate = {
  id: 'minimal-gradient',
  name: '미니멀 그라디언트',
  description: '세련된 그라디언트 브랜딩',
  icon: '🎨',
  colors: {
    background: '#667EEA',
    accent: '#764BA2',
    text: '#FFFFFF',
    subtitle: '#E0E7FF',
    tagBg: '#FFFFFF20',
    tagText: '#FFFFFF',
  },
  stylePrompt: `[디자인 템플릿: 미니멀 그라디언트]
- 배경: 인디고→퍼플 부드러운 대각선 그라디언트 (#667EEA → #764BA2)
- 중앙에 큰 흰색 제목 텍스트 (그림자 없이 깔끔하게)
- 제목 위에 작은 연한 서브카피
- 제목 아래 흰색 반투명 구분선
- 하단에 흰색 반투명 태그 뱃지
- 장식 요소 최소화 (그라디언트 자체가 디자인)
- 모서리 근처에 작은 원형 도형 2~3개 (반투명 장식)
- 전체적으로 모던하고 세련된 브랜딩 느낌`,
  styleConfig: {
    backgroundColor: '#667EEA',
    borderColor: '#764BA2',
    borderWidth: '0',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(102,126,234,0.25)',
    hasWindowButtons: false,
    mood: '모던하고 세련된 브랜딩',
    keyFeatures: ['그라디언트 배경', '흰색 타이포', '미니멀 장식', '모던 감성'],
    subtitleStyle: { color: '#E0E7FF', fontSize: '12px', fontWeight: '500' },
    mainTitleStyle: { color: '#FFFFFF', fontSize: '28px', fontWeight: '800' },
    highlightStyle: { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.15)' },
    descStyle: { color: '#E0E7FF', fontSize: '14px' },
    tagStyle: { backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667EEA"/>
        <stop offset="100%" style="stop-color:#764BA2"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="12" fill="url(#grad1)"/>
    <circle cx="95" cy="18" r="12" fill="white" opacity="0.08"/>
    <circle cx="25" cy="100" r="8" fill="white" opacity="0.06"/>
    <text x="60" y="38" text-anchor="middle" fill="#E0E7FF" font-size="5" font-weight="500">건강한 미소를 위한</text>
    <rect x="20" y="46" width="80" height="10" rx="2" fill="white" opacity="0.9"/>
    <rect x="26" y="60" width="68" height="8" rx="2" fill="white" opacity="0.6"/>
    <line x1="30" y1="78" x2="90" y2="78" stroke="white" stroke-width="0.5" opacity="0.3"/>
    <rect x="36" y="90" width="48" height="10" rx="5" fill="white" opacity="0.2"/>
    <text x="60" y="97" text-anchor="middle" fill="white" font-size="4" font-weight="500">더 알아보기</text>
  </svg>`,
};

// =============================================
// 8. 포토 오버레이 (Photo Overlay)
// 용도: 병원 사진 위 텍스트, 시설/장비 소개
// 의료 적합성: 중간 — 실제 사진 활용 시 효과적
// =============================================
const photoOverlay: CardNewsDesignTemplate = {
  id: 'photo-overlay',
  name: '포토 오버레이',
  description: '사진 위 텍스트 오버레이',
  icon: '📸',
  colors: {
    background: '#1A1A2E',
    accent: '#E94560',
    text: '#FFFFFF',
    subtitle: '#F1F1F1',
    tagBg: '#E9456030',
    tagText: '#E94560',
  },
  stylePrompt: `[디자인 템플릿: 포토 오버레이]
- 배경: 어두운 사진 또는 다크 네이비(#1A1A2E) 배경 (사진 위 오버레이 효과)
- 하단 40%에 검정 그라데이션 오버레이 (위로 갈수록 투명)
- 오버레이 위에 큰 흰색 제목 텍스트
- 제목 위에 작은 코랄 레드(#E94560) 카테고리 뱃지
- 제목 아래 밝은 회색 설명 텍스트 1~2줄
- 상단은 사진/일러스트 영역 (텍스트 없이 비워두기)
- 전체적으로 사진 배경 + 텍스트 오버레이 느낌
- 텍스트 가독성을 위해 오버레이 충분히 어둡게`,
  styleConfig: {
    backgroundColor: '#1A1A2E',
    borderColor: '#16213E',
    borderWidth: '0',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    hasWindowButtons: false,
    mood: '시네마틱 포토 오버레이',
    keyFeatures: ['다크 오버레이', '코랄 레드 뱃지', '사진 배경', '하단 텍스트'],
    subtitleStyle: { color: '#F1F1F1', fontSize: '12px', fontWeight: '500' },
    mainTitleStyle: { color: '#FFFFFF', fontSize: '28px', fontWeight: '800' },
    highlightStyle: { color: '#E94560', backgroundColor: '#E9456020' },
    descStyle: { color: '#D1D1D1', fontSize: '14px' },
    tagStyle: { backgroundColor: '#E9456030', color: '#E94560', borderRadius: '16px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#1A1A2E"/>
    <rect x="10" y="10" width="100" height="55" rx="6" fill="#2A2A4E" opacity="0.5"/>
    <circle cx="60" cy="35" r="15" fill="#3A3A5E" opacity="0.4"/>
    <rect x="45" y="28" width="30" height="14" rx="3" fill="#4A4A6E" opacity="0.3"/>
    <defs>
      <linearGradient id="overlay1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:#1A1A2E;stop-opacity:0"/>
        <stop offset="100%" style="stop-color:#1A1A2E;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <rect x="0" y="50" width="120" height="70" rx="0" fill="url(#overlay1)"/>
    <rect x="16" y="70" width="32" height="8" rx="4" fill="#E94560"/>
    <text x="32" y="76" text-anchor="middle" fill="white" font-size="4" font-weight="600">CLINIC</text>
    <rect x="16" y="84" width="88" height="8" rx="2" fill="white" opacity="0.9"/>
    <rect x="16" y="96" width="72" height="5" rx="1" fill="white" opacity="0.4"/>
    <rect x="16" y="104" width="60" height="5" rx="1" fill="white" opacity="0.3"/>
  </svg>`,
};

// =============================================
// 전체 템플릿 배열 Export
// =============================================
export const CARD_NEWS_DESIGN_TEMPLATES: CardNewsDesignTemplate[] = [
  infoCard,
  expertQuote,
  checklist,
  qnaCard,
  noticeBoard,
  numberHighlight,
  minimalGradient,
  photoOverlay,
];

// ID로 템플릿 찾기
export const getDesignTemplateById = (id: CardNewsDesignTemplateId): CardNewsDesignTemplate | undefined => {
  return CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === id);
};
