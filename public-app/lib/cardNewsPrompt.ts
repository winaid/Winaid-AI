/**
 * 카드뉴스 생성 프롬프트 조립
 *
 * old 앱의 cardNewsService.ts 참고, 이미지 생성 제외 텍스트 원고만 생성.
 * 슬라이드별 제목 + 설명 구조로 출력.
 */

import type { CardNewsDesignTemplateId } from './types';
import { CARD_NEWS_DESIGN_TEMPLATES } from './cardNewsDesignTemplates';
import { getMedicalLawPromptBlock } from './medicalLawRules';

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
    getMedicalLawPromptBlock(true),
    '',
    '[슬라이드 분량 기준]',
    '- 표지: 제목 15자 이내, 부제 25자 이내',
    '- 본문 슬라이드: 제목 15자 이내, 본문 2~3문장 (각 20~30자)',
    '- 마무리: 행동 유도 문구 20자 이내',
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
    `## 출력 형식 (마크다운)`,
    '각 슬라이드를 아래 마크다운 형식으로 정확히 작성해주세요 (HTML 아님):',
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
