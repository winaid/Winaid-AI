/**
 * AI 보정 프롬프트 — OLD ContentRefiner.tsx parity
 *
 * 2가지 모드: 자동 보정 (6종 방향) + 채팅 수정 (대화형)
 * HTML 출력, 의료광고법 준수, AI 느낌 제거, Google Search 연동
 */

import { getMedicalLawPromptBlock } from './medicalLawRules';

export type RefineMode = 'natural' | 'professional' | 'shorter' | 'longer' | 'medical_law' | 'seo';

export interface RefineRequest {
  originalText: string;
  mode: RefineMode;
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

// 모든 모드 공통
const BASE_RULES = `
[공통 규칙]
- ${getMedicalLawPromptBlock(true)}
- AI 느낌 제거: "또한", "더불어", "아울러", "이러한", "해당" → 삭제 또는 자연스러운 표현
- 출처/인용 표현 금지: "~에 따르면", "연구에 따르면" → 정보를 자연스럽게 녹여서 서술
- "해당/상기/동일한" → "이런/이"`;

// 격식체 모드 전용 (professional, medical_law, seo)
const FORMAL_RULES = `
[격식체 규칙]
- "~요/~죠" 종결어미 → "~입니다/~합니다" 사용
- "~하세요" 행동유도 → "~할 수 있습니다" 가능성 표현
- 만연체 금지: 한 문장 최대 50자, 쉼표 2개 이상이면 문장 분리`;

// 원문 어투 보존 (natural, shorter, longer)
const PRESERVE_TONE_RULES = `
[원문 어투 보존 — 가장 중요!]
- 원문이 "~는데요", "~거든요", "~해요" 체면 그 어투를 그대로 유지하세요.
- 원문이 "~입니다" 체면 그대로 유지하세요.
- 어투를 바꾸는 것이 아니라, 같은 어투 안에서 다듬는 것이 목표입니다.
- 원문의 문장 길이를 존중하세요. 긴 문장을 무조건 자르지 마세요.`;

// 변경점 표시 지침 (모든 모드에 추가)
const MARK_CHANGES = `
[변경점 표시]
수정한 부분을 <mark> 태그로 감싸주세요.
- 새로 추가한 문장: <mark class="added">추가된 텍스트</mark>
- 표현을 바꾼 부분: <mark class="changed">변경된 텍스트</mark>
- 삭제는 그냥 삭제 (표시 불필요)`;

const MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  natural: `아래 글을 더 자연스럽고 읽기 편하게 다듬어주세요.

[핵심 원칙]
- 원문의 어투와 말투를 최대한 유지합니다.
- 어투를 바꾸는 것이 아니라, 같은 어투 안에서 매끄럽게 다듬는 것이 목표입니다.

[수정 대상]
- 어색한 문장 연결 → 자연스러운 연결
- 불필요한 반복 표현 제거
- AI 특유의 기계적 표현 → 사람이 쓸 법한 표현 (예: "해당 부분" → "이 부분", "~하는 것이 중요합니다" → 문맥에 맞게)
- 같은 종결어미 연속 반복 → 다양하게 변주

[변환 예시]
❌ "임플란트는 치아를 대체하는 좋은 시술입니다. 많은 분들이 만족하고 계십니다."
✅ "임플란트는 빠진 치아를 대신하는 시술입니다. 잇몸뼈에 나사를 심고, 그 위에 치아를 얹습니다."
❌ "해당 치료의 경우 다양한 장점이 있는 것으로 알려져 있습니다."
✅ "이 치료는 인접 치아를 깎지 않아도 되고, 저작력이 자연치아의 80~90%까지 회복됩니다."

[절대 하지 말 것]
- 원문의 종결어미(~요/~죠/~입니다)를 일괄 변경
- 원문 문장을 짧게 자르기만 하는 것
- 원문에 없는 새 정보 추가
- 소제목 구조 변경
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  professional: `아래 글을 더 전문적이고 신뢰감 있게 다듬어주세요.

[구체적 변환 규칙]
- 일반 표현 → 전문 용어 교체 (괄호에 쉬운 설명 병기)
  예: "잇몸이 부었다" → "치은 종창(잇몸이 부어오른 상태)"
  예: "이가 흔들린다" → "치아 동요도 증가(치아가 흔들리는 현상)"
- 모호한 표현 → 구체적 수치/기준으로 교체
  예: "꽤 오래 걸립니다" → "평균 3~6개월의 치유 기간이 필요합니다"
- 원인-결과를 명확히 연결
  예: "잇몸병이 생길 수 있습니다" → "치주 포켓에 세균이 축적되면 잇몸 염증으로 진행될 수 있습니다"
- 단계/분류가 있으면 구조화 (초기/중기/후기 등)

[진료과별 전문 용어 예시]
- 피부과: "피부 벗기기" → "화학 박피(chemical peeling)", "주름 펴기" → "보톡스(보툴리눔톡신 A 주사)"
- 정형외과: "무릎 물차기" → "관절 천자(joint aspiration)", "디스크 수술" → "추간판 절제술(discectomy)"
${BASE_RULES}
${FORMAL_RULES}`,

  shorter: `아래 글을 핵심만 남기고 간결하게 줄여주세요.

[삭제 우선순위 — 위에서부터 먼저 삭제]
1순위: 같은 내용을 다른 표현으로 반복한 문장
2순위: "~할 수 있습니다", "~에 도움이 됩니다" 같은 뭉뚱그리기 문장
3순위: 부연 설명 (핵심 정보가 없는 "즉,", "다시 말해," 문장)
4순위: 마무리 인사/권유가 2문단 이상이면 1문단으로 압축

[절대 삭제 금지]
- 구체적 수치/기간/횟수가 포함된 문장
- 소제목 (구조 유지)
- 의료법 관련 주의 문구

[변환 예시]
원문 (3문장): "잇몸병은 초기에 발견하면 치료가 비교적 간단합니다. 하지만 진행되면 치료 기간이 길어지고 비용도 늘어날 수 있습니다. 따라서 정기적인 검진을 통해 조기에 발견하는 것이 중요합니다."
✅ 축소 (1문장): "잇몸병은 초기 발견 시 치료가 간단하지만, 진행되면 기간과 비용이 늘어날 수 있어 정기 검진이 중요합니다."

원본의 50~70% 분량
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  longer: `아래 글의 내용을 더 풍성하고 구체적으로 확장해주세요.

[확장 우선순위]
1순위: 구체적 수치/기간이 없는 문장에 수치 보강
2순위: "왜?"가 빠진 곳에 원인/이유 1문장 추가
3순위: 환자 관점 디테일 (시술 후 느낌, 회복 중 생활, 음식 제한 등)
4순위: 비교/대안 정보 (다른 치료 옵션과의 차이)

[확장 방법 — 아무거나 늘리지 마세요]
- 각 소제목 아래에 "왜?"를 한 번 더 설명 추가
  예: "잇몸이 붓습니다" → + "이는 세균이 잇몸 조직에 염증 반응을 일으키기 때문입니다"
- 환자가 궁금해할 디테일 추가
  예: "수술 후 관리" → + "수술 당일 부드러운 음식만, 3일간 해당 부위 양치 피하기, 1주 후 실밥 제거"
- 비교/대조 추가 (선택지가 있는 경우)
  예: "임플란트" → + "브릿지, 틀니와 비교 시 인접 치아를 깎지 않아도 되는 장점"
- 원문에 없는 새 주제를 만들지 마세요. 기존 내용의 깊이만 추가.
- 원본의 130~150% 분량. 원문 어투 유지.
${BASE_RULES}
${PRESERVE_TONE_RULES}`,

  medical_law: `아래 글에서 의료광고법 위반 리스크가 있는 표현을 모두 찾아 자동으로 수정해주세요.

[의료광고법 제56조 위반 유형별 수정]
1. 최상급/과장: "최고/최초/유일/탁월/혁신적" → "우수한/전문적인/새로운 방식의"
2. 보장/단정: "완치/100%/확실/보장/부작용 없는" → "~에 도움이 될 수 있습니다/개인차가 있을 수 있으며"
3. 행동 유도: "~하세요/~받으세요/~추천합니다" → "~을 고려해 보실 수 있습니다"
4. 비교: "타 병원 대비/~보다 우수" → 삭제 또는 객관적 정보로 대체
5. 효과 주장: "높은 성공률/효과가 뛰어난" → "도움이 될 수 있는"

- 수정한 부분은 원래 의미를 최대한 살리면서 자연스럽게
- 문맥상 문제없는 표현은 건드리지 마세요 (예: "완치가 어렵다" → 부정 맥락이므로 OK)
${BASE_RULES}
${FORMAL_RULES}`,

  seo: `아래 글을 네이버 검색 노출에 유리하도록 구조를 개선해주세요.

[네이버 SEO 구체적 규칙]
- 소제목: <h3>만 사용. 각 소제목에 핵심 키워드 1개 이상 포함
- 첫 문단: 핵심 키워드가 자연스럽게 2회 이상 등장
- 문단 길이: 3~5문장 (너무 짧으면 스마트블록에 안 잡힘, 너무 길면 가독성 저하)
- 소제목 간격: 2~3문단마다 소제목 1개
- 키워드 밀도: 전체 글에서 핵심 키워드가 자연스럽게 5~8회 등장
- 네이버 스마트블록 최적화: 질문형 소제목 1~2개 포함 ("~할까요?", "~일까요?")

[하지 말 것]
- 키워드 억지 삽입 (문맥에 안 맞는 곳에 끼워넣기)
- 소제목 순서 변경 (정보 흐름은 유지)
- 내용 자체를 바꾸지 말고 구조만 개선

[변환 예시]
❌ 소제목: "치료 방법" → ✅ "임플란트 치료, 어떻게 진행될까요?"
❌ 첫 문단: "치아가 빠지면 불편합니다." → ✅ "임플란트는 빠진 치아를 대체하는 대표적인 치료법입니다."
${BASE_RULES}
${FORMAL_RULES}`,
};

export function buildRefinePrompt(req: RefineRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const systemInstruction = `당신은 한국 병원 블로그 콘텐츠를 다듬는 전문 에디터입니다.
원본의 핵심 내용과 의도를 유지하면서, 요청된 방향으로 글을 수정합니다.

[문체 규칙]
- 한 문장 50자 이내 권장. 같은 어미 3연속 금지.
- 감각 표현 활용: "찌릿한", "욱신거리는", "뻣뻣한"
- 구체적 숫자: "오래" → "약 3~6개월"
- AI 느낌 금지: "일반적으로", "~라고 알려져 있습니다", "~에 대해 알아보겠습니다"
- 접속부사 금지: "또한", "더불어", "아울러" → 내용 흐름으로 대체

[출력] 순수 HTML(<p>, <h3>, <strong>, <em>)만. 마크다운/코드블록 금지.`;

  const prompt = `${MODE_INSTRUCTIONS[req.mode]}
${MARK_CHANGES}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 원문
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${req.originalText}
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
  let scopeInstruction = '';
  if (targetSection) {
    scopeInstruction = `\n⚠️ 수정 범위: ${targetSection[1]}번째 ${targetSection[2]}만 수정하세요. 나머지는 원본 그대로 유지.`;
  } else if (targetIntro) {
    scopeInstruction = '\n⚠️ 수정 범위: 도입부(첫 번째 <h3> 태그 이전)만 수정하세요. 나머지는 원본 그대로.';
  } else if (targetConclusion) {
    scopeInstruction = '\n⚠️ 수정 범위: 마지막 소제목 섹션만 수정하세요. 나머지는 원본 그대로.';
  } else if (targetSpecificText) {
    scopeInstruction = `\n⚠️ 수정 범위: "${targetSpecificText[1]}" 부분만 수정하세요. 나머지는 원본 그대로.`;
  }

  // ── 동작별 지침 ──
  let actionInstruction = '';
  if (wantsDelete) {
    actionInstruction = '삭제 요청: 해당 부분을 제거하고, 앞뒤 문맥이 자연스럽게 연결되도록 다듬으세요.';
  } else if (wantsReplace) {
    actionInstruction = '교체 요청: 해당 표현을 사용자가 원하는 방향으로 바꾸되, 전체 톤을 유지하세요.';
  } else if (wantsAdd) {
    actionInstruction = '추가 요청: 요청된 내용을 적절한 위치에 자연스럽게 삽입하세요. 기존 흐름을 깨지 마세요.';
  } else if (wantsTone) {
    actionInstruction = '톤 변경: 전체 글의 어투/분위기를 요청대로 조정하세요.';
  } else if (wantsFact) {
    actionInstruction = '팩트 보강: 관련 수치, 통계, 의학적 근거를 추가하세요. 확실하지 않은 수치는 넣지 마세요.';
  } else if (wantsSEO) {
    actionInstruction = 'SEO 개선: 키워드를 자연스럽게 배치하고 소제목을 검색 친화적으로 다듬으세요.';
  } else if (wantsDentalLab) {
    actionInstruction = '기공소/보철 전문성 보강: 보철 재료(지르코니아/PFM/e.max), 기공 과정(CAD/CAM, 밀링), 기공사 역할 등 디테일 추가.';
  } else if (wantsMedLaw) {
    actionInstruction = '의료광고법 수정: 위반 가능성이 있는 표현을 찾아 중립적으로 수정하세요.';
  } else if (wantsReorder) {
    actionInstruction = '순서 변경: 지정된 문단/소제목의 위치를 이동하세요. 앞뒤 연결이 자연스럽게.';
  } else if (wantsSubheading) {
    actionInstruction = '소제목 수정: 해당 소제목을 변경하세요. 네이버 검색 친화적이고 짧게 (10~25자).';
  } else if (wantsEmphasis) {
    actionInstruction = '강조: 해당 부분을 <strong> 태그로 감싸거나 문장을 더 임팩트 있게 수정하세요.';
  } else if (wantsExample) {
    actionInstruction = '예시 추가: 구체적인 사례나 비유를 추가하세요. 환자가 체감할 수 있는 예시로.';
  } else if (wantsFAQ) {
    actionInstruction = 'FAQ 추가: 환자가 자주 묻는 질문 3~5개를 글 마지막에 Q&A 형태로 추가하세요.';
  } else if (wantsSimplify) {
    actionInstruction = '쉽게 풀기: 전문 용어에 괄호 설명을 추가하고, 복잡한 문장을 2~3개로 나누세요.';
  }

  // 모호한 요청 시 보수적 접근
  if (!isSpecific && !wantsDelete && !wantsReplace && !wantsAdd && !wantsTone && !wantsFact && !wantsSEO && !wantsMedLaw && !wantsDentalLab && !wantsReorder && !wantsSubheading && !wantsEmphasis && !wantsExample && !wantsFAQ && !wantsSimplify) {
    actionInstruction += '\n사용자의 요청이 구체적이지 않습니다. 수정 범위를 최소화하세요. 확실한 부분만 수정하고, 불확실하면 원본을 유지하세요.';
  }

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

  // 어투 보존이 기본. 격식체 전환은 명시적 요청(전문적/의료법/SEO) 시에만
  const wantsFormal = wantsSEO || wantsMedLaw;
  const chatRules = wantsFormal
    ? `${BASE_RULES}\n${FORMAL_RULES}`
    : `${BASE_RULES}\n${PRESERVE_TONE_RULES}`;

  const prompt = `[독자 인식]
이 글의 독자는 특정 증상/질환 때문에 병원을 알아보는 본인 또는 가족이다.
행동 요구 금지, 불안 자극 금지, 판단은 독자에게.

${chatRules}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 사용자 요청: ${userMessage}
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
${crawledContent ? `\n[참고 자료 — 출처 표시 없이 내용만 참고]\n${crawledContent}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 현재 콘텐츠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${workingContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${MARK_CHANGES}
수정한 전체 글을 HTML로 출력하세요. 수정하지 않은 부분도 포함하여 전체를 출력하세요.`;

  return { systemInstruction, prompt };
}
