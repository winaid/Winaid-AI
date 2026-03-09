/**
 * cardNewsDesignTemplates.ts - 카드뉴스 디자인 템플릿 5종
 *
 * 각 템플릿은 다음을 포함:
 * - 색상 팔레트 (배경, 강조, 텍스트)
 * - AI 이미지 프롬프트에 전달할 스타일 가이드
 * - SVG 미리보기 썸네일
 * - assembleCardNewsHtml용 스타일 설정
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
// 템플릿 1: 메디컬 클린 (Medical Clean)
// 파란 배경 + 흰색 프레임 + 의료 아이콘
// =============================================
const medicalClean: CardNewsDesignTemplate = {
  id: 'medical-clean',
  name: '메디컬 클린',
  description: '깔끔한 의료 전문 느낌',
  icon: '🏥',
  colors: {
    background: '#6BA3D6',
    accent: '#6BA3D6',
    text: '#1E3A5F',
    subtitle: '#6BA3D6',
    tagBg: '#E8F4FD',
    tagText: '#4A90C4',
  },
  stylePrompt: `[디자인 템플릿: 메디컬 클린]
- 배경: 부드러운 블루(#6BA3D6) 톤 전체 배경
- 중앙에 흰색 아치형/둥근 프레임 카드
- 상단에 의료 십자 아이콘 (파란색 원 안에 흰색 십자)
- 병원/약국 이름 영문 표기
- 큰 굵은 하늘색 타이틀 텍스트
- 하단에 진단명/태그 바 (회색 배경 + 파란 라벨)
- 좌하단에 의료 소품 이미지 (주사기, 알약 등) 자연스럽게 배치
- 깨끗하고 신뢰감 있는 의료 전문 디자인
- 전체적으로 하늘색-흰색 투톤 조합`,
  styleConfig: {
    backgroundColor: '#6BA3D6',
    borderColor: '#4A90C4',
    borderWidth: '0',
    borderRadius: '24px',
    boxShadow: '0 8px 32px rgba(74,144,196,0.15)',
    hasWindowButtons: false,
    mood: '깔끔하고 신뢰감 있는 의료 전문',
    keyFeatures: ['블루 배경', '흰색 프레임', '의료 아이콘', '아치형 카드'],
    subtitleStyle: { color: '#4A90C4', fontSize: '13px', fontWeight: '600' },
    mainTitleStyle: { color: '#89CFF0', fontSize: '28px', fontWeight: '900' },
    highlightStyle: { color: '#89CFF0', backgroundColor: 'transparent' },
    descStyle: { color: '#FFFFFF', fontSize: '14px' },
    tagStyle: { backgroundColor: '#FFFFFF30', color: '#FFFFFF', borderRadius: '20px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#6BA3D6"/>
    <rect x="15" y="20" width="90" height="85" rx="16" fill="white" opacity="0.95"/>
    <path d="M40 20 Q60 8 80 20" fill="white" opacity="0.95"/>
    <circle cx="60" cy="28" r="8" fill="#4A90C4"/>
    <rect x="57" y="24" width="6" height="8" rx="1" fill="white"/>
    <rect x="56" y="27" width="8" height="2" rx="1" fill="white"/>
    <text x="60" y="42" text-anchor="middle" fill="#8AAFCC" font-size="5" font-weight="600">HOSPITAL</text>
    <rect x="30" y="50" width="60" height="8" rx="2" fill="#89CFF0" opacity="0.8"/>
    <rect x="35" y="62" width="50" height="6" rx="2" fill="#89CFF0" opacity="0.5"/>
    <rect x="28" y="80" width="18" height="10" rx="5" fill="#4A90C4" opacity="0.3"/>
    <rect x="50" y="80" width="40" height="10" rx="5" fill="#E8F0F8"/>
    <circle cx="20" cy="105" r="4" fill="#F5A0B8" opacity="0.5"/>
    <rect x="8" y="85" width="2" height="20" rx="1" fill="#4ABFBF" opacity="0.4" transform="rotate(-30 9 95)"/>
  </svg>`,
};

// =============================================
// 템플릿 2: 봄 플로럴 (Spring Floral)
// 연두 테두리 + 벚꽃 장식 + 부드러운 핑크
// =============================================
const springFloral: CardNewsDesignTemplate = {
  id: 'spring-floral',
  name: '봄 플로럴',
  description: '벚꽃과 자연의 부드러운 감성',
  icon: '🌸',
  colors: {
    background: '#E8F0D8',
    accent: '#7A8B5C',
    text: '#4A5A3A',
    subtitle: '#7A8B5C',
    tagBg: '#7A8B5C',
    tagText: '#FFFFFF',
  },
  stylePrompt: `[디자인 템플릿: 봄 플로럴]
- 배경: 연한 연두색(#E8F0D8) 테두리 프레임
- 중앙은 밝은 크림/흰색 배경
- 네 모서리에 벚꽃 가지와 꽃잎 장식 (수채화 느낌)
- 꽃잎이 흩날리는 효과
- 부드러운 핑크-코랄 그라데이션 타이틀 텍스트
- 올리브/카키 그린 버튼/태그
- 하단에 연한 구분선
- 전체적으로 봄의 따뜻하고 부드러운 자연 감성
- 수채화 일러스트 스타일의 꽃 장식`,
  styleConfig: {
    backgroundColor: '#E8F0D8',
    borderColor: '#C5D6A8',
    borderWidth: '12px',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(122,139,92,0.1)',
    hasWindowButtons: false,
    mood: '따뜻하고 부드러운 봄 자연 감성',
    keyFeatures: ['연두 테두리', '벚꽃 장식', '수채화 느낌', '핑크 그라데이션'],
    subtitleStyle: { color: '#7A8B5C', fontSize: '13px', fontWeight: '500' },
    mainTitleStyle: { color: '#E88B8B', fontSize: '28px', fontWeight: '800' },
    highlightStyle: { color: '#D4726A', backgroundColor: 'transparent' },
    descStyle: { color: '#6B7B5A', fontSize: '14px' },
    tagStyle: { backgroundColor: '#7A8B5C', color: '#FFFFFF', borderRadius: '24px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="8" fill="#E8F0D8"/>
    <rect x="10" y="10" width="100" height="100" rx="4" fill="#FFFEF8"/>
    <g opacity="0.7">
      <circle cx="15" cy="15" r="4" fill="#F5C6CB"/>
      <circle cx="18" cy="12" r="3" fill="#F8D7DA"/>
      <circle cx="12" cy="12" r="3" fill="#FADBD8"/>
      <line x1="20" y1="8" x2="28" y2="3" stroke="#8B6E5A" stroke-width="1"/>
      <circle cx="28" cy="4" r="3" fill="#F5C6CB"/>
    </g>
    <g opacity="0.7" transform="translate(120,0) scale(-1,1)">
      <circle cx="15" cy="15" r="4" fill="#F5C6CB"/>
      <circle cx="18" cy="12" r="3" fill="#F8D7DA"/>
      <line x1="20" y1="8" x2="28" y2="3" stroke="#8B6E5A" stroke-width="1"/>
    </g>
    <g opacity="0.6">
      <circle cx="105" cy="108" r="5" fill="#F5C6CB"/>
      <circle cx="100" cy="105" r="4" fill="#F8D7DA"/>
      <circle cx="108" cy="103" r="3" fill="#FADBD8"/>
    </g>
    <g opacity="0.6">
      <circle cx="15" cy="108" r="5" fill="#F5C6CB"/>
      <circle cx="20" cy="105" r="3" fill="#F8D7DA"/>
    </g>
    <circle cx="58" cy="28" r="2.5" fill="#F5C6CB" opacity="0.5"/>
    <text x="60" y="42" text-anchor="middle" fill="#7A8B5C" font-size="5" font-weight="500">Subtitle</text>
    <rect x="25" y="48" width="70" height="10" rx="2" fill="#E88B8B" opacity="0.7"/>
    <rect x="30" y="62" width="60" height="8" rx="2" fill="#E88B8B" opacity="0.4"/>
    <rect x="35" y="78" width="50" height="10" rx="12" fill="#7A8B5C" opacity="0.7"/>
  </svg>`,
};

// =============================================
// 템플릿 3: 모던 그리드 (Modern Grid)
// 격자 배경 + 찢어진 종이 + 볼드 타이포
// =============================================
const modernGrid: CardNewsDesignTemplate = {
  id: 'modern-grid',
  name: '모던 그리드',
  description: '격자 패턴의 트렌디한 느낌',
  icon: '📐',
  colors: {
    background: '#F5F5F0',
    accent: '#444444',
    text: '#333333',
    subtitle: '#666666',
    tagBg: '#F0F0F0',
    tagText: '#555555',
  },
  stylePrompt: `[디자인 템플릿: 모던 그리드]
- 배경: 밝은 베이지/회백색에 연한 격자 패턴
- 상하단에 찢어진 종이(ripped paper) 텍스처 효과
- 매우 굵고 큰 다크 그레이 타이포그래피 (Black weight)
- 상단에 아이콘 일러스트 (전구, 책, 펜 등 라인아트 스타일)
- 해시태그 스타일의 하단 키워드 (#모던한 #심플한)
- 전체적으로 모노톤 + 트렌디한 그래픽 디자인 느낌
- 격자 위에 종이가 놓인 듯한 레이어 구조
- 심플하면서도 임팩트 있는 타이포 중심 디자인`,
  styleConfig: {
    backgroundColor: '#F5F5F0',
    borderColor: '#DDDDDD',
    borderWidth: '0',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    hasWindowButtons: false,
    mood: '트렌디하고 임팩트 있는 모던',
    keyFeatures: ['격자 배경', '찢어진 종이 효과', '볼드 타이포', '모노톤'],
    subtitleStyle: { color: '#888888', fontSize: '12px', fontWeight: '500' },
    mainTitleStyle: { color: '#333333', fontSize: '30px', fontWeight: '900' },
    highlightStyle: { color: '#333333', backgroundColor: '#FFE066' },
    descStyle: { color: '#666666', fontSize: '13px' },
    tagStyle: { backgroundColor: '#F0F0F0', color: '#555555', borderRadius: '4px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="4" fill="#F5F5F0"/>
    <g stroke="#E0E0D8" stroke-width="0.3" opacity="0.5">
      ${Array.from({length: 12}, (_, i) => `<line x1="${i*10}" y1="0" x2="${i*10}" y2="120"/>`).join('')}
      ${Array.from({length: 12}, (_, i) => `<line x1="0" y1="${i*10}" x2="120" y2="${i*10}"/>`).join('')}
    </g>
    <path d="M0 8 Q10 12 20 7 Q30 3 40 9 Q50 13 60 7 Q70 2 80 8 Q90 14 100 7 Q110 2 120 8 L120 0 L0 0Z" fill="#E8E8E0" opacity="0.8"/>
    <path d="M0 112 Q10 108 20 113 Q30 117 40 111 Q50 107 60 113 Q70 118 80 112 Q90 106 100 113 Q110 118 120 112 L120 120 L0 120Z" fill="#E8E8E0" opacity="0.8"/>
    <text x="60" y="32" text-anchor="middle" fill="#999" font-size="5">Subtitle</text>
    <rect x="20" y="40" width="80" height="12" rx="2" fill="#444" opacity="0.85"/>
    <rect x="24" y="56" width="72" height="10" rx="2" fill="#444" opacity="0.6"/>
    <rect x="28" y="70" width="64" height="8" rx="2" fill="#444" opacity="0.4"/>
    <text x="60" y="100" text-anchor="middle" fill="#999" font-size="5">#\ubaa8\ub358\ud55c #\uc2ec\ud50c\ud55c</text>
  </svg>`,
};

// =============================================
// 템플릿 4: 심플 핀보드 (Simple Pinboard)
// 핀 장식 + 이중 테두리 + 깔끔한 구성
// =============================================
const simplePinboard: CardNewsDesignTemplate = {
  id: 'simple-pin',
  name: '심플 핀보드',
  description: '핀과 테두리의 미니멀 디자인',
  icon: '📌',
  colors: {
    background: '#F0F0F0',
    accent: '#7EB8DA',
    text: '#3A4A5C',
    subtitle: '#7EB8DA',
    tagBg: '#7EB8DA20',
    tagText: '#5A8AAA',
  },
  stylePrompt: `[디자인 템플릿: 심플 핀보드]
- 배경: 연한 그레이(#F0F0F0) 전체 배경
- 중앙에 흰색 카드 + 이중 테두리 (바깥: 실선, 안쪽: 점선)
- 좌상단에 빨간/코랄색 핀 장식
- 상단에 하늘색 띠 배너 (CARDNEWS 등 라벨)
- 매우 굵고 큰 다크 네이비 타이포그래피
- 작은 아이콘 일러스트 장식 (메가폰, 연필X, 연필노트 등)
- 하단에 색상 도트 장식과 설명 텍스트
- 전체적으로 깔끔하고 정돈된 미니멀 게시판 느낌`,
  styleConfig: {
    backgroundColor: '#F0F0F0',
    borderColor: '#3A4A5C',
    borderWidth: '2px',
    borderRadius: '4px',
    boxShadow: '0 2px 12px rgba(58,74,92,0.08)',
    hasWindowButtons: false,
    mood: '깔끔하고 정돈된 미니멀',
    keyFeatures: ['핀 장식', '이중 테두리', '미니멀', '하늘색 배너'],
    subtitleStyle: { color: '#7EB8DA', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#3A4A5C', fontSize: '28px', fontWeight: '900' },
    highlightStyle: { color: '#3A4A5C', backgroundColor: 'transparent' },
    descStyle: { color: '#6B7B8C', fontSize: '13px' },
    tagStyle: { backgroundColor: '#7EB8DA20', color: '#5A8AAA', borderRadius: '4px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="4" fill="#F0F0F0"/>
    <rect x="10" y="10" width="100" height="100" rx="2" fill="white" stroke="#3A4A5C" stroke-width="1.5"/>
    <rect x="14" y="14" width="92" height="92" rx="1" fill="none" stroke="#3A4A5C" stroke-width="0.5" stroke-dasharray="3 2"/>
    <circle cx="20" cy="16" r="5" fill="#E87461"/>
    <circle cx="20" cy="15" r="3" fill="#F08070" opacity="0.8"/>
    <line x1="20" y1="20" x2="20" y2="28" stroke="#3A4A5C" stroke-width="0.5"/>
    <rect x="28" y="24" width="64" height="10" rx="1" fill="#7EB8DA" opacity="0.25"/>
    <text x="60" y="31" text-anchor="middle" fill="#5A8AAA" font-size="5" font-weight="600">CARDNEWS</text>
    <rect x="22" y="42" width="76" height="10" rx="2" fill="#3A4A5C" opacity="0.85"/>
    <rect x="24" y="56" width="72" height="8" rx="2" fill="#3A4A5C" opacity="0.6"/>
    <rect x="26" y="68" width="68" height="7" rx="2" fill="#3A4A5C" opacity="0.4"/>
    <g transform="translate(40, 84)">
      <circle cx="0" cy="0" r="2" fill="#7EB8DA"/>
      <circle cx="8" cy="0" r="2" fill="#7EB8DA"/>
      <circle cx="16" cy="0" r="2" fill="#7EB8DA"/>
      <circle cx="24" cy="0" r="2" fill="#7EB8DA"/>
    </g>
    <text x="60" y="98" text-anchor="middle" fill="#8A9AAA" font-size="4">\uae54\ub054\ud55c \uad6c\uc131\uc73c\ub85c \uc804\ub2ec\ud574\uc694</text>
  </svg>`,
};

// =============================================
// 템플릿 5: 메디컬 일러스트 (Medical Illustration)
// 태블릿 프레임 + 캐릭터 + 파란 톤
// =============================================
const medicalIllust: CardNewsDesignTemplate = {
  id: 'medical-illust',
  name: '메디컬 일러스트',
  description: '캐릭터와 함께하는 친근한 의료',
  icon: '👩‍⚕️',
  colors: {
    background: '#D4E5F7',
    accent: '#2B5C9E',
    text: '#1E3A6E',
    subtitle: '#5A8CC0',
    tagBg: '#2B5C9E20',
    tagText: '#2B5C9E',
  },
  stylePrompt: `[디자인 템플릿: 메디컬 일러스트]
- 배경: 부드러운 하늘색(#D4E5F7) 전체 배경
- 중앙에 흰색 둥근 태블릿/패드 프레임
- 상단에 파란색 배너 + 병원 로고 (십자 아이콘 + 병원명)
- 배너 아래 해시태그 키워드 영역 (회색 배경)
- 큰 굵은 네이비 블루 타이틀 + 연한 파란 서브타이틀
- 점선 구분선으로 섹션 분리
- 하단에 귀여운 캐릭터 일러스트 (통증 표현하는 인물)
- 주변에 의료 소품 아이콘 (주사기, 약병, 십자 마크)
- 전체적으로 친근하면서도 전문적인 의료 일러스트 스타일`,
  styleConfig: {
    backgroundColor: '#D4E5F7',
    borderColor: '#2B5C9E',
    borderWidth: '0',
    borderRadius: '20px',
    boxShadow: '0 8px 24px rgba(43,92,158,0.12)',
    hasWindowButtons: false,
    mood: '친근하고 전문적인 의료 일러스트',
    keyFeatures: ['태블릿 프레임', '캐릭터 일러스트', '파란 배너', '의료 아이콘'],
    subtitleStyle: { color: '#5A8CC0', fontSize: '12px', fontWeight: '600' },
    mainTitleStyle: { color: '#1E3A6E', fontSize: '28px', fontWeight: '900' },
    highlightStyle: { color: '#2B5C9E', backgroundColor: 'transparent' },
    descStyle: { color: '#4A6A90', fontSize: '14px' },
    tagStyle: { backgroundColor: '#2B5C9E20', color: '#2B5C9E', borderRadius: '16px' },
  },
  previewSvg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="12" fill="#D4E5F7"/>
    <rect x="12" y="18" width="96" height="90" rx="12" fill="white" opacity="0.95"/>
    <rect x="20" y="18" width="80" height="14" rx="6" fill="#2B5C9E"/>
    <circle cx="30" cy="25" r="4" fill="#4A90D9"/>
    <rect x="28" y="23" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="27" y="24" width="6" height="2" rx="0.5" fill="white"/>
    <text x="60" y="27" text-anchor="middle" fill="white" font-size="5" font-weight="700">Hospital</text>
    <rect x="22" y="36" width="76" height="8" rx="3" fill="#E8EFF5"/>
    <text x="60" y="42" text-anchor="middle" fill="#5A8CC0" font-size="4">#keyword #tag</text>
    <rect x="28" y="50" width="64" height="8" rx="2" fill="#1E3A6E" opacity="0.8"/>
    <rect x="32" y="62" width="56" height="6" rx="2" fill="#5A8CC0" opacity="0.5"/>
    <line x1="30" y1="72" x2="90" y2="72" stroke="#D4E5F7" stroke-width="0.8" stroke-dasharray="3 2"/>
    <circle cx="60" cy="90" r="12" fill="#D4E5F7"/>
    <circle cx="60" cy="86" r="5" fill="#FBD9B5"/>
    <rect x="55" y="91" width="10" height="8" rx="3" fill="#5A8CC0"/>
    <rect x="8" y="70" width="2" height="14" rx="1" fill="#4ABFBF" opacity="0.4" transform="rotate(-20 9 77)"/>
    <rect x="103" y="40" width="12" height="14" rx="3" fill="#5A8CC0" opacity="0.4"/>
    <rect x="106" y="43" width="6" height="3" rx="1" fill="white" opacity="0.5"/>
  </svg>`,
};

// =============================================
// 전체 템플릿 배열 Export
// =============================================
export const CARD_NEWS_DESIGN_TEMPLATES: CardNewsDesignTemplate[] = [
  medicalClean,
  springFloral,
  modernGrid,
  simplePinboard,
  medicalIllust,
];

// ID로 템플릿 찾기
export const getDesignTemplateById = (id: CardNewsDesignTemplateId): CardNewsDesignTemplate | undefined => {
  return CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === id);
};
