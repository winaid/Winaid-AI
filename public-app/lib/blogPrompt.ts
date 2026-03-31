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
      return '3D 렌더 일러스트, Blender 스타일, 부드러운 스튜디오 조명, 파스텔 색상, 둥근 형태, 친근한 캐릭터, 깔끔한 배경 (⛔금지: 실사, 사진, DSLR)';
    case 'medical':
      return '의학 3D 일러스트, 해부학적 렌더링, 해부학적 구조, 장기 단면도, 반투명 장기, 임상 조명, 의료 색상 팔레트 (⛔금지: 귀여운 만화, 실사 얼굴)';
    default:
      return '실사 DSLR 사진, 진짜 사진, 35mm 렌즈, 자연스러운 부드러운 조명, 얕은 피사계심도, 전문 병원 환경 (⛔금지: 3D 렌더, 일러스트, 만화, 애니메이션)';
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

export function buildBlogPrompt(req: GenerationRequest): {
  systemInstruction: string;
  prompt: string;
} {
  const audienceGuide = AUDIENCE_GUIDES[req.audienceMode] || AUDIENCE_GUIDES['환자용(친절/공감)'];
  const personaGuide = PERSONA_GUIDES[req.persona] || PERSONA_GUIDES.hospital_info;
  const toneGuide = TONE_GUIDES[req.tone] || TONE_GUIDES.warm;
  const styleGuide = STYLE_GUIDES[req.writingStyle || 'empathy'] || '';
  const medLawNote = req.medicalLawMode === 'relaxed'
    ? '의료광고법 준수는 유지하되, "~수 있습니다", "~에 도움이 됩니다" 등의 표현을 적극 활용합니다.'
    : '의료광고법을 엄격히 준수합니다. "최고", "최초", "100%", 과장 표현 금지.';

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

  // 소제목 개수 가이드 (old gpt52-prompts-staged.ts 동일)
  let subheadingGuide: string;
  if (targetLength < 2000) subheadingGuide = '4개';
  else if (targetLength < 2500) subheadingGuide = '4~5개';
  else if (targetLength < 3000) subheadingGuide = '5개';
  else subheadingGuide = '5~6개';

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
    // ── 톤/어미/금지 표현 (OLD TONE 블록) ──
    '[어미 다양성 - AI 냄새 방지의 핵심]',
    '기본 체계는 ~습니다/~있습니다이되, 자연스러운 흐름 우선.',
    '- 같은 어미 3회 연속 금지 (가운데 하나를 다른 어미로)',
    '- "~수 있습니다"는 의료광고법 대상 표현에만 사용. 매 문장 금지',
    '- 긴 문장 뒤에는 짧은 문장 배치하면 리듬감 좋음',
    '',
    '[절대 금지 표현]',
    'AI 냄새: "~라고 알려져 있습니다" / "일반적으로" / "대부분의 경우" / "~에 해당합니다" / "~로 볼 수 있습니다" / "~에 영향을 미칩니다" / "다양한/여러 가지" / "~셈입니다"',
    '딱딱한 단어: 측면/관점/맥락/양상/경향/요인/파악하다/인지하다/유발하다/초래하다/적절한/효과적/체계적/상당히/유익하다/"~적인/~적으로" 3회 이하',
    '번역투: "~하는 것이 중요합니다" / "~하는 것으로 알려져" / "~를 가지고 있습니다" / "~에 의해 발생"',
    '메타 설명: "이 글에서는~" / "~에 대해 정리해봅니다" / "살펴보겠습니다"',
    '포장 문장: 문단 마지막에 앞 내용을 추상적으로 요약하는 문장 삭제',
    '독자 말 걸기(1개라도 있으면 실패): "~어떨까요/~해보세요/~해보시는 건/~확인해 보세요/~추천합니다/~궁금하실 겁니다"',
    '"해야" 전부 금지 / "바랍니다" 전부 금지',
    '',
    '[의학 표현 정밀도]',
    '- 쉽게 쓰되 틀리면 안 된다. 확실하지 않으면 빼라',
    '- 의인화 금지 ("바이러스의 끈질긴 생명력" → "감염력을 오래 유지하는 특성")',
    '- 모호한 뭉뚱그리기 금지 ("불편함" → "움직일 때 걸리는 느낌")',
    '- 모든 문단에 최소 1개 구체적 의학 정보 필수',
    '',
    '네이버 스마트블록 SEO에 최적화된 HTML 구조로 작성합니다.',
    '출력은 반드시 HTML입니다. <h3>으로 소제목, <p>로 문단을 작성합니다.',
    '',
    '🚨🚨🚨 [태그 규칙 - 절대 위반 금지] 🚨🚨🚨',
    '- <h1> 태그 사용 금지. 절대 사용하지 마세요.',
    '- <h2> 태그 사용 금지. 절대 사용하지 마세요.',
    '- 소제목은 오직 <h3> 태그만 사용합니다.',
    '- 마크다운 문법 금지: #, ##, ###, **, *, ``` 등 일체 금지.',
    '- 순수 HTML 태그만 사용합니다. (<h3>, <p>, <strong>, <em> 등)',
    '',
    `🚨 [글자 수 규칙 — 가장 중요!] 목표 글자 수(공백 포함): ${range.min}~${range.max}자. 이 범위를 반드시 지킵니다. ${range.max}자를 초과하면 절대 실패! 짧은 글은 짧게, 긴 글은 길게. 쓰다 보니 길어지는 것 금지 — 미리 분량을 계획하고 쓰세요.`,
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
    ctxParts.push('→ 위 정보를 자연스럽게 반영하되, 없는 서비스를 언급하지 마세요.');
    promptParts.push(...ctxParts);
  }

  promptParts.push(
    `- 이미지: ${targetImageCount}장`,
    `- 🚨 목표 글자 수: 공백 포함 ${range.min}~${range.max}자 (이 범위를 반드시 지키세요. ${range.max}자 초과 절대 금지!)`,
  );

  // ── 소제목 구조 규칙 (old 동일) ──
  promptParts.push(
    '',
    '[글 전체 구조 — 반드시 준수]',
    '- 도입부: 2문단 고정 (h3 소제목 없음, <p> 태그만)',
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
    '🚨 [구조 위반 체크리스트 — 출력 전 반드시 확인]',
    '□ <h1>, <h2> 태그가 단 1개라도 있으면 → 실패',
    '□ 마크다운 ##, ### 이 있으면 → 실패',
    '□ <h3> 소제목이 4개 미만이면 → 실패',
    '□ 소제목 아래 <p>가 2개 미만이면 → 실패',
    '□ 마무리 섹션이 없으면 → 실패',
    `□ 전체 글자 수(공백 포함)가 ${range.max}자를 넘으면 → 실패 (목표: ${range.min}~${range.max}자)`,
  );

  // ── 키워드 규칙 ──
  if (req.disease && req.keywords) {
    promptParts.push(
      '',
      `[키워드·질환 역할 분리]`,
      `SEO 키워드: "${req.keywords}" / 질환: "${req.disease}"`,
      `→ 키워드는 SEO용(글 전체에 4~5회, 자연스러운 위치에 배치), 질환이 글의 실제 주제. 다른 질환명 추가 금지.`,
    );
  } else if (req.keywords) {
    promptParts.push(
      '',
      `[키워드]`,
      `"${req.keywords}" - 글 전체에 4~5회, 자연스러운 위치에 배치. 도입부 첫 2문장에서는 금지. 다른 질환명 추가 금지.`,
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
    `🚨 일반 소제목: <p> 2~3개 / 마무리: <p> 2개 (도입부와 비슷한 분량)`,
  );

  // ── 이미지 프롬프트 규칙 (old 동일) ──
  if (targetImageCount > 0) {
    promptParts.push(
      '',
      `[이미지 프롬프트 규칙] 🚨 정확히 ${targetImageCount}개 필수!`,
      `글 마지막에 [IMAGE_PROMPTS] 블록으로 이미지 프롬프트를 작성하세요.`,
      `- 스타일: ${imageStyleGuide}`,
      '- 사람이 등장할 경우 반드시 "한국인" 명시 (예: "한국인 여성", "한국인 의사")',
      '',
      '🚨🚨🚨 [이미지 프롬프트 절대 금지 — 위반 시 실패] 🚨🚨🚨',
      '- 이미지 안에 글자, 문장, 제목, 캡션, 라벨, 간판, 로고, 워터마크 절대 금지',
      '- 병원명, 브랜드명, 전화번호, URL, 소셜 핸들 절대 금지',
      '- 포스터, 전단지, 브로셔, 인포그래픽, 카드뉴스, 광고 소재 레이아웃 절대 금지',
      '- 불릿 리스트, 번호 리스트, 표, 차트 등 정보 전달 요소 절대 금지',
      '- 프롬프트에 병원 이름이나 고유명사를 포함하지 마세요',
      '- 프롬프트는 오직 시각적 장면(사람, 공간, 사물, 분위기)만 묘사하세요',
      '- 출력 방향: editorial photograph / natural scene / clean illustration (텍스트 없는 본문 삽화)',
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
    '2. 본문 작성이 끝나면 아래 형식으로 자가평가 점수를 붙이세요:',
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
