/**
 * AI 보정 프롬프트 — OLD ContentRefiner.tsx parity
 *
 * 2가지 모드: 자동 보정 (6종 방향) + 채팅 수정 (대화형)
 * HTML 출력, 의료광고법 준수, AI 느낌 제거, Google Search 연동
 */

import { getMedicalLawPromptBlock } from './medicalLawRules';
import { sanitizePromptInput, sanitizeSourceContent } from './promptSanitize';

export type RefineMode = 'natural' | 'professional' | 'shorter' | 'longer' | 'medical_law' | 'seo';

export interface RefineRequest {
  originalText: string;
  mode: RefineMode;
  keywords?: string;  // SEO 모드에서 핵심 키워드 전달
}

export interface ChatRefineRequest {
  workingContent: string;   // 현재 보정 중인 콘텐츠
  userMessage: string;      // 사용자 수정 요청
  crawledContent?: string;  // URL 크롤링 결과 (있으면)
}

export const REFINE_OPTIONS: { value: RefineMode; label: string; icon: string; description: string }[] = [
  { value: 'natural', label: '더 자연스럽게', icon: '💬', description: '딱딱한 표현을 부드럽고 읽기 편하게' },
  { value: 'professional', label: '더 전문적으로', icon: '🎓', description: '전문 용어와 근거 기반 서술 강화' },
  { value: 'shorter', label: '더 짧게', icon: '✂️', description: '핵심만 남기고 간결하게 압축' },
  { value: 'longer', label: '더 길게', icon: '📝', description: '설명과 사례를 추가하여 풍성하게' },
  { value: 'medical_law', label: '의료광고법 자동 수정', icon: '⚖️', description: '과장·단정 표현을 중립적으로 자동 수정' },
  { value: 'seo', label: 'SEO 최적화', icon: '🔍', description: '검색 노출에 유리한 구조로 개선' },
];

// ── 자동 보정 프롬프트 ──

// ── 규칙 블록 ──

// 의료광고법만 공통. 문체/어투는 각 모드가 자체 정의.
const MEDICAL_LAW_COMMON = getMedicalLawPromptBlock(true);

// 변경점 표시 지침 (모든 모드에 추가)
const MARK_CHANGES = `
[변경점 표시]
수정한 부분을 <mark> 태그로 감싸주세요.
- 새로 추가한 문장: <mark class="added">추가된 텍스트</mark>
- 표현을 바꾼 부분: <mark class="changed">변경된 텍스트</mark>
- 삭제는 그냥 삭제 (표시 불필요)`;

const MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  // ── 💬 더 자연스럽게 ──
  natural: `아래 글을 더 자연스럽고 읽기 편하게 다듬어주세요.

[이 모드의 목표]
AI가 쓴 듯한 딱딱한 문장을 실제 병원 블로그 에디터가 쓴 것처럼 바꾸기.
원문의 어투(~요/~죠/~입니다)는 절대 바꾸지 않는다.

[수정 대상 — 우선순위]
1순위: AI 기계적 표현 제거
  ❌ "해당 치료의 경우 다양한 장점이 있는 것으로 알려져 있습니다."
  ✅ "이 치료는 인접 치아를 깎지 않아도 되고, 저작력이 자연치아의 80~90%까지 회복됩니다."
2순위: 같은 종결어미 2회 연속 → 같은 어투 안에서 변주
  ❌ "~좋습니다. ~좋습니다. ~좋습니다." (동일 어미 3연속)
  ✅ "~좋습니다. ~편입니다. ~거든요." (같은 격식도 안에서 변주)
  ⚠️ 원문이 "~요" 체면 "~요" 범위 안에서만 변주. "~입니다" 체로 바꾸지 마세요.
3순위: 추상적 서술 → 감각/구체 서술
  ❌ "무릎 통증이 있으면 전문의를 찾아가야 합니다."
  ✅ "계단을 내려갈 때 무릎 안쪽이 시큰거리면 반월판 손상을 의심해볼 수 있습니다."
4순위: 불필요한 반복/부연 삭제

[좋은 문단의 기준]
1. 첫 문장 = 문단 핵심 (두괄식)
2. 구체적 사실/수치 최소 1개
3. 환자 체감 표현 1문장 이상
4. 마지막 문장 = 다음 문단으로 자연스럽게 연결

[문체]
- 긴 문장 → 짧은 문장 교차. 3문장 중 1문장은 15자 이내
- 감각 표현: "찌릿한", "욱신거리는", "뻣뻣한" 적극 활용
- 접속부사("또한", "더불어") → 삭제. 문맥으로 연결
- 수식어 삭제: "매우 중요한" → "중요한"

[절대 하지 말 것]
- 원문의 격식도를 바꾸기 (예: "~요" 체 전체를 "~입니다" 체로 변경 금지)
- 원문에 없는 새 정보/수치 추가
- 소제목 구조 변경
- 원문보다 길어지게 만들기

${MEDICAL_LAW_COMMON}`,

  // ── 🎓 더 전문적으로 ──
  professional: `아래 글을 전문적이고 신뢰감 있게 다듬어주세요.

[이 모드의 목표]
일반인 눈높이의 글을 의료 전문가가 감수한 듯한 깊이 있는 글로 격상.
전문 용어를 넣되 괄호에 쉬운 설명 병기. 격식체(~입니다) 사용.

[수정 대상 — 우선순위]
1순위: 일반 표현 → 전문 용어 (괄호 설명 필수)
  ❌ "잇몸이 부었다"
  ✅ "치은 종창(잇몸이 부어오른 상태)이 관찰됩니다"
  ❌ "이가 흔들린다"
  ✅ "치아 동요도 증가(치아가 흔들리는 현상)가 나타납니다"
2순위: 모호한 표현 → 구체적 수치/기준
  ❌ "꽤 오래 걸립니다"
  ✅ "평균 3~6개월의 골유착 기간이 필요합니다"
  ❌ "효과가 좋습니다"
  ✅ "5년 생존율 95% 이상으로 보고됩니다"
3순위: 원인-결과 논리 연결
  ❌ "잇몸병이 생길 수 있습니다"
  ✅ "치주 포켓에 세균이 축적되면 잇몸뼈 흡수로 진행될 수 있습니다"
4순위: 단계/분류 구조화 (초기/중기/후기, 1단계/2단계 등)

[진료과별 용어 가이드]
치과: 보철(prosthesis), 인상채득(impression taking), 교합(occlusion), 치주낭(periodontal pocket)
피부과: 화학박피(chemical peeling), 보툴리눔톡신(botulinum toxin), 콜라겐 재생(collagen remodeling)
정형외과: 관절천자(joint aspiration), 추간판절제술(discectomy), 체외충격파(ESWT)

[문체]
- 두괄식 문단: 첫 문장 = 핵심 정보
- 근거 기반: 가능하면 수치/기간/횟수 명시
- 정보 밀도를 높이되 가독성 유지
- "~할 수 있습니다" 계열 가능성 표현 적극 사용

${MEDICAL_LAW_COMMON}`,

  // ── ✂️ 더 짧게 ──
  shorter: `아래 글을 핵심만 남기고 간결하게 줄여주세요.

[이 모드의 목표]
원본의 50~70% 분량으로 압축. 정보 손실 최소화. 원문 어투 유지.

[삭제 우선순위]
1순위: 같은 내용을 다른 표현으로 반복한 문장 → 하나만 남기기
  ❌ "정기적인 검진이 중요합니다. 조기에 발견하면 치료가 간단합니다. 따라서 검진을 미루지 마세요."
  ✅ "잇몸병은 초기 발견 시 치료가 간단합니다. 정기 검진을 권합니다."
2순위: 빈 칼로리 문장 ("~할 수 있습니다", "~에 도움이 됩니다" → 정보 없으면 삭제)
3순위: 부연 설명 ("즉,", "다시 말해," → 핵심 정보 없으면 삭제)
4순위: 마무리 인사가 2문단 이상 → 1문단으로

[압축 기법]
- 3문장 → 1문장 통합: 인과관계 유지하며 합치기
- 수식어 칼질: "매우 중요한 역할을 하는" → "핵심적인"
- 긴 나열 → 대표 2~3개만: "A, B, C, D, E" → "A, B 등"

[절대 삭제 금지]
- 구체적 수치/기간/횟수가 포함된 문장
- 소제목 (구조 유지)
- 의료법 관련 "개인차가 있을 수 있습니다" 류 문구

${MEDICAL_LAW_COMMON}`,

  // ── 📝 더 길게 ──
  longer: `아래 글의 내용을 더 풍성하고 구체적으로 확장해주세요.

[이 모드의 목표]
원본의 130~150% 분량. 기존 내용의 깊이만 추가. 새 주제 금지. 원문 어투 유지.

[확장 방법 — 우선순위]
1순위: 구체적 수치/기간 보강
  원문: "회복에 시간이 걸립니다"
  확장: "일반적으로 1~2주간 부기가 있고, 잇몸뼈와 결합하는 골유착 기간은 3~6개월입니다"
2순위: "왜?"를 1문장 추가
  원문: "잇몸이 붓습니다"
  확장: + "치주 포켓에 세균이 축적되면서 잇몸 조직에 염증 반응이 일어나기 때문입니다"
3순위: 환자 체감 디테일
  원문: "수술 후 관리가 필요합니다"
  확장: + "당일은 부드러운 음식만 섭취하고, 3일간 시술 부위 양치를 피합니다. 1주 후 실밥을 제거합니다"
4순위: 비교/대안 정보 (기존에 언급된 치료의 대안)
  원문: "임플란트를 추천합니다"
  확장: + "브릿지는 인접 치아를 깎아야 하고, 틀니는 저작력이 자연치아의 30~40%에 불과합니다"

[금지]
- 원문에 없는 새 소제목/주제 추가
- 같은 말을 다른 표현으로 반복하여 늘리기 (패딩)
- "~할 수 있습니다", "~에 도움이 됩니다" 반복으로 분량 채우기

[문체]
- 새로 추가하는 문장도 원문과 같은 어투
- 추가 문단은 두괄식: 첫 문장에 핵심 정보
- 감각 표현 적극 활용: "시큰거리는", "뻣뻣한", "욱신거리는"

${MEDICAL_LAW_COMMON}`,

  // ── ⚖️ 의료광고법 자동 수정 ──
  medical_law: `아래 글에서 의료광고법(제56조) 위반 리스크가 있는 표현을 모두 찾아 수정하세요.

[이 모드의 목표]
의미는 최대한 살리면서, 보건소 민원에 걸리지 않는 안전한 표현으로 변환.
위반이 아닌 표현은 절대 건드리지 마세요.

[위반 유형별 수정 가이드]
1. 최상급/과장 (민원 최빈 유형)
  ❌ "최고의 기술" → ✅ "전문적인 진료"
  ❌ "획기적인 치료" → ✅ "효과적인 치료"
  ❌ "탁월한 결과" → ✅ "우수한 결과를 기대할 수 있습니다"
  ❌ "독보적인/유일한" → ✅ "전문적인/대표적인"

2. 보장/단정 (가장 위험)
  ❌ "완치됩니다" → ✅ "증상 개선을 기대할 수 있습니다"
  ❌ "100% 성공" → ✅ "높은 만족도를 보이고 있습니다"
  ❌ "부작용 없는" → ✅ "부작용 위험을 줄인"
  ❌ "통증 없는" → ✅ "불편감을 줄인"

3. 행동 유도 (보건소 지적 빈번)
  ❌ "지금 바로 예약하세요" → ✅ "예약을 고려해 보실 수 있습니다"
  ❌ "상담 받으세요" → ✅ "상담을 받아보시는 것도 방법입니다"
  ❌ "추천합니다" → ✅ "고려해 볼 수 있습니다"

4. 비교 광고
  ❌ "타 병원 대비 우수" → ✅ (삭제)
  ❌ "가장 좋은 병원" → ✅ "전문적인 병원"

5. 효과 주장
  ❌ "높은 성공률" → ✅ "많은 분들이 만족하고 계십니다"
  ❌ "효과가 뛰어난" → ✅ "도움이 될 수 있는"

[오탐 방지 — 반드시 문맥 확인]
- "완치가 어렵다", "~할 수 없다" 등 부정 맥락 → 위반 아님
- "~할 수 있습니다", "~에 도움이 됩니다" 완화 표현 → 위반 아님
- 병원 상호명에 포함된 단어 (예: "일등치과"의 "일등") → 위반 아님
- 지역명+시술 (예: "강남 임플란트") → SEO 키워드이므로 위반 아님

${MEDICAL_LAW_COMMON}`,

  // ── 🔍 SEO 최적화 ──
  seo: `아래 글을 네이버 검색 노출에 유리하도록 구조를 개선해주세요.

[이 모드의 목표]
내용은 유지하면서 네이버 C-Rank + D.I.A 알고리즘에 최적화된 구조로 개선.
원문의 정보 흐름과 어투는 유지.

[네이버 SEO 2025~2026 핵심 규칙]
1. 소제목 (<h3>) — 검색 노출의 핵심
  - 각 소제목에 핵심 키워드 1개 이상 자연스럽게 포함
  - 구어체 질문형 1~2개 포함 (네이버 스마트블록/AEO 노출용)
  ❌ "치료 방법" → ✅ "임플란트 치료, 어떻게 진행될까요?"
  ❌ "주의사항" → ✅ "임플란트 시술 후 꼭 지켜야 할 관리법"
  - 10~25자. 너무 짧으면 키워드 부족, 너무 길면 잘림

2. 키워드 배치
  - 첫 문단: 핵심 키워드 자연스럽게 2회 이상
  ❌ "치아가 빠지면 불편합니다."
  ✅ "임플란트는 빠진 치아를 대체하는 대표적인 치과 치료입니다."
  - 전체: 핵심 키워드 5~8회 분산 (스터핑 금지)
  - 소제목 + 본문 첫 문장에 키워드 집중

3. 문단 구조 (D.I.A 가독성)
  - 문단당 3~5문장. 300자 이상 연속 문단 금지 (모바일 가독성)
  - 2~3문단마다 소제목 1개
  - 리스트/번호 활용 (네이버가 구조화 콘텐츠 우대)

4. 경험/전문성 (D.I.A 핵심)
  - 구체적 수치/사례가 없으면 추가 ("약 3~6개월", "5년 생존율 95%")
  - 일반론만 있으면 환자 관점 디테일 보강

[하지 말 것]
- 키워드 억지 삽입 (문맥에 안 맞는 곳)
- 소제목 순서 변경 (정보 흐름 유지)
- 원문에 없는 새 주제 추가

${MEDICAL_LAW_COMMON}`,
};

export function buildRefinePrompt(req: RefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  // 프롬프트 인젝션 방어 — 사용자 입력은 전부 sanitize 한 지역 변수로 사용.
  // originalText 는 장문(블로그 전체)이므로 sanitizeSourceContent 로 대괄호/단락 보존.
  // keywords 는 짧은 키워드 목록이라 sanitizePromptInput 으로 엄격하게.
  const safeOriginalText = sanitizeSourceContent(req.originalText, 15000);
  const safeKeywords = sanitizePromptInput(req.keywords, 300);

  const systemInstruction = `당신은 한국 병원 블로그 콘텐츠를 다듬는 전문 에디터입니다.
원본의 핵심 내용과 의도를 유지하면서, 요청된 방향으로 글을 수정합니다.

[문체 규칙]
- 한 문장 50자 이내 권장. 같은 어미 3연속 금지.
- 감각 표현 활용: "찌릿한", "욱신거리는", "뻣뻣한"
- 구체적 숫자: "오래" → "약 3~6개월"
- AI 느낌 금지: "일반적으로", "~라고 알려져 있습니다", "~에 대해 알아보겠습니다"
- 접속부사 금지: "또한", "더불어", "아울러" → 내용 흐름으로 대체

[출력] 순수 HTML(<p>, <h3>, <strong>, <em>)만. 마크다운/코드블록 금지.`;

  const keywordBlock = req.mode === 'seo' && safeKeywords
    ? `\n[핵심 키워드] "${safeKeywords}" — 이 키워드를 소제목과 본문에 5~8회 자연스럽게 분산 배치하세요.\n`
    : '';

  const prompt = `${MODE_INSTRUCTIONS[req.mode]}
${keywordBlock}${MARK_CHANGES}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 원문
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${safeOriginalText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 원문을 위 지침에 따라 수정한 결과를 HTML로만 출력해주세요.`;

  return { systemInstruction, prompt };
}

// ── 채팅 수정 프롬프트 ──

export function buildChatRefinePrompt(req: ChatRefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const { workingContent, userMessage, crawledContent } = req;

  // ── 의도 분석 (대폭 확장) ──

  // 기본 동작
  const wantsExpand = /자세히|자세하게|더 쓰|길게|확장|더 설명|상세|구체적|늘려|보강/.test(userMessage);
  const wantsShorter = /짧게|줄여|간결|요약|압축/.test(userMessage);
  const wantsRephrase = /다시|다르게|바꿔|고쳐|수정/.test(userMessage);
  const wantsHumanize = /사람|자연|AI|인공|딱딱|부드럽/.test(userMessage);

  // 위치/범위 특정
  const targetSection = userMessage.match(/(\d+)\s*번째?\s*(소제목|문단|섹션)/);
  const targetIntro = /도입|서론|첫\s*문단|시작\s*부분/.test(userMessage);
  const targetConclusion = /결론|마무리|마지막|끝\s*부분/.test(userMessage);
  const targetSpecificText = userMessage.match(/["""](.+?)["""]/);

  // 동작 유형
  const wantsDelete = /삭제|지워|빼|제거/.test(userMessage);
  const wantsReplace = /바꿔|교체|대신|으로\s*변경/.test(userMessage);
  const wantsAdd = /추가|넣어|더해|삽입|CTA|콜투액션/.test(userMessage);
  const wantsTone = /톤|분위기|느낌|어투|말투/.test(userMessage);
  const wantsFact = /수치|데이터|통계|근거|출처|팩트/.test(userMessage);
  const wantsSEO = /SEO|키워드|검색|네이버|상위노출/.test(userMessage);
  const wantsMedLaw = /의료법|의료광고|금지|위반|법적/.test(userMessage);
  const wantsDentalLab = /기공소|보철|기공사|지르코니아|CAD|밀링/.test(userMessage);

  // 구조 변경
  const wantsReorder = /순서|위치.*바꿔|앞으로|뒤로|올려|내려/.test(userMessage);
  const wantsSubheading = /소제목.*바꿔|소제목.*수정|제목.*변경/.test(userMessage);
  const wantsEmphasis = /강조|볼드|굵게|하이라이트|중요/.test(userMessage);

  // 콘텐츠 특화
  const wantsExample = /예시|사례|예를.*들|경우/.test(userMessage);
  const wantsFAQ = /FAQ|자주.*묻|질문|Q&A/.test(userMessage);
  const wantsSimplify = /쉽게|간단히|이해.*쉽|풀어/.test(userMessage);

  // 구체성 판단
  const isSpecific = !!(targetSection || targetIntro || targetConclusion || targetSpecificText);

  // ── 수정 범위 지시 ──
  // 주의: targetSection/targetSpecificText 는 raw userMessage 의 regex 매치 결과.
  // 프롬프트에 삽입할 때는 sanitize 필요 — 특히 targetSpecificText[1] 은 사용자가
  // 따옴표로 감싼 임의 텍스트이므로 인젝션 페이로드가 들어올 수 있음.
  let scopeInstruction = '';
  if (targetSection) {
    // [1] 은 숫자, [2] 는 '소제목'|'문단'|'섹션' 중 하나 — 안전.
    scopeInstruction = `\n⚠️ 수정 범위: ${targetSection[1]}번째 ${targetSection[2]}만 수정하세요. 나머지는 원본 그대로 유지.`;
  } else if (targetIntro) {
    scopeInstruction = '\n⚠️ 수정 범위: 도입부(첫 번째 <h3> 태그 이전)만 수정하세요. 나머지는 원본 그대로.';
  } else if (targetConclusion) {
    scopeInstruction = '\n⚠️ 수정 범위: 마지막 소제목 섹션만 수정하세요. 나머지는 원본 그대로.';
  } else if (targetSpecificText) {
    const safeTarget = sanitizePromptInput(targetSpecificText[1], 300);
    scopeInstruction = `\n⚠️ 수정 범위: "${safeTarget}" 부분만 수정하세요. 나머지는 원본 그대로.`;
  }

  // ── 동작별 지침 (복수 동작 지원) ──
  const actions: string[] = [];
  if (wantsDelete) actions.push('삭제: 해당 부분을 제거하고, 앞뒤 문맥이 자연스럽게 연결되도록 다듬으세요.');
  if (wantsReplace) actions.push('교체: 해당 표현을 사용자가 원하는 방향으로 바꾸되, 전체 톤을 유지하세요.');
  if (wantsAdd) actions.push('추가: 요청된 내용을 적절한 위치에 자연스럽게 삽입하세요. 기존 흐름을 깨지 마세요.');
  if (wantsTone) actions.push('톤 변경: 전체 글의 어투/분위기를 요청대로 조정하세요.');
  if (wantsFact) actions.push('팩트 보강: 관련 수치, 통계, 의학적 근거를 추가하세요. 확실하지 않은 수치는 넣지 마세요.');
  if (wantsSEO) actions.push('SEO 개선: 키워드를 자연스럽게 배치하고 소제목을 검색 친화적으로 다듬으세요.');
  if (wantsDentalLab) actions.push('기공소/보철 보강: 보철 재료(지르코니아/PFM/e.max), 기공 과정(CAD/CAM, 밀링), 기공사 역할 디테일 추가.');
  if (wantsMedLaw) actions.push('의료광고법: 위반 가능성 표현을 찾아 중립적으로 수정하세요.');
  if (wantsReorder) actions.push('순서 변경: 지정된 문단/소제목 위치를 이동. 앞뒤 연결 자연스럽게.');
  if (wantsSubheading) actions.push('소제목 수정: 네이버 검색 친화적이고 짧게 (10~25자).');
  if (wantsEmphasis) actions.push('강조: <strong> 태그 또는 문장을 더 임팩트 있게.');
  if (wantsExample) actions.push('예시 추가: 환자가 체감할 수 있는 구체적 사례나 비유.');
  if (wantsFAQ) actions.push('FAQ 추가: 환자 자주 묻는 질문 3~5개를 Q&A 형태로.');
  if (wantsSimplify) actions.push('쉽게 풀기: 전문 용어에 괄호 설명, 복잡한 문장을 2~3개로 분리.');
  if (wantsExpand) actions.push('확장: 기존 내용의 깊이를 추가. 새 주제 금지. 수치/사례/환자 체감 디테일 보강.');
  if (wantsShorter) actions.push('축소: 핵심만 남기고 반복/부연 제거. 수치 포함 문장은 보존.');
  if (wantsHumanize) actions.push('자연스럽게: AI 기계적 표현 → 사람 표현. 감각 표현 추가. 어미 변주.');

  const actionInstruction = actions.length > 0
    ? actions.join('\n')
    : '사용자의 요청이 구체적이지 않습니다. 수정 범위를 최소화하세요. 확실한 부분만 수정하고, 불확실하면 원본을 유지하세요.';

  // 프롬프트 삽입용 sanitized 버전. 의도 탐지(regex)는 위에서 raw userMessage
  // 로 이미 수행했으므로 여기서부터 안전하게 sanitize 된 값만 프롬프트에 섞는다.
  const safeUserMessage = sanitizePromptInput(userMessage, 1000);
  const safeWorkingContent = sanitizeSourceContent(workingContent, 15000);
  const safeCrawledContent = sanitizeSourceContent(crawledContent, 15000);

  // 글자 수 계산은 원본 HTML 태그 기준 — 사용자에게 보여주는 메타라 raw 유지 OK.
  const textOnly = workingContent.replace(/<[^>]+>/g, '').trim();
  const currentLength = textOnly.length;

  const systemInstruction = `당신은 병원 블로그 콘텐츠 보정 전문 에디터입니다.
사용자 요청을 정확히 이해하고, 요청한 부분만 수정합니다.
요청하지 않은 부분은 원본 그대로 유지합니다. 절대 전체를 재작성하지 마세요.

[문체 규칙]
- 원문의 어투(~요/~죠/~입니다)를 기본적으로 유지
- 한 문장 50자 이내 권장. 같은 어미 3연속 금지.
- AI 느낌 금지: "일반적으로", "~라고 알려져 있습니다", "또한", "더불어"
- ${getMedicalLawPromptBlock('brief')}

[출력] 순수 HTML(<p>, <h3>, <strong>, <em>)만. 설명/코멘트 금지.`;

  // 어투 보존이 기본. SEO/의료법 요청 시에만 격식체 허용
  const wantsFormal = wantsSEO || wantsMedLaw;
  const toneRule = wantsFormal
    ? '[어투] 격식체(~입니다/~합니다) 사용. "~하세요" → "~을 고려해 보실 수 있습니다"'
    : `[어투 보존 — 최우선!] 원문의 어투(~요/~죠/~입니다)를 그대로 유지. 어투를 바꾸는 것이 아니라 같은 어투 안에서 다듬는 것이 목표.`;

  const prompt = `[독자 인식]
이 글의 독자는 특정 증상/질환 때문에 병원을 알아보는 본인 또는 가족이다.
행동 요구 금지, 불안 자극 금지, 판단은 독자에게.

${toneRule}
${MEDICAL_LAW_COMMON}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 사용자 요청: ${safeUserMessage}
${scopeInstruction}
${actionInstruction ? `\n[동작 지침] ${actionInstruction}` : ''}

[감지된 의도]
${[
    wantsExpand && '확장',
    wantsShorter && '축소',
    wantsRephrase && '표현 변경',
    wantsHumanize && '자연스럽게',
    wantsDelete && '삭제',
    wantsAdd && '추가',
    wantsReplace && '교체',
    wantsTone && '톤 변경',
    wantsFact && '팩트 보강',
    wantsSEO && 'SEO',
    wantsMedLaw && '의료법',
    wantsDentalLab && '기공소/보철',
    wantsReorder && '순서 변경',
    wantsSubheading && '소제목 수정',
    wantsEmphasis && '강조',
    wantsExample && '예시 추가',
    wantsFAQ && 'FAQ',
    wantsSimplify && '쉽게 풀기',
    isSpecific && '특정 위치 지정',
  ].filter(Boolean).join(', ') || '일반 수정'}

현재 글자 수: ${currentLength}자
${safeCrawledContent ? `\n[참고 자료 — 출처 표시 없이 내용만 참고]\n${safeCrawledContent}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 현재 콘텐츠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${safeWorkingContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${MARK_CHANGES}
수정한 전체 글을 HTML로 출력하세요. 수정하지 않은 부분도 포함하여 전체를 출력하세요.`;

  return { systemInstruction, prompt };
}
