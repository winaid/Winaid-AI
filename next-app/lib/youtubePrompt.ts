/**
 * 유튜브 영상 분석 기반 글 생성 프롬프트
 *
 * 3가지 문체 선택 가능:
 * - blog: 블로그 문체 (3인칭 에디터)
 * - clinical: 임상글 문체 (원장 1인칭)
 * - summary: 영상 요약 문체 (핵심 내용 구조적 정리)
 */

import { getMedicalLawPromptBlock } from './medicalLawRules';

export type YoutubeWritingStyle = 'blog' | 'clinical' | 'summary';

export interface YoutubeArticleRequest {
  topic: string;
  transcript: string;           // 영상 요약 (Gemini가 분석한 결과)
  writingStyle: YoutubeWritingStyle;
  category: string;
  hospitalName?: string;
  doctorName?: string;
  textLength?: number;
  keywords?: string;
}

export const YOUTUBE_WRITING_STYLES = [
  { value: 'blog', label: '환자용 글', icon: '📝', desc: '쉽고 부드러운 정보 전달' },
  { value: 'clinical', label: '원장님 글', icon: '🩺', desc: '전문적이면서 친근한 설명' },
  { value: 'summary', label: '핵심 정리', icon: '📋', desc: '영상 내용 구조적 요약' },
];

const STYLE_SYSTEM_INSTRUCTIONS: Record<YoutubeWritingStyle, string> = {
  blog: `당신은 한국 병원 블로그 전담 에디터입니다.
유튜브 영상 분석 결과를 바탕으로 환자가 읽기 쉬운 블로그 글을 작성합니다.

[문체]
- 3인칭 에디터 시점. 의사가 아니라 정보를 잘 정리하는 사람.
- ~합니다/~있습니다 체 기본.
- 한 문장 50자 이내 권장. 쉬운 말.
- 전문 용어는 괄호에 쉬운 설명 병기.

[구조]
- 도입부 2문단 (일상 상황 → 주제 연결)
- 소제목 4~6개 (<h3>만 사용)
- 각 소제목 아래 2~3문단
- 마무리 (핵심 요약 + 부드러운 상담 안내)

[핵심 원칙]
- 분석 내용을 그대로 복사하지 마세요. 블로그 문체로 완전히 재구성.
- 영상에서 언급한 구체적 수치/사례/과정을 적극 활용.`,

  clinical: `당신은 한국 병원 원장이 직접 쓰는 임상 블로그 글을 대필하는 전문 작성자입니다.
유튜브 영상 분석 결과를 바탕으로, 원장이 직접 설명하는 느낌의 글을 작성합니다.

[문체]
- 원장 1인칭 시점 ("저는", "제가 설명드리면", "상담해 드렸습니다")
- ~합니다 체 기본 + 가끔 구어체 ("~하네요", "물론이죠")
- 한 문단 3~5문장. 한 문장 50자 이내.
- 전문 용어 + 괄호 쉬운 설명.

[구조]
- 도입: 영상 주제를 환자 관점으로 소개
- 본문: 소제목 4~6개 (<h3>만). 영상 내용을 단계별로 정리.
- 과정 강조: "치료에서 중요한 것은 '과정'입니다" 식의 원칙
- 대안 제시: "모든 경우에 이 치료가 필요한 것은 아닙니다"
- 마무리: 핵심 정리 + 정기검진/상담 권유

[핵심 원칙]
- 분석 내용을 그대로 복사하지 마세요. 원장 말투로 재구성.
- 영상에서 보여준 과정/사례를 "실제 치료 과정에서는 ~" 식으로 활용.`,

  summary: `당신은 의료 콘텐츠 요약 전문가입니다.
유튜브 영상 분석 결과를 바탕으로 핵심 내용을 구조적으로 정리합니다.

[문체]
- 객관적이고 깔끔한 정리체.
- ~합니다/~입니다 체.
- 짧고 명확한 문장.

[구조]
- 영상 개요: 1~2문장으로 영상 핵심 요약
- 핵심 포인트: 3~7개 (번호 리스트 또는 소제목)
- 각 포인트: 2~3문장으로 설명
- 주의사항/참고: 영상에서 강조한 주의사항
- 한 줄 요약: 영상 핵심을 한 문장으로

[핵심 원칙]
- 영상의 구조를 따르되, 읽기 쉽게 재구성.
- 반복/잡담/구독 요청 등 제거.
- 핵심 수치/사례만 추출.`,
};

export function buildYoutubePrompt(req: YoutubeArticleRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const targetLength = req.textLength || 2500;
  const styleInstruction = STYLE_SYSTEM_INSTRUCTIONS[req.writingStyle];

  const systemInstruction = `${styleInstruction}

${getMedicalLawPromptBlock(true)}

[출력 형식]
순수 HTML(<h3>, <p>, <ul>, <li>, <strong>)로 출력.
<h1>, <h2> 금지. <h3>만 사용. 마크다운 금지.`;

  const promptParts: string[] = [];

  promptParts.push(
    '[글 작성 요청]',
    `- 진료과: ${req.category}`,
    `- 주제: ${req.topic}`,
    `- 문체: ${req.writingStyle}`,
    `- 목표 글자수: 공백 포함 ${Math.round(targetLength * 0.85)}~${Math.round(targetLength * 1.15)}자`,
    ...(req.hospitalName ? [`- 병원명: ${req.hospitalName}`] : []),
    ...(req.doctorName && req.writingStyle === 'clinical' ? [`- 원장명: ${req.doctorName}`] : []),
    ...(req.keywords ? [`- SEO 키워드: ${req.keywords}`] : []),
  );

  const trimmedTranscript = req.transcript.trim().slice(0, 10000);
  promptParts.push(
    '',
    '[유튜브 영상 분석 결과 — 원본 자료]',
    '아래는 유튜브 영상을 AI가 분석한 내용입니다.',
    '이 내용을 바탕으로 글을 작성하세요.',
    '⚠️ 요약 내용을 그대로 복사하지 마세요. 위 문체에 맞게 완전히 재구성하세요.',
    '⚠️ 영상의 핵심 정보(수치, 과정, 사례)는 적극 활용하세요.',
    '',
    trimmedTranscript,
  );

  promptParts.push(
    '',
    '[출처 블록 — 글 마지막에 추가]',
    '<div class="references-footer" data-no-copy="true">',
    '<p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;font-weight:600;">참고 자료</p>',
    '<ul style="font-size:11px;color:#94a3b8;padding-left:20px;margin:8px 0 0 0;line-height:1.8;">',
    '<li>기관명 — 관련 정보 주제 (2~4개, 신뢰 기관만)</li>',
    '</ul></div>',
    '⚠️ 이 출처 블록은 data-no-copy="true"로 복사 시 제외됩니다.',
  );

  promptParts.push(
    '',
    '[출력]',
    '1. HTML 본문',
    '2. 출처 블록',
    '3. 자가평가:',
    '',
    '---SCORES---',
    '{"accuracy": [0~100], "relevance": [0~100], "readability": [0~100]}',
    'accuracy: 영상 내용 정확 반영, relevance: 주제 집중도, readability: 가독성',
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}
