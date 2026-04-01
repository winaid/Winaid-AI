/**
 * 보도자료 생성 프롬프트 + HTML/CSS
 *
 * OLD pressReleaseService.ts 기준 parity 복구.
 * 3인칭 기자 문체, 의료광고법 준수, 전문의 인용, HTML 출력.
 */

export type PressType = 'achievement' | 'new_service' | 'research' | 'event' | 'award' | 'health_tips';

export interface PressReleaseRequest {
  topic: string;
  keywords?: string;
  hospitalName?: string;
  doctorName: string;
  doctorTitle: string;
  pressType: PressType;
  textLength?: number;
  category?: string;              // 진료과
  hospitalInfo?: string;          // 크롤링된 병원 강점 분석 결과
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

export const CATEGORIES = [
  '치과', '피부과', '성형외과', '내과', '정형외과', '한의원', '안과',
  '이비인후과', '비뇨기과', '산부인과', '소아과', '신경외과', '외과',
  '정신건강의학과', '재활의학과', '영상의학과', '마취통증의학과', '기타',
];

import { getMedicalLawPromptBlock } from './medicalLawRules';
import { getTrustedSourcesPromptBlock } from './trustedMedicalSources';

const PRESS_TYPE_STRUCTURES: Record<PressType, string> = {
  achievement: `[실적 달성 기사 구조]
도입: 해당 분야의 최근 동향/수요 증가 배경
본문1: 병원의 실적 내용 (수치 포함)
본문2: 어떻게 이런 실적이 가능했는지 (시스템/인력/장비)
인용: 원장이 실적의 의미를 설명
마무리: 향후 계획 또는 업계 시사점`,

  new_service: `[신규 도입 기사 구조]
도입: 해당 치료/장비에 대한 환자 수요 또는 기술 발전 배경
본문1: 도입한 서비스/장비가 무엇인지, 기존과 뭐가 다른지
본문2: 환자에게 어떤 변화가 있는지 (시간 단축, 정확도 등 — 의료법 준수)
인용: 원장이 도입 이유와 기대 효과를 설명 (가능성 표현)
마무리: 해당 기술의 업계 도입 현황`,

  research: `[연구/학술 기사 구조]
도입: 관련 의학 분야의 연구 동향
본문1: 연구/학술 발표 내용 요약
본문2: 기존 연구 대비 의의/차별점
인용: 연구진(원장)의 코멘트
마무리: 향후 연구 방향 또는 임상 적용 전망`,

  event: `[행사/이벤트 기사 구조]
도입: 행사 배경 (의료 봉사/건강 캠페인/지역사회 등)
본문1: 행사 내용, 참여 규모, 프로그램
본문2: 참여자 반응 또는 성과
인용: 원장의 행사 취지 설명
마무리: 향후 행사 계획`,

  award: `[수상/인증 기사 구조]
도입: 해당 상/인증의 의미와 권위
본문1: 수상/인증 내용과 선정 이유
본문2: 병원의 관련 노력/역량
인용: 원장의 소감
마무리: 업계 시사점`,

  health_tips: `[건강 조언 기사 구조]
도입: 계절/시기별 건강 이슈 또는 최근 트렌드
본문1: 증상/질환의 의학적 설명 (원인, 메커니즘)
본문2: 예방/관리 방법 (의학적 근거 기반)
본문3: 주의사항 또는 병원 방문 시점
인용: 원장이 핵심 조언을 전문가 입장에서 설명
마무리: 일반적인 건강 관리 권고`,
};

export function buildPressPrompt(req: PressReleaseRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const pressTypeLabel = PRESS_TYPE_LABELS[req.pressType] || '실적 달성';
  const hospitalName = req.hospitalName || 'OO병원';
  const maxLength = req.textLength || 1200;

  const now = new Date();
  const formattedDate = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const systemInstruction = `너는 국내 포털에 송출되는 건강·의학 기사를 작성하는 전문 기자다.
블로그 글이나 칼럼이 아닌, 실제 언론사 의학 기사 문체로 글을 작성한다.

[기사 작성 기본 조건]
- 기자의 3인칭 서술을 기본으로 한다
- 글 전체는 객관적·중립적·정보 전달 중심으로 쓴다
- 독자에게 직접 말 걸기, 행동 유도(~하세요) 금지
- 병원 홍보, 마케팅, 권유 문장은 포함하지 않는다

[기사 구성 규칙]
1. 첫 문단은 아래 5가지 도입 패턴 중 주제에 맞는 것으로 시작 (매번 같은 패턴 반복 금지):
  A. 시즌형: "환절기를 맞아 ~환자가 늘고 있다"
  B. 통계형: "건강보험심사평가원에 따르면 ~건수가 전년 대비 N% 증가했다"
  C. 현상형: "최근 ~에 대한 관심이 높아지고 있다"
  D. 사례형: "지난달 한 병원에 ~증상을 호소하는 환자가 내원했다" (익명화)
  E. 트렌드형: "의료계에서는 ~기술이 새로운 표준으로 자리잡고 있다"
2. 중반부에 질환 또는 증상의 의학적 설명을 포함
3. 전문의 발언을 큰따옴표로 2회 이상 인용 (이름 + 소속 + 직함을 기사 형식으로 표기)
4. 치료나 관리는 '권장'이 아니라 '의학적으로 설명되는 방식'으로 서술
5. 문단 말미는 일반적인 주의 문구로 정리

[기사 문체 규칙]
- "~합니다 / ~도움이 됩니다" 같은 안내형 문체 금지
- "~라고 말했다 / ~라고 설명했다" 기사체 적극 사용
- 불필요한 감정 표현 최소화
- 전체 톤은 차분하고 사실 중심으로 유지

[전문의 인용 — 다양하게 작성]
같은 인용 동사를 2번 연속 쓰지 마세요:
- "~라고 설명했다" / "~라고 강조했다" / "~라고 조언했다" / "~라고 덧붙였다" / "~라고 밝혔다"
인용 내용도 각각 다른 역할:
- 1차 인용: 핵심 의학 정보 ("~은 ~때문에 발생합니다")
- 2차 인용: 환자 관점 조언 ("~한 경우에는 ~를 고려해볼 수 있습니다")
- 3차 인용(긴 기사): 전망/철학 ("~가 중요하다고 생각합니다")

${getMedicalLawPromptBlock(true)}

[기사체 금지 표현]
- "예후가 긍정적이다/좋다" / "효과가 기대된다"
- "도움이 됩니다/될 수 있다" → 기사에서는 "~로 알려져 있다" 관찰형 사용
- "빠른 대처가 필요하다" (공포 유발)
※ 전문의 인용 형태("~가 중요하다고 강조했다")는 허용

[기사체 ❌/✅ 변환 예시]
❌ 블로그체: "임플란트 수술이 걱정되시나요? 요즘은 기술이 많이 발전해서 크게 걱정하실 필요 없습니다."
✅ 기사체: "임플란트 시술은 최근 10년간 성공률이 꾸준히 높아지고 있다. 대한치과임플란트학회에 따르면 국내 임플란트 5년 생존율은 95% 이상으로 보고되고 있다."
❌ 블로그체: "레이저토닝은 기미 치료에 효과가 좋은 시술이에요. 한 번 받아보시면 차이를 느끼실 수 있습니다."
✅ 기사체: "레이저토닝은 1064nm 파장을 이용해 멜라닌 색소를 선택적으로 파괴하는 시술이다. 5~10회 반복 시술이 권장되며, 시술 후 자외선 차단이 필수적이라는 것이 전문가들의 공통된 견해다."

[출력 형식 — HTML]
반드시 아래 HTML 구조로 출력한다. 마크다운 금지.
<div class="press-release-container">
  <h1 class="press-title">제목</h1>
  <div class="press-body">
    <p>본문 단락들...</p>
  </div>
  <div class="press-footer">
    <div class="references-footer" data-no-copy="true">
      <p style="font-size:11px;color:#94a3b8;font-weight:600;">참고 자료</p>
      <ul style="font-size:11px;color:#94a3b8;padding-left:20px;margin:8px 0 0 0;line-height:1.8;">
        <li>기관명 — 관련 정보 주제 (2~4개)</li>
      </ul>
    </div>
    <div class="press-disclaimer">
      <p>※ 의학적 정보는 참고용이며, 정확한 진단은 전문의 판단이 필요합니다.</p>
    </div>
  </div>
</div>

전문의 인용 형식:
<p>${hospitalName} ${req.category || ''} ${req.doctorName} ${req.doctorTitle}은 "인용문"이라고 설명했다.</p>
⛔ blockquote 태그 사용 금지! <p> 태그 안에서 기사체로 인용!
⛔ h2 부제 태그 출력 금지!

${getTrustedSourcesPromptBlock(req.category)}`;

  const promptParts = [
    `[기본 정보]`,
    `- 작성일: ${formattedDate}`,
    `- 병원명: ${hospitalName}`,
    `- 의료진: ${req.doctorName} ${req.doctorTitle}`,
    `- 보도 유형: ${pressTypeLabel}`,
    `- 주제: ${req.topic}`,
  ];

  if (req.category) promptParts.push(`- 진료과: ${req.category}`);
  if (req.keywords) promptParts.push(`- SEO 키워드: ${req.keywords} (본문에 자연스럽게 포함)`);

  // 기사 길이별 구체적 가이드라인 (LLM이 실제로 차이를 두도록)
  if (maxLength <= 800) {
    promptParts.push(
      ``,
      `[기사 분량: 짧은 기사 (단신/속보형)]`,
      `- 목표 글자 수: 공백 제외 700~800자`,
      `- 구조 설계: 도입 1문단(150자) + 핵심 정보 2문단(350자) + 전문의 인용 1문단(150자) + 마무리(50자) = 약 700자`,
      `- 전문의 인용: 1회만`,
      `- 한 문단 최대 3문장`,
    );
  } else if (maxLength <= 1200) {
    promptParts.push(
      ``,
      `[기사 분량: 중간 기사 (일반 보도)]`,
      `- 목표 글자 수: 공백 제외 1000~1200자`,
      `- 구조 설계: 도입 1문단(150자) + 상황 설명 2문단(300자) + 의학 정보 2문단(300자) + 전문의 인용 2문단(250자) + 마무리 1문단(100자) = 약 1100자`,
      `- 전문의 인용: 2회 (서로 다른 맥락에서)`,
    );
  } else {
    promptParts.push(
      ``,
      `[기사 분량: 긴 기사 (심층 보도)]`,
      `- 목표 글자 수: 공백 제외 1600~1800자`,
      `- 구조 설계: 도입 2문단(200자) + 사회 배경 2문단(300자) + 의학 메커니즘 3문단(400자) + 치료 방법 2문단(300자) + 전문의 인용 2문단(300자) + 마무리 1문단(100자) = 약 1600자`,
      `- 전문의 인용: 3회 이상 (다양한 각도)`,
      `- 깊이 있는 의학 정보와 사회적 맥락 서술`,
    );
  }

  if (req.hospitalInfo) {
    promptParts.push('', req.hospitalInfo);
  }

  // 보도 유형별 구조 가이드
  const typeStructure = PRESS_TYPE_STRUCTURES[req.pressType] || PRESS_TYPE_STRUCTURES.health_tips;
  promptParts.push('', typeStructure);

  // health_tips 특별 규칙
  if (req.pressType === 'health_tips') {
    promptParts.push(
      '',
      '[건강 조언 기사 특별 규칙]',
      '- 의학 정보는 "~로 알려져 있다", "~로 보고되고 있다" 관찰형으로',
      '- 예방/관리 방법은 구체적 행동으로 (✕ "관리가 중요합니다" / ✅ "하루 2회 양치질과 6개월 간격 스케일링이 권장된다")',
      '- 수치가 있으면 반드시 포함 (발생률, 연령대, 빈도 등)',
    );
  }

  promptParts.push(
    '',
    `[핵심 규칙]`,
    `- 언론 기사체로 작성 (블로그체 아님)`,
    `- 공포 은유 금지 ("침묵의 살인자", "시한폭탄" 등)`,
    `- h1 제목: "${req.topic}"을 기반으로 기사 제목답게 다듬으세요.`,
    `  · 핵심 정보가 앞에 (두괄식)`,
    `  · 전문의 인용 포함 가능: "○○○ 원장 '~가 중요'"`,
    `  · 30~50자 내외. 과장/낚시 금지. 사실 기반.`,
    `  · 원래 주제의 의미는 유지하되 기사 제목 형식으로.`,
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}

/** 보도자료 전용 CSS */
export const PRESS_CSS = `<style>
.press-release-container { font-family: 'Pretendard', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; background: #fff; line-height: 1.8; color: #333; }
.press-title { font-size: 28px; font-weight: 800; color: #1a1a1a; margin: 0 0 24px 0; line-height: 1.4; }
.press-body h3 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 30px 0 15px 0; }
.press-body p { font-size: 15px; color: #444; margin: 0 0 15px 0; line-height: 1.8; }
.press-body ul { margin: 15px 0; padding-left: 24px; }
.press-body li { font-size: 15px; color: #444; margin: 8px 0; }
.press-footer { margin-top: 40px; padding-top: 30px; border-top: 2px solid #1a1a1a; }
.press-disclaimer { background: #fff3cd; padding: 16px 20px; border-radius: 8px; border: 1px solid #ffc107; }
.press-disclaimer p { font-size: 12px; color: #856404; margin: 4px 0; }
</style>`;
