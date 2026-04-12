/**
 * 블로그 생성 프롬프트 조립 — GenerationRequest → { systemInstruction, prompt }
 *
 * old legacyBlogGeneration.ts 기준으로 이식.
 * 출력: HTML (<h3> 소제목 + <p> 문단 + [IMG_N] 마커)
 */
import type { GenerationRequest } from './types';
import { sanitizePromptInput, sanitizeSourceContent } from './promptSanitize';

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
  empathy: '독자의 고민에 공감하는 서술을 포함합니다. (○ "이런 증상이 반복되면 신경이 쓰일 수밖에 없습니다", ✕ "걱정되시죠?")',
  expert: '전문적 근거와 수치를 활용하여 신뢰감을 높입니다.',
  conversion: '독자가 상담 예약이나 문의를 하도록 자연스럽게 유도하는 문장을 포함합니다.',
};

function getImageStyleGuide(req: GenerationRequest): string {
  // customImagePrompt 는 사용자 입력 → 그대로 Gemini 프롬프트에 흐르므로 sanitize.
  const custom = sanitizePromptInput(req.customImagePrompt, 300);
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
${imageCount >= 1 ? '[IMG_1 alt="키워드 포함 설명"]' : ''}

<h3>소제목 1</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 2 ? '[IMG_2 alt="키워드 포함 설명"]' : ''}

<h3>소제목 2</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 3 ? '[IMG_3 alt="키워드 포함 설명"]' : ''}

<h3>소제목 3</h3>
<p>문단 1</p>
<p>문단 2</p>
${imageCount >= 4 ? '[IMG_4 alt="키워드 포함 설명"]' : ''}`;

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

const DENTAL_PROSTHETIC_GUIDE = `
■ 보철/기공소 파트
1) 보철 역할: 저작 기능 회복, 발음 교정, 인접 치아 이동 방지, 악관절 균형 유지
2) 기공소 역할: 치과의사 채득 인상 → 기공사가 0.01mm 단위로 보철물 성형, 색상 매칭, 교합 조정
3) 보철 재료: 지르코니아(강도+심미), PFM(내구성, 금속비침), 올세라믹 e.max(심미 최고), 금(생체적합), 레진(임시)
4) 디지털 기공: 구강스캐너(iTero/TRIOS) → CAD/CAM 설계 → 밀링/3D프린터 제작 (정밀도↑ 시간↓)
5) 자체 기공소 vs 외주: 즉시 소통, 당일 수정, 색상 매칭 정확도 차이
6) 환자 체감: 제작 기간(아날로그 5~7일 vs 디지털 1~3일), 이물감, 자연치아 구분`;

function isProstheticTopic(topic: string, disease?: string): boolean {
  const t = `${topic} ${disease || ''}`;
  return /보철|임플란트|크라운|브릿지|틀니|인레이|온레이|기공|지르코니아|PFM|올세라믹|라미네이트/.test(t);
}

const CATEGORY_DEPTH_GUIDES: Record<string, string> = {
  '치과': `[치과 전문 콘텐츠 가이드]

■ 진료 과정 서술
- 치료 단계별: 진단(파노라마/CT/구강스캐너) → 치료계획 수립 → 시술 → 경과 관찰
- 장비명 + 환자 체감: "CT 촬영으로 잇몸뼈 상태를 3D로 확인 → 임플란트 위치와 각도를 미리 계획"
- 환자 불안 해소: 마취 과정, 시술 중 느낌, 회복 기간을 솔직하게

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

type TopicType = 'info' | 'compare' | 'aftercare' | 'symptom' | 'qna' | 'general';

function classifyTopicType(topic: string, disease?: string): TopicType {
  const t = `${topic} ${disease || ''}`.toLowerCase();
  if (/비교|차이|vs|종류|어떤.*좋|선택/.test(t)) return 'compare';
  if (/후.*관리|후.*주의|회복|수술.*후|시술.*후/.test(t)) return 'aftercare';
  if (/증상|원인|이유|왜|진단/.test(t)) return 'symptom';
  if (/자주.*묻|궁금|알아야|질문/.test(t)) return 'qna';
  if (/치료|시술|방법|과정/.test(t)) return 'info';
  return 'general';
}

const TOPIC_FLOW_GUIDES: Record<TopicType, string[]> = {
  info: [
    '"이게 뭔지" → "왜 필요한지" → "과정(단계별)" → "주의할 점" → "마무리"',
    '"환자 관점(언제 필요)" → "의학적 원리" → "구체 절차" → "예상 결과" → "마무리"',
    '"흔한 오해" → "실제 모습" → "과정" → "회복/관리" → "마무리"',
  ],
  compare: [
    '"비교 대상 소개" → "A 특징" → "B 특징" → "어떤 경우 적합" → "정리"',
    '"환자 상황 A" → "A 치료법" → "환자 상황 B" → "B 치료법" → "선택 기준"',
    '"공통점" → "차이점" → "비용/기간 비교" → "환자별 추천" → "정리"',
  ],
  aftercare: [
    '"시술 직후(당일)" → "1주일 이내" → "1~3개월" → "장기 관리" → "이상 증상 시"',
    '"회복 메커니즘" → "단계별 주의사항" → "일상 복귀 타이밍" → "장기 관리"',
    '"환자 체감(부기/통증)" → "각 기간 실제 경험" → "일상 복귀" → "예상 외 증상"',
  ],
  symptom: [
    '"증상" → "원인(의학적)" → "자가 체크법" → "병원 가는 시점" → "치료 개요"',
    '"일상 징후" → "심해지는 과정" → "진단 방법" → "치료 옵션" → "예방"',
    '"오해된 증상" → "진짜 원인" → "감별 진단" → "검사 방법" → "다음 단계"',
  ],
  qna: [
    '소제목 형식: "~일까요?", "~얼마나 걸리나요?", "~해도 되나요?" 답변: 결론 먼저 + 이유',
    '소제목 형식: "~한 경우 어떻게?", "~대신 ~는?" 답변: 선택지 제시 + 근거',
    '소제목 형식: "~전에 알아야 할 것", "~후에 주의할 것" 답변: 체크리스트 형태',
  ],
  general: [
    '"상황 제시" → "핵심 정보 2~3개" → "환자 관점 조언" → "마무리"',
    '"일상의 오류" → "올바른 이해" → "구체적 사례" → "행동 안내"',
    '"계절/시기 맥락" → "관련 정보" → "예방/관리법" → "마무리"',
  ],
};

// ── 계절/시기 컨텍스트 자동 생성 ──

const SEASONAL_CONTEXTS: Record<string, Record<number, string>> = {
  '치과': {
    1: '신년: 새해 건강 다짐, 미뤄둔 치과 치료 시작, 설 명절 전 치료 완료 수요',
    2: '설 연휴 후: 딱딱한 음식으로 인한 치아 파절/통증 증가, 명절 후 치과 방문',
    3: '봄: 입학/취업 전 치아교정/미백 수요 증가, 졸업·입사 전 외모 관리',
    4: '봄: 환절기 면역력 저하 → 잇몸 염증 증가',
    5: '어린이날: 소아치과 검진, 가정의달 가족 건강 체크',
    6: '여름 준비: 웃을 일 많은 여름 전 미백/라미네이트 수요',
    7: '여름: 찬 음식 → 시린이 증가, 빙수/아이스크림으로 인한 치아 민감',
    8: '여름: 휴가 전후 응급 치과 (해외여행 중 치통 대비)',
    9: '가을: 추석 전 치료 완료, 환절기 구강 건조 → 충치 위험',
    10: '가을: 건조한 날씨 → 구강 건조증, 잇몸 출혈 증가',
    11: '겨울 준비: 연말 전 미루던 치료 마무리, 연말정산 의료비 공제',
    12: '연말: 의료비 공제 마감, 새해 전 임플란트/교정 시작 적기',
  },
  '피부과': {
    1: '겨울: 건조·갈라짐 관리, 신년 피부 리뉴얼, 레이저 시술 적기(자외선 약할 때)',
    2: '겨울 끝: 겨울 동안 쌓인 각질 관리, 봄맞이 피부 준비',
    3: '봄: 꽃가루 알레르기 → 피부 트러블, 자외선 증가 시작',
    4: '봄: 미세먼지 → 모공/트러블, 자외선 차단 본격 시작',
    5: '초여름: 여름 전 제모/바디 관리 수요, 자외선 강해지기 시작',
    6: '여름: 강한 자외선 → 기미/잡티, 피지 과다 → 여드름',
    7: '여름: 자외선 피크, 선크림 중요성, 땀으로 인한 피부 트러블',
    8: '여름: 휴가 후 피부 회복, 일광 화상 관리',
    9: '가을: 여름 자외선 데미지 회복, 레이저 시술 시즌 시작',
    10: '가을: 건조해지는 피부 보습, 리프팅/보톡스 시즌',
    11: '겨울 준비: 보습 집중 관리, 연말 전 시술 수요',
    12: '연말: 송년/신년 모임 전 피부 관리, 겨울 보습 집중',
  },
  '정형외과': {
    1: '겨울: 빙판길 낙상 → 골절/염좌, 새해 운동 시작 → 부상 주의',
    2: '겨울: 추위 → 관절 뻣뻣, 실내 운동 중 부상',
    3: '봄: 등산/야외활동 시작 → 무릎/발목 부상, 운동 재개 주의',
    4: '봄: 야외활동 증가 → 스포츠 부상, 골프/테니스 시즌',
    5: '봄: 장마 전 야외활동 피크, 등산 무릎 통증',
    6: '여름: 수영/수상스포츠 → 어깨/허리 부상',
    7: '여름: 에어컨 → 관절 통증 악화, 냉방병',
    8: '여름: 휴가 활동(서핑/계곡) 후 부상',
    9: '가을: 등산 시즌 → 무릎/발목, 일교차 → 관절통',
    10: '가을: 마라톤/산행 → 과사용 부상',
    11: '겨울 준비: 추위 전 관절 검진, 도수치료 시즌',
    12: '겨울: 빙판길 주의, 스키/보드 부상, 연말 무리한 활동',
  },
};

function getSeasonalContext(category: string): string {
  const month = new Date().getMonth() + 1;
  const catContexts = SEASONAL_CONTEXTS[category];
  if (!catContexts) return '';
  const context = catContexts[month];
  if (!context) return '';
  return `[현재 시즌 컨텍스트 — ${month}월]\n${context}\n→ 가능하면 위 계절 맥락을 도입부나 본문에 자연스럽게 반영하세요. 억지로 넣지는 말 것.`;
}

export function buildBlogPrompt(req: GenerationRequest): {
  systemInstruction: string;
  prompt: string;
} {
  // 프롬프트 인젝션 방어 — 사용자 입력은 전부 sanitize 한 지역 변수로 사용.
  // 단문(키워드·제목·병원명)은 sanitizePromptInput, 장문(임상 컨텍스트·YouTube
  // 스크립트·병원 강점 서술)은 sanitizeSourceContent 로 대괄호·단락 보존.
  const safeTopic = sanitizePromptInput(req.topic, 500);
  const safeBlogTitle = sanitizePromptInput(req.blogTitle, 200);
  const safeKeywords = sanitizePromptInput(req.keywords, 300);
  const safeDisease = sanitizePromptInput(req.disease, 100);
  const safeHospitalName = sanitizePromptInput(req.hospitalName, 100);
  const safePatientPersona = sanitizePromptInput(req.patientPersona, 200);
  const safeCustomImagePrompt = sanitizePromptInput(req.customImagePrompt, 300);
  const safeCustomSubheadings = sanitizeSourceContent(req.customSubheadings, 2000);
  const safeHospitalStrengths = sanitizeSourceContent(req.hospitalStrengths, 3000);
  const safeClinicalContext = sanitizeSourceContent(req.clinicalContext, 5000);
  const safeYoutubeTranscript = sanitizeSourceContent(req.youtubeTranscript, 8000);

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
  const topicType = classifyTopicType(req.topic, req.disease);
  const flowOptions = TOPIC_FLOW_GUIDES[topicType];
  const topicFlowGuide = '흐름 권장: ' + flowOptions[Math.floor(Math.random() * flowOptions.length)];

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
  const volumeDesign = `[분량 규칙 — ${range.min}~${range.max}자 (목표 ${range.target}자)]
구조:
- 도입부 ${introChars}자: 2문단 × 각 100자
- 본문 ${bodyCharsPerSection * subheadingCount}자: 소제목 ${subheadingCount}개 × 각 2~3문단(문단당 ${Math.round(bodyCharsPerSection / 2.5)}자)
- 마무리 ${outroChars}자: 2문단 × 각 100자
문단 기준: 최소 3문장, 문장당 35~50자. 2문장 문단 금지.
${range.max}자 초과 시 → 가장 약한 문단을 삭제 후 출력. 패딩(같은 말 반복, 원론적 경고) 금지.`;

  // 말투 학습이 적용되면 IDENTITY의 화자/시점 규칙을 무시 (학습된 말투 우선)
  const hasLearnedStyle = !!(req.learnedStyleId || (req.hospitalStyleSource === 'explicit_selected_hospital' && req.hospitalName));

  const systemInstruction = [
    // ── 최상위 원칙 (1번만) ──
    '[최상위 원칙] 쉽고 짧게 직접 말한다',
    '1. 짧게 쓴다. 한 문장 50자 이내 권장. 70자 넘으면 나눈다',
    '2. 직접 말한다. 돌려 말하지 않는다',
    '3. 쉬운 말을 쓴다. 중학생도 이해할 수 있을 정도',
    '',
    // ── 정체성 (조건부) ──
    ...(hasLearnedStyle ? [
      '⚠️ 아래 학습된 말투/화자 설정이 최우선.',
    ] : [
      '[글쓴이 정체성]',
      '병원 블로그 전담 에디터. 의학 지식이 있지만 의사처럼 말하지 않는다.',
      '독자에게 가르치지 않고, 정보를 두고 갈 뿐이다. 각 문장에 군더더기 없이 하나의 정보만 담는다.',
    ]),
    '',
    personaGuide,
    audienceGuide,
    `글의 어조: ${toneGuide}`,
    styleGuide,
    medLawNote,
    '',
    // ── 글쓰기 가이드 ──
    '[좋은 문단의 기준]',
    '1. 첫 문장 = 새로운 정보 전달 (두괄식)',
    '   ❌ "이제 다음 단계를 살펴보겠습니다" (정보 0)',
    '   ✅ "골유착 기간은 평균 3~6개월이 소요됩니다" (새로운 정보)',
    '2. 본문에서 주장하는 내용에 한해 수치/기간을 포함. 무관한 곳에 억지로 넣지 말 것',
    '3. 환자 체감 표현 1문장 이상 ("시큰거리는", "뻣뻣한" 등 감각어)',
    '4. 마지막 문장: 다음 문단과 내용상 연결 (접속사 없이, 주제 흐름으로). 글의 마지막 문단은 행동 안내로 마무리',
    '',
    '❌ AI 스타일 (매번 같은 톤):',
    '  "레이저토닝은 피부에 좋은 시술입니다. 많은 분들이 만족하고 계십니다."',
    '  "무릎 통증이 있으면 전문의를 찾아가야 합니다."',
    '  "1064nm 파장으로 멜라닌 색소를 잘게 부수는 시술입니다." (기술용어로 시작 — AI 티)',
    '',
    '✅ 자연스러운 다양한 스타일 (매번 다르게):',
    '  친근형: "레이저 받고 나오면 얼굴이 빨개서 깜짝 놀라실 수 있어요. 보통 2~3시간이면 가라앉습니다."',
    '  정보형: "레이저토닝의 원리는 간단합니다. 검은 색소에만 반응하는 빛을 쏘아 기미를 조금씩 분해하는 방식이에요."',
    '  체감형: "계단 내려갈 때 무릎 안쪽이 시큰거리는 느낌, 혹시 반월판 문제일까요?"',
    '  솔직형: "솔직히 5회 만에 기미가 다 빠지진 않습니다. 하지만 10회 전후로 대부분 만족하시는 편입니다."',
    '',
    '→ 같은 스타일로 3문단 연속 금지. 문단마다 스타일을 섞으세요.',
    '',
    '[독자 말 걸기 — 허용되는 형식]',
    '❌ 금지: "걱정되시죠?", "궁금하시죠?" (직접 질문)',
    '✅ 허용:',
    '- 환자 심정 명명: "이런 증상이 반복되면 신경이 쓰일 수밖에 없습니다."',
    '- 환자 질문 인용: "가장 많이 받는 질문이 이것입니다: \'꼭 해야 하나요?\' 답은 상황에 따릅니다."',
    '- 진료 장면 재현: "어제도 환자분이 \'지금 안 해도 괜찮나?\'라고 물으셨어요."',
    '- 결론 선제공: "많은 분들이 이 선택을 합니다. 이유는 간단해요."',
    '',
    '[문체 — 사람처럼 쓰기]',
    '- 어미 변주: 기계적 순환(A→B→C→A) 금지. 문장의 의미에 따라 자연스럽게 선택:',
    '  · 사실 전달: "~입니다", "~됩니다"',
    '  · 부연 설명: "~거든요", "~는데요"',
    '  · 강조/결론: "~합니다", "~이에요"',
    '  · 경험/체감: "~더라고요", "~편이에요"',
    '  같은 어미 2회 연속 금지. 단, 의도적 반복(강조)은 허용.',
    '- 문장 길이 혼합: 40자+ 긴 문장과 10~15자 짧은 문장을 불규칙하게 섞기. 3:1 비율이 아닌 자연스러운 리듬으로.',
    '- 감각 표현: "찌릿한", "욱신거리는", "뻣뻣한", "시큰거리는", "뻐근한", "화끈거리는" — 이 중 글 주제에 맞는 것만 사용. 무관한 감각어 억지 삽입 금지.',
    '- 구체적 숫자: "오래" → "약 3~6개월", "여러 번" → "5~10회". 단, 확인 불가능한 수치를 지어내지 말 것.',
    '- 수식어 삭제: "매우 중요한" → "중요한"',
    '- 문단 연결: 접속부사("또한","그리고") 대신 다음 문단의 첫 문장이 이전 주제를 받아서 시작',
    '',
    '[전문성]',
    '- 왜 중요한지 → 구체적으로 어떻게 → 어떤 장비/기술 → 환자에게 어떤 차이',
    '- 의학 표현: 쉽게 쓰되 틀리면 안 됨. "불편함" → "움직일 때 걸리는 느낌"',
    '',
    '[수치/통계 사용 규칙 — 할루시네이션 방지]',
    '- 확실한 수치만 사용. 지어내지 말 것. 확인 불가능하면 범위로("약 3~6개월") 또는 일반 서술로 대체',
    '- 구체적 통계 인용 시: "~로 보고되고 있다", "~에 따르면" 형태로 출처 암시. 가짜 기관명/논문 생성 금지',
    '- ❌ "건강보험심사평가원 2025년 통계에 따르면 23만 건" (검증 불가 구체 수치)',
    '- ✅ "최근 몇 년간 해당 시술 건수가 꾸준히 증가하는 추세입니다" (일반 서술)',
    '- ✅ "임플란트 5년 생존율은 90% 이상으로 보고되고 있습니다" (검증 가능한 범위 수치)',
    '',
    ...(CATEGORY_DEPTH_GUIDES[req.category] ? [CATEGORY_DEPTH_GUIDES[req.category]] : []),
    // isProstheticTopic / classifyTopicType 은 raw topic/disease 로 판정 — sanitize 후에는
    // 분류 키워드가 사라질 수 있음. 분기 로직은 raw, 프롬프트 삽입은 safe 버전 사용.
    ...(req.category === '치과' && isProstheticTopic(req.topic, req.disease) ? [DENTAL_PROSTHETIC_GUIDE] : []),
    '',
    getTrustedSourcesPromptBlock(req.category),
    '',
    // ── 금지 표현 + 끝맺음 (통합) ──
    '[금지 표현 — AI 탐지 회피]',
    '아래 표현이 1개라도 들어가면 네이버 AI 탐지에 걸립니다:',
    'Tier 1 (절대 금지): "~라고 알려져 있습니다", "일반적으로", "대부분의 경우", "~에 대해 알아보겠습니다", "살펴보겠습니다", "이 글에서는~", "~는 매우 중요합니다", "다양한/여러 가지"',
    'Tier 2 (번역투): "~에 해당합니다", "~에 불과합니다", "~로 인해", "~를 통해", "~에 기인합니다", "~을 야기합니다", "~하는 것이 중요합니다", "~에 의해 발생"',
    'Tier 3 (AI 패턴): "~할 수 있습니다" 연속 2회, "~에 도움이 됩니다" 연속 2회, "이러한", "해당", "상기", "동일한", "상술한"',
    'Tier 4 (접속부사): "또한", "더불어", "아울러", "한편", "나아가", "뿐만 아니라" → 모두 삭제. 내용 흐름으로 대체',
    '한자어 접미사: "~적인", "~적으로" 불필요 시 삭제',
    '딱딱한 단어: 측면/관점/맥락/양상/경향/요인/차원 → 글 전체 2회 이하',
    '번역투: "~하는 것이 중요합니다", "~에 의해 발생" → 직접 서술로 변환',
    '독자 말 걸기 금지 (✕ "걱정되시죠?" ○ "이런 증상이 반복되면 신경이 쓰일 수밖에 없습니다")',
    '"해야", "바랍니다" 금지. 의인화 금지.',
    '끝맺음 연속 금지: 같은 어미("~좋습니다", "~해야 합니다", "~할 수 있습니다") 2회 연속 사용 금지. "~됩니다/~이에요/~거든요/~합니다" 자연스럽게 섞기.',
    '',
    // ── 태그 + 출력 (1곳에 통합) ──
    '[출력 규칙]',
    '순수 HTML만 사용 (<h3>, <p>, <strong>, <em>). <h1>/<h2>/마크다운/JSON/코드블록 금지.',
    '<h3>으로 소제목, <p>로 문단.',
    '',
    volumeDesign,
  ].filter(Boolean).join('\n');

  const promptParts: string[] = [];

  // ── 계절 컨텍스트 ──
  const seasonalCtx = getSeasonalContext(req.category);
  if (seasonalCtx) promptParts.push(seasonalCtx, '');

  // ── 작성 요청 ──
  promptParts.push(
    '한국 병·의원 네이버 블로그용 의료 콘텐츠를 작성하세요.',
    '',
    '[작성 요청]',
    `- 진료과: ${req.category}`,
    `- 주제(글의 방향): ${safeTopic}`,
    ...(safeBlogTitle && safeBlogTitle !== safeTopic ? [`- 블로그 제목: ${safeBlogTitle}`] : []),
    `- SEO 키워드: ${safeKeywords || '없음'}`,
  );

  if (safeDisease) {
    promptParts.push(`- 질환(글의 핵심 주제): ${safeDisease}`);
  }
  if (safeHospitalName) {
    if (req.includeHospitalIntro) {
      promptParts.push(`- 병원명: ${safeHospitalName} (병원 소개 섹션에서만 사용)`);
    } else {
      promptParts.push(`- 병원명: ${safeHospitalName}`);
      promptParts.push(`⚠️ 병원 소개 섹션이 비활성화되어 있으므로, 본문에 "${safeHospitalName}" 병원명을 직접 언급하지 마세요. 병원명 없이 일반적인 정보 글로 작성하세요.`);
    }
  }

  // ── 환자 페르소나 타겟팅 ──
  if (safePatientPersona) {
    promptParts.push(
      '',
      '[타겟 환자 페르소나]',
      `이 글의 주요 독자: ${safePatientPersona}`,
      '→ 이 독자가 가장 궁금해할 정보를 우선 배치하세요.',
      '→ 이 독자의 언어 수준과 관심사에 맞춰 설명 깊이를 조절하세요.',
      '→ 이 독자가 공감할 수 있는 상황/사례를 도입부나 본문에 반영하세요.',
    );
  }

  // ── 병원 홈페이지/블로그 분석 결과 ──
  // clinicContext 는 clinicContextService 가 크롤링·분석해서 만든 2차 사용자 데이터.
  // 각 배열 요소가 프롬프트에 그대로 흘러가므로 sanitize 필요.
  if (req.clinicContext) {
    const ctx = req.clinicContext;
    const safeJoin = (arr: string[] | undefined) =>
      (arr || []).map(s => sanitizePromptInput(s, 200)).filter(Boolean).join(', ');
    const safeServices = safeJoin(ctx.actualServices);
    const safeSpecialties = safeJoin(ctx.specialties);
    const safeLocationSignals = safeJoin(ctx.locationSignals);
    const ctxParts: string[] = ['', '[병원 실제 정보 (홈페이지/블로그 분석 결과)]'];
    if (safeServices) {
      ctxParts.push(`- 실제 제공 서비스: ${safeServices}`);
    }
    if (safeSpecialties) {
      ctxParts.push(`- 특화/차별화 진료: ${safeSpecialties}`);
    }
    if (safeLocationSignals) {
      ctxParts.push(`- 주변 지역: ${safeLocationSignals}`);
    }
    ctxParts.push(`→ 위 정보 중 현재 글의 주제("${safeTopic}")와 관련 있는 정보만 참고하세요.`);
    ctxParts.push('→ 주제와 무관한 시술, 장비, 서비스 정보는 절대 포함하지 마세요.');
    ctxParts.push('→ 없는 서비스를 언급하지 마세요.');
    ctxParts.push('');
    ctxParts.push('[차별화 — 이 병원만의 글로 만들기]');
    ctxParts.push('→ 위 병원 정보(특화 진료, 장비, 지역)를 본문에 자연스럽게 녹여서 이 병원에서만 나올 수 있는 글로 만드세요.');
    ctxParts.push('→ 다른 병원 블로그에 그대로 복사해도 어색하지 않은 범용 글은 실패입니다.');
    ctxParts.push('→ 최소 2곳 이상에서 이 병원의 고유 정보(지역명, 장비명, 특화 시술)를 언급하세요.');
    promptParts.push(...ctxParts);
  }

  promptParts.push(
    `- 이미지: ${targetImageCount}장`,
    `- 목표 글자 수: 위 분량 설계 참고`,
  );

  // ── 글 구조 ──
  promptParts.push(
    '',
    '[글 전체 구조]',
    '- 도입부: 2문단 (<p>만, <h3> 없음)',
    '  · 1문단: 일상 장면/상황 (2~3문장, 구체적 감각)',
    '  · 2문단: 검색 의도 브릿지 (1~2문장)',
    '  ⚠️ 금지: "~이란", "~에 대해", "알아보겠습니다", 질환명으로 시작, 여러 상황 나열',
    '[도입부 10가지 패턴 — 주제에 가장 맞는 것을 골라 쓰세요. 매번 다른 패턴 사용.]',
    'A. 일상 장면형: "아이스 아메리카노를 한 모금 마셨는데 왼쪽 어금니가 찌릿합니다."',
    'B. 시간 경과형: "처음엔 양치할 때만 피가 났습니다. 요즘은 사과를 베어 물어도 잇몸에서 피가 비칩니다."',
    'C. 오해 반전형: "잇몸이 아프면 대부분 잇몸병이라고 생각합니다. 하지만 원인이 치아 뿌리에 있는 경우가 적지 않습니다."',
    'D. 계절 연결형: "환절기가 되면 피부가 유독 예민해집니다. 평소 화장품에도 빨갛게 반응합니다."',
    'E. 수치 시작형: "국내 65세 이상 임플란트 시술 건수는 해마다 증가하고 있습니다."',
    'F. 원장 인사형: "안녕하세요, {주제와 어울리는 수식어}하는 {병원명}의 대표원장입니다."',
    'G. 비교 대조형: "같은 증상인데 치료 방법은 다릅니다. 처음 시작이 어디인지에 따라 갈립니다."',
    'H. 환자 대화형: "진료실에서 가장 많이 듣는 질문이 있습니다. \'이거 꼭 해야 하나요?\'입니다."',
    'I. 생활 습관형: "매일 아침 커피 한 잔, 점심 후 양치 건너뛰기. 사소한 습관이 치아에 흔적을 남깁니다."',
    'J. 검색 의도 직격형: "\'논산 임플란트 비용\'을 검색하셨다면, 아마 이런 상황일 겁니다."',
    '   · 수식어는 매번 글 주제에 맞게 달라야 합니다. 절대 같은 표현 반복 금지!',
    '   · 좋은 예: "건강한 미소를 지켜드리는", "편안한 진료를 약속드리는", "치아 건강의 든든한 동반자"',
    '   · 나쁜 예: "최고의 진료를 하는" (과장), "가장 좋은" (최상급 금지)',
    '   · 인사 후 바로 주제 연결: "오늘은 ~에 대해 이야기해보려고 합니다."',
    ...(req.persona === 'director_1st' && safeHospitalName
      ? [`⚠️ 이 글은 대표원장 1인칭이므로 반드시 F(원장 인사형)으로 시작하세요. 병원명: "${safeHospitalName}"`]
      : topicType === 'symptom' ? ['⚠️ 증상 주제 → A(일상 장면형) 또는 B(시간 경과형) 권장.']
      : topicType === 'compare' ? ['⚠️ 비교 주제 → C(오해 반전형) 또는 E(수치 시작형) 권장.']
      : topicType === 'aftercare' ? ['⚠️ 관리 주제 → B(시간 경과형) 권장. 시술 직후 장면부터 시작.']
      : topicType === 'qna' ? ['⚠️ Q&A 주제 → A(일상 장면형) 또는 E(수치 시작형) 권장.']
      : ['⚠️ 주제에 맞는 패턴을 A~E 중 선택하세요. 증상 없는 주제에 A/B를 억지로 쓰지 마세요.']),
    '❌ 금지하는 첫 문장: "~를 찾는 분들이 많습니다", "~에 대해 알아보겠습니다", "~가 궁금하신 분들을 위해", "요즘 ~가 유행입니다"',
    '✅ 구체적 상황이나 수치로 시작: "임플란트 5년 생존율은 95%입니다" 또는 "수술 다음 날 거즈를 언제 빼야 할지 고민되셨나요?"',
    `- 본문: <h3> 소제목 최소 4개 (${subheadingGuide} 권장). 각 소제목 아래 2~3문단`,
    '- 소제목: 검색형 구어체 10~25자. 예: "찬 물만 마시면 이가 시린 이유"',
    '- 흐름: 각 소제목의 마지막 문장이 다음 소제목의 핵심 단어를 포함하며 연결. 예: "그래서 관리 방법이 중요합니다." (다음 소제목: "시술 후 관리")',
    `- ${topicFlowGuide}`,
    '',
    '[마무리 3가지 패턴 — 매번 다른 패턴 사용]',
    'A. 핵심 요약: "잇몸 출혈이 2주 이상 계속되면 치주염 초기를 의심. 가까운 치과에서 치주 검사를 받아보시는 것도 방법입니다."',
    'B. 환자 정리: "정리하면, 찬 것에만 시리면 초기, 뜨거운 것에도 반응하면 신경 근처 진행. 1주일 이상 지속 시 검사를 미루지 않는 편이 좋습니다."',
    'C. 다음 단계: "먼저 파노라마 촬영으로 전체 치아 상태를 확인하는 것부터 시작해보시기 바랍니다."',
    '',
    '[체크리스트]',
    '□ 태그 규칙 준수 (h3만, h1/h2/마크다운 없음)',
    '□ 소제목 4개 이상, 각 아래 <p> 2개+',
    '□ 마무리 섹션 있음',
    `□ 분량 설계 범위 내 (${range.min}~${range.max}자)`,
  );

  // ── 키워드 규칙 ──
  const kwDensity = req.keywordDensity;
  const kwCountGuide = kwDensity === 'auto' || kwDensity === undefined
    ? `본문에 5~8회 분산. 도입부(첫 2문장) 금지. 소제목에 1~2회 + 각 섹션 본문에 1회씩. 같은 문장에 2회 금지. 문맥상 자연스러운 위치에만`
    : `본문에 정확히 ${kwDensity}회. 도입부 금지. 소제목에 ${Math.ceil(Number(kwDensity) / 4)}회 + 본문에 나머지. 같은 문단에 2회 금지. 문맥에 맞게`;

  if (safeDisease && safeKeywords) {
    promptParts.push(
      '',
      `[키워드·질환 역할 분리]`,
      `SEO 키워드: "${safeKeywords}" / 질환: "${safeDisease}"`,
      `→ 키워드는 SEO용 — ${kwCountGuide}. 질환이 글의 실제 주제. 다른 질환명 추가 금지.`,
    );
  } else if (safeKeywords) {
    promptParts.push(
      '',
      `[키워드]`,
      `"${safeKeywords}" - ${kwCountGuide}. 도입부 첫 2문장에서는 금지. 다른 질환명 추가 금지.`,
    );
  }

  // ── 사용자 지정 소제목 ──
  if (safeCustomSubheadings) {
    promptParts.push(
      '',
      '[사용자 지정 소제목 - 반드시 이 소제목 사용]',
      safeCustomSubheadings,
    );
  }

  // ── 병원 특장점 ──
  if (safeHospitalStrengths) {
    promptParts.push(
      '',
      '[병원 특장점 — 등록된 정보]',
      safeHospitalStrengths,
      '→ 위 특장점 중 글의 주제와 연관 있는 부분만 자연스럽게 반영.',
      '→ 주제와 무관한 특장점은 언급하지 마세요.',
      '→ 나열하지 말고 본문 흐름에 녹여서 서술.',
    );
  }

  // ── 임상 이미지 분석 결과 ──
  if (safeClinicalContext) {
    promptParts.push(
      '',
      '[임상 이미지 분석 결과 — 참고 자료]',
      '아래는 업로드된 임상/시술 이미지를 AI가 분석한 결과입니다.',
      '이 내용을 바탕으로 정확하고 구체적인 블로그 글을 작성하세요.',
      '분석 결과에 언급된 시술/장비/상태를 본문 최소 3곳 이상에서 구체적으로 언급하세요. 분석에 없는 정보는 추가 금지.',
      '', safeClinicalContext,
    );
  }

  // ── 유튜브 자막 참고 ──
  if (safeYoutubeTranscript) {
    const trimmed = safeYoutubeTranscript;
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
      '⚠️ FAQ 질문은 실제 환자가 진료실에서 묻는 질문 기반으로:',
      '- 실제 환자가 검색할 법한 구어체 질문 ("~해도 되나요?", "~얼마나 걸리나요?")',
      '- 질문에 핵심 키워드 포함 (검색 노출용)',
      '- 답변은 2~3문장으로 명확하게 (네이버 AI 요약에 잡히는 길이)',
      `형식:
<div class="faq-section"><h3>💬 자주 묻는 질문</h3>
<p class="faq-q">Q. 질문내용</p>
<p class="faq-a">A. 답변내용</p>
</div>`,
    );
  }

  // ── 병원 소개 섹션 ──
  if (req.includeHospitalIntro && req.clinicContext) {
    const ctx = req.clinicContext;
    const safeJoin = (arr: string[] | undefined) =>
      (arr || []).map(s => sanitizePromptInput(s, 200)).filter(Boolean).join(', ');
    const svc = safeJoin(ctx.actualServices);
    const spec = safeJoin(ctx.specialties);
    const loc = safeJoin(ctx.locationSignals);
    promptParts.push(
      '',
      '[병원 소개 섹션 - 글 마지막에 삽입]',
      '마무리 섹션 바로 앞에 <h3>병원 소개</h3> 소제목을 추가하고, 아래 정보를 자연스럽게 2~3문단으로 작성하세요.',
      svc ? `- 진료 서비스: ${svc}` : '',
      spec ? `- 특화 진료: ${spec}` : '',
      loc ? `- 위치: ${loc}` : '',
      '- 병원 소개는 광고가 아닌 정보 전달 톤으로 작성. 의료법 준수.',
    );
  }

  // ── HTML 구조 + 이미지 마커 (old 동일) ──
  promptParts.push(
    '',
    `[HTML 구조] - 이미지 ${targetImageCount}장 기준`,
    buildHtmlTemplate(targetImageCount),
    '',
    '[이미지 마커에 alt 텍스트 필수]',
    '- 마커 형식: [IMG_N alt="설명"] (예: [IMG_1 alt="임플란트 시술 후 관리하는 모습"])',
    '- alt에 SEO 키워드 + 장면 설명을 한국어로 포함',
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
      '- ⚠️ 이미지 프롬프트는 반드시 영어(English)로 작성. 이미지 생성 AI가 영어를 가장 정확하게 이해합니다.',
      '- 사람이 등장할 경우 반드시 "Korean" 명시 (예: "Korean woman", "Korean male dentist")',
      '- 모든 프롬프트 마지막에 "no text, no watermark, no logo" 포함',
      '',
      '[이미지 프롬프트 작성 규칙 — AI티 방지]',
      '- 각 프롬프트는 최소 40 English words, 구체적인 장면 묘사 필수',
      '- 반드시 포함: 장소(where), 인물(who, how many, expression), 동작(doing what), 소품(surrounding objects), 분위기(lighting, color)',
      '- Bad: "dental consultation scene" (너무 짧음)',
      '- Good: "A bright dental clinic near a large window, a 30-year-old Korean female patient sitting in the dental chair looking at an X-ray on the monitor with a Korean male dentist explaining calmly. Dental instruments on the desk, natural daylight streaming in, warm color tone. eye-level shot. no text, no watermark, no logo"',
      '',
      '[카메라 시점]',
      '- 거울 장면: over-the-shoulder mandatory. No frontal shots.',
      '- 모든 이미지에 카메라 위치 명시 (eye-level, slightly elevated, over-the-shoulder)',
      '- No direct eye contact with camera',
      '',
      '[이미지 프롬프트 금지] 모든 프롬프트에 "no text, no watermark, no logo" 필수.',
      '프롬프트에 병원 이름이나 고유명사 포함 금지.',
      '',
      ...(CATEGORY_IMAGE_GUIDES[req.category] ? [CATEGORY_IMAGE_GUIDES[req.category]] : []),
      '',
      '[이미지-본문 매칭 규칙]',
      '- 각 [IMG_N] 위치의 이미지 프롬프트는 바로 위/아래 문단의 주제를 시각적 장면으로 표현',
      '- 이미지 순서: 본문 흐름과 동일하게 (도입→증상→원인→관리)',
      '- 각 이미지가 서로 다른 장면이어야 합니다 (비슷한 포즈/배경 반복 금지)',
    );

    if (safeCustomImagePrompt) {
      promptParts.push(
        '',
        `[커스텀 스타일 필수 적용]`,
        `사용자가 "${safeCustomImagePrompt}" 스타일을 요청했습니다.`,
        `모든 이미지 프롬프트에 이 스타일 키워드를 반드시 포함하세요.`,
      );
    }
  }

  // ── 출력 형식 ──
  if (targetImageCount > 0) {
    promptParts.push(
      '',
      '⚠️ [출력 순서 — 반드시 지키세요]',
      '',
      '1단계: 글 골격을 먼저 출력하세요:',
      '---OUTLINE---',
      '소제목 1: (제목)',
      '소제목 2: (제목)',
      '... (전체 소제목 목록, 각 1줄)',
      '',
      '2단계: 골격에 맞는 이미지 프롬프트를 출력하세요:',
      '---IMAGE_PROMPTS---',
      `[정확히 ${targetImageCount}줄, 한 줄에 하나씩, 반드시 영어(English)로 작성]`,
      '각 프롬프트는 해당 [IMG_N] 위치 소제목의 맥락에 맞는 장면 묘사',
      '',
      '3단계: HTML 블로그 본문을 작성하세요:',
      '---BLOG_START---',
      '(여기부터 HTML 본문)',
      `본문 안에 [IMG_1]~[IMG_${targetImageCount}] 마커를 위 구조대로 배치하세요.`,
    );
  } else {
    promptParts.push(
      '',
      '[출력 형식]',
      '1. HTML 본문을 작성하세요. 이미지 마커 없이.',
    );
  }

  promptParts.push(
    '',
    '[CTA(행동 유도) 가이드]',
    '- 마무리 문단에 자연스러운 행동 유도 1문장 포함',
    '- 예: "정기 검진으로 미리 관리하시는 것을 권합니다" (부드러운 권유)',
    '- ❌ "지금 바로 예약하세요!" (과도한 광고)',
    '- ❌ "전화주세요" (직접 영업)',
    '',
    '본문 마지막에 참고 출처 블록 추가:',
    '<div class="references-footer" data-no-copy="true"><p><strong>참고 자료</strong></p><ul><li>기관명 — 정보 주제</li></ul></div>',
    '',
    '[출처 규칙 — 할루시네이션 방지]',
    '- 2~4개만. 실제 존재하는 기관만 (가짜 기관명 생성 금지)',
    '- ❌ 구체 연도/가이드라인명 금지: "대한치과의사협회 2024년 가이드" (존재 여부 불확실)',
    '- ❌ 구체 통계 수치 인용 금지: "23만 건 시행" (검증 불가)',
    '- ✅ 일반적 주제만: "국민건강보험공단 — 임플란트 보험 기준"',
    '- ✅ 검증 가능한 것만: "서울대학교병원 건강정보 — 임플란트 주의사항"',
    '- URL 금지. 기관명+주제만.',
    '',
    '출처 블록 다음에 자가평가 점수를 붙이세요:',
    '',
    '---SCORES---',
    '{"seo": [0~100 점수], "medical": [0~100 점수], "conversion": [0~100 점수]}',
    '⚠️ 점수는 반드시 0~100 범위의 정수!',
  );

  return {
    systemInstruction,
    prompt: promptParts.join('\n'),
  };
}

// ── 소제목 재생성 프롬프트 ──

interface SectionRegenerateInput {
  sectionTitle: string;
  sectionHtml: string;
  sectionType: 'intro' | 'section' | 'conclusion';
  fullContext: string;
  category: string;
  persona: string;
  tone: string;
  audienceMode: string;
  writingStyle: string;
  keywords: string;
  disease?: string;
  medicalLawMode: 'strict' | 'relaxed';
}

export function buildSectionRegeneratePrompt(input: SectionRegenerateInput): {
  systemInstruction: string;
  prompt: string;
} {
  // 프롬프트 인젝션 방어 — 사용자 입력은 전부 sanitize 한 지역 변수로 사용.
  const safeSectionTitle = sanitizePromptInput(input.sectionTitle, 200);
  const safeKeywords = sanitizePromptInput(input.keywords, 300);
  const safeDisease = sanitizePromptInput(input.disease, 100);
  const safeCategory = sanitizePromptInput(input.category, 50);
  const safeSectionHtml = sanitizeSourceContent(input.sectionHtml, 10000);
  const safeFullContext = sanitizeSourceContent(input.fullContext, 15000);

  const personaGuide = PERSONA_GUIDES[input.persona] || PERSONA_GUIDES.hospital_info;
  const audienceGuide = AUDIENCE_GUIDES[input.audienceMode] || AUDIENCE_GUIDES['환자용(친절/공감)'];
  const toneGuide = TONE_GUIDES[input.tone] || TONE_GUIDES.warm;
  const styleGuide = STYLE_GUIDES[input.writingStyle || 'empathy'] || '';
  const medLawNote = getMedicalLawPromptBlock(input.medicalLawMode !== 'relaxed');
  const categoryGuide = CATEGORY_DEPTH_GUIDES[input.category] || '';

  const systemInstruction = [
    '[최상위 원칙] 쉽고 짧게 직접 말한다',
    '1. 짧게 쓴다. 한 문장 50자 이내 권장',
    '2. 직접 말한다. 돌려 말하지 않는다',
    '3. 쉬운 말을 쓴다',
    '',
    personaGuide,
    audienceGuide,
    `글의 어조: ${toneGuide}`,
    styleGuide,
    '',
    medLawNote,
    '',
    '[문체 — 사람처럼 쓰기]',
    '- 같은 어미 3연속 금지',
    '- 긴 문장 → 짧은 문장 교차',
    '- 감각 표현 포함: "찌릿한", "욱신거리는", "뻣뻣한"',
    '- 구체적 숫자: "오래" → "약 3~6개월"',
    '- 수식어 삭제: "매우 중요한" → "중요한"',
    '',
    '[금지 표현]',
    'AI 느낌: "~라고 알려져 있습니다", "일반적으로", "~에 대해 알아보겠습니다", "~는 매우 중요합니다"',
    '접속부사: "또한", "더불어", "아울러" → 내용 흐름으로 대체',
    '끝맺음 연속 금지: 같은 어미 2회 연속 사용 금지.',
    '',
    categoryGuide,
    '',
    '[출력 규칙]',
    '순수 HTML만 사용 (<h3>, <p>, <strong>, <em>). 마크다운/JSON/코드블록 금지.',
  ].filter(Boolean).join('\n');

  const prompt = [
    `[미션] 아래 소제목 섹션만 새로 작성. 나머지 글과의 톤·흐름 유지.`,
    '',
    `[진료과] ${safeCategory}`,
    safeDisease ? `[질환] ${safeDisease}` : '',
    safeKeywords ? `[SEO 키워드] ${safeKeywords} — 재작성 본문에도 자연스럽게 1~2회 포함` : '',
    '',
    `[소제목] ${safeSectionTitle}`,
    `[현재 내용]`,
    safeSectionHtml,
    '',
    `[전체 글 맥락 (참고용 — 이 부분을 수정하는 것이 아닙니다)]`,
    safeFullContext,
    '',
    '[재작성 방향]',
    '- 같은 주제를 다루되, 아래 중 하나 이상을 변경:',
    '  · 더 구체적인 수치/사례 추가 (기존에 없던 정보)',
    '  · 문단 순서나 논리 구조 변경 (원인→증상 대신 증상→원인)',
    '  · 환자 체감 중심으로 서술 각도 전환',
    '- 기존 문장을 단순히 어순만 바꾸는 것은 금지. 새로운 정보나 관점이 있어야 합니다.',
    '- 2~3문단 유지. 문단당 3~4문장.',
    '',
    `[출력] ${input.sectionType === 'intro' ? '<p>부터 시작하는 도입부 HTML만 출력.' : `<h3>${safeSectionTitle}</h3>부터 시작하는 HTML만 출력.`}`,
    'HTML만 출력하세요. 설명, 주석, 코드블록 금지.',
  ].filter(Boolean).join('\n');

  return { systemInstruction, prompt };
}
