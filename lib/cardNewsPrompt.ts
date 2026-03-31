/**
 * 카드뉴스 생성 프롬프트 조립
 *
 * old 앱의 cardNewsService.ts 참고, 이미지 생성 제외 텍스트 원고만 생성.
 * 슬라이드별 제목 + 설명 구조로 출력.
 */

import type { CardNewsDesignTemplateId } from './types';
import { CARD_NEWS_DESIGN_TEMPLATES } from './cardNewsDesignTemplates';

export interface CardNewsRequest {
  topic: string;
  keywords?: string;
  hospitalName?: string;
  slideCount: number;         // 4–7
  writingStyle?: 'expert' | 'empathy' | 'conversion';
  designTemplateId?: CardNewsDesignTemplateId;
}

const STYLE_GUIDES: Record<string, string> = {
  empathy: '독자의 고민에 공감하며, 걱정을 덜어주는 톤으로 작성합니다.',
  expert: '전문적 근거와 수치를 활용하여 신뢰감을 높입니다.',
  conversion: '독자가 상담 예약이나 문의를 하도록 자연스럽게 유도합니다.',
};

export function buildCardNewsPrompt(req: CardNewsRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const style = STYLE_GUIDES[req.writingStyle || 'empathy'] || STYLE_GUIDES.empathy;

  const systemInstruction = [
    '당신은 한국의 병원 마케팅 전문 카드뉴스 원고 작성자입니다.',
    '인스타그램/블로그용 카드뉴스 원고를 작성합니다.',
    style,
    '',
    '[의료광고법 제56조 준수 — 절대 금지 표현]',
    '- "최고", "최초", "유일", "100%", "완치", "보장" 등 과장/단정 표현 금지',
    '- "~하세요", "~받으세요", "~예약하세요" 등 행동 유도 명령형 금지',
    '- "효과가 뛰어난", "성공률 높은", "가장 좋은" 등 효과 보장 표현 금지',
    '- "전후 사진", "체험기", "추천사" 등 치료 결과 암시 금지',
    '- 특정 시술/약품 효능을 단정하는 표현 금지',
    '- 다른 의료기관 비교·비방 금지',
    '',
    '[대신 사용할 표현]',
    '- "~할 수 있습니다" → "~로 알려져 있습니다", "~라고 합니다"',
    '- "치료 효과" → "치료 과정", "치료 방법"',
    '- "최고의 기술" → "전문적인 진료"',
    '- 객관적 정보 전달 중심, 관찰형 서술',
    '',
    '각 슬라이드는 3초 안에 핵심을 전달할 수 있도록 짧고 임팩트 있게 작성합니다.',
    '전문 용어는 쉬운 말로 바꿔 설명합니다.',
  ].join('\n');

  const slideGuide = buildSlideGuide(req.slideCount);

  const promptParts = [
    `## 카드뉴스 원고 작성 요청`,
    `- 주제: ${req.topic}`,
  ];

  if (req.keywords) {
    promptParts.push(`- 키워드: ${req.keywords}`);
  }
  if (req.hospitalName) {
    promptParts.push(`- 병원명: ${req.hospitalName}`);
  }
  if (req.designTemplateId) {
    const tmpl = CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === req.designTemplateId);
    if (tmpl) {
      promptParts.push(`- 디자인 템플릿: ${tmpl.name} (${tmpl.description})`);
      promptParts.push(`- 디자인 분위기: ${tmpl.styleConfig.mood}`);
    }
  }

  promptParts.push(
    `- 슬라이드 수: ${req.slideCount}장`,
    '',
    `## 슬라이드 구성 가이드`,
    slideGuide,
    '',
    `## 출력 형식`,
    '각 슬라이드를 아래 형식으로 작성해주세요:',
    '',
    '### 1장: 표지',
    '**제목**: (메인 타이틀)',
    '**부제**: (서브 타이틀)',
    '',
    '### 2장: (슬라이드 역할)',
    '**제목**: (슬라이드 제목)',
    '**본문**: (핵심 내용 2-3문장)',
    '',
    '... (이하 동일 형식)',
    '',
    '위 형식대로 정확히 작성해주세요.',
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}

function buildSlideGuide(slideCount: number): string {
  const guides: string[] = [];

  guides.push('1장 - **표지**: 시선을 멈추게 하는 강렬한 제목. 본문 없이 제목+부제만.');

  if (slideCount >= 4) {
    guides.push('2장 - **문제 제기**: 독자의 고민이나 궁금증을 짚어줍니다.');
  }
  if (slideCount >= 5) {
    guides.push('3장 - **변화 신호**: "이런 증상이 있다면?" 체크리스트 형식.');
  }
  if (slideCount >= 6) {
    guides.push('4장 - **원인/해결**: 전문적 정보를 쉽게 전달합니다.');
  }
  if (slideCount >= 7) {
    guides.push(`5~${slideCount - 2}장 - **추가 정보**: 사례, 비교, 주의사항 등.`);
  }

  guides.push(`${slideCount - 1}장 - **핵심 정리**: 가장 중요한 포인트를 한 문장으로.`);
  guides.push(`${slideCount}장 - **마무리 표지**: 병원명, 연락처 안내 또는 행동 유도 문구.`);

  return guides.join('\n');
}
