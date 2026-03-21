/**
 * 보도자료 생성 프롬프트 조립
 *
 * old 앱의 pressReleaseService.ts 참고, 핵심 구조만 이식.
 * 3인칭 기자 문체, 의료광고법 준수, 전문의 인용 포함.
 */

export type PressType = 'achievement' | 'new_service' | 'research' | 'event' | 'award' | 'health_tips';

export interface PressReleaseRequest {
  topic: string;
  keywords?: string;
  hospitalName?: string;
  doctorName: string;
  doctorTitle: string;
  pressType: PressType;
  textLength?: number;         // 800–2000
}

const PRESS_TYPE_LABELS: Record<PressType, string> = {
  achievement: '실적 달성',
  new_service: '신규 서비스/장비 도입',
  research: '연구/학술 성과',
  event: '행사/이벤트',
  award: '수상/인증 획득',
  health_tips: '건강 조언/정보',
};

export const PRESS_TYPES: { value: PressType; label: string; icon: string }[] = [
  { value: 'achievement', label: '실적/달성', icon: '🏆' },
  { value: 'new_service', label: '신규 도입', icon: '🆕' },
  { value: 'research', label: '연구/학술', icon: '📚' },
  { value: 'event', label: '행사', icon: '🎉' },
  { value: 'award', label: '수상/인증', icon: '🎖️' },
  { value: 'health_tips', label: '건강 조언', icon: '💡' },
];

export const DOCTOR_TITLES = ['원장', '부원장', '과장', '교수', '부교수', '전문의', '센터장'];

export function buildPressPrompt(req: PressReleaseRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const pressTypeLabel = PRESS_TYPE_LABELS[req.pressType] || '실적 달성';
  const maxLength = req.textLength || 1200;

  const systemInstruction = [
    '너는 국내 포털에 송출되는 건강·의학 기사를 작성하는 전문 기자다.',
    '블로그 글이나 칼럼이 아닌, 실제 언론사 의학 기사 문체로 글을 작성한다.',
    '',
    '## 기사 작성 기본 조건',
    '- 기자의 3인칭 서술을 기본으로 한다.',
    '- 글 전체는 객관적·중립적·정보 전달 중심으로 쓴다.',
    '- 독자에게 직접 말을 거는 표현은 사용하지 않는다.',
    '- 병원 홍보, 마케팅, 권유 문장은 포함하지 않는다.',
    '- 과장, 단정, 효과 보장 표현은 쓰지 않는다.',
    '',
    '## 의료광고법 준수',
    '- "최고", "최초", "100%", "완치", "보장" 등 과장 표현 금지.',
    '- "~할 수 있다", "~에 도움이 될 수 있다" 등 중립 표현 사용.',
    '- 치료 결과, 효과를 단정하지 않는다.',
    '',
    '## 전문의 인용 규칙',
    '- 기사 내 전문의 발언을 2회 이상 인용한다.',
    '- 인용 형식: "내용"이라고 [이름] [직함]은 설명했다/밝혔다/강조했다.',
    '- 인용문도 객관적이고 정보 전달 중심으로 작성한다.',
    '',
    '## 출력 형식',
    '- 순수 마크다운으로 작성한다. HTML 태그 사용 금지.',
    '- 제목은 # 으로 시작한다.',
    '- 본문은 문단 단위로 작성한다.',
  ].join('\n');

  const promptParts = [
    `## 보도자료 작성 요청`,
    '',
    `### 기본 정보`,
    `- 주제: ${req.topic}`,
    `- 보도 유형: ${pressTypeLabel}`,
    `- 의료진: ${req.doctorName} ${req.doctorTitle}`,
  ];

  if (req.hospitalName) {
    promptParts.push(`- 병원명: ${req.hospitalName}`);
  }
  if (req.keywords) {
    promptParts.push(`- SEO 키워드: ${req.keywords}`);
  }

  promptParts.push(
    `- 최대 글자 수: 공백 제외 ${maxLength}자`,
    '',
    `### 구조`,
    '1. 헤드라인 (# 제목)',
    '2. 리드문 (핵심 사실 1-2문장)',
    '3. 본문 (배경, 상세 내용, 전문가 발언 인용 2회 이상)',
    '4. 마무리 (향후 전망 또는 정보 안내)',
    '',
    '위 조건에 맞는 보도자료를 작성해주세요.',
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}
