/**
 * 블로그 생성 프롬프트 조립 — GenerationRequest → { systemInstruction, prompt }
 *
 * 기존 Vite 앱의 프롬프트 로직을 단순화하여 이식.
 * 핵심 구조: systemInstruction(역할 지정) + prompt(구체적 요청)
 */
import type { GenerationRequest } from './types';

const AUDIENCE_GUIDES: Record<string, string> = {
  '환자용(친절/공감)': '환자가 치과 치료를 두려워하지 않도록 따뜻하고 공감하는 어조로 작성하세요. 전문 용어는 쉬운 말로 바꿔 설명합니다.',
  '보호자용(가족걱정)': '자녀나 부모의 치료를 걱정하는 보호자 입장에서 안심할 수 있도록 작성하세요.',
  '전문가용(신뢰/정보)': '의료 전문가가 읽어도 신뢰할 수 있는 정보 중심으로 작성하세요. 근거 기반 서술을 권장합니다.',
};

const PERSONA_GUIDES: Record<string, string> = {
  hospital_info: '병원 공식 블로그 톤으로 객관적이고 정보 중심으로 작성합니다.',
  director_1st: '대표원장이 직접 환자에게 설명하는 1인칭 어조("제가 직접 설명드리겠습니다")로 작성합니다.',
  coordinator: '상담 실장이 환자 후기를 전하는 듯한 친근한 톤으로 작성합니다.',
};

const TONE_GUIDES: Record<string, string> = {
  warm: '따뜻하고 공감하는 톤',
  logical: '논리적이고 명확한 톤',
  premium: '고급스럽고 신뢰감 있는 톤',
  reassuring: '안심시키는 톤',
};

const STYLE_GUIDES: Record<string, string> = {
  empathy: '독자의 고민에 공감하며, "걱정되시죠?" 같은 공감 문장을 자연스럽게 포함합니다.',
  expert: '전문적 근거와 수치를 활용하여 신뢰감을 높입니다.',
  conversion: '독자가 상담 예약이나 문의를 하도록 자연스럽게 유도하는 문장을 포함합니다.',
};

export function buildBlogPrompt(req: GenerationRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const audienceGuide = AUDIENCE_GUIDES[req.audienceMode] || AUDIENCE_GUIDES['환자용(친절/공감)'];
  const personaGuide = PERSONA_GUIDES[req.persona] || PERSONA_GUIDES.hospital_info;
  const toneGuide = TONE_GUIDES[req.tone] || TONE_GUIDES.warm;
  const styleGuide = STYLE_GUIDES[req.writingStyle || 'empathy'] || '';
  const medLawNote = req.medicalLawMode === 'relaxed'
    ? '의료광고법 준수는 유지하되, "~수 있습니다", "~에 도움이 됩니다" 등의 표현을 적극 활용합니다.'
    : '의료광고법을 엄격히 준수합니다. "최고", "최초", "100%", 과장 표현 금지.';

  const systemInstruction = [
    '당신은 한국의 병원 마케팅 전문 블로그 작성자입니다.',
    personaGuide,
    audienceGuide,
    `글의 어조: ${toneGuide}`,
    styleGuide,
    medLawNote,
    '네이버 스마트블록 SEO에 최적화된 구조로 작성합니다.',
    '소제목(##)을 활용하여 가독성을 높입니다.',
    'HTML 태그 없이 순수 마크다운으로 작성합니다.',
  ].filter(Boolean).join('\n');

  const promptParts = [
    `## 블로그 작성 요청`,
    `- 진료과: ${req.category}`,
    `- 주제: ${req.topic}`,
  ];

  if (req.disease) {
    promptParts.push(`- 질환명: ${req.disease}`);
  }
  if (req.keywords) {
    promptParts.push(`- SEO 키워드: ${req.keywords}`);
  }
  if (req.hospitalName) {
    promptParts.push(`- 병원명: ${req.hospitalName}`);
  }

  promptParts.push(`- 목표 글자수: 약 ${req.textLength || 1500}자`);

  if (req.includeFaq) {
    promptParts.push(`- FAQ 섹션을 ${req.faqCount || 3}개 포함해주세요.`);
  }

  if (req.customSubheadings) {
    promptParts.push(`\n[사용자 지정 소제목]\n${req.customSubheadings}`);
  }

  promptParts.push(
    '',
    '위 조건에 맞는 블로그 글을 작성해주세요.',
    '제목은 SEO에 효과적이고 클릭을 유도하는 형태로 만들어주세요.',
    '첫 문단에서 독자의 관심을 끌고, 본문에서 전문 정보를 전달하며, 마지막에 자연스러운 마무리를 해주세요.',
    '',
    '## 품질 자가평가 (필수)',
    '블로그 글 작성이 끝나면, 글 맨 마지막에 아래 형식으로 자가평가 점수를 반드시 붙여주세요.',
    '점수는 0~100 사이 정수입니다. 솔직하게 평가하세요.',
    '',
    '```',
    '---SCORES---',
    '{"seo": [SEO 최적화 점수], "medical": [의료광고법 준수 점수], "conversion": [전환력/행동유도 점수]}',
    '```',
    '',
    '- seo: 키워드 밀도, 소제목 구조, 메타 적합성 기준',
    '- medical: 의료광고법 위반 표현 유무 기준 (위반 없으면 90+)',
    '- conversion: 독자가 상담/예약으로 이어질 가능성 기준',
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}
