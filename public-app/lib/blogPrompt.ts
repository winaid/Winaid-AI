/**
 * 블로그 생성 프롬프트 조립 — GenerationRequest → { systemInstruction, prompt }
 *
 * old legacyBlogGeneration.ts 기준으로 이식.
 * 출력: HTML (<h3> 소제목 + <p> 문단 + [IMG_N] 마커)
 */
import type { GenerationRequest } from './types';

const AUDIENCE_GUIDES: Record<string, string> = {
  '환자용(친절/공감)': '환자가 치료를 두려워하지 않도록 따뜻하고 공감하는 어조로 작성하세요. 전문 용어는 쉬운 말로 바꿔 설명합니다.',
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

function getImageStyleGuide(req: GenerationRequest): string {
  const custom = req.customImagePrompt?.trim();
  if (custom) return `커스텀 스타일: ${custom}`;
  switch (req.imageStyle) {
    case 'illustration':
      return '3D 일러스트(Blender/Cinema4D 렌더링), 파스텔 색상 기반 세련된 팔레트, 부드러운 스튜디오 조명, 세미 리얼리스틱 캐릭터(친근하지만 만화적이지 않음), 미세 재질감(fabric, wood grain), 환경광 반사(ambient occlusion), 부드러운 그림자 (금지: 플라스틱 질감, 형광색, 클립아트, 스톡이미지 느낌, 실사/DSLR)';
    case 'medical':
      return '의학 3D 일러스트, 해부학적 렌더링, 장기 단면도, 반투명 장기, 임상 조명, 의료 색상 팔레트 (금지: 귀여운 만화, 실사 얼굴)';
    default:
      return '실사 DSLR(Canon EOS R5, 35mm f/1.4), 자연광 또는 창가 빛(스튜디오 조명 금지), 인물 f/2.8 얕은 심도, 약간 따뜻한 톤, 한국인 인물, 자연스러운 표정, 배경에 실제 병원/생활 환경 요소(가구, 식물, 창문), 자연스러운 그림자, 살짝의 노이즈/입자감 (금지: 과도하게 매끄러운 피부, 비현실적 완벽한 치아, CG 조명, 대칭 포즈, 빈 배경, 3D/일러스트/만화)';
  }
}

function buildHtmlTemplate(imageCount: number): string {
  let html = `<p>도입 1 - 구체적 상황 + 감각</p>
<p>도입 2 - 공감</p>
${imageCount >= 1 ? '[IMG_1]' : ''}

<h3>소제목 1</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 2 ? '[IMG_2]' : ''}

<h3>소제목 2</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 3 ? '[IMG_3]' : ''}

<h3>소제목 3</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 4 ? '[IMG_4]' : ''}`;

  if (imageCount >= 5) {
    html += `

<h3>소제목 4</h3>
<p>문단 1</p>
<p>문단 2</p>
[IMG_5]`;
  }

  if (imageCount >= 6) {
    html += `

<h3>소제목 5</h3>
<p>문단 1</p>
<p>문단 2</p>
[IMG_6]`;
  }

  html += `

<h3>마무리 소제목</h3>
<p>마무리 문단 1 - 핵심 메시지</p>
<p>마무리 문단 2 - 행동 안내</p>
<p>#해시태그 10개</p>`;

  return html;
}

const CATEGORY_DEPTH_GUIDES: Record<string, string> = {
  '치과': `[치과 전문 콘텐츠 가이드]

■ 진료 과정 서술
- 치료 단계별: 진단(파노라마/CT/구강스캐너) → 치료계획 수립 → 시술 → 경과 관찰
- 장비명 + 환자 체감: "CT 촬영으로 잇몸뼈 상태를 3D로 확인 → 임플란트 위치와 각도를 미리 계획"
- 환자 불안 해소: 마취 과정, 시술 중 느낌, 회복 기간을 솔직하게

■ 보철/기공소 파트 — 보철 관련 주제 시 반드시 포함
1) 보철 역할: 저작 기능 회복, 발음 교정, 인접 치아 이동 방지, 악관절 균형 유지
2) 기공소 역할: 치과의사 채득 인상 → 기공사가 0.01mm 단위로 보철물 성형, 색상 매칭, 교합 조정
3) 보철 재료: 지르코니아(강도+심미), PFM(내구성, 금속비침), 올세라믹 e.max(심미 최고), 금(생체적합), 레진(임시)
4) 디지털 기공: 구강스캐너(iTero/TRIOS) → CAD/CAM 설계 → 밀링/3D프린터 제작 (정밀도↑ 시간↓)
5) 자체 기공소 vs 외주: 즉시 소통, 당일 수정, 색상 매칭 정확도 차이
6) 환자 체감: 제작 기간(아날로그 5~7일 vs 디지털 1~3일), 이물감, 자연치아 구분

■ 비용: "건강보험 적용 여부", "재료에 따른 차이" 수준으로. 65세 이상 틀니/임플란트 보험 적용 안내 가능`,

  '피부과': `[피부과 전문 콘텐츠 가이드]

■ 시술 원리 서술
- 레이저 원리를 과학적으로: "프락셀은 미세 열 손상(MFZ)으로 콜라겐 재생 유도"
- 시술별 타겟 깊이: 표피(피코) vs 진피(프락셀) vs 근막(울쎄라)
- 시술 전후 주의사항: 세안 시기, 자외선 차단, 화장 가능 시점, 음주/사우나 제한

■ 주요 장비별 가이드 — 주제에 해당하는 장비만 선택적 사용
1) 레이저: 피코레이저(색소 분해), 레이저토닝(기미/색소), IPL(홍조/잡티), CO2(점/흉터), 엔디야그(혈관/문신)
2) 리프팅: 울쎄라(초음파 HIFU, SMAS층), 써마지(고주파 RF, 진피), 인모드(RF+마이크로니들), 슈링크(국산 HIFU), 올리지오(차세대 RF), 실리프팅(PDO/PCL 실)
3) 주사: 보톡스(주름/사각턱), 필러(볼륨, 쥬비덤/레스틸렌), 스킨부스터(쥬베룩 PDRN/리쥬란/엑소좀), 물광주사, PRP
4) 피부 재생: 더마펜(마이크로니들링), 화학 박피(AHA/BHA), 아쿠아필, LED 테라피

■ 시술 비교 프레임
- 같은 목적 시술 비교: 원리 → 타겟 깊이 → 시술 시간 → 다운타임 → 유지 기간
- 예: 울쎄라(초음파, SMAS, 60~90분, 부기 1~3일, 6~12개월) vs 써마지(고주파, 진피, 30~40분, 당일, 6개월)

■ 증상별 매칭
- 기미: 레이저토닝 + 스킨부스터 조합
- 모공: 프락셀 + 더마펜 + 써마지
- 주름: 보톡스(표정) + 필러(깊은) + 리프팅(처짐)
- 여드름 흉터: CO2 프락셔널 + 더마펜 + 서브시전

■ 비용/횟수: 직접 가격 금지. 횟수("레이저토닝 5~10회"), 유지기간("보톡스 3~6개월", "울쎄라 12~18개월") 안내 가능`,

  '정형외과': `[정형외과 전문 콘텐츠 가이드]

■ 해부학적 구조: 관절/인대/연골/근육의 역할과 손상 메커니즘
■ 진단: 이학적 검사(맥머리/라흐만 등) → 영상(X-ray/MRI/초음파) → 진단

■ 비수술 치료
- 물리치료, 도수치료, 체외충격파(ESWT), 프롤로테라피(인대강화주사), DNS주사
- 신경차단술, 고주파열응고술, 풍선확장술(카테터)

■ 수술 치료
- 관절경(반월판/십자인대), 인공관절(부분/전치환)
- 척추 내시경(FESS/BESS), 척추유합술, 디스크 시술(신경성형술)

■ 재활: 시기별 운동(급성기→회복기→강화기), 일상 복귀 시점, 직업/활동별 조언
■ 예방 운동: 구체적 동작명 + 횟수 + 주의점`,
};

const CATEGORY_IMAGE_GUIDES: Record<string, string> = {
  '치과': `[치과 이미지 장면 추천]
- 상담: 치과의사가 X-ray를 환자에게 보여주며 설명, 밝은 진료실, 자연광
- 시술: 치과 유닛체어에서 치료 중인 전체 환경 (클로즈업 X)
- 장비: CT 기계, 디지털 스캐너, 마이크로스코프
- 회복: 치료 후 거울을 보는 환자 — over-the-shoulder 구도(카메라는 환자 뒤/옆, 거울에 환자의 미소 비침). 정면 금지
- 피할 것: 무서운 기구 클로즈업, 피 나는 장면, 고통스러운 표정`,
  '피부과': `[피부과 이미지 장면 추천]
- 상담: 피부 확대경으로 환자 피부를 관찰하는 의사
- 시술: 레이저/필링 시술 장면 (시술실 전체 분위기 중심)
- 스킨케어: 세안, 선크림 바르기, 마스크팩 등 일상 관리
- 결과: 건강하고 맑은 피부의 한국인 (자연광, 과보정 금지)
- 피할 것: Before/After 대비, 과도하게 보정된 피부`,
  '정형외과': `[정형외과 이미지 장면 추천]
- 진단: MRI/X-ray 영상을 보며 설명하는 의사, 관절 모형
- 치료: 물리치료실에서 운동하는 환자, 재활 기구
- 일상: 무릎 보호대를 하고 가벼운 산책하는 사람
- 운동: 스트레칭, 근력 운동 (재활/예방 목적)
- 피할 것: 고통스러운 표정, 심한 부상, 수술실 내부`,
};

import { getMedicalLawPromptBlock } from './medicalLawRules';
import { getTrustedSourcesPromptBlock } from './trustedMedicalSources';

export function buildBlogPrompt(req: GenerationRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const audienceGuide = AUDIENCE_GUIDES[req.audienceMode] || AUDIENCE_GUIDES['환자용(친절/공감)'];
  const personaGuide = PERSONA_GUIDES[req.persona] || PERSONA_GUIDES.hospital_info;
  const toneGuide = TONE_GUIDES[req.tone] || TONE_GUIDES.warm;
  const styleGuide = STYLE_GUIDES[req.writingStyle || 'empathy'] || '';
  const medLawNote = getMedicalLawPromptBlock(req.medicalLawMode !== 'relaxed');

  const targetImageCount = req.imageCount ?? 0;
  const rawTarget = req.textLength || 1500;
  // 프롬프트용 실제 범위: 짧은 1100~1800, 중간 2100~2800, 긴 3100~3800
  const targetRanges: Record<number, { min: number; max: number; target: number }> = {
    1500: { min: 1100, max: 1800, target: 1500 },
    2500: { min: 2100, max: 2800, target: 2500 },
    3500: { min: 3100, max: 3800, target: 3500 },
  };
  const range = targetRanges[rawTarget] || { min: Math.round(rawTarget * 0.75), max: Math.round(rawTarget * 1.2), target: rawTarget };
  const targetLength = range.target;
  const imageStyleGuide = getImageStyleGuide(req);

  // 소제목 개수와 분량 설계
  let subheadingCount: number;
  if (targetLength < 2000) subheadingCount = 4;
  else if (targetLength < 2500) subheadingCount = 5;
  else if (targetLength < 3000) subheadingCount = 5;
  else subheadingCount = 6;
  const subheadingGuide = `${subheadingCount}개`;

  // 구조적 분량 설계 (글자수를 구조로 강제)
  const introChars = 200;
  const outroChars = 200;
  const bodyCharsPerSection = Math.round((range.target - introChars - outroChars) / subheadingCount);
  const volumeDesign = `[분량 설계 — 글자수를 구조로 확보]
목표: 공백 포함 ${range.min}~${range.max}자
- 도입부: 2문단 × 각 100자 = ${introChars}자
- 소제목 ${subheadingCount}개 × 각 2~3문단 × 각 ${Math.round(bodyCharsPerSection / 2.5)}자 = ${bodyCharsPerSection * subheadingCount}자
- 마무리: 2문단 × 각 100자 = ${outroChars}자
- 합계 목표: ${range.target}자
각 문단은 최소 3문장, 문장당 평균 30~40자. 2문장짜리 짧은 문단은 만들지 마세요.`;

  // 말투 학습이 적용되면 IDENTITY의 화자/시점 규칙을 무시 (학습된 말투 우선)
  const hasLearnedStyle = !!(req.learnedStyleId || (req.hospitalStyleSource === 'explicit_selected_hospital' && req.hospitalName));

  const systemInstruction = [
    // ── 글쓴이 정체성 (OLD IDENTITY 블록) ──
    // 말투 학습 시: 정체성/시점은 학습된 말투가 덮어씀
    ...(hasLearnedStyle ? [
      '[최상위 원칙] 쉽고 짧게 직접 말한다',
      '1. 짧게 쓴다. 한 문장은 40자 이내 권장. 50자 넘으면 나눈다',
      '2. 직접 말한다. 돌려 말하지 않는다',
      '3. 쉬운 말을 쓴다. 중학생도 이해할 수 있을 정도',
      '⚠️ 아래 학습된 말투/화자 설정이 최우선. IDENTITY 화자 설정보다 학습 말투를 따르세요.',
    ] : [
      '[글쓴이 정체성]',
      '병원 블로그 전담 에디터. 의사가 아니라 건강 정보를 잘 정리하는 사람.',
      '- 의학 지식이 있지만 의사처럼 말하지 않는다',
      '- 독자에게 가르치지 않는다. 정보를 두고 갈 뿐이다',
      '- 문장이 짧다. 군더더기를 싫어한다',
      '',
      '[최상위 원칙] 쉽고 짧게 직접 말한다',
      '1. 짧게 쓴다. 한 문장은 40자 이내 권장. 50자 넘으면 나눈다',
      '2. 직접 말한다. 돌려 말하지 않는다',
      '3. 쉬운 말을 쓴다. 중학생도 이해할 수 있을 정도',
      '4. 의료광고법에 걸리는 표현만 피한다. 나머지는 직접 서술한다',
    ]),
    '',
    personaGuide,
    audienceGuide,
    `글의 어조: ${toneGuide}`,
    styleGuide,
    medLawNote,
    '',
    // ── 긍정 가이드 (이렇게 써라) ──
    '[좋은 문단의 기준 — 모든 문단이 이걸 충족해야 함]',
    '- 첫 문장이 문단의 핵심을 담는다 (두괄식)',
    '- 구체적 사실/수치/과정이 최소 1개 있다 (추상적 설명만으로 채우지 않기)',
    '- 환자 입장에서의 체감/변화가 1문장 이상 있다 (의사 관점이 아닌 환자 관점)',
    '- 마지막 문장이 다음 문단으로 자연스럽게 이어지는 브릿지 역할 (앞 내용 요약이 아니라 다음 주제를 예고)',
    '',
    '나쁜 문단 (추상적, AI스러움):',
    '"임플란트는 치아를 대체하는 좋은 방법입니다. 많은 환자분들이 만족하고 계십니다. 전문적인 진료를 통해 좋은 결과를 얻을 수 있습니다."',
    '→ 문제: 구체적 정보 0개, 모든 문장이 추상적',
    '',
    '좋은 문단 (구체적, 사람이 쓴 느낌):',
    '"임플란트는 빠진 치아 자리의 잇몸뼈에 티타늄 나사를 심고, 그 위에 인공 치아를 얹는 시술입니다. 시술 자체는 30분~1시간 정도 걸리지만, 잇몸뼈와 임플란트가 결합하는 데 약 3~6개월이 필요합니다. 이 기간 동안 임시 치아를 사용하므로 일상생활에는 큰 불편이 없습니다."',
    '→ 좋은 이유: 구체적 과정, 시간 수치, 환자 체감',
    '',
    '[문장 리듬과 어미]',
    '- 기본 ~습니다/~있습니다 체. 같은 어미 3회 연속이면 가운데 하나를 바꿔라',
    '- "~수 있습니다"는 의료법 표현에만 사용. 매 문장 금지',
    '- 긴 문장 뒤에 짧은 문장 배치 → 리듬감',
    '- 접속사("또한","그리고") 연속 문단 반복 금지. 내용 흐름으로 연결',
    '',
    '[전문성 깊이]',
    '- 왜 중요한지 → 구체적으로 어떻게 → 어떤 장비/기술 → 환자에게 어떤 차이',
    '- "좋다"가 아니라 "왜 좋은지", "다른 방법과 뭐가 다른지"',
    '- 실무 디테일(소요 시간, 과정, 주의사항, 사후 관리) 포함',
    '- 의학 표현: 쉽게 쓰되 틀리면 안 된다. 모호한 뭉뚱그리기 금지 ("불편함" → "움직일 때 걸리는 느낌")',
    '',
    // 진료과별 전문 가이드
    ...(CATEGORY_DEPTH_GUIDES[req.category] ? [CATEGORY_DEPTH_GUIDES[req.category]] : []),
    '',
    getTrustedSourcesPromptBlock(req.category),
    '',
    // ── 금지 표현 (한 곳에 통합) ──
    '[금지 표현 통합]',
    'AI 냄새: "~라고 알려져 있습니다", "일반적으로", "대부분의 경우", "다양한/여러 가지"',
    '딱딱한 단어: 측면/관점/맥락/양상/경향/요인/파악하다 등 → 3회 이하',
    '번역투: "~하는 것이 중요합니다", "~하는 것으로 알려져", "~에 의해 발생"',
    '메타 설명: "이 글에서는~", "살펴보겠습니다"',
    '독자 직접 말 걸기 금지 (✕ "걱정되시죠?", ○ "이런 증상이 반복되면 신경이 쓰일 수밖에 없습니다")',
    '"해야", "바랍니다" 전부 금지',
    '의인화: "바이러스의 끈질긴 생명력" → "감염력을 오래 유지하는 특성"',
    '',
    '네이버 스마트블록 SEO에 최적화된 HTML 구조로 작성합니다.',
    '출력은 반드시 HTML입니다. <h3>으로 소제목, <p>로 문단을 작성합니다.',
    '',
    '[태그 규칙]',
    '소제목: <h3>만 사용. <h1>, <h2> 금지. 마크다운(#, ##, **, ```) 금지.',
    '출력: 순수 HTML(<h3>, <p>, <strong>, <em>)만 사용.',
    '',
    volumeDesign,
    '',
    `[도입부 좋은 예시]`,
    `치과: "찬 물을 마실 때마다 오른쪽 어금니가 찌릿합니다. 처음엔 그냥 넘겼는데, 이제는 뜨거운 국물에도 반응합니다."`,
    `피부과: "요즘 거울을 볼 때마다 눈가 잔주름이 신경 쓰입니다. 웃을 때만 보이던 주름이 이제는 가만히 있어도 남아 있습니다."`,
    `정형외과: "아침에 일어나면 무릎이 뻣뻣합니다. 계단을 내려갈 때 시큰한 느낌이 점점 강해지고 있습니다."`,
    '',
    `[소제목 좋은 예시]`,
    `"찬 물만 마시면 이가 시린 이유" (증상 → 궁금증)`,
    `"충치인 줄 알았는데 잇몸이 문제?" (오해 바로잡기)`,
    `"임플란트, 수술 당일 뭘 준비해야 할까" (실용 정보)`,
    `"잇몸이 내려앉으면 되돌릴 수 있을까" (가능성 질문)`,
    '',
    `[마무리 좋은 예시]`,
    `핵심을 한 문장으로 요약 + "궁금한 점은 가까운 치과에서 상담받아보시길 바랍니다"`,
  ].filter(Boolean).join('\n');

  const promptParts: string[] = [];

  // ── 작성 요청 ──
  promptParts.push(
    '한국 병·의원 네이버 블로그용 의료 콘텐츠를 작성하세요.',
    '',
    '[작성 요청]',
    `- 진료과: ${req.category}`,
    `- 제목/주제: ${req.topic}`,
    `- SEO 키워드: ${req.keywords || '없음'}`,
  );

  if (req.disease) {
    promptParts.push(`- 질환(글의 핵심 주제): ${req.disease}`);
  }
  if (req.hospitalName) {
    promptParts.push(`- 병원명: ${req.hospitalName}`);
  }

  // ── 병원 홈페이지/블로그 분석 결과 ──
  if (req.clinicContext) {
    const ctx = req.clinicContext;
    const ctxParts: string[] = ['', '[병원 실제 정보 (홈페이지/블로그 분석 결과)]'];
    if (ctx.actualServices.length > 0) {
      ctxParts.push(`- 실제 제공 서비스: ${ctx.actualServices.join(', ')}`);
    }
    if (ctx.specialties.length > 0) {
      ctxParts.push(`- 특화/차별화 진료: ${ctx.specialties.join(', ')}`);
    }
    if (ctx.locationSignals.length > 0) {
      ctxParts.push(`- 주변 지역: ${ctx.locationSignals.join(', ')}`);
    }
    ctxParts.push(`→ 위 정보 중 현재 글의 주제("${req.topic}")와 관련 있는 정보만 참고하세요.`);
    ctxParts.push('→ 주제와 무관한 시술, 장비, 서비스 정보는 절대 포함하지 마세요.');
    ctxParts.push('→ 없는 서비스를 언급하지 마세요.');
    promptParts.push(...ctxParts);
  }

  promptParts.push(
    `- 이미지: ${targetImageCount}장`,
    `- 목표 글자 수: 공백 포함 ${range.min}~${range.max}자 (위 분량 설계 참고)`,
  );

  // ── 소제목 구조 규칙 (old 동일) ──
  promptParts.push(
    '',
    '[글 전체 구조 — 반드시 준수]',
    '- 도입부: 2문단 고정 (h3 소제목 없음, <p> 태그만)',
    '  · 1문단: 일상 장면/상황 전개 (2~3문장, 구체적 감각 묘사)',
    '  · 2문단: 검색 의도 브릿지 (1~2문장, 키워드/질환명을 자연스럽게 연결)',
    '  ⚠️ 도입부 금지: "~이란", "~에 대해", "알아보겠습니다", "많은 분들이", 질환명으로 시작, 독자에게 질문',
    '  ⚠️ 여러 상황 나열 금지 — 하나의 장면이 자연스럽게 전개되어야 함',
    `- 본문 소제목: 최소 4개 (${targetLength}자 기준 ${subheadingGuide} 권장). 4개 미만 실패`,
    '- 각 소제목 = <h3> 태그만 사용. <h1>, <h2> 절대 금지',
    '- 각 소제목 아래 문단 2~3개씩 균일. 마지막 소제목도 축약 금지',
    '- 소제목 간 문단 수 차이 최대 1문단',
    '- 마무리: <h3> 소제목으로 시작 + 2문단 고정 (핵심 메시지 + 행동 안내)',
    '',
    '[소제목 규칙]',
    '- 네이버 검색창에 사람이 직접 칠 법한 말투. 짧고 구어체 (10~25자)',
    '- 피할 것: "~이란", "~의 정의", "주요 ~", "~ 및 ~"',
    '- 좋은 예: "찬 물만 마시면 이가 시린 이유" / "충치인 줄 알았는데 잇몸이 문제?"',
    '- 각 소제목은 하나의 역할만 담당 (정의/원인/증상/치료/관리 등). 앞 소제목에서 다룬 정보 반복 금지',
    '',
    '[출력 전 체크리스트]',
    '□ <h1>, <h2> 태그 없는가?',
    '□ <h3> 소제목 4개 이상인가?',
    '□ 각 소제목 아래 <p> 2개 이상인가?',
    '□ 마무리 섹션이 있는가?',
    `□ 전체 글자 수 ${range.min}~${range.max}자 범위인가?`,
  );

  // ── 키워드 규칙 ──
  const kwDensity = req.keywordDensity;
  const kwCountGuide = kwDensity === 'auto' || kwDensity === undefined
    ? '자연스럽게 분산 배치하세요. 과도한 반복은 피하세요'
    : `본문에 정확히 ${kwDensity}회 삽입하세요. 소제목, 본문, 결론에 골고루 분산. 어색하게 끼워넣지 말고 문맥에 맞게 삽입`;

  if (req.disease && req.keywords) {
    promptParts.push(
      '',
      `[키워드·질환 역할 분리]`,
      `SEO 키워드: "${req.keywords}" / 질환: "${req.disease}"`,
      `→ 키워드는 SEO용 — ${kwCountGuide}. 질환이 글의 실제 주제. 다른 질환명 추가 금지.`,
    );
  } else if (req.keywords) {
    promptParts.push(
      '',
      `[키워드]`,
      `"${req.keywords}" - ${kwCountGuide}. 도입부 첫 2문장에서는 금지. 다른 질환명 추가 금지.`,
    );
  }

  // ── 사용자 지정 소제목 ──
  if (req.customSubheadings) {
    promptParts.push(
      '',
      '[사용자 지정 소제목 - 반드시 이 소제목 사용]',
      req.customSubheadings,
    );
  }

  // ── 유튜브 자막 참고 ──
  if (req.youtubeTranscript?.trim()) {
    const trimmed = req.youtubeTranscript.trim().slice(0, 8000);
    promptParts.push(
      '',
      '[참고 영상 자막]',
      '아래는 유튜브 영상의 자막입니다. 핵심 정보를 추출하여 블로그 문체로 재구성하세요.',
      '자막을 그대로 복사하지 말고, 구체적 수치/사례/설명을 활용하세요.',
      '글의 주제와 관련 없는 내용은 무시하세요.',
      '', trimmed,
    );
  }

  // ── FAQ ──
  if (req.includeFaq) {
    promptParts.push(
      '',
      `[FAQ 섹션]`,
      `본문을 완전히 마무리한 후(결론/마무리 문단 이후에) FAQ를 ${req.faqCount || 3}개 작성하세요.`,
      'FAQ는 글의 맨 마지막에 위치해야 합니다. 마무리 인사 뒤에 작성하세요.',
      `형식:
<div style="margin-top:32px;padding:20px 24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
<h3 style="margin:0 0 16px 0;font-size:17px;color:#1e293b;">💬 자주 묻는 질문</h3>
각 Q/A:
<p style="margin:12px 0 4px 0;font-weight:700;color:#334155;">Q. 질문내용</p>
<p style="margin:0 0 12px 0;color:#64748b;">A. 답변내용</p>
</div>`,
    );
  }

  // ── 병원 소개 섹션 ──
  if (req.includeHospitalIntro && req.clinicContext) {
    const ctx = req.clinicContext;
    promptParts.push(
      '',
      '[병원 소개 섹션 - 글 마지막에 삽입]',
      '마무리 섹션 바로 앞에 <h3>병원 소개</h3> 소제목을 추가하고, 아래 정보를 자연스럽게 2~3문단으로 작성하세요.',
      ctx.actualServices.length > 0 ? `- 진료 서비스: ${ctx.actualServices.join(', ')}` : '',
      ctx.specialties.length > 0 ? `- 특화 진료: ${ctx.specialties.join(', ')}` : '',
      ctx.locationSignals.length > 0 ? `- 위치: ${ctx.locationSignals.join(', ')}` : '',
      '- 병원 소개는 광고가 아닌 정보 전달 톤으로 작성. 의료법 준수.',
    );
  }

  // ── HTML 구조 + 이미지 마커 (old 동일) ──
  promptParts.push(
    '',
    `[HTML 구조] - 이미지 ${targetImageCount}장 기준`,
    buildHtmlTemplate(targetImageCount),
  );

  promptParts.push(
    '',
    `일반 소제목: <p> 2~3개 / 마무리: <p> 2개 (도입부와 비슷한 분량)`,
  );

  // ── 이미지 프롬프트 규칙 (old 동일) ──
  if (targetImageCount > 0) {
    promptParts.push(
      '',
      `[이미지 프롬프트 규칙] 정확히 ${targetImageCount}개 필수`,
      `글 마지막에 [IMAGE_PROMPTS] 블록으로 이미지 프롬프트를 작성하세요.`,
      `- 스타일: ${imageStyleGuide}`,
      '- 사람이 등장할 경우 반드시 "한국인" 명시 (예: "한국인 여성", "한국인 의사")',
      '- 모든 프롬프트 마지막에 "no text, no watermark, no logo" 포함',
      '',
      '[이미지 프롬프트 작성 규칙 — AI티 방지]',
      '- 각 프롬프트는 최소 40단어 이상, 구체적인 장면 묘사 필수',
      '- 반드시 포함: 장소(어디서), 인물(누가, 몇 명, 표정), 동작(뭘 하는 중), 소품(주변에 뭐가), 분위기(조명, 색감)',
      '- 나쁜 예: "치과에서 상담하는 장면" (너무 짧음)',
      '- 좋은 예: "밝은 창가 옆 진료실에서 30대 한국인 여성 환자가 치과 의사와 X-ray 사진을 보며 이야기하는 장면. 환자는 약간 걱정스러운 표정이고 의사는 차분하게 설명 중. 진료 의자, 데스크 위 치과 기구, 창으로 들어오는 자연광. no text, no watermark, no logo"',
      '',
      '[카메라 시점 규칙]',
      '- 거울 장면: "카메라는 인물 뒤쪽/옆(over-the-shoulder), 뒷모습 + 거울 반사면에 얼굴 비침" 구도 필수. 정면 구도 금지',
      '- 좋은 예: "카메라가 환자 어깨 뒤에 위치, 뒷머리와 손거울이 보이고, 거울 속에 밝은 미소가 비침. over-the-shoulder shot"',
      '- 모든 이미지에 카메라 위치 명시 (eye-level, slightly elevated, over-the-shoulder 등)',
      '- 인물이 카메라를 정면 응시하는 구도 금지 (다큐멘터리/에디토리얼 느낌 유지)',
      '',
      '[이미지 프롬프트 금지]',
      '- 이미지 안에 글자, 문장, 제목, 캡션, 라벨, 간판, 로고, 워터마크 금지',
      '- 병원명, 브랜드명, 전화번호, URL 금지',
      '- 포스터, 인포그래픽, 카드뉴스, 광고 레이아웃 금지',
      '- 프롬프트에 병원 이름이나 고유명사를 포함하지 마세요',
      '',
      ...(CATEGORY_IMAGE_GUIDES[req.category] ? [CATEGORY_IMAGE_GUIDES[req.category]] : []),
      '',
      '[이미지-본문 매칭 규칙]',
      '- 각 [IMG_N] 위치의 이미지 프롬프트는 바로 위/아래 문단의 주제를 시각적 장면으로 표현',
      '- 이미지 순서: 본문 흐름과 동일하게 (도입→증상→원인→관리)',
      '- 각 이미지가 서로 다른 장면이어야 합니다 (비슷한 포즈/배경 반복 금지)',
    );

    if (req.customImagePrompt) {
      promptParts.push(
        '',
        `[커스텀 스타일 필수 적용]`,
        `사용자가 "${req.customImagePrompt}" 스타일을 요청했습니다.`,
        `모든 이미지 프롬프트에 이 스타일 키워드를 반드시 포함하세요.`,
      );
    }
  }

  // ── 출력 형식 ──
  promptParts.push(
    '',
    '[출력 형식]',
    '1. 먼저 HTML 본문을 작성하세요.',
    targetImageCount > 0
      ? `   본문 안에 [IMG_1]~[IMG_${targetImageCount}] 마커를 위 구조대로 배치하세요.`
      : '   이미지 마커 없이 작성하세요.',
    '2. 본문 마지막(마무리 문단 이후, FAQ가 있으면 FAQ 이후)에 참고 출처 블록 추가:',
    '',
    `<div class="references-footer" data-no-copy="true">`,
    `<p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;font-weight:600;">참고 자료</p>`,
    `<ul style="font-size:11px;color:#94a3b8;padding-left:20px;margin:8px 0 0 0;line-height:1.8;">`,
    `<li>기관명 — 관련 정보 주제</li>`,
    `</ul></div>`,
    '',
    '출처 규칙: 본문에서 참고한 의학 정보의 출처를 2~4개 기재. 신뢰 기관만(질병관리청, 대한OO학회, 대학병원 등). URL 금지, 기관명+주제만. 없는 자료를 지어내지 마세요.',
    '',
    '3. 출처 블록 다음에 자가평가 점수를 붙이세요:',
    '',
    '---SCORES---',
    '{"seo": [0~100 점수], "medical": [0~100 점수], "conversion": [0~100 점수]}',
    '⚠️ 점수는 반드시 0~100 범위의 정수! seo: SEO 최적화 점수, medical: 의료광고법 준수 점수, conversion: 전환/행동유도 점수. 평범한 글 = 60~75, 잘 쓴 글 = 75~90.',
  );

  if (targetImageCount > 0) {
    promptParts.push(
      '',
      `3. 점수 블록 다음에 이미지 프롬프트를 작성하세요:`,
      '',
      '---IMAGE_PROMPTS---',
      `[정확히 ${targetImageCount}줄, 한 줄에 하나씩, 한국어로 작성]`,
    );
  }

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}
