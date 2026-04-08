/**
 * 카드뉴스 AI 액션 — ProRenderer에서 추출된 순수 async 함수.
 * state setter 없이 결과만 반환. 호출부에서 state 관리.
 */
import type { SlideData, SlideLayoutType, SlideComparisonColumn } from './cardNewsLayouts';
import { SLIDE_IMAGE_STYLES } from './cardNewsLayouts';

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

⚠️ 순수 일러스트/사진만 생성. 텍스트·프레임·카드 레이아웃·빈 공간·UI 요소 절대 포함하지 말 것. 배경은 단색 또는 투명.`;
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

/** AI 텍스트 필드 추천. 반환: 추천 텍스트 또는 null */
export async function suggestSlideText(
  slide: SlideData,
  field: 'title' | 'subtitle' | 'body',
  allSlides: SlideData[],
): Promise<string | null> {
  const context = `카드뉴스 슬라이드 ${slide.index}장 (레이아웃: ${slide.layout})
현재 제목: ${slide.title}
현재 부제: ${slide.subtitle || ''}
현재 본문: ${slide.body || ''}
전체 주제: ${allSlides[0]?.title || ''}`;
  const prompts: Record<string, string> = {
    title: '위 카드뉴스 슬라이드의 제목을 더 매력적으로 다시 써줘. 20자 이내. 제목 한 줄만 출력. 따옴표·설명 금지.',
    subtitle: '위 슬라이드의 부제를 써줘. 25자 이내. 부제 한 줄만 출력. 따옴표·설명 금지.',
    body: '위 슬라이드의 본문을 구체적 수치 포함해 다시 써줘. 3문장 이내. 본문만 출력. 따옴표·설명 금지.',
  };
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `${context}\n\n${prompts[field]}`,
      systemInstruction: '카드뉴스 콘텐츠 전문가. 요청한 필드 값만 반환. 의료광고법 준수. 최상급/단정 표현 금지.',
      model: 'gemini-3.1-pro-preview',
      temperature: 0.8,
      maxOutputTokens: 200,
    }),
  });
  const data = await res.json() as { text?: string };
  if (data.text) {
    const cleaned = data.text.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (cleaned) return cleaned;
  }
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
    const cleaned = data.text.replace(/^["'`]+|["'`]+$/g, '').replace(/\n/g, ' ').replace(/```/g, '').trim();
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
      prompt: `"${slide.title}" 주제로 2열 비교표를 만들어줘.
JSON 한 객체만 출력:
{"compareLabels": ["항목1","항목2","항목3","항목4"], "columns": [{"header":"A","highlight":false,"items":["값","값","값","값"]},{"header":"B","highlight":true,"items":["값","값","값","값"]}]}`,
      systemInstruction: 'JSON만 출력. 의료 전문가. 구체적 수치 포함. 최상급/단정 표현 금지.',
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
