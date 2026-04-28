/**
 * 카드뉴스 생성 프롬프트 조립
 *
 * old 앱의 cardNewsService.ts 참고, 이미지 생성 제외 텍스트 원고만 생성.
 * 슬라이드별 제목 + 설명 구조로 출력.
 */

import type { CardNewsDesignTemplateId } from '@winaid/blog-core';
import { CARD_NEWS_DESIGN_TEMPLATES } from './cardNewsDesignTemplates';
import { getMedicalLawPromptBlock, sanitizePromptInput, sanitizeSourceContent } from '@winaid/blog-core';

export interface CardNewsRequest {
  topic: string;
  keywords?: string;
  hospitalName?: string;
  slideCount: number;         // 4–7
  writingStyle?: 'expert' | 'empathy' | 'conversion';
  designTemplateId?: CardNewsDesignTemplateId;
  category?: string;
  contentMode?: 'simple' | 'detailed';
  /**
   * 소스 콘텐츠 (블로그 글·유튜브 스크립트·기사 등).
   * 제공되면 이 텍스트의 핵심을 추출하여 slideCount장 카드뉴스로 재구성한다.
   * topic 은 "이 소스의 카드뉴스화" 정도의 의미로만 쓰인다.
   */
  sourceContent?: string;
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
    ...(req.contentMode === 'detailed' ? [
      '[슬라이드 분량 — 상세 모드]',
      '- 표지: 제목 15자 이내, 부제 25자 이내',
      '- 본문 슬라이드: 제목 15자 이내, 본문 3~4문장 (각 25~35자). 구체적 수치, 사례, 비교 포함',
      '- 마무리: 핵심 메시지 25자 이내 + 부가 안내 1문장',
      '- ⚠️ 상세 모드: 정보 밀도를 높이되, 한 슬라이드에 정보 3개 이하',
    ] : [
      '[슬라이드 분량 — 간단 모드]',
      '- 표지: 제목 10자 이내, 부제 20자 이내',
      '- 본문 슬라이드: 제목 10자 이내, 본문 2문장 (각 20자 이내, 합계 40자 이내. 50자 초과 시 실패)',
      '- ⚠️ 간단 모드에서 본문 50자 초과 금지. 예: "시술 후 2시간 식사 금지. 차가운 음식부터." (26자) ✅',
      '- 마무리: 핵심 한 줄 20자 이내',
      '- ⚠️ 간단 모드: 한 슬라이드 전체 텍스트(제목+본문) 합산 50자 이내',
    ]),
    '',
    '전문 용어는 쉬운 말로 바꿔 설명합니다.',
    '',
    '[콘텐츠 품질 — 빈약한 내용 금지]',
    '❌ "임플란트는 좋은 치료법입니다" (정보 없음)',
    '❌ "정기적인 검진이 중요합니다" (누구나 아는 말)',
    '✅ "시술 후 2주간 딱딱한 음식 금지" (구체적 기간+행동)',
    '✅ "보톡스 효과 3~6개월 유지" (구체적 수치)',
    '- 모든 본문 슬라이드에 구체적 수치/기간/조건 1개 이상',
    '- "중요합니다/필요합니다/좋습니다" 금지 — 구체적 사실로',
    '- "전문의와 상담하세요"는 마지막 장에서만 1번',
    '- 슬라이드 간 정보 겹침 금지 — 각각 다른 팩트',
    '',
    '[쓸데없는 단어 제거]',
    '- "~하는 것이 좋습니다" → "~하세요"',
    '- "다양한/여러가지/효과적인" → 구체적으로 뭔지',
    '- "~에 대해 알아보겠습니다" → 바로 내용으로',
    '',
    '[표지 제목 작성 — 한 눈에 읽히게]',
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
    '제목: "해당 시술의 정의와 종류 및 시술 과정에 대한 상세 안내"',
    '본문: "해당 시술은 여러 단계로 나뉘어 진행되며 환자의 상태에 따라 다양한 방법이 적용될 수 있으므로..."',
    '→ 문제: 제목 25자 초과, 본문 한 문장이 80자, 텍스트 과다',
    '',
    '✅ 좋은 슬라이드 (임팩트, 짧음):',
    '제목: "이 시술, 뭐가 다를까?"',
    '본문: "핵심 차이를 3가지로 정리했습니다. 한눈에 비교해보세요."',
    '→ 좋은 이유: 제목 12자, 본문 2문장(각 18자), 50자 이내로 핵심 전달',
  ].join('\n');

  // 프롬프트 인젝션 방어 — 사용자 입력을 전부 sanitize한 지역 변수로 사용
  const safeTopic = sanitizePromptInput(req.topic, 300);
  const safeKeywords = sanitizePromptInput(req.keywords, 200);
  const safeHospitalName = sanitizePromptInput(req.hospitalName, 60);

  const topicType = classifyCardTopicType(safeTopic);
  const slideGuide = buildSlideGuide(req.slideCount, topicType);

  const promptParts = [
    `## 카드뉴스 원고 작성 요청`,
    `- 주제: ${safeTopic}`,
  ];

  if (safeKeywords) {
    promptParts.push(`- 키워드: ${safeKeywords}`);
  }
  if (safeHospitalName) {
    promptParts.push(`- 병원명: ${safeHospitalName}`);
    promptParts.push(`⚠️ 원고에서 병원명이 필요한 경우 반드시 ${safeHospitalName} 만 사용. 다른 병원명 지어내기 절대 금지.`);
  }
  if (req.designTemplateId) {
    const tmpl = CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === req.designTemplateId);
    if (tmpl) {
      promptParts.push(`- 디자인 템플릿: ${tmpl.name} (${tmpl.description})`);
      promptParts.push(`- 디자인 분위기: ${tmpl.styleConfig.mood}`);
    }
  }

  promptParts.push(
    `- 슬라이드 수: ${!req.slideCount || req.slideCount === 0 ? '자동 (4~10장, AI가 주제에 맞게 결정)' : `${req.slideCount}장`}`,
    '',
    `## 슬라이드 구성 가이드`,
    slideGuide,
    '',
    `## 출력 형식 (원고 + 이미지 프롬프트 통합)`,
    '각 슬라이드를 아래 형식으로 정확히 작성해주세요:',
    '',
    '### 1장: 표지',
    '**제목**: (시선을 멈추게 하는 메인 타이틀)',
    '**부제**: (부연 설명)',
    '**비주얼**: (이 슬라이드의 배경 이미지 묘사, 30자 이내. 스타일+색상+오브젝트)',
    '',
    '### 2장: (슬라이드 역할)',
    '**제목**: (슬라이드 제목)',
    '**본문**: (핵심 내용)',
    '**비주얼**: (배경 이미지 묘사, 30자 이내)',
    '',
    '... (중간 슬라이드 동일 형식)',
    '',
    `### ${req.slideCount}장: 마무리`,
    '**제목**: (핵심 한 줄 메시지)',
    `**본문**: (${safeHospitalName ? `${safeHospitalName} 과 함께` : ''} 맥락에 맞는 행동 유도: 예방→"오늘부터 관리", 시술비교→"나에게 맞는 방법 찾기", 증상→"정기 검진 권유")`,
    '**비주얼**: (배경 이미지 묘사, 30자 이내)',
    '',
    '',
    '[모바일 가독성 — 카드뉴스는 모바일 중심]',
    '- 제목: 한 줄 10~15자 (모바일 가로 폭 기준)',
    '- 본문: 한 슬라이드에 정보 최대 3개 (50자 이내)',
    '- 숫자/데이터 활용: "매년" → "연 1회", "많은" → "80%"',
    '',
    '⚠️ 모든 슬라이드에 반드시 **제목**, **본문**(또는 **부제**), **비주얼** 3개 필드가 있어야 합니다.',
    '⚠️ **비주얼** 필드: 모든 카드에 동일한 스타일 키워드를 사용하세요. 달라지는 것은 오브젝트만.',
    '⚠️ "핵심 메시지", "마무리 문구" 같은 다른 키워드 쓰지 마세요. 반드시 **제목**/**본문**/**비주얼**만.',
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

// ═══════════════════════════════════════════════════════════════
// Pro Mode: 구조화된 JSON 레이아웃 출력
// ═══════════════════════════════════════════════════════════════

/**
 * 프로 카드뉴스 프롬프트
 *
 * 기존 buildCardNewsPrompt는 "제목 + 본문 + 비주얼 묘사"의 텍스트 원고만 생성했지만,
 * 이 함수는 AI가 슬라이드별로 최적의 레이아웃(cover/comparison/icon-grid/steps/
 * checklist/data-highlight/closing)을 선택하고 구조화된 JSON을 출력하게 한다.
 *
 * 이 JSON은 이후 CardNewsProRenderer가 레이아웃별 HTML/CSS로 렌더링한다.
 */
export function buildCardNewsProPrompt(req: CardNewsRequest): {
  systemInstruction: string;
  prompt: string;
} {
  // 프롬프트 인젝션 방어 — 사용자 입력을 전부 sanitize한 지역 변수로 사용
  const safeTopic = sanitizePromptInput(req.topic, 300);
  const safeKeywords = sanitizePromptInput(req.keywords, 200);
  const safeHospitalName = sanitizePromptInput(req.hospitalName, 60);
  const safeCategory = sanitizePromptInput(req.category, 30);
  // 소스 콘텐츠는 대괄호·따옴표·단락을 보존하는 전용 sanitize 사용 (최대 15000자).
  const safeSource = sanitizeSourceContent(req.sourceContent, 15000);
  const hasSource = safeSource.length > 0;

  const isAutoCount = !req.slideCount || req.slideCount === 0;
  const slideCount = isAutoCount ? 0 : req.slideCount;
  const middleCount = isAutoCount ? 0 : Math.max(0, slideCount - 2);

  const systemInstruction = `당신은 프로급 의료 카드뉴스 기획자입니다.
주제를 받으면 슬라이드별로 가장 적합한 레이아웃을 선택하고, 반드시 JSON 형식으로만 출력합니다.
웹 검색이 활성화되어 있으므로 최신 수치(비용 평균, 성공률, 회복 기간, 건보 적용 여부 등)를 반드시 확인하고 반영하세요.

사용 가능한 레이아웃 (16종):

[기본 8종]
- cover: 표지 (title + subtitle). 슬라이드 1장은 반드시 cover.
- info: 정보형 (title + subtitle + body 텍스트). 개념 설명에 적합.
- comparison: 비교표. columns(2~3개) + compareLabels(행 라벨 3~5개). 수치/특징 비교에 필수.
- icon-grid: 아이콘 그리드. icons 배열(3~4개, emoji+title+desc). 장점/특징 나열에 적합.
- steps: 단계형. steps 배열(3~5개, label+desc). 시술 과정/절차 설명에 적합.
- checklist: 체크리스트. checkItems 배열(4~6개 문자열). 자가 진단/체크사항에 적합.
- data-highlight: 수치 강조. dataPoints 배열(2~3개, value+label+highlight). 성공률/기간/비용 등 임팩트 있는 숫자 제시.
- closing: 마무리 (title + subtitle + body). 마지막 슬라이드는 반드시 closing.

[확장 8종]
- before-after: 시술 전후 비교. beforeLabel, afterLabel, beforeItems[], afterItems[] (각 3~5개 항목).
- qna: Q&A. questions: [{q, a}] (2~4쌍). 환자가 자주 묻는 질문에 적합.
- timeline: 타임라인. timelineItems: [{time, title, desc?}] (3~5개). 시술 후 1일/1주/1달 경과 등.
- quote: 인용/후기. quoteText(30~80자) + quoteAuthor + quoteRole. 환자 후기·의사 코멘트.
- numbered-list: 번호 리스트. numberedItems: [{num?, title, desc?}] (3~5개). TOP 5/3가지 이유 등.
- pros-cons: 장단점. pros[], cons[] (각 3~5개), prosLabel/consLabel(선택).
- price-table: 가격표. priceItems: [{name, price, note?}] (3~5행). 웹 검색 결과 기반 실제 시세 반영 필수.
- warning: 주의사항. warningTitle(선택) + warningItems[] (3~5개). 금기·부작용·회복기 수칙 등.

[웹 검색 활용]
- 주제에 대해 웹 검색으로 최신 데이터 확인:
  · 시술/진료 비용 (2024~2025년 기준 한국 평균)
  · 성공률·부작용 비율·임상 데이터
  · 시술 시간·회복 기간·내원 횟수
  · 건강보험 적용 여부 및 본인부담금
- 수치는 반드시 구체적 범위로 (예: "80~120만원", "3~6개월", "90~95%")
- price-table에는 반드시 검색으로 확인한 실제 시세를 반영

절대 규칙:
1. 1장은 cover, 마지막 장은 closing.${isAutoCount ? ' 주제에 맞게 적절한 장수(4~10장)를 자동 결정하세요. 커버 + 내용 + 마무리 구성.' : ` 총 ${slideCount}장, 중간 ${middleCount}장은 16종 레이아웃 중 주제에 맞는 것을 다양하게 혼합.`}
2. 같은 레이아웃을 3번 이상 연속/반복 사용 금지. 가능하면 서로 다른 6~8종을 섞으세요.
3. comparison / data-highlight / price-table / timeline / warning 에는 반드시 구체적 수치(%/년/개월/만원/mm 등) 포함.
4. "중요합니다", "전문의 상담", "것이 좋습니다" 같은 뻔한 표현 금지.
5. 의료광고법 준수: "완치", "100%", "최첨단", "완벽", "획기적", "유일", "국내 최초", "1위" 등 최상급/단정 표현 금지.
6. 모든 텍스트는 한국어. 한 문장은 짧고 명확하게(25자 내외).
7. 이모지는 UTF-8 단일 이모지(🦷 💉 ⏱️ 🔬 🩺 ✨ 💡 📊 🎯 ⚠️ 등)만 사용.
8. 출력은 JSON 객체 하나. { "font": "...", "slides": [ ... ] } 형태. 마크다운 코드블록·설명·주석 금지.
9. 최상위 font 필드에 주제 분위기에 맞는 폰트 id를 하나 선택(선택 옵션):
   - 전문적/의료/신뢰: "pretendard", "noto-sans", "gothic-a1", "ibm-plex"
   - 고급/품격: "noto-serif", "nanum-myeongjo", "hahmlet", "gowun-batang"
   - 강렬한/임팩트: "black-han", "do-hyeon", "orbit"
   - 친근한/부드러운: "jua", "sunflower", "nanum-gothic"
   - 손글씨/감성: "gaegu", "hi-melody", "gowun-dodum"
10. 중간 슬라이드(cover/closing 제외)마다 visualKeyword 필드를 포함(영문 1~2줄):
    실제 장비·치아 모델·진료 장면 등 해당 슬라이드를 표현하는 이미지 프롬프트.
    예: "dental implant titanium screws close-up, clean white background, 3D render"
11. imagePosition은 레이아웃에 어울리게 선택:
    - "top": 이미지가 제목 위 (info/steps/checklist에 권장)
    - "background": 이미지가 배경, 텍스트가 오버레이 (표지·강렬한 수치 강조에 권장)
    - "center": 이미지가 중앙 큰 비중 (data-highlight에도 가능)
    cover/closing은 visualKeyword/imagePosition 생략 가능.

[소스 콘텐츠 모드]
- 요청에 "소스 콘텐츠" 블록이 제공되면, 그 글의 핵심을 추출하여 카드뉴스로 재구성하세요.
- 이 경우 topic 은 "이 소스를 카드뉴스로 변환" 정도의 의미이므로 소스 내용이 우선합니다.
- 원문의 사실·수치·고유명사(인물명·시술명·병원명·기관명)는 **정확히 유지**하세요. 지어내거나 바꾸지 마세요.
- 원문에 없는 수치를 웹 검색으로 보강할 때는, 원문과 충돌하지 않는 범위에서만 추가하세요. 충돌 시 원문 우선.
- 원문의 핵심 주장·결론·순서를 따르되, 카드뉴스 포맷(짧은 제목·요약 본문·구조화된 레이아웃)에 맞게 재구성하세요.
- 원문을 그대로 복사하지 마세요. 요약·구조화·시각적 임팩트 있는 표현으로 다시 쓰세요.
- 원문에 가격·통계 등 구체적 수치가 있으면 반드시 해당 슬라이드에 살려주세요.`;

  const example = `예시 스키마:
{
  "font": "noto-sans",
  "slides": [
    {
      "index": 1,
      "layout": "cover",
      "title": "주제에 맞는 호기심 유발 제목 (15자 이내)",
      "subtitle": "진료과와 주제에 맞는 부제 (20자 이내)"
    },
    {
      "index": 2,
      "layout": "comparison",
      "title": "A 방식 vs B 방식",
      "subtitle": "핵심 차이를 숫자로 확인하세요",
      "visualKeyword": "주제에 맞는 의료 장비/해부도/시술 장면을 영어로 묘사",
      "imagePosition": "top",
      "compareLabels": ["항목1", "항목2", "항목3"],
      "columns": [
        { "header": "기존", "highlight": false, "items": ["값1", "값2", "값3"] },
        { "header": "개선", "highlight": true, "items": ["값1", "값2", "값3"] }
      ]
    },
    {
      "index": 3,
      "layout": "icon-grid",
      "title": "핵심 장점 4가지",
      "visualKeyword": "주제에 맞는 의료 장비/시술 환경을 영어로 묘사 (진료과 키워드 포함)",
      "imagePosition": "background",
      "icons": [
        { "emoji": "🎯", "title": "장점 1", "desc": "구체적 설명" },
        { "emoji": "💡", "title": "장점 2", "desc": "구체적 설명" },
        { "emoji": "⏱️", "title": "장점 3", "desc": "구체적 설명" },
        { "emoji": "🩺", "title": "장점 4", "desc": "구체적 설명" }
      ]
    },
    {
      "index": 4,
      "layout": "steps",
      "title": "치료/관리 과정",
      "visualKeyword": "주제에 맞는 시술 과정 infographic, clean white background",
      "imagePosition": "top",
      "steps": [
        { "label": "1단계", "desc": "구체적 설명" },
        { "label": "2단계", "desc": "구체적 설명" },
        { "label": "3단계", "desc": "구체적 설명" }
      ]
    },
    {
      "index": 5,
      "layout": "data-highlight",
      "title": "숫자로 보는 핵심 정보",
      "visualKeyword": "주제에 맞는 의료 이미지, 진료과 키워드 포함",
      "imagePosition": "background",
      "dataPoints": [
        { "value": "핵심 수치", "label": "설명", "highlight": true },
        { "value": "수치2", "label": "설명2" },
        { "value": "수치3", "label": "설명3" }
      ]
    },
    {
      "index": 6,
      "layout": "closing",
      "title": "주제에 맞는 행동 유도 문구",
      "subtitle": "부드러운 마무리 메시지",
      "body": "요약 + 상담 안내 (의료법 준수)"
    }
  ]
}

중요: visualKeyword는 반드시 진료과에 맞는 영어 키워드를 사용하세요.
치과면 dental/teeth, 피부과면 skincare/dermatology/skin, 정형외과면 spine/orthopedic/rehabilitation/physiotherapy.

[확장 레이아웃 필드 예시] (각 레이아웃을 쓸 때 이 필드들을 채우세요)

// before-after
{ "layout": "before-after", "title": "관리 전후 차이", "beforeLabel": "이전", "afterLabel": "이후", "beforeItems": ["문제 1","문제 2","문제 3"], "afterItems": ["개선 1","개선 2","개선 3"] }

// qna
{ "layout": "qna", "title": "자주 묻는 질문", "questions": [ { "q": "질문 1?", "a": "답변 1" }, { "q": "질문 2?", "a": "답변 2" } ] }

// timeline
{ "layout": "timeline", "title": "시술/치료 경과", "timelineItems": [ { "time": "당일", "title": "제목", "desc": "설명" }, { "time": "1주", "title": "제목", "desc": "설명" }, { "time": "3개월", "title": "제목", "desc": "설명" } ] }

// quote
{ "layout": "quote", "title": "환자 후기", "quoteText": "진료과와 주제에 맞는 자연스러운 후기", "quoteAuthor": "환자 정보", "quoteRole": "시술 내역" }

// numbered-list
{ "layout": "numbered-list", "title": "체크포인트 TOP 5", "numberedItems": [ { "num": "01", "title": "항목 제목", "desc": "구체적 설명" }, { "num": "02", "title": "항목 제목", "desc": "구체적 설명" } ] }

// pros-cons
{ "layout": "pros-cons", "title": "장단점 비교", "prosLabel": "✓ 장점", "consLabel": "⚠ 주의점", "pros": ["장점 1","장점 2"], "cons": ["주의점 1","주의점 2"] }

// price-table
{ "layout": "price-table", "title": "비용 안내", "priceItems": [ { "name": "시술 A", "price": "가격대", "note": "비고" }, { "name": "시술 B", "price": "가격대", "note": "비고" } ] }

// warning
{ "layout": "warning", "title": "주의사항", "warningItems": ["주의 1","주의 2","주의 3"] }`;

  const requestBlock = [
    `주제: ${safeTopic}`,
    safeKeywords ? `키워드: ${safeKeywords}` : '',
    safeHospitalName ? `병원명: ${safeHospitalName} (본문에 직접 언급 금지, 마지막 장 아래에만 표시)` : '',
    `진료과: ${safeCategory || '일반의료'}`,
    `슬라이드 수: ${slideCount}장`,
    `톤: ${req.writingStyle === 'expert' ? '전문가형(신뢰/정보)' : '친절형(공감/쉬움)'}`,
  ].filter(Boolean).join('\n');

  // 소스 콘텐츠가 주어지면 원문 블록을 별도로 명시. 역할: topic 보다 우선.
  const sourceBlock = hasSource ? `

---
[소스 콘텐츠 — 아래 글의 핵심을 추출하여 카드뉴스로 재구성하세요]
${safeSource}
---
` : '';

  const sourceModeNote = hasSource
    ? '\n\n⚠️ 소스 콘텐츠가 제공됐습니다. 위 topic 은 참고용이고, 소스 내용을 우선으로 재구성하세요. 원문의 사실·수치·고유명사는 정확히 유지.'
    : '';

  const prompt = `${requestBlock}${sourceBlock}${sourceModeNote}

${hasSource ? '위 소스 콘텐츠' : '위 주제'}에 맞는 카드뉴스 ${slideCount}장을 구조화된 JSON으로 출력하세요.
- 1장: cover, ${slideCount}장: closing
- 중간 ${middleCount}장은 comparison / icon-grid / steps / checklist / data-highlight / info 중 ${hasSource ? '소스 내용' : '주제'}에 맞는 것을 혼합
- 수치·기간·비용 등 구체적 숫자를 최소 5개 이상 슬라이드 전체에 분포
- 같은 표현 반복 금지, 매 슬라이드 새로운 정보 제공
- 마지막 장은 구체적 행동 유도(CTA) 포함

${example}

이제 실제 ${hasSource ? '소스 콘텐츠' : '주제'}에 맞춰 JSON만 출력하세요. 설명·주석·마크다운 금지.`;

  return { systemInstruction, prompt };
}
