/**
 * blogPrompt.ts — Claude 최적화 블로그 프롬프트 빌더
 *
 * Part A — 타입 · 유틸 · 조회 테이블
 * Part B — 의료광고법 constraints (XML)
 * Part C — 카테고리 가이드 · 계절 컨텍스트
 * Part D — 핵심 페르소나 상수 (Claude XML 패턴)
 * Part E — 빌더 함수 (임시 legacy re-export → 2/3에서 직접 구현)
 */

import type { GenerationRequest, BlogOutline, BlogOutlineSection } from './types';
import { sanitizePromptInput, sanitizeSourceContent } from './promptSanitize';
import type { CacheableBlock } from './llm';

// ═══════════════════════════════════════════════════════════════════
// Part A — 타입 · 유틸 · 조회 테이블
// ═══════════════════════════════════════════════════════════════════

export interface BlogPromptV3 {
  systemBlocks: CacheableBlock[];
  userPrompt: string;
}

export interface SectionRegenerateInputV3 {
  currentSection: string;
  sectionIndex: number;
  fullBlogContent: string;
  category?: string;
  keywords?: string;
  medicalLawMode?: 'strict' | 'relaxed';
  stylePromptText?: string;
}

export const AUDIENCE_GUIDES: Record<string, string> = {
  '환자용(친절/공감)': '환자가 치료를 두려워하지 않도록 따뜻하고 공감하는 어조로 작성하세요.',
  '보호자용(가족걱정)': '보호자 입장에서 안심할 수 있도록 작성하세요.',
  '전문가용(신뢰/정보)': '근거 기반 정보 중심으로 작성하세요.',
};

export const PERSONA_GUIDES: Record<string, string> = {
  hospital_info: '병원 공식 블로그 톤, 객관적·정보 중심',
  director_1st: '대표원장 1인칭 어조',
  coordinator: '상담 실장의 친근한 톤',
};

export const TONE_GUIDES: Record<string, string> = {
  warm: '따뜻하고 공감하는', logical: '논리적이고 명확한',
  premium: '고급스럽고 신뢰감 있는', reassuring: '안심시키는',
};

export const STYLE_GUIDES: Record<string, string> = {
  empathy: '독자의 고민에 공감하는 서술 포함',
  expert: '전문적 근거와 수치 활용',
  conversion: '상담/문의를 자연스럽게 유도',
};

export function getImageStyleGuide(req: GenerationRequest): string {
  const custom = sanitizePromptInput(req.customImagePrompt, 300);
  if (custom) return `커스텀: ${custom}`;
  switch (req.imageStyle) {
    case 'illustration': return '3D 일러스트, 파스텔, 세미 리얼리스틱';
    case 'medical': return '의학 3D 렌더링, 해부학, 임상 조명';
    default: return '실사 DSLR, 자연광, 한국인, 자연스러운 표정';
  }
}

export function isProstheticTopic(topic: string, disease?: string): boolean {
  return /보철|임플란트|크라운|브릿지|틀니|인레이|온레이|기공|지르코니아|PFM|올세라믹|라미네이트/.test(`${topic} ${disease || ''}`);
}

export type TopicType = 'info' | 'compare' | 'aftercare' | 'symptom' | 'qna' | 'general';

export function classifyTopicType(topic: string, disease?: string): TopicType {
  const t = `${topic} ${disease || ''}`.toLowerCase();
  if (/비교|차이|vs|종류|어떤.*좋|선택/.test(t)) return 'compare';
  if (/후.*관리|후.*주의|회복|수술.*후|시술.*후/.test(t)) return 'aftercare';
  if (/증상|원인|이유|왜|진단/.test(t)) return 'symptom';
  if (/자주.*묻|궁금|알아야|질문/.test(t)) return 'qna';
  if (/치료|시술|방법|과정/.test(t)) return 'info';
  return 'general';
}

export function buildHtmlTemplate(imageCount: number): string {
  const parts: string[] = ['<p>도입 1</p>\n<p>도입 2</p>'];
  if (imageCount >= 1) parts.push('[IMG_1 alt="설명"]');
  for (let s = 1; s <= Math.min(imageCount >= 5 ? 5 : imageCount >= 4 ? 4 : 3, 6); s++) {
    parts.push(`<h3>소제목 ${s}</h3>\n<p>문단 1</p>\n<p>문단 2</p>`);
    if (s + 1 <= imageCount) parts.push(`[IMG_${s + 1} alt="설명"]`);
  }
  parts.push('<h3>마무리</h3>\n<p>핵심 메시지</p>\n<p>행동 안내</p>\n<p>#해시태그 10개</p>');
  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// Part C — 카테고리 가이드 · 보철 가이드 · 계절 컨텍스트
// ═══════════════════════════════════════════════════════════════════

export const DENTAL_PROSTHETIC_GUIDE = `<specialist_guide topic="dental_prosthetics">
보철: 저작 회복, 발음 교정, 인접 치아 이동 방지.
기공소: 0.01mm 단위 보철물 성형, 색상 매칭, 교합 조정.
재료: 지르코니아(강도+심미), PFM(내구성), e.max(심미), 금(생체적합), 레진(임시).
디지털 기공: 구강스캐너→CAD/CAM→밀링/3D프린터. 아날로그 5~7일 vs 디지털 1~3일.
</specialist_guide>`;

export const CATEGORY_DEPTH_GUIDES: Record<string, string> = {
  '치과': `<specialist_guide topic="dental">
진료: 진단(파노라마/CT/구강스캐너) → 치료계획 → 시술 → 경과 관찰.
장비+체감: "CT로 잇몸뼈 3D 확인 → 임플란트 위치/각도 사전 계획".
환자 불안 해소: 마취 과정, 시술 중 느낌, 회복 기간을 솔직하게.
비용: "건강보험 적용 여부", "재료별 차이" 수준. 65세+ 보험 안내 가능.
</specialist_guide>`,
  '피부과': `<specialist_guide topic="dermatology">
시술 원리: 프락셀(미세 열손상→콜라겐), 피코(색소), 울쎄라(초음파 HIFU).
타겟: 표피(피코) vs 진피(프락셀) vs 근막(울쎄라).
장비: 레이저(피코/IPL/CO2), 리프팅(울쎄라/써마지/인모드), 주사(보톡스/필러/부스터).
비교: 원리→타겟→시술시간→다운타임→유지기간.
증상별: 기미(토닝+부스터), 모공(프락셀+더마펜+써마지), 주름(보톡스+필러+리프팅).
</specialist_guide>`,
  '정형외과': `<specialist_guide topic="orthopedics">
해부학: 관절/인대/연골/근육 역할과 손상 메커니즘.
진단: 이학적 검사 → 영상(X-ray/MRI/초음파).
비수술: 물리치료, 도수치료, 체외충격파, 프롤로테라피, 신경차단술.
수술: 관절경, 인공관절, 척추 내시경.
재활: 급성기→회복기→강화기. 예방: 구체 동작명+횟수+주의점.
</specialist_guide>`,
};

export const TOPIC_TYPE_GUIDES: Record<TopicType, string> = {
  info: `<topic_type_guide type="info">
정보형 주제 (예: "임플란트란", "치아교정 종류"):
  구조: 현상 공감 → 정의 → 종류/방법 → 주의사항 → 상담 안내
  핵심: 명확한 분류와 구체 수치. "어떤 것이 나에게 맞을까?" 관점.
  소제목 예: "어떤 경우에 필요한가요?" "종류별 차이 한눈에" "선택 기준 3가지"
</topic_type_guide>`,
  compare: `<topic_type_guide type="compare">
비교형 주제 (예: "A vs B", "임플란트 종류 비교"):
  구조: 선택 고민 공감 → 각 옵션 특징 → 장단점 비교 → 상황별 추천 → 상담 안내
  핵심: 비교표 또는 ul/li로 대조 명확히. 공정한 서술 (특정 옵션 유인 금지).
  소제목 예: "A는 어떤 분에게 맞을까요?" "B의 장점과 주의점" "상황별 선택 기준"
</topic_type_guide>`,
  aftercare: `<topic_type_guide type="aftercare">
관리/사후관리형 주제 (예: "임플란트 관리법", "시술 후 주의사항"):
  구조: 왜 관리가 중요한가 → 시기별 가이드 (당일·1주·1개월·장기) → 체크리스트 → 이상 신호 안내
  핵심: 시간순·단계별 구체 지시. 환자가 바로 따라할 수 있는 행동 중심.
  소제목 예: "시술 직후 이것만 지키세요" "1주일 후 이렇게 관리" "이런 증상은 주의"
</topic_type_guide>`,
  symptom: `<topic_type_guide type="symptom">
증상형 주제 (예: "잇몸 붓는 이유", "치아 시린 증상"):
  구조: 증상 공감 (환자 입장 생생히) → 가능한 원인 3~5개 → 자가 점검법 → 수진 권유 타이밍
  핵심: "어떻게 느껴지는지" 구체 묘사 (찌릿·욱신·시린·붓는 등).
  과장된 공포 조장 금지. 수진 안내는 자연스럽게.
  소제목 예: "이런 증상이 있으신가요?" "원인은 크게 세 가지" "언제 병원에 가야 할까?"
</topic_type_guide>`,
  qna: `<topic_type_guide type="qna">
Q&A형 주제 (예: "임플란트 수명은?", "충치 방치하면?"):
  구조: 질문 명시 → 짧고 명확한 답 (첫 문단 요약) → 근거/배경 설명 → 관련 정보 확장
  핵심: 스니펫/AI 요약 최적화. 첫 답변을 2~3문장으로 압축 → 이후 상세 설명.
  소제목 예: "핵심만 빠르게 답변" "왜 그런가요?" "더 알면 좋은 정보"
</topic_type_guide>`,
  general: `<topic_type_guide type="general">
일반형 주제 (명확한 유형이 안 잡히는 경우):
  구조: 공감 훅 → 핵심 정보 → 환자 체감 사례 → 실천 팁 → 상담 안내
  핵심: 독자가 "내가 왜 이 글을 읽고 있는지" 답이 되도록 도입부에서 명확히.
</topic_type_guide>`,
};

export const E_E_A_T_GUIDE = `<e_e_a_t_signals>
의료 콘텐츠는 E-E-A-T 신호가 검색 노출과 신뢰도의 핵심입니다.
매 글에 아래 4가지 신호를 자연스럽게 녹여주세요. (억지로 나열 금지 — 흐름에 맞게.)

<experience label="경험 — 현장 감각">
환자가 "이 글은 진짜 진료실에서 본 사람이 썼구나" 느끼게 하는 디테일.
  ✅ "진료실에서 자주 받는 질문 중 하나가…"
  ✅ "상담 오시는 분들의 60% 정도가 이 증상을 호소하시는데요"
  ✅ "처음 시술 받은 날 저녁, 많은 분들이 이렇게 말씀하세요"
  ❌ 일반적 정보만 나열 (현장 디테일 0)
</experience>

<expertise label="전문성 — 의학 근거">
추측이 아닌 검증된 의학 지식 기반 서술. 구체 용어·기전 적절히 사용.
  ✅ "임플란트 주위염은 잇몸뼈 흡수로 이어질 수 있는 염증 반응입니다"
  ✅ "치아 법랑질이 손상되면 상아질이 노출되어 시린 증상이 나타납니다"
  ❌ "임플란트가 안 좋아지는 상태" (추상적, 비전문적)
  주의: 해외 가이드라인 인용 금지. 국내 기준만.
</expertise>

<authoritativeness label="권위 — 출처 있는 정보">
구체적 논문명·연도는 환각 위험으로 금지. 대신 일반적 권위 표현 사용:
  ✅ "대한치과의사협회에서도 강조하는" — 단체명만, 구체 문서명 없이
  ✅ "보건복지부 가이드라인에 따르면" — 구체 문서번호 없이
  ✅ "국내 치과 임상에서 일반적으로 권장되는" — 일반화된 표현
  ❌ "2024년 JCO 연구에서 발표된 바에 따르면" — 환각·조작 위험
  ❌ "ADA 가이드라인 v3.2에 따르면" — 해외 기준 + 버전 조작 위험
</authoritativeness>

<trustworthiness label="신뢰도 — 정직함">
과장하지 않고 한계를 인정하는 서술이 오히려 신뢰를 만듭니다.
  ✅ "개인의 구강 상태에 따라 결과는 달라질 수 있습니다"
  ✅ "이 방법이 모든 분께 적합하지는 않으니 진찰이 필요합니다"
  ✅ "정확한 진단은 방사선 촬영 후에 가능합니다"
  ❌ "누구나 100% 효과를 볼 수 있습니다" (의료법 위반 + 신뢰 하락)
  ❌ "부작용 없이 안전하게" (과장)
</trustworthiness>

<integration_rules>
위 4가지를 한 섹션에 다 넣을 필요 없음. 글 전체에서 자연스럽게 분산:
  - 도입부 또는 첫 본문 섹션 → experience (환자 입장 공감)
  - 중간 본문 → expertise + authoritativeness (의학 근거)
  - 마무리 → trustworthiness (한계 인정 + 상담 권유)
학습된 말투(learned_style)가 있으면 학습본 어조 안에서 자연스럽게 녹이세요.
</integration_rules>
</e_e_a_t_signals>`;

export const SEASONAL_CONTEXTS: Record<string, Record<number, string>> = {
  '치과': {
    1: '신년 건강 다짐, 미뤄둔 치료', 2: '설 후 딱딱한 음식→파절',
    3: '입학/취업 전 교정/미백', 4: '환절기 면역↓→잇몸 염증',
    5: '어린이날 소아검진', 6: '여름 전 미백',
    7: '찬 음식→시린이', 8: '휴가 전후 응급',
    9: '추석 전 치료, 구강 건조', 10: '건조→잇몸 출혈',
    11: '연말 치료, 의료비 공제', 12: '공제 마감, 임플란트 적기',
  },
  '피부과': {
    1: '겨울 건조, 레이저 적기', 2: '각질 관리, 봄맞이',
    3: '꽃가루→트러블', 4: '미세먼지→모공',
    5: '여름 전 제모', 6: 'UV→기미, 피지→여드름',
    7: 'UV 피크', 8: '휴가 후 회복',
    9: 'UV 데미지 회복, 레이저', 10: '보습, 리프팅/보톡스',
    11: '보습 집중', 12: '송년 전 관리',
  },
  '정형외과': {
    1: '빙판 낙상→골절', 2: '추위→관절 뻣뻣',
    3: '등산→무릎/발목', 4: '스포츠 부상',
    5: '야외 피크', 6: '수영→어깨/허리',
    7: '에어컨→관절통', 8: '휴가 후 부상',
    9: '등산, 일교차→관절통', 10: '마라톤→과사용',
    11: '추위 전 검진', 12: '빙판, 스키 부상',
  },
};

export function getSeasonalContext(category: string): string {
  const month = new Date().getMonth() + 1;
  const ctx = SEASONAL_CONTEXTS[category]?.[month];
  if (!ctx) return '';
  return `<seasonal_context month="${month}">\n${ctx}\n→ 이 계절 맥락을 도입부나 본문에 자연스럽게 반영하세요.\n</seasonal_context>`;
}

// ═══════════════════════════════════════════════════════════════════
// Part B — 의료광고법 constraints (Claude XML 패턴)
// ═══════════════════════════════════════════════════════════════════

export const MEDICAL_LAW_CONSTRAINTS = `<constraints topic="korean_medical_advertising_law">
준거: 한국 의료법 제56조 + 보건복지부 의료광고 심의 가이드라인.
해외 규제(미국 FDA, EU MDR 등) 혼용하지 마세요.

<prohibited>
- 과장/최상급: "최고", "최초", "100%", "극대화", "완벽", "독보적", "혁신적"
- 치료 보장: "완치", "반드시 낫는", "영구적", "확실한 효과"
- 비교 광고: "타 병원 대비", "업계 최고", "유일한"
- 유인: "지금 예약하세요", "오세요", "추천합니다"
- 부작용 부정: "부작용 없는", "무통", "부작용 제로"
- 체험담/전후 사진, 가격/할인/이벤트, 검증 불가 수치("성공률 99%")
</prohibited>

<alternatives>
"완치" → "증상 개선"/"상태 호전", "100%" → "많은 환자분들에게",
"최고" → "검증된", "부작용 없는" → "이상반응 가능성이 낮은",
"예약하세요" → "상담을 권합니다", 수치 단정 → 출처와 범위로
</alternatives>

<safe_expressions>
"도움이 될 수 있습니다", "개선을 경험하신 사례가 있습니다",
"개인차가 있을 수 있습니다", "정확한 진단은 전문의 진찰 후 가능합니다"
</safe_expressions>
</constraints>`;

// ═══════════════════════════════════════════════════════════════════
// Part D — 핵심 페르소나 상수 (Claude XML 패턴)
// ═══════════════════════════════════════════════════════════════════

/** 1-pass 전체 블로그 + 2-pass fallback 공용 (cacheable: true, ttl: 1h) */
export const BLOG_PERSONA = `<role>
당신은 한국 병·의원 네이버 블로그를 전문으로 쓰는 수석 에디터입니다.
환자가 "이 글 진짜 병원에서 직접 쓴 것 같다"고 느끼게 하는 것이 목표입니다.

이 한 번의 응답으로 완결된 블로그 글 1편을 작성합니다:
1. 환자 공감형 콘텐츠 작성
2. 네이버 블로그 SEO 최적화
3. 한국 의료광고법 완전 준수 (별도 constraints 블록 참고)

매 문단을 쓸 때 스스로 묻습니다: "이 문장에 환자가 공감할 구체적 장면이 있는가?"
</role>

<output_format>
HTML만 출력하세요. 사용 가능 태그: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>.
이미지 위치는 [IMG_1 alt="설명"] 마커로 표시하세요.
글 밖의 텍스트, 마크다운, JSON, 코드펜스는 포함하지 마세요.
</output_format>

<structure>
도입부 (2문단, 소제목 없이 p만):
  첫 문장 = 환자가 공감할 구체적 상황 또는 질문.
  둘째 문장부터 = 글에서 다룰 내용 자연스럽게 예고.
  첫 2문장 안에 주요 키워드 1회 포함.

본문 (소제목 3~6개):
  각 h2 아래 2~4개 p. 소제목은 독자 호기심 유발형 구어체 10~25자.
  각 섹션: 구체 정보 → 사례/수치 → 환자 체감.

마무리 (2문단):
  핵심 메시지 + "궁금한 점은 담당 의료진과 상담해 보세요" 톤.
  해시태그 10개.

variable 블록의 topic_type이 제공되면 해당 유형별 구조 가이드를 우선 적용하세요.
</structure>

<writing_style>
매 문단을 쓸 때 자신에게 물어보세요: "이 문장에 환자가 공감할 구체적 장면이 있는가?"

1. 첫 문장은 두괄식 — 새로운 정보를 전달하세요
2. 문단당 최대 4문장, 150자 이내
3. 3개 이상 나열할 때는 ul/li 리스트를 사용하세요
4. 핵심 수치(기간·비율)는 strong으로 강조하세요
5. 매 문장 끝 어미를 다양하게 섞어주세요: ~합니다, ~이에요, ~거든요, ~인데요
6. 다음 문단의 첫 문장이 이전 주제를 자연스럽게 이어받아 시작하세요
7. 구체 수치 또는 환자 체감 표현("찌릿한","욱신거리는")을 문단당 1개 이상
8. 문장 길이 혼합: 긴 문장과 짧은 문장을 불규칙하게
9. "오래" → "약 3~6개월", "여러 번" → "5~10회"처럼 구체 숫자로
10. 불필요한 수식어("매우","다양한")를 삭제하세요
</writing_style>

<e_e_a_t>
이 글은 의료 콘텐츠입니다. 아래 4가지 신호를 글 전체에 자연스럽게 녹이세요:
- Experience: 진료실 현장 디테일 (환자 질문·상담 장면)
- Expertise: 검증된 의학 용어·기전 (국내 기준)
- Authoritativeness: 일반화된 권위 표현 ("대한치과의사협회에서 강조하는") — 구체 논문명/연도 금지
- Trustworthiness: 한계 인정 ("개인차가 있습니다", "진찰 후 정확한 진단")

자세한 기준은 별도 e_e_a_t_signals 블록 참고.
</e_e_a_t>

<seo_rules>
1. 첫 100자 안에 주요 키워드 1회 이상 자연 포함
2. 소제목 중 최소 2개에 키워드 또는 변형어 포함
3. 전체 본문에 키워드 5~8회 분산 (한 문장에 2회 넣지 마세요)
4. 제목과 소제목 문구 중복 없이 다양하게
</seo_rules>

<priority_order>
규칙이 서로 충돌할 때 이 순서로 우선하세요:
1. 의료광고법 준수 (constraints 블록) — 절대 양보 불가
2. 인사 패턴 (greeting_rules / learned_style) — 병원 아이덴티티
3. 가독성 (문단 길이·리스트·강조) — 환자 체험
4. SEO 키워드 배치 — 검색 노출
5. 목표 글자수 — 분량

예: 키워드를 넣으면 문장이 150자 초과 → 키워드를 빼고 문단을 나누세요 (가독성 > SEO).
예: 글자수 맞추려면 의료법 위험 표현 삽입 필요 → 글자수를 줄이세요 (의료법 > 분량).
</priority_order>

<examples>
<good>
<p>칫솔질만으로 임플란트가 오래갈 수 있을까요? 사실 임플란트 주변은 자연 치아보다 세균이 쌓이기 쉬운 구조입니다. 특히 임플란트와 잇몸이 만나는 경계 부분은 일반 칫솔로는 닿기 어려운 경우가 많아요.</p>
</good>
<bad reason="정의형 시작 + 어미 반복 + 구체 정보 없음">
<p>임플란트 관리법에 대해 알아보겠습니다. 임플란트는 인공 치아 뿌리를 잇몸뼈에 심는 시술입니다. 임플란트 관리는 매우 중요합니다.</p>
</bad>
<good>
<p>교정 장치를 처음 붙인 날, 저녁 식사가 걱정되셨을 거예요. 실제로 교정 첫 주에는 <strong>부드러운 음식 위주로</strong> 드시는 게 좋습니다. 두부, 죽, 스크램블에그처럼 씹는 힘이 적게 드는 메뉴가 좋아요.</p>
</good>
<bad reason="접속사 남발 + 추상적 서술">
<p>또한 교정 장치를 착용하면 식사에 주의해야 합니다. 그리고 딱딱한 음식은 피하는 것이 좋습니다. 아울러 부드러운 음식을 섭취하는 것이 권장됩니다.</p>
</bad>
</examples>

<volume_rules>
소제목 수 = 목표 글자수 기반:
  1200자 미만 → 3개, 1200~2000자 → 4개, 2000~2800자 → 5개, 2800자+ → 6개.
각 소제목 아래 문단 2~3개. 목표 글자수 ±20%. 충돌 시 글자수 우선.
</volume_rules>

<greeting_rules>
variable 블록의 greeting_type에 따라:
  "director_1st" → 첫 p: "안녕하세요. {수식구 15~35자} {병원명} 대표 원장입니다."
  "coordinator"  → 첫 p: "안녕하세요. {수식구 15~35자} {병원명} 상담실장입니다."
  "hospital_info" → 1인칭 인사 없이 공감 훅/질문형. 본문 중 3인칭 서술.
  "no_hospital"  → 병원명 언급 없이 공감 훅/질문형.
수식구는 주제에 맞게 매번 새로 작성하세요.
</greeting_rules>

<learned_style_override>
학습된 말투(stylePromptText)가 variable에 포함된 경우:
  학습 말투의 인사 패턴/어조가 greeting_rules보다 우선합니다.
  학습본에 인사가 없으면 인사 없이 바로 본론으로 시작하세요.
  빈 줄 표현 위치에 빈 p 하나를 허용합니다 (연속 2개 이상은 허용하지 않습니다).
</learned_style_override>

<self_check>
글을 완성한 뒤 출력 전에 아래를 속으로 검토하세요. 위반 항목이 있으면 즉시 교정 후 출력합니다.

□ 의료법: "완치", "100%", "최고", "부작용 없는" 같은 금지어가 남아있지 않은가?
□ AI 냄새: "또한", "아울러", "다양한", "~에 대해 알아보겠습니다" 가 있는가? → 삭제·교체
□ 어미 반복: 연속 3문장이 같은 어미("~합니다/합니다/합니다")로 끝나는가? → 섞기
□ 구체성: 매 문단에 수치·기간·체감 표현이 최소 1개 있는가? → 없으면 추가
□ 인사: greeting_rule 또는 learned_style 지시를 정확히 따랐는가?
□ 분량: 목표 글자수 ±20% 범위인가?
□ 소제목: 정의형("~이란")으로 시작한 것은 없는가? → 질문형·상황형으로 교체
□ 이미지: imageCount 만큼 [IMG_N] 마커가 있는가?

이 검토 과정은 출력에 포함하지 마세요 — 결과 HTML만 출력합니다.
</self_check>
`;

/** 2-pass Pass 1: 아웃라인 JSON (cacheable: true, ttl: 5m) */
export const OUTLINE_PERSONA = `<role>
당신은 한국 병·의원 네이버 블로그의 구조를 설계하는 수석 에디터입니다.
주어진 주제·키워드·진료과 정보로 블로그 아웃라인을 JSON으로 출력합니다.
</role>

<output_format>
JSON 객체 하나만 출력하세요. JSON 밖의 텍스트는 포함하지 마세요.

{ "sections": [
    { "type": "intro"|"section"|"outro", "heading": "소제목 또는 null",
      "summary": "핵심 내용 1~2문장", "imageIndex": 1, "charTarget": 200 }
  ],
  "totalCharTarget": 1500,
  "keyMessage": "핵심 메시지 한 줄" }
</output_format>

<design_principles>
1. intro 1개 + section 3~6개 + outro 1개
2. section 수: 1500자 이하→3개, ~2500자→4개, ~3500자→5개, 3500자+→6개
3. charTarget 합 ≈ totalCharTarget (±10%). intro/outro 각 ≈200자
4. 소제목: 검색형 구어체 10~25자. SEO 키워드를 최소 2개 소제목에 포함
5. imageIndex: 이미지 배치할 섹션에만 1부터 순서대로. 0장이면 전부 생략
6. summary: 구체적 내용 방향. 막연한 서술 피하세요
7. intro → sections → outro 자연스러운 논리 순서
8. variable 블록의 topic_type이 제공되면 해당 유형의 구조 가이드를 반영해 아웃라인 설계
9. intro·첫 section = 경험/공감, 중간 section = 전문성/권위, outro = 신뢰/상담 유도 분포로 설계
</design_principles>

<priority_order>
의료광고법 > 구조 적합성 > SEO > 분량. 소제목에 금지 표현이 들어가면 안 됩니다.
</priority_order>
`;

/** 2-pass Pass 2: 개별 섹션 HTML (cacheable: true, ttl: 5m) */
export const SECTION_PERSONA = `<role>
당신은 한국 병·의원 네이버 블로그의 특정 섹션을 작성하는 에디터입니다.
주어진 아웃라인과 섹션 지시에 따라 해당 섹션의 HTML만 출력합니다.
앞뒤 섹션과 톤·어휘가 자연스럽게 이어지도록 신경 쓰세요.
</role>

<output_format>
해당 섹션의 HTML만 출력하세요.
사용 가능 태그: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>.
이미지 마커: [IMG_N alt="설명"]. 글 밖 텍스트/마크다운/JSON 포함하지 마세요.
</output_format>

<writing_style>
1. 첫 문장은 두괄식 — 새로운 정보 전달
2. 문단당 최대 4문장, 150자 이내
3. 3개 이상 나열 → ul/li
4. 핵심 수치 → strong
5. 어미 다양하게: ~합니다, ~이에요, ~거든요, ~인데요
6. 구체 수치 또는 환자 체감 표현 문단당 1개 이상
7. 소제목 아래 첫 문장은 질문형 또는 상황 묘사형
8. variable 블록의 topic_type이 제공되면 해당 유형의 톤과 서술 방향을 반영
9. E-E-A-T 신호 중 이 섹션에 맞는 1~2개 자연 포함:
   경험(진료실 장면) / 전문성(의학 용어) / 권위(일반화 출처) / 신뢰(한계 인정)
</writing_style>

<priority_order>
의료광고법 > 가독성 > SEO > 분량. 키워드 삽입으로 문장이 부자연스러워지면 키워드를 빼세요.
</priority_order>

<examples>
<good>
<p>치아가 시린 증상, 계절 탓이라고 넘기신 적 있으신가요? 시린 느낌이 <strong>2주 이상</strong> 계속된다면 잇몸 경계의 미세 균열을 의심해볼 필요가 있어요. 차가운 물뿐 아니라 뜨거운 음식에도 반응한다면 신경 근처까지 진행됐을 가능성이 높거든요.</p>
</good>
<bad reason="정보 없는 연결문 + 어미 반복">
<p>다음으로 시린 치아의 원인에 대해 알아보겠습니다. 시린 치아는 다양한 원인에 의해 발생할 수 있습니다. 가장 흔한 원인은 잇몸 퇴축입니다.</p>
</bad>
</examples>

<self_check>
출력 전 검토:
□ 금지어·AI 냄새 없는가? □ 어미 3연속 반복 없는가?
□ 구체 수치/체감 표현 문단당 1개+? □ 이미지 마커 누락 없는가?
□ charTarget ±15%? □ 소제목 텍스트 변경하지 않았는가?
검토 결과는 출력에 포함하지 마세요.
</self_check>
`;

/** Opus 감수 JSON (cacheable: true, ttl: 1h) */
export const REVIEWER_PERSONA = `<role>
당신은 의료광고법 전문 감수 에디터 겸 문체 디렉터입니다.
HTML 초안을 12개 체크리스트로 전수 검토하고 JSON으로만 답합니다.
준거: 한국 의료법 제56조 + 보건복지부 의료광고 심의 가이드라인.
</role>

<checklist>
1) 과장/최상급  2) 치료 보장  3) 비교 광고  4) 유인 표현
5) 체험담/전후 사진  6) 부작용 제로/무통  7) 환자 증언
8) 가격/할인  9) 검증 불가 수치  10) 공포 조장
11) AI 티: 접속사 남발, 번역투, 어미 반복, 추상적 접속어
12) 구조: 논리 흐름, 소제목 순서, 주제 이탈
13) E-E-A-T: 현장 경험·의학 근거·권위 표현·한계 인정 신호 중 2개 이상 존재하는가
14) 출처 환각: "2024년 연구", "XX 논문" 같은 구체 출처 조작 여부
</checklist>

<output_format>
JSON 객체 하나만 출력하세요. JSON 밖 텍스트 포함하지 마세요.

{ "verdict": "pass"|"minor_fix"|"major_fix",
  "issues": [{ "category": "medical_law"|"factuality"|"tone"|"seo"|"structure"|"ai_artifact",
    "severity": "low"|"medium"|"high",
    "originalQuote": "원문 1~2문장", "problem": "한 줄", "suggestion": "한 줄" }],
  "revisedHtml": "수정 HTML"|null, "summaryNote": "종합 1~2줄" }
</output_format>

<verdict_rules>
기계적 적용: issues 0개→"pass"(issues=[], revisedHtml=null),
1~3개 AND high 0개→"minor_fix", 4~5개 OR high 1+→"major_fix".
severity: high=의료법 직접 위반, medium=위반 가능성 높음, low=맥락 따라 다름.
issues 최대 5개. revisedHtml은 원본 구조/소제목/[IMG_N] 보존, 문구만 최소 교정.
</verdict_rules>
`;

/** 섹션 재생성 수동 요청 */
export const SECTION_REGEN_PERSONA = `<role>
당신은 블로그 내 특정 섹션만 다시 쓰는 에디터입니다.
앞뒤 섹션의 문맥과 톤을 유지하면서 제시된 섹션 하나만 새로 작성합니다.
</role>

<output_format>
해당 섹션의 HTML만 출력하세요.
소제목 텍스트는 원본 그대로 유지하세요. [IMG_N] 마커도 동일 위치에 유지.
분량: 원본 ±20%. 마크다운/JSON 포함하지 마세요.
</output_format>

<writing_style>
1. 원본의 어조/존댓말 수준 유지
2. 어미를 다양하게 섞으세요
3. 구체 수치 또는 환자 체감 표현 1개 이상
4. 어순만 바꾸는 것이 아닌 새로운 정보/관점 추가
5. 2~3문단, 문단당 3~4문장
</writing_style>

<self_check>
출력 전 검토:
□ 금지어·AI 냄새 없는가? □ 어미 3연속 반복 없는가?
□ 구체 수치/체감 표현 문단당 1개+? □ 이미지 마커 누락 없는가?
□ charTarget ±15%? □ 소제목 텍스트 변경하지 않았는가?
검토 결과는 출력에 포함하지 마세요.
</self_check>
`;

// ═══════════════════════════════════════════════════════════════════
// Part E — 빌더 함수 (Claude 최적화 XML 태그 기반)
// ═══════════════════════════════════════════════════════════════════

/** 공통 user_input XML 블록 — 주제·키워드·병원·어조 등 기본 입력 */
function buildUserInputBlock(req: GenerationRequest): string {
  const topic = sanitizePromptInput(req.topic, 500);
  const blogTitle = sanitizePromptInput(req.blogTitle, 200);
  const keywords = sanitizePromptInput(req.keywords, 300);
  const disease = sanitizePromptInput(req.disease, 100);
  const hospitalName = sanitizePromptInput(req.hospitalName, 100);
  const patientPersona = sanitizePromptInput(req.patientPersona, 200);

  const audience = AUDIENCE_GUIDES[req.audienceMode] || AUDIENCE_GUIDES['환자용(친절/공감)'];
  const personaDesc = PERSONA_GUIDES[req.persona] || PERSONA_GUIDES.hospital_info;
  const toneDesc = TONE_GUIDES[req.tone] || TONE_GUIDES.warm;
  const styleDesc = STYLE_GUIDES[req.writingStyle || 'empathy'] || '';

  const topicType = classifyTopicType(req.topic, req.disease);
  const targetLength = req.textLength || 1500;
  const imageCount = req.imageCount ?? 0;

  const lines: string[] = [
    '<user_input>',
    `  <topic>${topic}</topic>`,
    `  <topic_type>${topicType}</topic_type>`,
    blogTitle && blogTitle !== topic ? `  <blog_title>${blogTitle}</blog_title>` : '',
    `  <keywords>${keywords || '(없음)'}</keywords>`,
    disease ? `  <disease>${disease}</disease>` : '',
    `  <category>${req.category || '(미지정)'}</category>`,
    hospitalName ? `  <hospital_name>${hospitalName}</hospital_name>` : '',
    patientPersona ? `  <patient_persona>${patientPersona}</patient_persona>` : '',
    `  <audience>${audience}</audience>`,
    `  <persona_role>${personaDesc}</persona_role>`,
    `  <tone>${toneDesc}</tone>`,
    styleDesc ? `  <writing_style>${styleDesc}</writing_style>` : '',
    `  <target_chars>${targetLength}</target_chars>`,
    `  <image_count>${imageCount}</image_count>`,
    `  <image_style>${getImageStyleGuide(req)}</image_style>`,
    '</user_input>',
  ];
  return lines.filter(Boolean).join('\n');
}

/** <greeting_rule> XML 블록 — persona + hospital + includeIntro 기반 인사 규칙 */
function buildGreetingRuleBlock(req: GenerationRequest): string {
  const hospitalName = sanitizePromptInput(req.hospitalName, 100);
  const includeIntro = req.includeHospitalIntro !== false;

  if (!hospitalName || !includeIntro) {
    return `<greeting_rule priority="highest">
<mode>no_hospital</mode>
<instruction>병원명 언급 없이 공감 훅 또는 질문형으로 시작하세요.</instruction>
</greeting_rule>`;
  }
  if (req.persona === 'director_1st') {
    return `<greeting_rule priority="highest">
<mode>first_person_allowed</mode>
<hospital_name>${hospitalName}</hospital_name>
<role>대표 원장</role>
<required_format><p>안녕하세요. {수식구 15~35자} ${hospitalName} 대표 원장입니다.</p></required_format>
<instruction>첫 p는 위 형식 한 문장. 수식구는 주제에 맞게 매번 새로 작성. 두 번째 문장부터 공감 훅으로 전환.</instruction>
</greeting_rule>`;
  }
  if (req.persona === 'coordinator') {
    return `<greeting_rule priority="highest">
<mode>first_person_allowed</mode>
<hospital_name>${hospitalName}</hospital_name>
<role>상담실장</role>
<required_format><p>안녕하세요. {수식구 15~35자} ${hospitalName} 상담실장입니다.</p></required_format>
</greeting_rule>`;
  }
  return `<greeting_rule priority="highest">
<mode>hospital_info</mode>
<hospital_name>${hospitalName}</hospital_name>
<instruction>1인칭 인사 금지. 본문 중 "${hospitalName}은(는)..." 형태로 3인칭 서술.</instruction>
</greeting_rule>`;
}

/** <reference_material> 블록 — req.referenceFacts 있을 때만 */
function buildReferenceBlock(req: GenerationRequest): string {
  if (!req.referenceFacts) return '';
  const safeFacts = sanitizeSourceContent(req.referenceFacts, 3000);
  const sources = req.referenceSources?.length ? `\n<source>${req.referenceSources.join(', ')}</source>` : '';
  return `<reference_material>
${safeFacts}${sources}
<instruction>위 사실만 활용. 추측/환각 금지. 문장 그대로 복사 금지.</instruction>
</reference_material>`;
}

/** <clinic_context> 블록 — req.clinicContext 있을 때만 */
function buildClinicContextBlock(req: GenerationRequest): string {
  if (!req.clinicContext) return '';
  const ctx = req.clinicContext;
  const safeJoin = (arr?: string[]) => (arr || []).map(s => sanitizePromptInput(s, 200)).filter(Boolean).join(', ');
  const services = safeJoin(ctx.actualServices);
  const specialties = safeJoin(ctx.specialties);
  if (!services && !specialties) return '';
  const topic = sanitizePromptInput(req.topic, 500);
  return `<clinic_context>
${services ? `<services>${services}</services>` : ''}
${specialties ? `<specialties>${specialties}</specialties>` : ''}
<instruction>
현재 주제("${topic}")와 관련 있는 정보만 참고하세요.
없는 서비스/장비는 언급하지 마세요. 지역명(동·시·역 이름) 본문 삽입 금지.
</instruction>
</clinic_context>`;
}

/** <learned_style> 블록 — stylePromptText 또는 hospitalStyleBlock 있을 때만 */
function buildLearnedStyleBlock(
  req: GenerationRequest,
  hospitalStyleBlock?: string | { systemBlock: string; fewShotBlock?: string } | null,
): string {
  if (req.stylePromptText?.trim()) {
    return `<learned_style priority="override_greeting">
${req.stylePromptText}
<instruction>이 말투/화자 설정이 다른 모든 정체성/톤 지시보다 우선합니다. greeting_rule의 표준 인사 형식은 적용하지 마세요. 학습본의 인사 유무/길이를 그대로 재현합니다.</instruction>
</learned_style>`;
  }
  if (hospitalStyleBlock) {
    const text = typeof hospitalStyleBlock === 'string'
      ? hospitalStyleBlock
      : [hospitalStyleBlock.systemBlock, hospitalStyleBlock.fewShotBlock].filter(Boolean).join('\n\n');
    if (text) {
      return `<learned_style priority="override_greeting">
${text}
<instruction>이 말투가 greeting_rule보다 우선합니다.</instruction>
</learned_style>`;
    }
  }
  return '';
}

// ── 1) buildOutlinePrompt — 2패스 Pass 1: 아웃라인 JSON 생성 ──

export function buildOutlinePrompt(
  req: GenerationRequest,
  opts: { hospitalStyleBlock?: string | { systemBlock: string; fewShotBlock?: string } | null } = {},
): BlogPromptV3 {
  const systemBlocks: CacheableBlock[] = [];

  systemBlocks.push({ type: 'text', text: OUTLINE_PERSONA, cacheable: true, cacheTtl: '1h' });
  systemBlocks.push({ type: 'text', text: MEDICAL_LAW_CONSTRAINTS, cacheable: true, cacheTtl: '1h' });

  if (req.category && CATEGORY_DEPTH_GUIDES[req.category]) {
    systemBlocks.push({ type: 'text', text: CATEGORY_DEPTH_GUIDES[req.category], cacheable: true, cacheTtl: '5m' });
  }
  if (req.category === '치과' && isProstheticTopic(req.topic, req.disease)) {
    systemBlocks.push({ type: 'text', text: DENTAL_PROSTHETIC_GUIDE, cacheable: true, cacheTtl: '5m' });
  }
  const topicGuideOutline = TOPIC_TYPE_GUIDES[classifyTopicType(req.topic, req.disease)];
  if (topicGuideOutline) {
    systemBlocks.push({ type: 'text', text: topicGuideOutline, cacheable: true, cacheTtl: '5m' });
  }
  systemBlocks.push({ type: 'text', text: E_E_A_T_GUIDE, cacheable: true, cacheTtl: '1h' });

  const seasonal = getSeasonalContext(req.category || '');
  if (seasonal) {
    systemBlocks.push({ type: 'text', text: seasonal, cacheable: true, cacheTtl: '5m' });
  }

  const learnedStyle = buildLearnedStyleBlock(req, opts.hospitalStyleBlock);
  if (learnedStyle) {
    systemBlocks.push({ type: 'text', text: learnedStyle, cacheable: true, cacheTtl: '5m' });
  }

  const parts: string[] = [buildUserInputBlock(req)];

  const reference = buildReferenceBlock(req);
  if (reference) parts.push('', reference);

  const clinic = buildClinicContextBlock(req);
  if (clinic) parts.push('', clinic);

  const targetLength = req.textLength || 1500;
  const imageCount = req.imageCount ?? 0;
  parts.push(
    '',
    `<task>
위 정보를 바탕으로 블로그 아웃라인을 JSON으로만 출력하세요.
- 목표 글자수 ${targetLength}자에 맞춰 section 개수와 각 charTarget 결정
- 이미지 ${imageCount}장이면 해당 섹션에만 imageIndex를 1부터 순서대로 부여
- 소제목은 검색형 구어체 10~25자. SEO 키워드를 최소 2개 소제목에 자연 포함
- intro/outro 각 charTarget ≈ 200자
- summary에 이 섹션이 다룰 구체적 내용을 1~2문장으로 작성
- JSON 객체 하나만 출력. 밖의 텍스트 포함하지 마세요.
</task>`,
  );

  return { systemBlocks, userPrompt: parts.join('\n') };
}

// ── 2) buildSectionFromOutlinePrompt — 2패스 Pass 2: 섹션 HTML 생성 ──

interface SectionFromOutlineInput {
  section: BlogOutlineSection;
  sectionIndex: number;
  outline: BlogOutline;
  req: GenerationRequest;
  hospitalStyleBlock?: string | { systemBlock: string; fewShotBlock?: string } | null;
}

export function buildSectionFromOutlinePrompt(
  input: SectionFromOutlineInput,
): BlogPromptV3 {
  const { section, sectionIndex, outline, req, hospitalStyleBlock } = input;
  const systemBlocks: CacheableBlock[] = [];

  systemBlocks.push({ type: 'text', text: SECTION_PERSONA, cacheable: true, cacheTtl: '1h' });
  systemBlocks.push({ type: 'text', text: MEDICAL_LAW_CONSTRAINTS, cacheable: true, cacheTtl: '1h' });

  if (req.category && CATEGORY_DEPTH_GUIDES[req.category]) {
    systemBlocks.push({ type: 'text', text: CATEGORY_DEPTH_GUIDES[req.category], cacheable: true, cacheTtl: '5m' });
  }
  if (req.category === '치과' && isProstheticTopic(req.topic, req.disease)) {
    systemBlocks.push({ type: 'text', text: DENTAL_PROSTHETIC_GUIDE, cacheable: true, cacheTtl: '5m' });
  }
  const topicGuideSection = TOPIC_TYPE_GUIDES[classifyTopicType(req.topic, req.disease)];
  if (topicGuideSection) {
    systemBlocks.push({ type: 'text', text: topicGuideSection, cacheable: true, cacheTtl: '5m' });
  }
  systemBlocks.push({ type: 'text', text: E_E_A_T_GUIDE, cacheable: true, cacheTtl: '1h' });

  const learnedStyle = buildLearnedStyleBlock(req, hospitalStyleBlock);
  if (learnedStyle) {
    systemBlocks.push({ type: 'text', text: learnedStyle, cacheable: true, cacheTtl: '5m' });
  }

  // user prompt
  const parts: string[] = [buildUserInputBlock(req)];

  // intro 섹션만 greeting_rule 주입
  if (section.type === 'intro' && !req.stylePromptText?.trim()) {
    parts.push('', buildGreetingRuleBlock(req));
  }

  const reference = buildReferenceBlock(req);
  if (reference) parts.push('', reference);

  // 아웃라인 전체 맥락
  const allHeadings = outline.sections
    .map((s, i) => {
      const mark = i === sectionIndex ? ' current="true"' : '';
      const heading = s.heading ? ` heading="${sanitizePromptInput(s.heading, 100)}"` : '';
      return `  <section index="${i}" type="${s.type}"${heading}${mark} />`;
    })
    .join('\n');

  parts.push(
    '',
    `<outline_context>
  <total_sections>${outline.sections.length}</total_sections>
  <key_message>${sanitizePromptInput(outline.keyMessage, 200)}</key_message>
  <all_headings>
${allHeadings}
  </all_headings>
</outline_context>`,
  );

  // 대상 섹션 상세
  const prevHeading = sectionIndex > 0 ? outline.sections[sectionIndex - 1]?.heading : undefined;
  const nextHeading = sectionIndex < outline.sections.length - 1 ? outline.sections[sectionIndex + 1]?.heading : undefined;
  const imgMarker = section.imageIndex ? `\n  <image_marker>[IMG_${section.imageIndex}]</image_marker>` : '';

  parts.push(
    '',
    `<target_section>
  <index>${sectionIndex}</index>
  <type>${section.type}</type>
${section.heading ? `  <heading>${sanitizePromptInput(section.heading, 100)}</heading>` : ''}
  <summary>${sanitizePromptInput(section.summary, 500)}</summary>
  <char_target>${section.charTarget ?? 300}</char_target>${imgMarker}
${prevHeading ? `  <prev_heading>${sanitizePromptInput(prevHeading, 100)}</prev_heading>` : ''}
${nextHeading ? `  <next_heading>${sanitizePromptInput(nextHeading, 100)}</next_heading>` : ''}
</target_section>`,
  );

  const typeLabel = section.type === 'intro' ? '도입부' : section.type === 'outro' ? '마무리' : `"${section.heading || ''}"`;
  parts.push(
    '',
    `<task>
target_section의 HTML만 출력하세요. 소제목 heading을 <h2>로 사용하고 아래 2~4개 <p> 문단.
${section.imageIndex ? `이미지 마커 [IMG_${section.imageIndex}]를 적절한 위치에 포함하세요.` : ''}
prev_heading과 next_heading이 있으면 문맥이 자연스럽게 이어지도록.
${typeLabel} 섹션의 HTML만 출력. 설명/코드펜스/마크다운 금지.
</task>`,
  );

  return { systemBlocks, userPrompt: parts.join('\n') };
}

// ── 3) buildBlogPromptV3 — 1패스 fallback: 완결된 블로그 1편 ──

export function buildBlogPromptV3(
  req: GenerationRequest,
  opts: { hospitalStyleBlock?: string | { systemBlock: string; fewShotBlock?: string } | null } = {},
): BlogPromptV3 {
  const systemBlocks: CacheableBlock[] = [];

  systemBlocks.push({ type: 'text', text: BLOG_PERSONA, cacheable: true, cacheTtl: '1h' });
  systemBlocks.push({ type: 'text', text: MEDICAL_LAW_CONSTRAINTS, cacheable: true, cacheTtl: '1h' });

  if (req.category && CATEGORY_DEPTH_GUIDES[req.category]) {
    systemBlocks.push({ type: 'text', text: CATEGORY_DEPTH_GUIDES[req.category], cacheable: true, cacheTtl: '5m' });
  }
  if (req.category === '치과' && isProstheticTopic(req.topic, req.disease)) {
    systemBlocks.push({ type: 'text', text: DENTAL_PROSTHETIC_GUIDE, cacheable: true, cacheTtl: '5m' });
  }
  const topicGuideBlog = TOPIC_TYPE_GUIDES[classifyTopicType(req.topic, req.disease)];
  if (topicGuideBlog) {
    systemBlocks.push({ type: 'text', text: topicGuideBlog, cacheable: true, cacheTtl: '5m' });
  }
  systemBlocks.push({ type: 'text', text: E_E_A_T_GUIDE, cacheable: true, cacheTtl: '1h' });

  const seasonal = getSeasonalContext(req.category || '');
  if (seasonal) {
    systemBlocks.push({ type: 'text', text: seasonal, cacheable: true, cacheTtl: '5m' });
  }

  const learnedStyle = buildLearnedStyleBlock(req, opts.hospitalStyleBlock);
  if (learnedStyle) {
    systemBlocks.push({ type: 'text', text: learnedStyle, cacheable: true, cacheTtl: '5m' });
  }

  // user prompt
  const parts: string[] = [buildUserInputBlock(req)];

  // 인사 규칙 (학습 말투 없을 때만)
  if (!req.stylePromptText?.trim()) {
    parts.push('', buildGreetingRuleBlock(req));
  }

  const reference = buildReferenceBlock(req);
  if (reference) parts.push('', reference);

  const clinic = buildClinicContextBlock(req);
  if (clinic) parts.push('', clinic);

  // 병원 강점
  const safeStrengths = sanitizeSourceContent(req.hospitalStrengths, 3000);
  if (safeStrengths) {
    parts.push(
      '',
      `<hospital_strengths>
${safeStrengths}
<instruction>주제와 관련된 부분만 본문 흐름에 자연스럽게 녹여 서술. 나열 금지.</instruction>
</hospital_strengths>`,
    );
  }

  // 임상 컨텍스트
  const safeClinical = sanitizeSourceContent(req.clinicalContext, 5000);
  if (safeClinical) {
    parts.push(
      '',
      `<clinical_context>
${safeClinical}
<instruction>분석 결과에 언급된 시술/장비/상태를 본문 최소 3곳 이상에서 구체적으로 언급. 없는 정보 추가 금지.</instruction>
</clinical_context>`,
    );
  }

  // 이미지 라이브러리
  if (req.libraryImages?.length) {
    const imgLines = req.libraryImages.map((img, i) =>
      `  <image index="${i + 1}" tags="${sanitizePromptInput(img.tags.join(','), 200)}" alt="${sanitizePromptInput(img.altText, 200)}" />`,
    ).join('\n');
    parts.push(
      '',
      `<library_images>
${imgLines}
<instruction>위 이미지가 이미 준비되어 있습니다. 프롬프트는 "USE_LIBRARY"로만 작성.</instruction>
</library_images>`,
    );
  }

  // 사용자 지정 소제목
  const safeSubheadings = sanitizeSourceContent(req.customSubheadings, 2000);
  if (safeSubheadings) {
    parts.push(
      '',
      `<custom_subheadings>
${safeSubheadings}
<instruction>위 소제목을 그대로 사용하세요.</instruction>
</custom_subheadings>`,
    );
  }

  // FAQ
  if (req.includeFaq) {
    parts.push(
      '',
      `<faq_section count="${req.faqCount || 3}">
본문 완전히 마무리 후(결론 뒤) FAQ를 ${req.faqCount || 3}개 작성하세요.
형식: <div class="faq-section"><h3>💬 자주 묻는 질문</h3><p class="faq-q">Q. ...</p><p class="faq-a">A. ...</p></div>
실제 환자 질문 기반 구어체, 답변은 2~3문장.
</faq_section>`,
    );
  }

  const targetLength = req.textLength || 1500;
  const imageCount = req.imageCount ?? 0;
  parts.push(
    '',
    `<task>
완결된 블로그 글 1편을 HTML로만 출력하세요.
- 목표 글자수 ${targetLength}자 (±20%)
- 이미지 ${imageCount}장: [IMG_1] ~ [IMG_${imageCount}] 마커를 본문에 배치
- greeting_rule / learned_style 중 존재하는 것을 최우선 준수
- reference_material / clinic_context / clinical_context 의 사실만 활용
- 본문 마지막에 <div class="references-footer" data-no-copy="true">...</div> 출처 블록 (2~4개 기관명+주제)
- 출처 블록 다음 줄에 ---SCORES--- 와 {"seo":0~100,"medical":0~100,"conversion":0~100} JSON 한 줄
HTML 외 텍스트/마크다운/코드펜스 금지.
</task>`,
  );

  return { systemBlocks, userPrompt: parts.join('\n') };
}

// ── 4) buildBlogSectionPromptV3 — 수동 섹션 재생성 ──

export function buildBlogSectionPromptV3(
  input: SectionRegenerateInputV3,
): BlogPromptV3 {
  const systemBlocks: CacheableBlock[] = [];

  systemBlocks.push({ type: 'text', text: SECTION_REGEN_PERSONA, cacheable: true, cacheTtl: '1h' });
  systemBlocks.push({ type: 'text', text: MEDICAL_LAW_CONSTRAINTS, cacheable: true, cacheTtl: '1h' });

  if (input.category && CATEGORY_DEPTH_GUIDES[input.category]) {
    systemBlocks.push({ type: 'text', text: CATEGORY_DEPTH_GUIDES[input.category], cacheable: true, cacheTtl: '5m' });
  }

  if (input.stylePromptText?.trim()) {
    systemBlocks.push({
      type: 'text',
      text: `<learned_style priority="override_greeting">
${input.stylePromptText}
<instruction>이 말투/화자 설정이 다른 모든 정체성/톤 지시보다 우선합니다.</instruction>
</learned_style>`,
      cacheable: true,
      cacheTtl: '5m',
    });
  }

  // user prompt
  const safeKeywords = sanitizePromptInput(input.keywords, 300);
  const safeCurrent = sanitizeSourceContent(input.currentSection, 10000);
  const safeFullCtx = sanitizeSourceContent(input.fullBlogContent, 30000);

  const parts: string[] = [
    `<current_section index="${input.sectionIndex}">
${safeCurrent}
</current_section>`,
    '',
    `<full_blog_context>
${safeFullCtx}
</full_blog_context>`,
    '',
    `<regeneration_target>
  <index>${input.sectionIndex}</index>
  <preserve_heading>true</preserve_heading>
  <preserve_image_markers>true</preserve_image_markers>
  <char_range>원본 ±20%</char_range>
${input.category ? `  <category>${input.category}</category>` : ''}
${safeKeywords ? `  <seo_keywords>${safeKeywords}</seo_keywords>` : ''}
</regeneration_target>`,
    '',
    `<task>
current_section만 재작성하세요.
- heading(h2/h3 텍스트)는 원본 그대로 유지
- [IMG_N] 마커가 있으면 동일 위치에 유지
- full_blog_context는 앞뒤 섹션과 톤 일치를 위한 참고용 — 직접 편집하지 마세요
- 기존 문장의 어순만 바꾸지 말고, 새로운 정보나 관점을 추가하세요
${safeKeywords ? `- 키워드 "${safeKeywords}"를 본 섹션에 1~2회 자연 포함` : ''}
- 해당 섹션의 HTML만 출력. 설명/코드펜스 금지.
</task>`,
  ];

  return { systemBlocks, userPrompt: parts.filter(p => p !== '').join('\n') };
}

// ── 5) buildBlogReviewPrompt — Opus 감수 (JSON 출력) ──

export function buildBlogReviewPrompt(
  draftHtml: string,
  ctx: {
    category?: string;
    hospitalName?: string;
    ruleFilterViolations?: string[];
    stylePromptText?: string;
    hospitalStyleBlock?: string;
  } = {},
): BlogPromptV3 {
  const systemBlocks: CacheableBlock[] = [];

  systemBlocks.push({ type: 'text', text: REVIEWER_PERSONA, cacheable: true, cacheTtl: '1h' });
  systemBlocks.push({ type: 'text', text: MEDICAL_LAW_CONSTRAINTS, cacheable: true, cacheTtl: '1h' });

  if (ctx.category && CATEGORY_DEPTH_GUIDES[ctx.category]) {
    systemBlocks.push({ type: 'text', text: CATEGORY_DEPTH_GUIDES[ctx.category], cacheable: true, cacheTtl: '5m' });
  }

  const hasLearnedStyle = !!(ctx.stylePromptText?.trim() || ctx.hospitalStyleBlock?.trim());

  // user prompt
  const safeHospital = sanitizePromptInput(ctx.hospitalName, 100) || '(미지정)';
  const safeDraft = sanitizeSourceContent(draftHtml, 60000);
  const violations = ctx.ruleFilterViolations?.length ? ctx.ruleFilterViolations.join(', ') : '(감지 없음)';

  const parts: string[] = [
    `<draft_to_review>
${safeDraft}
</draft_to_review>`,
    '',
    `<original_request>
  <hospital_name>${safeHospital}</hospital_name>
${ctx.category ? `  <category>${ctx.category}</category>` : ''}
  <rule_filter_detections>${violations}</rule_filter_detections>
${hasLearnedStyle ? '  <has_learned_style>true</has_learned_style>' : ''}
</original_request>`,
    '',
    `<review_criteria>
1. 의료광고법 위반 (MEDICAL_LAW_CONSTRAINTS 블록 기준)
2. AI 냄새 (어미 반복, 접속사 남발, 추상적 서술, 번역투)
3. SEO (키워드 배치, 소제목 키워드 포함, 중복 없음)
4. 가독성 (문단 150자 이내, 3+ 나열 시 리스트, 핵심 수치 strong)
5. 구조 (도입→본문→마무리 논리 흐름, 소제목 순서)
${hasLearnedStyle ? '6. 학습 말투 경로 — 초안의 인사 유무/형식을 있는 그대로 존중. MISSING/FRAGMENTED 판정 금지.' : '6. 인사 패턴 — "안녕하세요. {수식구} {병원명} {직책}입니다." 형식이 요구된 경우 첫 p를 검증/복원.'}
</review_criteria>`,
    '',
    `<task>
draft_to_review를 review_criteria 5~6개 항목으로 전수 검토하고 JSON 객체 하나만 출력하세요.

{
  "verdict": "pass" | "minor_fix" | "major_fix",
  "issues": [{
    "category": "medical_law"|"factuality"|"tone"|"seo"|"structure"|"ai_artifact",
    "severity": "low"|"medium"|"high",
    "originalQuote": "원문 1~2문장",
    "problem": "한 줄",
    "suggestion": "한 줄"
  }],
  "revisedHtml": "수정 HTML" | null,
  "summaryNote": "종합 1~2줄"
}

verdict 규칙 (기계적 적용):
- issues 0개 → "pass" (issues=[], revisedHtml=null)
- 1~3개 AND high 0개 → "minor_fix"
- 4~5개 OR high 1+ → "major_fix"

revisedHtml 작성 시 원본 구조·소제목·[IMG_N] 마커 보존. 문구만 최소 교정. issues 최대 5개.
JSON 밖의 텍스트, 코드펜스, 설명문 금지.
</task>`,
  ];

  return { systemBlocks, userPrompt: parts.filter(p => p !== '').join('\n') };
}

// legacy re-export 전부 제거 완료 — blogPrompt_legacy.ts는 롤백 보험으로만 유지
