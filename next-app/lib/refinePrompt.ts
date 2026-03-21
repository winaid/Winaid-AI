/**
 * AI 보정 프롬프트 조립
 *
 * 원문 텍스트 + 보정 옵션 → Gemini 프롬프트
 */

export type RefineMode =
  | 'natural'       // 더 자연스럽게
  | 'professional'  // 더 전문적으로
  | 'shorter'       // 더 짧게
  | 'longer'        // 더 길게
  | 'medical_law'   // 의료광고 리스크 완화
  | 'seo';          // SEO 최적화

export interface RefineRequest {
  originalText: string;
  mode: RefineMode;
}

export const REFINE_OPTIONS: { value: RefineMode; label: string; icon: string; description: string }[] = [
  { value: 'natural', label: '더 자연스럽게', icon: '💬', description: '딱딱한 표현을 부드럽고 읽기 편하게' },
  { value: 'professional', label: '더 전문적으로', icon: '🎓', description: '전문 용어와 근거 기반 서술 강화' },
  { value: 'shorter', label: '더 짧게', icon: '✂️', description: '핵심만 남기고 간결하게 압축' },
  { value: 'longer', label: '더 길게', icon: '📝', description: '설명과 사례를 추가하여 풍성하게' },
  { value: 'medical_law', label: '의료광고 리스크 완화', icon: '⚖️', description: '과장·단정 표현을 중립적으로 수정' },
  { value: 'seo', label: 'SEO 최적화', icon: '🔍', description: '검색 노출에 유리한 구조로 개선' },
];

const MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  natural: [
    '아래 글을 더 자연스럽고 읽기 편하게 다듬어주세요.',
    '- 딱딱하거나 어색한 표현을 자연스러운 구어체로 바꿉니다.',
    '- 문장 흐름을 매끄럽게 연결합니다.',
    '- 내용의 핵심은 유지합니다.',
  ].join('\n'),

  professional: [
    '아래 글을 더 전문적이고 신뢰감 있게 다듬어주세요.',
    '- 적절한 전문 용어를 사용합니다.',
    '- 근거 기반 서술을 강화합니다.',
    '- 객관적이고 정보 전달 중심으로 수정합니다.',
  ].join('\n'),

  shorter: [
    '아래 글을 핵심만 남기고 간결하게 줄여주세요.',
    '- 반복되는 내용을 제거합니다.',
    '- 부연 설명을 최소화합니다.',
    '- 핵심 메시지는 반드시 유지합니다.',
    '- 원본의 50~70% 분량으로 줄입니다.',
  ].join('\n'),

  longer: [
    '아래 글을 더 풍성하고 상세하게 늘려주세요.',
    '- 구체적인 설명이나 사례를 추가합니다.',
    '- 독자가 궁금할 수 있는 부분을 보충합니다.',
    '- 원본의 130~150% 분량으로 확장합니다.',
    '- 억지로 늘리지 말고 자연스럽게 보충합니다.',
  ].join('\n'),

  medical_law: [
    '아래 글에서 의료광고법 위반 리스크가 있는 표현을 찾아 수정해주세요.',
    '- "최고", "최초", "100%", "완치", "보장" 등 과장 표현을 제거합니다.',
    '- "~할 수 있습니다", "~에 도움이 됩니다" 등 중립 표현으로 바꿉니다.',
    '- 치료 결과나 효과를 단정하는 문장을 완화합니다.',
    '- 수정한 부분은 원래 의미를 최대한 살립니다.',
  ].join('\n'),

  seo: [
    '아래 글을 네이버/구글 검색 노출에 유리하도록 구조를 개선해주세요.',
    '- 소제목(##)을 활용하여 섹션을 나눕니다.',
    '- 핵심 키워드가 제목, 첫 문단, 소제목에 자연스럽게 포함되게 합니다.',
    '- 문단 길이를 적절하게 조절합니다.',
    '- 내용 자체는 바꾸지 않고 구조만 개선합니다.',
  ].join('\n'),
};

export function buildRefinePrompt(req: RefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = [
    '당신은 한국어 콘텐츠를 다듬는 전문 에디터입니다.',
    '원본의 핵심 내용과 의도를 유지하면서, 요청된 방향으로 글을 수정합니다.',
    'HTML 태그 없이 순수 마크다운으로 출력합니다.',
    '수정된 글만 출력하세요. 설명이나 코멘트는 포함하지 마세요.',
  ].join('\n');

  const prompt = [
    MODE_INSTRUCTIONS[req.mode],
    '',
    '---',
    '',
    '## 원문',
    '',
    req.originalText,
    '',
    '---',
    '',
    '위 원문을 위 지침에 따라 수정한 결과만 출력해주세요.',
  ].join('\n');

  return { systemInstruction, prompt };
}
