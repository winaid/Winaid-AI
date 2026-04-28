/**
 * 카드뉴스 AI 액션 — ProRenderer에서 추출된 순수 async 함수.
 * state setter 없이 결과만 반환. 호출부에서 state 관리.
 */
import type { SlideData, SlideLayoutType, SlideComparisonColumn } from './cardNewsLayouts';
import { SLIDE_IMAGE_STYLES } from './cardNewsLayouts';
import { getMedicalLawPromptBlock, detectForbiddenWords, applyContentFilters } from '@winaid/blog-core';

/**
 * Gemini 응답을 "출력 가능한 순수 한 줄 텍스트"로 정리.
 * 마크다운 코드펜스, 양끝 구두점/따옴표/JSON 기호, 내부 불릿/헤더,
 * 연속 공백을 제거하고 길이 캡을 적용한다.
 *
 * filterOutputArtifacts 전 단계 — JSON/따옴표 쓰레기만 씻고,
 * AI 말투·금지어 처리는 applyContentFilters 에 맡긴다.
 */
function sanitizeAiText(raw: string, opts?: { maxLen?: number }): string {
  let t = raw;
  // 1) 마크다운 코드펜스 제거
  t = t.replace(/```[a-z]*\n?|```/gi, '');
  // 2) 양끝 구두점/따옴표/JSON 기호 반복 제거 (고정점까지, 최대 5회)
  for (let i = 0; i < 5; i++) {
    const prev = t;
    t = t.trim().replace(/^[\s"'`,;:\[\]{}()]+|[\s"'`,;:\[\]{}()]+$/g, '');
    if (t === prev) break;
  }
  // 3) 내부 불릿/헤더 제거 (줄 시작의 - * # 들)
  t = t.replace(/^[-*#]+\s+/gm, '');
  // 4) 연속 공백/줄바꿈 → 단일 공백
  t = t.replace(/\s+/g, ' ').trim();
  // 5) 길이 캡
  const max = opts?.maxLen ?? 200;
  if (t.length > max) t = t.slice(0, max).trim();
  return t;
}

/**
 * 레이아웃 변경 시 새 레이아웃에 맞는 기본값을 채운 SlideData 반환.
 * AI 호출 없음 — 순수 데이터 변환.
 */
export function buildLayoutDefaults(slide: SlideData, newLayout: SlideLayoutType): SlideData {
  const base: SlideData = { ...slide, layout: newLayout };

  switch (newLayout) {
    case 'checklist':
      if (!base.checkItems?.length) base.checkItems = ['항목 1', '항목 2', '항목 3'];
      break;
    case 'icon-grid':
      if (!base.icons?.length) base.icons = [
        { emoji: '🦷', title: '항목 1', desc: '설명' },
        { emoji: '💉', title: '항목 2', desc: '설명' },
        { emoji: '⏱️', title: '항목 3', desc: '설명' },
        { emoji: '✨', title: '항목 4', desc: '설명' },
      ];
      break;
    case 'steps':
      if (!base.steps?.length) base.steps = [
        { label: '1단계', desc: '설명' },
        { label: '2단계', desc: '설명' },
        { label: '3단계', desc: '설명' },
      ];
      break;
    case 'comparison':
      if (!base.columns?.length) {
        base.compareLabels = ['항목 1', '항목 2', '항목 3'];
        base.columns = [
          { header: 'A 방식', highlight: false, items: ['-', '-', '-'] },
          { header: 'B 방식', highlight: true, items: ['-', '-', '-'] },
        ];
      }
      break;
    case 'data-highlight':
      if (!base.dataPoints?.length) base.dataPoints = [
        { value: '00%', label: '항목 1', highlight: true },
        { value: '00', label: '항목 2' },
        { value: '00', label: '항목 3' },
      ];
      break;
    case 'qna':
      if (!base.questions?.length) base.questions = [
        { q: '질문을 입력하세요?', a: '답변을 입력하세요.' },
        { q: '두 번째 질문?', a: '답변.' },
      ];
      break;
    case 'timeline':
      if (!base.timelineItems?.length) base.timelineItems = [
        { time: '1일차', title: '항목', desc: '설명' },
        { time: '1주차', title: '항목', desc: '설명' },
        { time: '1개월', title: '항목', desc: '설명' },
      ];
      break;
    case 'quote':
      if (!base.quoteText) {
        base.quoteText = '여기에 인용문을 입력하세요.';
        base.quoteAuthor = base.quoteAuthor || '작성자';
        base.quoteRole = base.quoteRole || '역할';
      }
      break;
    case 'before-after':
      if (!base.beforeItems?.length) {
        base.beforeLabel = base.beforeLabel || 'BEFORE';
        base.afterLabel = base.afterLabel || 'AFTER';
        base.beforeItems = ['항목 1', '항목 2', '항목 3'];
        base.afterItems = ['항목 1', '항목 2', '항목 3'];
      }
      break;
    case 'pros-cons':
      if (!base.pros?.length) {
        base.pros = ['장점 1', '장점 2', '장점 3'];
        base.cons = ['주의점 1', '주의점 2', '주의점 3'];
      }
      break;
    case 'price-table':
      if (!base.priceItems?.length) base.priceItems = [
        { name: '시술 A', price: '00만원', note: '기준' },
        { name: '시술 B', price: '00만원', note: '기준' },
        { name: '시술 C', price: '00만원', note: '기준' },
      ];
      break;
    case 'numbered-list':
      if (!base.numberedItems?.length) base.numberedItems = [
        { num: '01', title: '항목 1', desc: '설명' },
        { num: '02', title: '항목 2', desc: '설명' },
        { num: '03', title: '항목 3', desc: '설명' },
      ];
      break;
    case 'warning':
      if (!base.warningItems?.length) base.warningItems = [
        '주의사항 1',
        '주의사항 2',
        '주의사항 3',
      ];
      break;
    case 'info':
    case 'closing':
      if (!base.body) base.body = '내용을 입력하세요';
      break;
    default:
      break;
  }

  return base;
}

/** 레이아웃 변경 후 AI로 내용 자동 채우기. 기존 제목/주제를 기반으로 새 레이아웃에 맞는 데이터 생성. */
export async function fillLayoutContent(
  slide: SlideData,
  allSlides: SlideData[],
): Promise<Partial<SlideData> | null> {
  const layout = slide.layout;
  // 이미 내용이 채워져 있으면 스킵 (플레이스홀더가 아닌 경우)
  const hasRealContent = (
    (slide.checkItems && slide.checkItems.some(i => !i.startsWith('항목'))) ||
    (slide.steps && slide.steps.some(s => !s.label.includes('단계'))) ||
    (slide.icons && slide.icons.some(i => !i.title.startsWith('항목'))) ||
    (slide.columns && slide.columns.some(c => !c.header.startsWith('A') && !c.header.startsWith('B'))) ||
    (slide.body && slide.body !== '내용을 입력하세요')
  );
  if (hasRealContent) return null;

  const topic = allSlides[0]?.title || slide.title;
  const fieldMap: Record<string, string> = {
    'checklist': 'checkItems (문자열 배열 3~5개)',
    'steps': 'steps (배열: [{label, desc}] 3~4개)',
    'icon-grid': 'icons (배열: [{emoji, title, desc}] 3~6개, emoji는 실제 이모지)',
    'comparison': 'compareLabels (문자열 배열 3~4개) + columns (배열: [{header, items, highlight}] 2개)',
    'qna': 'questions (배열: [{q, a}] 2~3개)',
    'timeline': 'timelineItems (배열: [{time, title, desc}] 3~4개)',
    'before-after': 'beforeLabel + afterLabel + beforeItems (배열 3개) + afterItems (배열 3개)',
    'pros-cons': 'pros (배열 3개) + cons (배열 3개)',
    'price-table': 'priceItems (배열: [{name, price, note}] 3~5개)',
    'data-highlight': 'dataPoints (배열: [{value, label, highlight}] 3개)',
    'numbered-list': 'numberedItems (배열: [{title, desc}] 3~5개)',
    'warning': 'warningTitle + warningItems (문자열 배열 3~4개)',
    'info': 'body (본문 2~3문장)',
    'quote': 'quoteText + quoteAuthor + quoteRole',
    'cover': 'subtitle (부제 1문장)',
    'closing': 'subtitle (마무리 멘트 1문장) + body (행동 유도 문구)',
  };
  const fields = fieldMap[layout];
  if (!fields) return null;

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `카드뉴스 "${topic}" 주제의 "${slide.title}" 슬라이드를 "${layout}" 레이아웃에 맞게 채워줘.

필요한 필드: ${fields}

규칙:
- 의료/건강 맥락에 맞는 구체적 내용
- 의료광고법 준수 (과장/단정 금지)
- 가격은 범위로 (예: 3~5만원)
- JSON 객체만 출력. 마크다운/설명 금지.`,
        systemInstruction: '카드뉴스 콘텐츠 전문가. 요청한 필드만 JSON으로 반환.',
        model: 'gemini-3.1-flash-lite-preview',
        temperature: 0.7,
        maxOutputTokens: 1000,
      }),
    });
    const data = await res.json() as { text?: string };
    if (!data.text) return null;
    const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    // layout은 보존
    delete parsed.layout;
    delete parsed.index;
    delete parsed.title;
    return parsed;
  } catch {
    return null;
  }
}

/** AI 이미지 생성. 반환: imageDataUrl 또는 null */
export async function generateSlideImage(
  slide: SlideData,
  cardRatio: string,
): Promise<string | null> {
  const styleId = slide.imageStyle || 'illustration';
  const styleDef = SLIDE_IMAGE_STYLES.find(s => s.id === styleId) || SLIDE_IMAGE_STYLES[0];
  const subject = slide.visualKeyword || slide.title;
  const fullPrompt = `${subject}, ${styleDef.prompt}

[CARD NEWS ILLUSTRATION RULES]
- Pure illustration/photo only. NO text, frames, card layouts, UI elements, empty spaces.
- Background: solid color or transparent. No complex backgrounds.
- Medical accuracy: realistic proportions, real medical equipment only.
- Korean hospital clinic aesthetic: clean, modern, professional.
- NO before/after comparison imagery.
- NO patient faces or identifiable features.
- NO advertising layout, poster, or infographic elements.
- Safe for medical marketing: no blood, gore, or distressing imagery.`;
  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fullPrompt,
      aspectRatio: slide.imageRatio || (slide.imagePosition === 'background'
        ? (cardRatio === '3:4' ? '3:4' : '1:1')
        : (cardRatio === '3:4' ? '3:4' : '16:9')),
      mode: 'blog',
      imageStyle: 'illustration',
    }),
  });
  const data = await res.json() as { imageDataUrl?: string; error?: string };
  if (res.ok && data.imageDataUrl) return data.imageDataUrl;
  console.warn('[CARD_AI] AI 이미지 생성 실패', data.error);
  return null;
}

/** suggestSlideText 추가 맥락 옵션 (모두 선택). backward compatible. */
export interface SuggestSlideTextOptions {
  /** 병원명 — theme.hospitalName */
  hospitalName?: string;
  /** 진료과 — 예: "치과", "성형외과" */
  hospitalDept?: string;
  /** 브랜드 톤 — 예: "따뜻하고 신뢰감 있는" */
  brandTone?: string;
  /** 카드뉴스 전체 주제. 생략 시 allSlides[0].title 사용. */
  topic?: string;
  /** 재클릭 다양성 — 이전에 이미 보여준 최근 문구들 (최대 5개). 중복 회피용. */
  recentAttempts?: string[];
}

/** 추천 각도 — 매 호출마다 무작위 1개 선택해 prompt 앞에 주입 (anchoring 완화) */
const SUGGEST_ANGLES: string[] = [
  '구체 수치(몇 주/몇 %/몇 회 등)를 포함해',
  '독자의 호기심을 자극하는 질문형으로',
  '시점(초기·중기·1주차 등)을 강조해',
  '비교·대비 구조(A는 X, B는 Y)로',
  '감정 공감(걱정/안심/궁금함 등)을 건드려',
  '숫자 리스트 어감(3가지/5단계)으로',
];

/** layout 별 톤 힌트 — Gemini 에 프롬프트로 주입 */
const LAYOUT_TONE_HINT: Record<string, string> = {
  cover: '호기심을 끄는 훅. 클릭 욕구 유발하되 과장 금지.',
  closing: '정리·공감·부드러운 마무리. 행동 유도 명령형("~하세요") 금지.',
  info: '정보 전달 중심. 명확하고 담백하게.',
  quote: '감정 공감 어조. 환자·보호자 시점 공감.',
  warning: '경각심은 있으되 공포 유발·과장 금지. 객관적 사실 중심.',
  checklist: '체크 리스트 제목답게 간결·행동 지향.',
  steps: '단계 흐름이 느껴지는 순차적 어조.',
  comparison: '중립적 비교. 한쪽 우월 뉘앙스 금지.',
  'data-highlight': '수치가 돋보이는 훅. 과장 없이 담담하게.',
  timeline: '시간 흐름 강조. 회복 과정의 현실적 기대치.',
  'before-after': '변화 강조 금지(의료법). 과정·관리 중심.',
  qna: '자주 묻는 질문 톤. 친절하고 간결.',
  'pros-cons': '장점·주의점 균형. 단정 금지.',
  'price-table': '가격 범위만. "최저가/할인" 금지.',
  'icon-grid': '항목이 병렬적으로 보이는 리스트 톤.',
  'numbered-list': '순서 있는 리스트 톤.',
};

/** field 별 few-shot 예시 — 좋은 예(✅) / 나쁜 예(❌ + 이유) */
const FEW_SHOT: Record<'title' | 'subtitle' | 'body', string> = {
  title: `[참고 예시]
✅ "잇몸 관리, 3개월이 분기점" — 구체 수치 + 행동 시점
✅ "임플란트 전 꼭 확인할 3가지" — 숫자로 호기심 유발
❌ "국내 최고의 임플란트 기술" — "최고" 최상급 (의료법 제56조)
❌ "100% 안전한 완치 보장" — "100%/완치/보장" 단정 3건`,
  subtitle: `[참고 예시]
✅ "치주염 초기 신호 4가지" — 카테고리 + 숫자
❌ "가장 뛰어난 치료 효과" — "가장/뛰어난" 비교·단정`,
  body: `[참고 예시]
✅ "치주염은 초기 잇몸 출혈로 시작됩니다. 3개월 주기 스케일링으로 진행 속도를 늦출 수 있으며, 개인차가 있습니다." — 수치 + 가능성 + 개인차
❌ "반드시 완치되는 획기적 치료로 부작용도 없습니다." — "반드시/완치/획기적/부작용 없는" 금지어 4건`,
};

/**
 * AI 텍스트 필드 추천.
 *
 * 파이프라인:
 *   Gemini 호출 → sanitizeAiText(JSON/따옴표/마크다운 제거 + 길이 캡)
 *     → applyContentFilters(의료광고법 자동 치환 + AI 말투 정리)
 *     → detectForbiddenWords(잔존 금지어 검사)
 *     → 남으면 금지어 명시 prepend 로 재시도 1회 (같은 파이프라인)
 *     → 2회차도 남으면 null 반환 (호출부에서 toast)
 *
 * 반환: 추천 텍스트 또는 null
 */
export async function suggestSlideText(
  slide: SlideData,
  field: 'title' | 'subtitle' | 'body',
  allSlides: SlideData[],
  options?: SuggestSlideTextOptions,
): Promise<string | null> {
  // ── 전·후 슬라이드 ±2개 요약 ──
  const currentIdx = allSlides.findIndex(s => s.id === slide.id);
  const idx = currentIdx >= 0 ? currentIdx : (slide.index - 1);
  const nearbyRange = (start: number, end: number) =>
    allSlides.slice(Math.max(0, start), Math.min(allSlides.length, end))
      .filter(s => s.id !== slide.id)
      .map(s => `  ${s.index}장 (${s.layout}): "${s.title}"${s.subtitle ? ` — ${s.subtitle}` : ''}`)
      .join('\n');
  const beforeSummary = nearbyRange(idx - 2, idx);
  const afterSummary = nearbyRange(idx + 1, idx + 3);
  const topicValue = options?.topic || allSlides[0]?.title || '';
  const allTitlesList = allSlides
    .map(s => `  ${s.index}장: "${s.title}"`)
    .join('\n');

  // ── 병원 정보 블록 ──
  const hospitalLines: string[] = [];
  if (options?.hospitalName) hospitalLines.push(`병원: ${options.hospitalName}`);
  if (options?.hospitalDept) hospitalLines.push(`진료과: ${options.hospitalDept}`);
  if (options?.brandTone) hospitalLines.push(`브랜드 톤: ${options.brandTone}`);
  const hospitalBlock = hospitalLines.length > 0
    ? `\n[브랜드 컨텍스트]\n${hospitalLines.join('\n')}\n`
    : '';

  const layoutHint = LAYOUT_TONE_HINT[slide.layout] || '';

  // ── 같은 필드의 기존 값 + recentAttempts 를 avoid 리스트로 분리 ──
  // 기존 값을 context 에 "제목: XXX" 로 노출하면 모델이 anchoring 됨.
  // 따라서 같은 필드 값은 context 에서 빼고 [이미 시도한 문구] 블록으로 이동.
  const currentFieldValue = field === 'title' ? slide.title
    : field === 'subtitle' ? (slide.subtitle || '')
    : (slide.body || '');
  const avoidRaw: string[] = [];
  if (currentFieldValue && currentFieldValue.trim()) avoidRaw.push(currentFieldValue.trim());
  if (options?.recentAttempts) {
    for (const s of options.recentAttempts) {
      if (s && s.trim() && !avoidRaw.includes(s.trim())) avoidRaw.push(s.trim());
    }
  }
  const avoidList = avoidRaw.slice(0, 6); // 최대 6개 (현재 + 최근 5)
  const avoidBlock = avoidList.length > 0
    ? `\n[이미 시도한 문구 — 이와 중복/유사 금지 · 완전히 다른 각도로 써라]\n${avoidList.map(s => `- "${s}"`).join('\n')}`
    : '';

  // 같은 필드는 숨기고, 다른 필드들은 참고용으로 유지
  const otherFieldsLines: string[] = [];
  if (field !== 'title' && slide.title) otherFieldsLines.push(`제목: ${slide.title}`);
  if (field !== 'subtitle' && slide.subtitle) otherFieldsLines.push(`부제: ${slide.subtitle}`);
  if (field !== 'body' && slide.body) otherFieldsLines.push(`본문: ${slide.body}`);
  const otherFieldsBlock = otherFieldsLines.length > 0
    ? `\n[함께 존재하는 다른 필드 — 참고만]\n${otherFieldsLines.join('\n')}`
    : '';

  // ── 각도 무작위 ──
  const angle = SUGGEST_ANGLES[Math.floor(Math.random() * SUGGEST_ANGLES.length)];

  // ── 전체 컨텍스트 블록 ──
  const context = `[카드뉴스 전체 주제]
${topicValue}

[전체 슬라이드 구성]
${allTitlesList}
${hospitalBlock}
[현재 슬라이드 ${slide.index}장 — 레이아웃: ${slide.layout}]${otherFieldsBlock}
${layoutHint ? `\n[이 레이아웃의 톤]\n${layoutHint}` : ''}
${beforeSummary ? `\n[이전 슬라이드 맥락]\n${beforeSummary}` : ''}
${afterSummary ? `\n[이후 슬라이드 맥락]\n${afterSummary}` : ''}${avoidBlock}

[이번 톤: ${angle}]`;

  const prompts: Record<string, string> = {
    title: '위 맥락에 맞는 제목을 새로 써라. 20자 이내. 제목 한 줄만 출력. 따옴표·설명 금지.',
    subtitle: '위 맥락에 맞는 부제를 써라. 25자 이내. 부제 한 줄만 출력. 따옴표·설명 금지.',
    body: '위 맥락에 맞는 본문을 써라. 2~3문장. 구체 수치·범위·가능성("~할 수 있습니다") 포함. 본문만 출력. 따옴표·설명 금지.',
  };
  const outputFormatRule = 'JSON/배열/따옴표/콤마/설명/마크다운 금지. 순수 한 줄(또는 본문은 2~3문장) 텍스트만.';

  const systemInstruction = `${getMedicalLawPromptBlock('brief')}

카드뉴스 콘텐츠 전문가. 요청한 필드 값만 반환. 의료광고법 준수. 최상급/단정 표현 금지.

${FEW_SHOT[field]}`;

  const maxLen = field === 'body' ? 200 : 40;
  // 상향: title/subtitle 0.95, body 0.85 — anchoring 완화 + 각도 다양성 확보
  const temperature = field === 'body' ? 0.85 : 0.95;
  const topP = 0.95;
  // Day 8-1 에서 80/300 으로 축소했으나 2547f70 이후 프롬프트가 커지며
  // reasoning 토큰까지 포함해 출력이 짤림. 길이 제한은 prompt "N자 이내"
  // + sanitizeAiText maxLen 으로 충분하므로 여유를 복구한다.
  const maxOutputTokens = field === 'body' ? 500 : 220;

  /**
   * 짤린 출력(조각)인지 휴리스틱 감지.
   * - 너무 짧음 (<3자)
   * - 조사/어미로 끝남 (미완결 문장)
   * - 첫 글자가 단위 접미사(회/개/번/째/주/월/일/년/차) → 숫자가 짤린 잔해
   */
  const looksTruncated = (text: string): boolean => {
    const t = text.trim();
    if (t.length < 3) return true;
    const incomplete = /(에|의|을|를|이|가|은|는|도|와|과|로|으로|에서|에게|에는|으로는|보다|처럼|까지|부터|만)$/;
    if (field === 'body') {
      // body 는 문장부호로 안 끝나면 + 조사로 끝나면 미완결 확정
      if (!/[.!?…]\s*$/.test(t) && incomplete.test(t)) return true;
    } else {
      // title/subtitle 은 조사로 끝나면 거의 확실히 조각
      if (incomplete.test(t)) return true;
    }
    // "회 건강보험" 같이 단위 잔해가 앞에 붙은 케이스
    if (/^[회개번째주월일년차]/.test(t)) return true;
    return false;
  };

  /** 한 번의 Gemini 호출 + 파이프라인 실행. */
  const runOnce = async (extraPrefix: string): Promise<{ filtered: string; leftovers: string[]; truncated: boolean } | null> => {
    const promptBody = `${extraPrefix}${context}\n\n${prompts[field]}\n\n${outputFormatRule}`;
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptBody,
        systemInstruction,
        model: 'gemini-3.1-pro-preview',
        temperature,
        topP,
        maxOutputTokens,
      }),
    });
    const data = await res.json() as { text?: string };
    if (!data.text) return null;
    const sanitized = sanitizeAiText(data.text, { maxLen });
    if (!sanitized) return null;
    const truncated = looksTruncated(sanitized);
    const { filtered } = applyContentFilters(sanitized);
    const found = detectForbiddenWords(filtered);
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[suggestSlideText] raw Gemini response:', data.text);
      // eslint-disable-next-line no-console
      console.debug('[suggestSlideText] after sanitize:', sanitized);
      // eslint-disable-next-line no-console
      console.debug('[suggestSlideText] truncation suspected:', truncated);
      // eslint-disable-next-line no-console
      console.debug('[suggestSlideText] pipeline', {
        filtered,
        leftovers: found.map(f => f.word),
      });
    }
    return { filtered, leftovers: found.map(f => f.word), truncated };
  };

  // ── 호출 플로우 ──
  // 최대 3회: 1차 → truncation retry(있으면) → 의료법 retry(있으면)
  // 순서상 truncation 이 감지되면 truncation 을 먼저 해결 (그 결과가 금지어 포함이면 의료법 retry)
  let totalCalls = 0;
  const MAX_CALLS = 3;

  // 1차
  let current = await runOnce('');
  totalCalls++;
  if (!current) return null;

  // 짤린 경우 truncation retry 1회
  if (current.truncated && totalCalls < MAX_CALLS) {
    const truncPrefix = `⚠️ 이전 응답이 문장 중간에 짤렸다. 반드시 완결된 문장/문구로 다시 작성하라.\n\n`;
    const retried = await runOnce(truncPrefix);
    totalCalls++;
    if (retried) current = retried;
  }
  // truncation retry 후에도 짤려 있으면 null 반환
  if (current.truncated) return null;

  // 금지어 없으면 성공
  if (current.leftovers.length === 0) return current.filtered;

  // 의료법 retry 1회
  if (totalCalls < MAX_CALLS) {
    const medPrefix = `⚠️ 이전 응답에 금지어 [${current.leftovers.join(', ')}]이 포함됐다. 절대 사용 금지. 완전히 다른 표현으로 다시.\n\n`;
    const medRetried = await runOnce(medPrefix);
    totalCalls++;
    if (!medRetried) return null;
    if (medRetried.truncated) return null;
    if (medRetried.leftovers.length === 0) return medRetried.filtered;
  }

  // 모든 재시도 실패 — 호출부에서 toast
  return null;
}

/** AI 이미지 프롬프트 생성. 반환: 프롬프트 string 또는 null */
export async function suggestImagePrompt(
  slide: SlideData,
  allSlides: SlideData[],
): Promise<string | null> {
  const allTitles = allSlides.map(s => `${s.index}장: ${s.title}`).join('\n');
  const slideDetail = JSON.stringify({
    title: slide.title,
    subtitle: slide.subtitle,
    body: slide.body,
    layout: slide.layout,
    checkItems: slide.checkItems,
    icons: slide.icons,
    steps: slide.steps,
    columns: slide.columns,
    compareLabels: slide.compareLabels,
  });
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `당신은 의료 마케팅 이미지 프롬프트 전문가입니다.

이 카드뉴스의 전체 구성:
${allTitles}

현재 슬라이드 (${slide.index}장, 레이아웃: ${slide.layout}):
${slideDetail}

이미지 위치: ${slide.imagePosition || 'top'}

위 내용에 어울리는 이미지를 영어 프롬프트로 작성해주세요.

규칙:
1. 프롬프트만 출력 (다른 텍스트 없이)
2. 영어로 작성
3. 의료/치과 맥락에 정확하게 맞추기
4. 비현실적인 크기 금지 (예: 거대한 이빨 X) — 실제 비율에 맞는 의료 일러스트
5. 배경은 깨끗하고 단순하게 (복잡한 배경 X)
6. 카드뉴스에 어울리는 구도 (텍스트가 들어갈 공간 고려)
7. 스타일: ${slide.imageStyle || 'professional medical illustration, clean and modern'}
8. ${slide.imagePosition === 'top' || slide.imagePosition === 'bottom' ? '가로로 넓은 구도 (16:9 비율)' : '정사각형 구도 (1:1 비율)'}
9. 색상: 카드뉴스 테마에 어울리는 톤
10. 의료 장비/시술 이미지는 사실적이되 깨끗하고 전문적으로`,
      systemInstruction: '의료 마케팅 이미지 프롬프트 전문가. 영어 프롬프트 1줄만 출력. 마크다운/따옴표 금지.',
      model: 'gemini-3.1-pro-preview',
      temperature: 0.7,
      maxOutputTokens: 300,
    }),
  });
  const data = await res.json() as { text?: string };
  if (data.text) {
    // 영문 프롬프트는 의료광고법 재검증 미적용 — sanitize 로 파싱만 정리.
    const cleaned = sanitizeAiText(data.text, { maxLen: 500 });
    if (cleaned) return cleaned;
  }
  return null;
}

/** AI 웹 검색 보강. 반환: Partial<SlideData> patch 또는 null */
export async function enrichSlide(slide: SlideData): Promise<Partial<SlideData> | null> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `아래는 카드뉴스 슬라이드 JSON이다. 웹에서 ${new Date().getFullYear()}년 한국 기준 최신 수치(비용 평균, 성공률, 회복 기간, 건보 적용 등)를 검색해 이 슬라이드의 내용을 보강해라.
- 레이아웃(${slide.layout})은 유지.
- 제목·부제·본문·배열 필드들을 필요한 만큼 수정.
- 추가로 필요한 필드만 포함한 부분 패치(JSON 객체)를 출력. 슬라이드 전체가 아니라 수정할 필드만.
- 구체적 수치는 반드시 범위(예: "80~120만원", "3~6개월")로.
- 의료광고법 준수 (완치/최첨단/100%/유일 등 금지).
- 설명·마크다운 코드블록 금지. 순수 JSON 객체 하나만.

현재 슬라이드:
${JSON.stringify(slide, null, 2)}`,
      systemInstruction: '카드뉴스 콘텐츠 전문가. 웹 검색 결과 기반 최신 수치만 사용. JSON 부분 패치만 출력.',
      model: 'gemini-3.1-flash-lite-preview',
      temperature: 0.5,
      maxOutputTokens: 2048,
      googleSearch: true,
    }),
  });
  const data = await res.json() as { text?: string };
  if (data.text) {
    const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        const patch = JSON.parse(cleaned.slice(start, end + 1)) as Partial<SlideData>;
        const { layout: _ignore, ...safePatch } = patch as { layout?: string } & Partial<SlideData>;
        void _ignore;
        return safePatch;
      } catch (parseErr) {
        console.warn('[CARD_AI] enrich JSON 파싱 실패', parseErr);
      }
    }
  }
  return null;
}

/** AI 비교표 자동 생성. 반환: { columns, compareLabels } 또는 null */
export async function suggestComparison(
  slide: SlideData,
): Promise<{ columns: SlideComparisonColumn[]; compareLabels: string[] } | null> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `"${slide.title}" 주제로 2열 비교표를 작성해주세요.

[비교 항목 가이드]
- 4~5개 비교 기준 (예: 정의, 비용 범위, 시술 시간, 회복 기간, 주의사항)
- 수치는 범위로만 (예: "80~120만원", "3~6개월")
- 각 항목 20자 이내, 핵심만

[의료광고법]
- "최고/최초/유일/완치/100%" 금지
- 한쪽이 명확히 우월하다는 표현 금지 (중립적 비교)
- "개인차가 있을 수 있음" 필요 시 포함

JSON만 출력:
{"compareLabels":["기준1","기준2","기준3","기준4"],"columns":[{"header":"A 방식","highlight":false,"items":["값","값","값","값"]},{"header":"B 방식","highlight":true,"items":["값","값","값","값"]}]}`,
      systemInstruction: '의료 비교표 전문가. 중립적 비교. 구체적 수치 범위. JSON만 출력.',
      model: 'gemini-3.1-pro-preview',
      temperature: 0.7,
      maxOutputTokens: 500,
      responseType: 'json',
    }),
  });
  const data = await res.json() as { text?: string };
  if (data.text) {
    try {
      const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
      const parsed = JSON.parse(cleaned) as { compareLabels?: string[]; columns?: SlideComparisonColumn[] };
      if (parsed.compareLabels && parsed.columns) {
        return { compareLabels: parsed.compareLabels, columns: parsed.columns };
      }
    } catch (parseErr) {
      console.warn('[CARD_AI] comparison JSON 파싱 실패', parseErr);
    }
  }
  return null;
}

// ── 영감 이미지 스타일 분석 (카드뉴스 "영감 이미지 → 스타일 매칭" 기능용) ──

/**
 * 사용자가 업로드한 영감 이미지를 Gemini Vision 으로 분석한 결과.
 *   - `palette`      : 5개 hex 컬러 (proTheme 에 1:1 매핑 가능)
 *   - `mood`         : 영문 2~4단어 분위기 (`"calm clinical minimal"` 등)
 *   - `visualKeyword`: 영문 구문, AI 이미지 프롬프트·이미지 검색 쿼리 prefix 용
 *   - `description`  : 한국어 설명 (사용자 피드백용)
 */
export interface InspirationAnalysis {
  palette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
  };
  mood: string;
  visualKeyword: string;
  description: string;
}

// ── 내부 유틸: 간단한 해시 (캐시 키 용도, 암호학적 용도 아님) ──

/**
 * 문자열 → 짧은 36진수 해시. Java String.hashCode() 변형.
 * 충돌 가능성이 있으므로 보안 용도로 쓰면 안 됨 — 여기서는 sessionStorage
 * 캐시 키 길이만 줄이는 용도.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ── 내부 유틸: WCAG 대비비 계산 + 팔레트 보정 ──

/**
 * hex (`#rrggbb`) 문자열을 WCAG 2.0 상대 휘도(0~1)로 변환.
 * 잘못된 입력(짧은 hex, 빈 문자열)에 관대 — 실패 시 0 반환해 호출부가
 * fallback 로직(어두운 배경으로 취급)으로 자연스럽게 진행되도록.
 */
function relativeLuminance(hex: string): number {
  if (typeof hex !== 'string' || hex.length < 7 || hex[0] !== '#') return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 0;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** 두 hex 색상의 WCAG 대비비 (1~21). 높을수록 가독성 좋음. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Gemini Vision 이 뽑은 팔레트의 가독성을 검증해 필요 시 자동 보정.
 *  - body text ↔ background : WCAG AA 4.5:1 기준. 미달 시 text 를 흑/백으로 교체.
 *  - title(primary) ↔ background : AA Large Text 3:1 기준. 미달 시 primary 를
 *    배경 대비가 확보되는 어두운/밝은 색으로 교체.
 *
 * 색상을 바꾸는 기준:
 *   배경이 밝으면(L > 0.5) → 어두운 글자
 *   배경이 어두우면        → 밝은 글자
 */
function ensureContrast(palette: InspirationAnalysis['palette']): InspirationAnalysis['palette'] {
  const next = { ...palette };
  const bgLum = relativeLuminance(next.background);
  const isLightBg = bgLum > 0.5;

  // 1) 본문 텍스트 — AA 기준 4.5:1
  if (contrastRatio(next.background, next.text) < 4.5) {
    next.text = isLightBg ? '#1F2937' : '#F9FAFB';
  }
  // 2) 제목 (primary) — AA Large Text 기준 3:1 (24pt 이상 또는 굵은 글씨)
  if (contrastRatio(next.background, next.primary) < 3) {
    next.primary = isLightBg ? '#1E3A5F' : '#E0F2FE';
  }
  // 3) 부제 (secondary) — 마찬가지로 3:1 기준 (제목보다 약한 텍스트지만
  //    여전히 가독성 필요)
  if (contrastRatio(next.background, next.secondary) < 3) {
    next.secondary = isLightBg ? '#475569' : '#CBD5E1';
  }
  return next;
}

/**
 * 영감 이미지 1장을 Gemini Vision 으로 분석해 `InspirationAnalysis` 로 반환.
 *
 * - `/api/gemini` 의 기존 `inlineImages` 파라미터를 재사용 (별도 API 불필요)
 * - `responseType: 'json'` 으로 Gemini 가 JSON 만 반환하도록 강제 + 혹시
 *   마크다운 코드 블록이 섞이면 제거하는 폴백 파싱
 * - 실패 시(네트워크·파싱·필드 누락) null 반환 — 호출부가 기본 플로우로 계속
 *
 * 최적화:
 *  - sessionStorage 캐시 (동일 이미지 재업로드 시 Vision 재호출 회피)
 *  - 반환 직전 팔레트를 WCAG 기준으로 자동 보정 (본문 4.5, 제목/부제 3)
 *
 *
 * @param imageDataUrl  `data:image/...;base64,...` 형식. 1024px 이하로
 *                      리사이즈된 이미지 권장 (Gemini 호출 비용·지연 감소).
 */
export async function analyzeInspirationImage(imageDataUrl: string): Promise<InspirationAnalysis | null> {
  // ── 캐시 조회 ──
  // 전체 base64 를 키로 쓰면 sessionStorage 용량이 낭비되므로 앞 200자에
  // simpleHash 를 걸어 짧은 키로 쓴다. 충돌 위험이 있지만 sessionStorage 는
  // 탭 세션 단위라 false positive 가 발생해도 영향 범위가 작음.
  const cacheKey = 'winaid_inspiration_' + simpleHash(imageDataUrl.slice(0, 200));
  if (typeof sessionStorage !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const restored = JSON.parse(cached) as InspirationAnalysis;
        // 캐시된 값도 한 번 더 대비 보정을 통과시켜 규칙 변경 후 무효화를 가능하게.
        return { ...restored, palette: ensureContrast(restored.palette) };
      }
    } catch { /* 캐시 오염·quota — 조용히 무시 */ }
  }

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `이 이미지의 디자인 스타일을 분석해주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "palette": {
    "primary": "#hex (이미지의 가장 지배적인 색상)",
    "secondary": "#hex (두 번째 주요 색상)",
    "background": "#hex (배경 색상)",
    "text": "#hex (이 배경에 어울리는 텍스트 색상)",
    "accent": "#hex (강조/포인트 색상)"
  },
  "mood": "영문 2~4단어로 분위기 설명",
  "visualKeyword": "영문으로, AI 이미지 생성 프롬프트에 prefix로 붙일 수 있는 스타일 설명구. 예: soft watercolor illustration with warm earth tones",
  "description": "한국어로 이 이미지의 분위기와 스타일을 2~3문장으로 설명"
}`,
        systemInstruction: '이미지 디자인 분석 전문가. 요청한 JSON 스키마만 그대로 반환. 마크다운·설명·주석 금지.',
        inlineImages: [imageDataUrl],
        model: 'gemini-3.1-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 1000,
        responseType: 'json',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { text?: string };
    if (!data.text) return null;

    // Gemini 가 가끔 ```json ... ``` 으로 감쌀 수 있으므로 제거 후 파싱.
    const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<InspirationAnalysis>;
    // 필수 필드 방어 — palette 5개 + mood + visualKeyword 중 하나라도 없으면 무효 처리.
    const p = parsed.palette;
    if (!p || !p.primary || !p.secondary || !p.background || !p.text || !p.accent) return null;
    if (!parsed.mood || !parsed.visualKeyword) return null;
    // 팔레트 WCAG 대비 보정 — Gemini 가 뽑은 색이 너무 낮은 대비로 나오면
    // 텍스트가 배경에 섞여 안 읽히는 문제 방지.
    const safePalette = ensureContrast({
      primary: p.primary,
      secondary: p.secondary,
      background: p.background,
      text: p.text,
      accent: p.accent,
    });
    const result: InspirationAnalysis = {
      palette: safePalette,
      mood: parsed.mood,
      visualKeyword: parsed.visualKeyword,
      description: parsed.description || '',
    };
    // 캐시 저장 — 같은 이미지를 다시 업로드하면 Vision 재호출 없이 즉시 반환.
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(result));
      } catch { /* quota 초과 — 조용히 무시, 캐시는 best-effort */ }
    }
    return result;
  } catch (err) {
    console.warn('[CARD_AI] inspiration 분석 실패', err);
    return null;
  }
}
