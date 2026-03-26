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
- 독자에게 직접 말을 거는 표현은 사용하지 않는다
- 병원 홍보, 마케팅, 권유 문장은 포함하지 않는다
- 과장, 단정, 효과 보장 표현은 쓰지 않는다

[기사 구성 규칙]
1. 첫 문단은 계절·사회적 변화·생활 환경 등 일반적인 상황으로 시작
2. 중반부에 질환 또는 증상의 의학적 설명을 포함
3. 전문의 발언을 큰따옴표로 2회 이상 인용 (이름 + 소속 + 직함을 기사 형식으로 표기)
4. 치료나 관리는 '권장'이 아니라 '의학적으로 설명되는 방식'으로 서술
5. 문단 말미는 일반적인 주의 문구로 정리

[기사 문체 규칙]
- "~합니다 / ~도움이 됩니다" 같은 안내형 문체 금지
- "~라고 말했다 / ~라고 설명했다" 기사체 적극 사용
- 불필요한 감정 표현 최소화
- 전체 톤은 차분하고 사실 중심으로 유지

[⛔ 절대 금지 표현]
- "치료 예후가 긍정적이다" / "예후가 좋다"
- "효과가 기대된다" / "높은 성공률"
- "가장 좋은" / "최선의" / "최고"
- "~에 도움이 됩니다" / "도움이 될 수 있다"
- "~하세요" / "~받으세요" (명령형/권유형)
- "권장됩니다" / "추천합니다" / "반드시"
- "완치" / "100%" / "보장"
- "조기 발견이 중요하다" / "빠른 대처가 필요하다"

[출력 형식 — HTML]
반드시 아래 HTML 구조로 출력한다. 마크다운 금지.
<div class="press-release-container">
  <h1 class="press-title">제목</h1>
  <div class="press-body">
    <p>본문 단락들...</p>
  </div>
  <div class="press-footer">
    <div class="press-disclaimer">
      <p>※ 의학적 정보는 참고용이며, 정확한 진단은 전문의 판단이 필요합니다.</p>
    </div>
  </div>
</div>

전문의 인용 형식:
<p>${hospitalName} ${req.category || ''} ${req.doctorName} ${req.doctorTitle}은 "인용문"이라고 설명했다.</p>
⛔ blockquote 태그 사용 금지! <p> 태그 안에서 기사체로 인용!
⛔ h2 부제 태그 출력 금지!`;

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
  promptParts.push(`- 최대 글자 수: 공백 제외 ${maxLength}자 (절대 초과 불가!)`);

  if (req.hospitalInfo) {
    promptParts.push('', req.hospitalInfo);
  }

  promptParts.push(
    '',
    `[핵심 규칙]`,
    `- 언론 기사체로 작성 (블로그체 아님)`,
    `- 독자 행동을 직접 명령하지 않음 ("~하세요" 금지)`,
    `- 공포 은유 금지 ("침묵의 살인자", "시한폭탄" 등)`,
    `- 효과·평가·결과 표현 전면 금지`,
    `- 전문의 인용 2회 이상 (본문에 자연스럽게 기사체로)`,
    `- h1 제목은 "${req.topic}" 그대로! 절대 변경 금지!`,
    `- h2 부제 태그 출력 금지!`,
    `- blockquote 태그 사용 금지!`,
    `- 마크다운 금지, 모든 텍스트는 HTML 태그로 감싸기`,
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
