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
  category?: string;
}

const STYLE_GUIDES: Record<string, string> = {
  empathy: '독자의 고민에 공감하며, 걱정을 덜어주는 톤으로 작성합니다.',
  expert: '전문적 근거와 수치를 활용하여 신뢰감을 높입니다.',
  conversion: '마지막 슬라이드에서 부드러운 상담 안내를 포함합니다. (○ "궁금한 점은 상담을 통해 확인할 수 있습니다", ✕ "지금 바로 예약하세요")',
};

const CATEGORY_CARD_GUIDES: Record<string, string> = {
  '치과': `[치과 카드뉴스 가이드]
- 시술: 임플란트, 라미네이트, 교정(메탈/세라믹/투명), 크라운, 인레이/온레이, 스케일링
- 증상: 충치, 치주염, 잇몸출혈, 시린이, 턱관절, 사랑니
- 포인트: 보험 적용 여부, 시술 과정 단계별 설명, Before/After 개념 설명`,

  '피부과': `[피부과 카드뉴스 가이드]
- 레이저: 피코레이저(색소), 레이저토닝(기미), IPL(홍조/잡티), CO2(점/흉터), 엔디야그(혈관/문신)
- 리프팅: 울쎄라(초음파 HIFU), 써마지(고주파 RF), 인모드, 슈링크, 올리지오, 실리프팅(PDO/PCL)
- 주사: 보톡스(주름/사각턱), 필러(쥬비덤/레스틸렌), 스킨부스터(쥬베룩/리쥬란/엑소좀), 물광, PRP
- 재생: 더마펜, 화학박피(AHA/BHA), 아쿠아필, LED
- 증상매칭: 기미=토닝+부스터, 모공=프락셀+더마펜+써마지, 주름=보톡스+필러+리프팅
- 포인트: 시술 비교(원리/다운타임/유지기간), 시술 전후 주의사항, 계절별 추천 시술`,

  '정형외과': `[정형외과 카드뉴스 가이드]
- 비수술: 물리치료, 도수치료, 체외충격파(ESWT), 프롤로, DNS주사, 신경차단술
- 수술: 관절경, 인공관절, 척추 내시경(FESS/BESS), 척추유합술
- 증상: 디스크, 오십견, 무릎연골, 족저근막염, 거북목, 척추관협착증
- 포인트: 운동법 카드(동작+횟수), 증상 자가체크 리스트, 시술 비교`,
};

type CardTopicType = 'symptom' | 'procedure' | 'compare' | 'tips' | 'general';

function classifyCardTopicType(topic: string): CardTopicType {
  const t = topic.toLowerCase();
  if (/증상|원인|이유|왜|진단|통증/.test(t)) return 'symptom';
  if (/시술|수술|과정|치료법|방법/.test(t)) return 'procedure';
  if (/비교|차이|vs|종류|선택/.test(t)) return 'compare';
  if (/관리|예방|주의|팁|습관|후.*관리/.test(t)) return 'tips';
  return 'general';
}

export function buildCardNewsPrompt(req: CardNewsRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const style = STYLE_GUIDES[req.writingStyle || 'empathy'] || STYLE_GUIDES.empathy;
  const categoryGuide = CATEGORY_CARD_GUIDES[req.category || ''] || '';

  const systemInstruction = [
    '당신은 한국의 병원 마케팅 전문 카드뉴스 원고 작성자입니다.',
    '인스타그램/블로그용 카드뉴스 원고를 작성합니다.',
    style,
    '',
    ...(categoryGuide ? [categoryGuide, ''] : []),
    getMedicalLawPromptBlock('brief'),
    '',
    '[슬라이드 분량 — 초과하면 실패]',
    '- 표지: 제목 10자 이내 (최대 15자), 부제 20자 이내 (최대 25자)',
    '- 본문 슬라이드: 제목 10자 이내, 본문 2문장 × 각 20자 이내 (최대 30자)',
    '- 마무리: 핵심 한 줄 20자 이내',
    '- ⚠️ 긴 문장보다 짧은 키워드가 카드뉴스에 적합합니다',
    '- ⚠️ "~하는 것이 중요합니다" 같은 긴 표현 금지. "중요합니다" 또는 "꼭 확인하세요"로',
    '',
    '각 슬라이드는 3초 안에 핵심을 전달할 수 있도록 짧고 임팩트 있게 작성합니다.',
    '전문 용어는 쉬운 말로 바꿔 설명합니다.',
    '',
    '[표지 제목 작성 — 3초 안에 멈추게]',
    '표지 제목은 아래 5가지 패턴 중 주제에 맞는 것:',
    'A. 질문형: "혹시 이 증상, 무시하고 계신가요?"',
    'B. 숫자형: "임플란트 전 꼭 알아야 할 3가지"',
    'C. 경고형: "이것 모르면 잇몸 망가집니다" (공포 유발 아닌 정보 전달)',
    'D. 비교형: "라미네이트 vs 미백, 뭐가 다를까?"',
    'E. 결과형: "치아가 이렇게 달라집니다"',
    '',
    '[슬라이드 간 스토리 연결]',
    '- 각 슬라이드가 독립적이면 안 됩니다. 앞 슬라이드의 끝이 다음 슬라이드의 시작을 예고해야 합니다.',
    '- 1장(표지) → 2장: 표지의 질문/주장에 대한 답변 시작',
    '- 마지막-1장 → 마지막장: 핵심 정리가 자연스럽게 마무리로 연결',
    '- 넘기는 재미: 각 슬라이드 끝에 "그런데..." / "하지만..." / "그래서..." 식의 궁금증 유발 가능',
    '',
    '[카드뉴스 ❌/✅ 예시]',
    '',
    '❌ 나쁜 슬라이드 (정보 과다, 글자 많음):',
    '제목: "임플란트의 정의와 종류 및 시술 과정에 대한 안내"',
    '본문: "임플란트는 치아를 상실한 부위의 잇몸뼈에 인공 치근을 식립하고 그 위에 보철물을 장착하는 치과 시술로서..."',
    '→ 문제: 제목 25자 초과, 본문 한 문장이 80자, 3초 안에 읽기 불가능',
    '',
    '✅ 좋은 슬라이드 (임팩트, 짧음):',
    '제목: "임플란트, 뭐가 다를까?"',
    '본문: "빠진 치아 자리에 인공 뿌리를 심습니다. 옆 치아를 깎지 않아도 됩니다."',
    '→ 좋은 이유: 제목 12자, 본문 2문장(각 18자), 3초 안에 핵심 전달',
  ].join('\n');

  const topicType = classifyCardTopicType(req.topic);
  const slideGuide = buildSlideGuide(req.slideCount, topicType);

  const promptParts = [
    `## 카드뉴스 원고 작성 요청`,
    `- 주제: ${req.topic}`,
  ];

  if (req.keywords) {
    promptParts.push(`- 키워드: ${req.keywords}`);
  }
  if (req.hospitalName) {
    promptParts.push(`- 병원명: ${req.hospitalName}`);
    promptParts.push(`⚠️ 원고에서 병원명이 필요한 경우 반드시 "${req.hospitalName}"만 사용. 다른 병원명 지어내기 절대 금지.`);
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

function buildSlideGuide(slideCount: number, topicType: CardTopicType): string {
  const BODY_FLOWS: Record<CardTopicType, string[]> = {
    symptom: [
      '**공감 도입**: "이런 경험 있으신가요?" 독자의 일상 상황',
      '**증상 체크**: "이런 증상이 있다면?" 체크리스트 형식',
      '**원인 설명**: 왜 이런 증상이 나타나는지 간단히',
      '**해결 방향**: 어떤 치료/관리가 있는지 개요',
      '**주의사항**: 방치하면 어떻게 되는지, 병원 가야 하는 시점',
    ],
    procedure: [
      '**시술 소개**: 이 시술이 뭔지 한 줄로',
      '**이런 분에게**: 어떤 경우에 이 시술이 적합한지',
      '**과정 요약**: 시술 과정을 3~4단계로 간단히',
      '**시술 후 관리**: 회복 기간, 주의사항',
      '**핵심 포인트**: 이 시술의 가장 중요한 특징 한 가지',
    ],
    compare: [
      '**비교 대상**: A와 B가 뭔지 한 줄씩',
      '**A의 특징**: 장점 + 적합한 경우',
      '**B의 특징**: 장점 + 적합한 경우',
      '**한눈에 비교**: 핵심 차이 3가지 (리스트)',
      '**선택 기준**: 어떤 경우에 뭘 선택하면 좋은지',
    ],
    tips: [
      '**왜 중요한지**: 관리/예방이 필요한 이유',
      '**팁 1~2**: 가장 중요한 실천 항목',
      '**팁 3~4**: 추가 실천 항목',
      '**흔한 실수**: 많이 하는 잘못된 습관',
      '**정리**: 오늘부터 할 수 있는 것',
    ],
    general: [
      '**문제 제기**: 독자의 고민이나 궁금증',
      '**변화 신호**: "이런 증상이 있다면?" 체크리스트',
      '**원인/해결**: 전문적 정보를 쉽게 전달',
      '**추가 정보**: 사례, 비교, 주의사항',
      '**핵심 정리**: 가장 중요한 포인트를 한 문장으로',
    ],
  };

  const bodyFlow = BODY_FLOWS[topicType];
  const guides: string[] = [];

  guides.push('1장 - **표지**: 시선을 멈추게 하는 강렬한 제목. 본문 없이 제목+부제만.');

  const bodySlots = slideCount - 2;
  for (let i = 0; i < bodySlots; i++) {
    const role = bodyFlow[i % bodyFlow.length];
    guides.push(`${i + 2}장 - ${role}`);
  }

  guides.push(`${slideCount}장 - **마무리 표지**: 핵심 한 줄 + 병원명 또는 부드러운 상담 안내.`);

  return guides.join('\n');
}
