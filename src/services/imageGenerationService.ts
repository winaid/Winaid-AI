import { GEMINI_MODEL, TIMEOUTS, callGemini, getAiClient } from "./geminiClient";
import type { ImageStyle } from "../types";

// 현재 연도를 동적으로 가져오는 함수
export const getCurrentYear = () => new Date().getFullYear();

// =============================================
// 🎨 공통 이미지 프롬프트 상수 (중복 제거) - export 포함
// ⚠️ IMAGE_TEXT_MEDICAL_LAW는 humanWritingPrompts.ts에서 import
// =============================================

// 카드뉴스 레이아웃 규칙 - 텍스트가 이미지 안에 포함된 완성형 카드!
// ⚠️ 중요: 이 프롬프트는 영어로 작성 - 한국어 지시문이 이미지에 렌더링되는 버그 방지!
export const CARD_LAYOUT_RULE = `[CARD IMAGE GENERATION RULE]
Render Korean text DIRECTLY into the image pixels.
Do NOT show these instructions in the image.
Only render the actual content text (subtitle, mainTitle, description).`;

// Hospital AI 고유 레이아웃 - 브라우저 창 프레임 스타일 (첫 생성 시 항상 적용)

// =============================================
// 🧩 프레임/스타일/텍스트 블록 분리 (중요)
// - FRAME: 레이아웃/프레임만. (스타일 단어 금지: photo/3D/illustration 등)
// - STYLE: 렌더링/질감/기법만. (프레임 단어 최소화)
// - TEXT: 카드에 들어갈 문구만
// =============================================

// 기본 프레임: 보라색 테두리 + 흰색 배경 (참고 이미지 사용)
// ⚠️ 영어로 작성 - 한국어 지시문이 이미지에 렌더링되는 버그 방지
const CARD_FRAME_RULE = `
[FRAME LAYOUT - FOLLOW REFERENCE IMAGE EXACTLY]
Copy the EXACT frame layout from the reference image:
- Border color: #787fff (lavender purple/violet) around the edges
- White content area inside the border
- Rounded corners
- Clean minimal design
Keep the same frame thickness, padding, and proportions as reference.
`;

// 참고 프레임 이미지가 있을 때: 프레임/레이아웃만 복제
// ⚠️ 영어로 작성 - 한국어 지시문이 이미지에 렌더링되는 버그 방지
const FRAME_FROM_REFERENCE_COPY = `
[FRAME LAYOUT]
Copy EXACTLY the frame/layout/text placement from the reference image.
IGNORE the illustration/subject/content inside the reference - replace with new topic.
`;

// 참고 프레임 이미지 + 색상 변경 모드(레이아웃 유지)
// ⚠️ 영어로 작성 - 한국어 지시문이 이미지에 렌더링되는 버그 방지
const FRAME_FROM_REFERENCE_RECOLOR = `
[FRAME LAYOUT]
Keep the frame/layout/text placement from reference image as much as possible.
Adjust overall color tone to match the requested background color.
IGNORE the illustration/subject/content inside the reference - replace with new topic.
`;

// 스타일 블록: 버튼별로 단 하나만 선택
const PHOTO_STYLE_RULE = `
[STYLE - 실사 촬영 (PHOTOREALISTIC PHOTOGRAPHY)]
🚨 최우선 규칙: 반드시 실제 사진처럼 보여야 합니다! 🚨

✅ 필수 스타일 키워드 (모두 적용!):
- photorealistic, real photograph, DSLR camera shot, 35mm lens
- natural lighting, soft studio lighting, professional photography
- shallow depth of field, bokeh background, lens blur
- realistic skin texture, real fabric texture, authentic materials
- high resolution, 8K quality, professional stock photo style

✅ 피사체 표현:
- 실제 한국인 인물 (의료진, 환자 등)
- 실제 병원/의료 환경
- 실제 의료 장비, 진료 도구
- 자연스러운 표정과 포즈

✅ 분위기:
- professional, trustworthy, clean, modern
- 밝고 깨끗한 병원 느낌
- 신뢰감 있는 의료 환경

⛔⛔⛔ 절대 금지 (이것들은 사용하지 마세요!):
- 3D render, 3D illustration, Blender, Cinema4D
- cartoon, anime, vector art, flat illustration
- clay render, isometric, infographic style
- digital art, painting, watercolor, sketch
- 파스텔톤 일러스트, 귀여운 캐릭터

※ 프레임(브라우저 창 상단바/버튼)만 그래픽 요소로 유지, 나머지는 모두 실사!
`;

const ILLUSTRATION_3D_STYLE_RULE = `
[STYLE - 3D 일러스트 (3D ILLUSTRATION)]
⚠️ 필수: 친근하고 부드러운 3D 일러스트 스타일!
- 렌더링: 3D rendered illustration, Blender/Cinema4D style, soft 3D render
- 조명: soft studio lighting, ambient occlusion, gentle shadows
- 질감: smooth plastic-like surfaces, matte finish, rounded edges
- 색상: 밝은 파스텔 톤, 파란색/흰색/연한 색상 팔레트
- 캐릭터: cute stylized characters, friendly expressions, simple features
- 🇰🇷 인물: 사람이 등장할 경우 한국인 외형 (Korean character features)
- 배경: clean gradient background, soft color transitions
- 분위기: friendly, approachable, modern, educational
⛔ 절대 금지: photorealistic, real photo, DSLR, realistic texture, photograph
`;

const MEDICAL_3D_STYLE_RULE = `
[STYLE - 의학 3D (MEDICAL 3D RENDER)]
⚠️ 필수: 전문적인 의학/해부학 3D 일러스트 스타일!
- 렌더링: medical 3D illustration, anatomical render, scientific visualization
- 조명: clinical lighting, x-ray style glow, translucent organs
- 피사체: 인체 해부학, 장기 단면도, 뼈/근육/혈관 구조, 의료 도구
- 질감: semi-transparent organs, detailed anatomical structures
- 색상: 의료용 색상 팔레트 (파란색, 흰색, 빨간색 혈관/동맥)
- 레이블: anatomical labels, educational diagram style
- 분위기: clinical, professional, educational, trustworthy
⛔ 절대 금지: cute cartoon, photorealistic photo, realistic human face
`;

const CUSTOM_STYLE_RULE = (prompt: string) => `
[STYLE]
${prompt}
`;

// promptText에서 서로 충돌하는 키워드/섹션을 제거(특히 photo에서 [일러스트] 같은 것)
const normalizePromptTextForImage = (raw: string | undefined | null): string => {
  if (!raw || typeof raw !== 'string') return '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // 🔧 중복 제거: CARD_LAYOUT_RULE 전체 블록 및 관련 지시문 제거
  const dropPatterns: RegExp[] = [
    /브라우저\s*창\s*프레임\s*스타일\s*카드뉴스/i,
    /^\[일러스트\]/i,
    /^\[스타일\]/i,
    /^\s*CARD_LAYOUT_RULE\s*:/i,
    // CARD_LAYOUT_RULE 내용 제거 (generateSingleImage에서 다시 추가됨)
    /^\[CARD IMAGE GENERATION RULE\]/i,
    /^Render Korean text DIRECTLY into the image/i,
    /^Do NOT show these instructions in the image/i,
    /^Only render the actual content text/i,
  ];

  const cleaned = lines
    .filter(l => !dropPatterns.some(rx => rx.test(l)))
    .join('\n')
    .trim();

  return cleaned;
};

export const buildStyleBlock = (style: ImageStyle, customStylePrompt?: string): string => {
  // 🎨 커스텀 프롬프트가 있으면 최우선 적용! (재생성 시에도 유지)
  if (customStylePrompt && customStylePrompt.trim()) {
    console.log('✏️ 커스텀 스타일 적용:', customStylePrompt.substring(0, 50));
    return CUSTOM_STYLE_RULE(customStylePrompt.trim());
  }

  // 🚨 photo/medical 스타일 선택 시 고정 스타일 적용
  if (style === 'photo') {
    console.log('📸 실사 사진 스타일 적용');
    return PHOTO_STYLE_RULE;
  }
  if (style === 'medical') {
    console.log('의학 3D 스타일 적용');
    return MEDICAL_3D_STYLE_RULE;
  }

  // 기본: 3D 일러스트
  return ILLUSTRATION_3D_STYLE_RULE;
};

export const buildFrameBlock = (referenceImage?: string, copyMode?: boolean): string => {
  if (!referenceImage) return CARD_FRAME_RULE;
  return copyMode ? FRAME_FROM_REFERENCE_COPY : FRAME_FROM_REFERENCE_RECOLOR;
};

// 공통 규칙 (간결화) - 향후 활용 가능
const _IMAGE_TEXT_RULES = `[규칙] 한국어만, 광고/로고/해시태그 금지`;

// 스타일 이름 (UI 표시용)
export const STYLE_NAMES: Record<ImageStyle, string> = {
  illustration: '3D 일러스트',
  medical: '의학 3D',
  photo: '실사 사진',
  custom: '커스텀'
};

// 짧은 스타일 키워드 (프롬프트용) - 구체적으로 개선!
export const STYLE_KEYWORDS: Record<ImageStyle, string> = {
  illustration: '3D 렌더 일러스트, Blender 스타일, 부드러운 조명, 파스텔 색상, 친근한 캐릭터, 깔끔한 배경',
  medical: '의학 3D 일러스트, 해부학적 구조, 장기 단면도, 임상 조명, 교육용 다이어그램, 전문적 분위기',
  photo: '실사 사진, DSLR 촬영, 자연스러운 조명, 얕은 피사계심도, 전문 병원 환경, 사실적 질감',
  custom: '사용자 지정 스타일'
};

// 🌐 영어 스타일 프롬프트를 한국어로 번역하는 함수
export const translateStylePromptToKorean = async (englishPrompt: string): Promise<string> => {
  // 이미 한국어인지 확인 (한글이 30% 이상이면 번역 생략)
  const koreanRatio = (englishPrompt.match(/[\uAC00-\uD7A3]/g) || []).length / englishPrompt.length;
  if (koreanRatio > 0.3) {
    console.log('🌐 이미 한국어 프롬프트, 번역 생략');
    return englishPrompt;
  }

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL.FLASH,
      contents: `다음 이미지 스타일 프롬프트를 자연스러운 한국어로 번역해주세요.
전문 용어는 유지하고, 의미를 정확히 전달해주세요.

영어 프롬프트:
"${englishPrompt}"

[규칙]
- 번역된 한국어만 출력 (설명이나 따옴표 없이)
- DSLR, 3D 같은 용어는 그대로 유지
- "NOT"은 "~는 제외" 또는 "~금지"로 번역
- 간결하게 번역 (원문 길이와 비슷하게)

번역:`,
      config: {
        temperature: 0.2,
      }
    });

    const translated = response.text?.trim() || englishPrompt;
    console.log('🌐 스타일 프롬프트 번역 완료:', englishPrompt.substring(0, 30), '→', translated.substring(0, 30));
    return translated;
  } catch (error) {
    console.warn('⚠️ 스타일 프롬프트 번역 실패, 원본 사용:', error);
    return englishPrompt;
  }
};

export const recommendImagePrompt = async (blogContent: string, currentImageAlt: string, imageStyle: ImageStyle = 'illustration', customStylePrompt?: string): Promise<string> => {
  const ai = getAiClient();

  // 스타일에 따른 프롬프트 가이드 (구체적으로 개선!)
  let styleGuide: string;

  if (imageStyle === 'custom' && customStylePrompt) {
    // 🎨 커스텀 스타일: 사용자가 업로드한 참고 이미지 스타일 분석 결과 사용
    styleGuide = `**중요: 사용자가 지정한 커스텀 스타일로 생성해야 합니다!**
       사용자 지정 스타일 프롬프트:
       "${customStylePrompt}"

       위 스타일을 최대한 반영하여 프롬프트를 생성하세요.
       레이아웃, 색상, 분위기, 디자인 요소 등을 유지해주세요.`;
  } else if (imageStyle === 'illustration') {
    styleGuide = `**중요: 3D 렌더 일러스트 스타일로 생성해야 합니다!**
       - 렌더링 스타일: "3D rendered illustration", "Blender style", "soft 3D render"
       - 조명: 부드러운 스튜디오 조명, 은은한 그림자
       - 질감: 매끄러운 플라스틱 느낌, 무광 마감, 둥근 모서리
       - 색상: 밝은 파스텔 톤, 파란색/흰색/연한 색상 팔레트
       - 캐릭터: 친근한 표정, 단순화된 디자인
       - 배경: 깔끔한 그라데이션 배경
       ⛔ 금지: photorealistic, real photo, DSLR, realistic texture`;
  } else if (imageStyle === 'medical') {
    styleGuide = `**중요: 의학 3D 일러스트 스타일로 생성해야 합니다!**
       - 렌더링 스타일: "medical 3D illustration", "anatomical render", "scientific visualization"
       - 피사체: 인체 해부학, 장기 단면도, 뼈/근육/혈관 구조
       - 조명: 임상적 조명, X-ray 스타일 글로우, 반투명 장기
       - 질감: semi-transparent organs, detailed anatomical structures
       - 색상: 의료용 팔레트 (파란색, 흰색, 빨간색 혈관)
       - 분위기: clinical, professional, educational
       ⛔ 금지: cute cartoon, photorealistic human face`;
  } else {
    // photo 또는 기타
    styleGuide = `**중요: 실사 사진 스타일로 생성해야 합니다!**
       - 렌더링 스타일: "photorealistic", "real photography", "DSLR shot", "35mm lens"
       - 피사체: 실제 병원 환경, 실제 의료진, 실제 진료 도구
       - 조명: 자연스러운 소프트 조명, 스튜디오 조명, 전문 사진 조명
       - 질감: realistic skin texture, fabric texture, realistic materials
       - 깊이: shallow depth of field, bokeh background
       - 분위기: professional, trustworthy, clean modern hospital
       ⛔ 금지: 3D render, illustration, cartoon, anime, vector, clay`;
  }

  try {
    const now = new Date();
    const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `[현재 날짜: ${dateInfo}]

다음은 병원 블로그 글 내용입니다:

${blogContent}

현재 이미지 설명: "${currentImageAlt}"

${styleGuide}

이 글의 맥락과 주제에 맞는 이미지 프롬프트를 **딱 1개만** 추천해주세요.

요구사항:
1. **글 전체를 읽고 핵심 주제와 연관성 높은 장면 선택**
2. 글의 맥락, 흐름, 주요 내용을 모두 고려
3. 한국 병원 환경에 적합
4. 전문적이고 신뢰감 있는 분위기
5. 구체적인 요소 (인물, 배경, 분위기 등) 포함
6. **텍스트 규칙**: 진짜 필요할 때만 한글/숫자 사용, 영어는 가급적 자제
7. 로고는 절대 포함하지 말 것
8. **위에서 지정한 스타일 키워드를 반드시 프롬프트에 포함할 것!**

**중요: 프롬프트 1개만 출력하세요! 여러 개 출력 금지!**
설명 없이 프롬프트 문장만 **한국어**로 답변하세요.

예시 (1개만):
${imageStyle === 'illustration'
  ? '"밝은 병원 상담실에서 의사가 환자에게 설명하는 모습, 3D 일러스트, 아이소메트릭 뷰, 클레이 렌더, 파란색 흰색 팔레트"'
  : imageStyle === 'medical'
  ? '"인체 심장의 3D 단면도, 좌심실과 우심실이 보이는 해부학적 구조, 혈관과 판막이 표시된 의학 일러스트, 파란색 배경, 교육용 전문 이미지"'
  : '"깔끔한 병원 상담실에서 의사가 환자와 상담하는 모습, 실사 사진, DSLR 촬영, 자연스러운 조명, 전문적인 분위기"'}:`;

    const response = await callGemini({
      prompt,
      model: GEMINI_MODEL.FLASH,
      googleSearch: false,  // 프롬프트 추천은 Google Search 불필요
      responseType: 'text',
      timeout: TIMEOUTS.QUICK_OPERATION
    });

    return response.text?.trim() || currentImageAlt;
  } catch (error) {
    console.error('프롬프트 추천 실패:', error);
    return currentImageAlt;
  }
};

// 🎴 카드뉴스 전용 AI 프롬프트 추천 - 부제/메인제목/설명 포함!
export const recommendCardNewsPrompt = async (
  subtitle: string,
  mainTitle: string,
  description: string,
  imageStyle: ImageStyle = 'illustration',
  customStylePrompt?: string
): Promise<string> => {
  const ai = getAiClient();

  // 스타일 가이드 결정
  let styleKeywords: string;
  if (imageStyle === 'custom' && customStylePrompt) {
    styleKeywords = customStylePrompt;
  } else if (imageStyle === 'illustration') {
    styleKeywords = '3D 일러스트, 클레이 렌더, 파스텔톤, 부드러운 조명';
  } else if (imageStyle === 'medical') {
    styleKeywords = '의학 3D 일러스트, 해부학적 구조, 전문적인 의료 이미지';
  } else {
    styleKeywords = '실사 사진, DSLR 촬영, 자연스러운 조명';
  }

  // 커스텀 스타일 여부 확인
  const isCustomStyle = imageStyle === 'custom' && customStylePrompt;

  try {
    const now = new Date();
    const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `[현재 날짜: ${dateInfo}]

당신은 카드뉴스 이미지 프롬프트 전문가입니다.

다음 카드뉴스 텍스트에 어울리는 **배경 이미지 내용**을 **한국어로** 추천해주세요.

[카드뉴스 텍스트]
- 부제: "${subtitle || '없음'}"
- 메인 제목: "${mainTitle || '없음'}"
- 설명: "${description || '없음'}"

[이미지 스타일 - ⚠️ 반드시 이 스타일 유지!]
${styleKeywords}

[출력 형식 - 반드시 이 형식으로!]
subtitle: "${subtitle || ''}"
mainTitle: "${mainTitle || ''}"
${description ? `description: "${description}"` : ''}
비주얼: (여기에 배경 이미지 내용만 한국어로 작성)

[🚨 프롬프트 언어 규칙 - 반드시 준수!]
- **비주얼 설명**(무엇을 그릴지)은 **한국어**로만 작성하세요!
- 스타일 키워드(3D, DSLR 등)는 영어/한국어 모두 허용
- 예: "심장 아이콘과 파란 그라데이션 배경" (✅) vs "heart icon blue gradient" (❌)

[규칙]
1. subtitle, mainTitle, description은 위 텍스트 그대로 유지
2. "비주얼:" 부분에는 **이미지에 그릴 대상/내용만** 한국어로 작성 (30자 이내)
3. ${isCustomStyle ? `⚠️ 중요: 그림체/스타일은 "${customStylePrompt}"로 이미 지정되어 있으므로, 비주얼에는 "무엇을 그릴지"만 작성 (수채화, 연필, 볼펜 등 스타일 언급 금지!)` : '비주얼에 스타일과 내용을 함께 한국어로 작성'}
4. 예: "심장 아이콘과 파란 그라데이션 배경", "병원에서 상담받는 환자"

[의료광고법 준수 - 이미지 텍스트에도 적용!]
🚨 금지: "완치", "상담하세요", "방문하세요", "조기 발견", "전문의"
✅ 허용: 증상명, 질환명, 질문형 제목, 정보 전달

위 형식대로만 한국어로 출력하세요. 다른 설명 없이!`;

    const response = await callGemini({
      prompt,
      model: GEMINI_MODEL.FLASH,
      googleSearch: false,  // 프롬프트 추천은 Google Search 불필요
      responseType: 'text',
      timeout: TIMEOUTS.QUICK_OPERATION
    });

    return response.text?.trim() || `subtitle: "${subtitle}"\nmainTitle: "${mainTitle}"\n${description ? `description: "${description}"\n` : ''}비주얼: 밝은 파란색 배경, ${styleKeywords}`;
  } catch (error) {
    console.error('카드뉴스 프롬프트 추천 실패:', error);
    // 실패 시 기본 프롬프트 반환
    return `subtitle: "${subtitle}"\nmainTitle: "${mainTitle}"\n${description ? `description: "${description}"\n` : ''}비주얼: 밝은 파란색 배경, ${styleKeywords}`;
  }
};

// 🧹 공통 프롬프트 정리 함수 - base64/코드 문자열만 제거, 의미있는 텍스트는 유지!
// ⚠️ 주의: 영어 지시문/한국어 텍스트는 절대 삭제하면 안 됨!
export const cleanImagePromptText = (prompt: string): string => {
  let cleaned = prompt
    // 1. base64 데이터 URI 제거
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
    // 2. URL 제거
    .replace(/https?:\/\/[^\s]+/g, '')
    // 3. base64 스타일 긴 문자열 제거 - 공백 없이 연속 50자 이상인 경우만! (기존 12자 → 50자로 완화)
    // ⚠️ 영어 지시문("Render Korean text DIRECTLY" 등)이 삭제되지 않도록!
    .replace(/[A-Za-z0-9+/=]{50,}/g, '')
    // 4. 경로 패턴 제거 - 슬래시가 3개 이상 연속인 경우만 (기존: 2개 이상 → 3개 이상으로 완화)
    // ⚠️ "1:1 square" 같은 패턴이 삭제되지 않도록!
    .replace(/[a-zA-Z0-9]{2,}\/[a-zA-Z0-9]+\/[a-zA-Z0-9/]+/g, '')
    // 5. 연속 특수문자 정리
    .replace(/[,.\s]{3,}/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  // 너무 짧으면 기본값으로 대체 (완전히 비어있는 경우만)
  if (cleaned.length < 5) {
    console.warn('⚠️ 필터링 후 프롬프트가 너무 짧음, 기본값으로 대체:', cleaned);
    cleaned = '의료 건강 정보 카드뉴스, 깔끔한 인포그래픽, 파란색 흰색 배경';
  }
  return cleaned;
};

// 🖼️ 블로그용 일반 이미지 생성 함수 (텍스트 없는 순수 이미지)
export const generateBlogImage = async (
  promptText: string,
  style: ImageStyle,
  aspectRatio: string = "16:9",
  customStylePrompt?: string
): Promise<string> => {
  const ai = getAiClient();

  // 스타일 블록만 사용 (카드뉴스 프레임 없음!)
  const styleBlock = buildStyleBlock(style, customStylePrompt);

  // 블로그용 프롬프트: 텍스트 없는 순수 이미지! (한국어로 생성)
  const now = new Date();
  const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const finalPrompt = `
[현재 날짜: ${dateInfo}]
블로그 포스트용 전문적인 의료/건강 이미지를 생성해주세요.

${styleBlock}

[이미지 내용]
${promptText}

[디자인 사양]
- 비율: ${aspectRatio} (가로형/랜드스케이프 블로그 형식)
- 스타일: 전문적인 의료/건강 이미지
- 분위기: 신뢰감 있고, 깔끔하며, 현대적인 병원 환경
- 텍스트 없음, 제목 없음, 캡션 없음, 워터마크 없음, 로고 없음
- 순수한 시각적 콘텐츠만 - 블로그 게시물 이미지로 사용됩니다

[필수 요구사항]
✅ 텍스트 오버레이 없는 깔끔한 이미지 생성
✅ 병원 블로그에 적합한 전문적인 의료/건강 이미지
✅ 스타일에 따라 고품질, 상세한 일러스트 또는 사진
✅ 블로그 게시물에 최적화된 가로형 16:9 형식

[의료광고법 준수 - 이미지에 텍스트가 포함될 경우]
🚨 절대 금지: "완치", "상담하세요", "방문하세요", "조기 발견", "전문의", 구체적 수치/시간
✅ 허용: 증상명, 질환명, 정보성 키워드, 질문형 표현

⛔ 금지사항 (Negative Prompt):
- 한국어 텍스트, 영어 텍스트, any text overlay
- 제목, 캡션, 워터마크, 로고
- 브라우저 창 프레임, 카드뉴스 레이아웃
- 텍스트가 포함된 인포그래픽 요소
- Low quality, blurry, pixelated, distorted
- Cartoon, anime, drawing, sketch (photo style일 경우)
- 3D render, CGI (photo style일 경우)
- Out of focus, bad lighting, overexposed
- Watermark, signature, text, logo, caption

[출력]
의료 블로그 게시물에 적합한 텍스트 없는 깔끔한 단일 이미지.
`.trim();

  console.log('📷 generateBlogImage - 블로그용 이미지 생성 (텍스트 없음, 16:9)');

  // 재시도 로직
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🎨 블로그 이미지 생성 시도 ${attempt}/${MAX_RETRIES}...`);

      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",  // Nano Banana Pro
        contents: [{ text: finalPrompt }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.6, // 블로그 이미지 품질 향상
        },
      });

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const data = imagePart.inlineData.data;
        console.log(`✅ 블로그 이미지 생성 성공`);
        return `data:${mimeType};base64,${data}`;
      }

      lastError = new Error('이미지 데이터를 받지 못했습니다.');
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

    } catch (error: any) {
      lastError = error;
      console.error(`❌ 블로그 이미지 생성 에러:`, error?.message || error);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // 실패 시 플레이스홀더
  console.error('❌ 블로그 이미지 생성 최종 실패:', lastError?.message || lastError);
  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <rect fill="#E8F4FD" width="1600" height="900"/>
    <rect fill="#fff" x="40" y="40" width="1520" height="820" rx="24"/>
    <text x="800" y="430" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#64748b">이미지 생성에 실패했습니다</text>
    <text x="800" y="470" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#94a3b8">이미지를 클릭하여 재생성해주세요</text>
  </svg>`;
  const base64Placeholder = btoa(unescape(encodeURIComponent(placeholderSvg)));
  return `data:image/svg+xml;base64,${base64Placeholder}`;
};

// 🎴 기본 프레임 이미지 URL (로컬 파일 사용 - 외부 URL 403 에러 방지)
const DEFAULT_FRAME_IMAGE_URL = '/default-card-frame.webp';

// 기본 프레임 이미지 로드 (캐싱)
let defaultFrameImageCache: string | null = null;
const loadDefaultFrameImage = async (): Promise<string | null> => {
  if (defaultFrameImageCache) return defaultFrameImageCache;

  try {
    // 로컬 파일 사용 (public 폴더)
    const response = await fetch(DEFAULT_FRAME_IMAGE_URL);
    if (!response.ok) throw new Error(`Failed to fetch default frame: ${response.status}`);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    defaultFrameImageCache = base64;
    console.log('✅ 기본 프레임 이미지 로드 완료 (로컬)');
    return base64;
  } catch (error) {
    console.warn('⚠️ 기본 프레임 이미지 로드 실패:', error);
    return null;
  }
};

// 🎴 카드뉴스용 이미지 생성 함수 (텍스트 포함, 보라색 프레임)
export const generateSingleImage = async (
  promptText: string,
  style: ImageStyle,
  aspectRatio: string,
  customStylePrompt?: string,
  referenceImage?: string,
  copyMode?: boolean
): Promise<string> => {
  const ai = getAiClient();

  // 1) 입력 정리: 충돌 문구 제거
  const cleanPromptText = normalizePromptTextForImage(promptText) || '';

  // 🎨 참고 이미지가 없으면 기본 프레임 이미지 사용
  let effectiveReferenceImage = referenceImage;
  if (!referenceImage) {
    effectiveReferenceImage = await loadDefaultFrameImage() || undefined;
    console.log('🖼️ 기본 프레임 이미지 사용:', !!effectiveReferenceImage);
  }

  // 2) 프레임/스타일 블록 분리 (프레임은 레이아웃, 스타일은 렌더링)
  const frameBlock = buildFrameBlock(effectiveReferenceImage, copyMode);
  const styleBlock = buildStyleBlock(style, customStylePrompt);

  // 3) 최종 프롬프트 조립: 완성형 카드 이미지 (텍스트가 이미지 픽셀로 렌더링!)
  // 🔧 핵심 텍스트를 프롬프트 상단에 배치하여 모델이 반드시 인식하도록!

  // 🚨 핵심 문장 추출 전 안전 체크
  console.log('📝 핵심 문장 추출 시작, cleanPromptText 타입:', typeof cleanPromptText, '길이:', cleanPromptText?.length);

  // cleanPromptText에서 핵심 텍스트 추출 (다양한 패턴 지원)
  const subtitleMatch = (cleanPromptText && typeof cleanPromptText === 'string') ?
                        (cleanPromptText.match(/subtitle:\s*"([^"]+)"/i) || cleanPromptText.match(/subtitle:\s*([^\n,]+)/i)) : null;
  const mainTitleMatch = (cleanPromptText && typeof cleanPromptText === 'string') ?
                         (cleanPromptText.match(/mainTitle:\s*"([^"]+)"/i) || cleanPromptText.match(/mainTitle:\s*([^\n,]+)/i)) : null;
  const descriptionMatch = (cleanPromptText && typeof cleanPromptText === 'string') ?
                           (cleanPromptText.match(/description:\s*"([^"]+)"/i) || cleanPromptText.match(/description:\s*([^\n]+)/i)) : null;
  // 🎨 비주얼 지시문 추출
  const visualMatch = (cleanPromptText && typeof cleanPromptText === 'string') ?
                      (cleanPromptText.match(/비주얼:\s*([^\n]+)/i) || cleanPromptText.match(/visual:\s*([^\n]+)/i)) : null;

  const extractedSubtitle = (subtitleMatch?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const extractedMainTitle = (mainTitleMatch?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const extractedDescription = (descriptionMatch?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const extractedVisual = (visualMatch?.[1] || '').trim();

  // 🚨 추출 실패 시 로그 및 원본 사용
  const hasValidText = extractedSubtitle.length > 0 || extractedMainTitle.length > 0;
  if (!hasValidText) {
    console.warn('⚠️ 텍스트 추출 실패! cleanPromptText:', cleanPromptText.substring(0, 200));
  }

  // 🔧 텍스트가 없으면 원본 프롬프트 그대로 사용 (라벨 없이!)
  const now = new Date();
  const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const finalPrompt = hasValidText ? `
[현재 날짜: ${dateInfo}]
🚨 RENDER THIS EXACT KOREAN TEXT IN THE IMAGE 🚨

[TEXT HIERARCHY - MUST FOLLOW EXACTLY!]
※ MAIN TITLE (BIG, BOLD, CENTER): "${extractedMainTitle}"
※ SUBTITLE (small, above main title): "${extractedSubtitle}"
${extractedDescription ? `※ DESCRIPTION (small, below main title): "${extractedDescription}"` : ''}

${extractedVisual ? `[ILLUSTRATION - MUST FOLLOW THIS VISUAL DESCRIPTION!]
🎨 "${extractedVisual}"
⚠️ Draw EXACTLY what is described above! Do NOT change or ignore this visual instruction!` : ''}

Generate a 1:1 square social media card with the Korean text above rendered directly into the image.

${frameBlock}
${styleBlock}

[TEXT LAYOUT - CRITICAL!]
- SUBTITLE: Small text (14-16px), positioned at TOP or above main title
- MAIN TITLE: Large bold text (28-36px), positioned at CENTER, most prominent
- DESCRIPTION: Small text (14-16px), positioned BELOW main title
- Text hierarchy: subtitle(small) → mainTitle(BIG) → description(small)

[DESIGN]
- 1:1 square, background: #E8F4FD gradient
- Border color: #787fff
- Korean text rendered with clean readable font
- Professional Instagram-style card news design
- Illustration at bottom, text at top/center
${extractedVisual ? `- ILLUSTRATION MUST MATCH: "${extractedVisual}"` : ''}

[RULES]
✅ MAIN TITLE must be the LARGEST and most prominent text
✅ Subtitle must be SMALLER than main title
✅ Do NOT swap subtitle and mainTitle positions
✅ Do NOT use placeholder text
${extractedVisual ? `✅ ILLUSTRATION must follow the visual description EXACTLY` : ''}
⛔ No hashtags, watermarks, logos
⛔ Do NOT ignore visual instructions

[의료광고법 - 이미지 텍스트 규칙]
🚨 금지: "완치", "상담하세요", "방문하세요", "조기 발견", "전문의", 수치(%)
✅ 허용: 증상명, 질환명, 정보성 표현, 질문형 제목
`.trim() : `
[현재 날짜: ${dateInfo}]
Generate a 1:1 square social media card image.

${frameBlock}
${styleBlock}

[CONTENT TO RENDER]
${cleanPromptText}

[DESIGN]
- 1:1 square, background: #E8F4FD gradient
- Korean text rendered with clean readable font
- Professional Instagram-style card news design

[RULES]
✅ Render the Korean text from the content above
⛔ Do NOT render instruction text like "subtitle:" or "mainTitle:"
⛔ No hashtags, watermarks, logos
`.trim();

  // • 디버그 - 프롬프트 전체 내용 확인!
  console.log('🧩 generateSingleImage 입력 promptText:', promptText.substring(0, 300));
  console.log('🧩 generateSingleImage cleanPromptText:', cleanPromptText.substring(0, 300));
  console.log('🧩 generateSingleImage prompt blocks:', {
    style,
    hasCustomStyle: !!(customStylePrompt && customStylePrompt.trim()),
    hasReferenceImage: !!referenceImage,
    usingDefaultFrame: !referenceImage && !!effectiveReferenceImage,
    copyMode: !!copyMode,
    finalPromptHead: finalPrompt.slice(0, 500),
  });

  // 🔄 재시도 로직: 최대 2회 시도 (빠른 실패 유도)
  const MAX_RETRIES = 2;
  let lastError: any = null;

  // 참고 이미지 파트 준비 (기본 프레임 포함)
  const refImagePart = effectiveReferenceImage && effectiveReferenceImage.startsWith('data:')
    ? (() => {
        const [meta, base64] = effectiveReferenceImage.split(',');
        const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';
        return { inlineData: { data: base64, mimeType } };
      })()
    : null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🎨 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (gemini-3-pro-image-preview)...`);

      // Nano Banana Pro (Gemini 3 Pro Image) - 이미지 생성 전용 모델
      const contents: any[] = refImagePart
        ? [refImagePart, { text: finalPrompt }]
        : [{ text: finalPrompt }];

      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",  // Nano Banana Pro
        contents: contents,
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.4, // 카드뉴스 일관성 강화
        },
      });

      // 안전 필터 등으로 인한 차단 확인
      const finishReason = result?.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        console.warn(`⚠️ 이미지 생성 중단됨 (이유: ${finishReason})`);
        if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
           throw new Error(`이미지 생성이 안전 정책에 의해 차단되었습니다. (${finishReason})`);
        }
      }

      // 응답에서 이미지 데이터 추출
      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const data = imagePart.inlineData.data;
        console.log(`✅ 이미지 생성 성공 (시도 ${attempt}/${MAX_RETRIES})`);
        return `data:${mimeType};base64,${data}`;
      }

      // 텍스트 응답만 온 경우 (거절 메시지 등)
      const textPart = parts.find((p: any) => p.text)?.text;
      if (textPart) {
        console.warn(`⚠️ 이미지 대신 텍스트 응답 수신: "${textPart.substring(0, 100)}..."`);
      }

      // inlineData가 없으면 재시도
      console.warn(`⚠️ 이미지 데이터 없음, 재시도 중... (${attempt}/${MAX_RETRIES})`);
      lastError = new Error('이미지 데이터를 받지 못했습니다.');

      // 재시도 전 짧은 대기
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

    } catch (error: any) {
      lastError = error;
      console.error(`❌ 이미지 생성 에러 (시도 ${attempt}/${MAX_RETRIES}):`, error?.message || error);

      // 재시도 전 짧은 대기 (지수 백오프)
      if (attempt < MAX_RETRIES) {
        const waitTime = 1000 * Math.pow(2, attempt - 1); // 1초, 2초, 4초
        console.log(`⏳ ${waitTime/1000}초 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // 모든 재시도 실패 시 - 플레이스홀더 이미지 반환 (에러 방지)
  console.error('❌ 이미지 생성 최종 실패 (재시도 후):', lastError?.message || lastError);
  console.error('📝 사용된 프롬프트 (앞 250자):', finalPrompt.slice(0, 250));

  // 플레이스홀더 SVG 이미지 (빈 문자열 대신 반환하여 UI 오류 방지)
  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect fill="#E8F4FD" width="800" height="800"/>
    <rect fill="#fff" x="40" y="40" width="720" height="720" rx="24"/>
    <text x="400" y="380" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#64748b">이미지 생성에 실패했습니다</text>
    <text x="400" y="420" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#94a3b8">카드를 클릭하여 재생성해주세요</text>
  </svg>`;
  const base64Placeholder = btoa(unescape(encodeURIComponent(placeholderSvg)));
  return `data:image/svg+xml;base64,${base64Placeholder}`;
};


// searchNaverNews, searchNewsForTrends, getTrendingTopics, recommendSeoTitles, rankSeoTitles → seoService.ts로 분리됨

// 카드뉴스 스타일 참고 이미지 분석 함수 (표지/본문 구분)
export const analyzeStyleReferenceImage = async (base64Image: string, isCover: boolean = false): Promise<string> => {
  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',  // 스타일 분석은 FLASH
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: base64Image.includes('png') ? 'image/png' : 'image/jpeg',
                data: base64Image.split(',')[1] // base64 데이터만 추출
              }
            },
            {
              text: `이 카드뉴스/인포그래픽 이미지의 **디자인 스타일과 일러스트 그림체**를 매우 상세히 분석해주세요.

[중요]
🚨 최우선 목표: "같은 시리즈"로 보이게 할 일관된 스타일만 추출! 🚨
[중요]

⚠️ [중요] 이 분석은 "스타일/프레임"만 추출합니다. 이미지 속 "내용물"은 분석하지 마세요!
- ❌ 이미지 속 일러스트가 "무엇인지" (돼지, 사람, 돈 등) → 분석 불필요!
- ❌ 이미지 속 텍스트가 "무슨 내용인지" → 분석 불필요!
- ✅ 일러스트의 "그리는 방식/기법" (3D, 플랫, 수채화 등) → 분석 필요!
- ✅ 색상 팔레트, 프레임 형태, 레이아웃 구조 → 분석 필요!

**이 이미지는 ${isCover ? '표지(1장)' : '본문(2장 이후)'} 스타일 참고용입니다.**

---━━━━
🎨 [1단계] 일러스트/그림체 DNA 분석 (가장 중요!)
---━━━━
1. **그림체 종류** (정확히 하나만 선택):
   - 3D 클레이/점토 렌더링 (Blender/Cinema4D 느낌)
   - 3D 아이소메트릭 일러스트
   - 플랫 벡터 일러스트 (미니멀)
   - 수채화/손그림 스타일
   - 캐릭터 일러스트 (귀여운/키치)
   - 실사 사진 / 포토리얼
   - 선화+채색 일러스트
   - 그라데이션 글래스모피즘

2. **렌더링 특징**:
   - 조명: 부드러운 스튜디오 조명 / 강한 그림자 / 플랫 조명
   - 질감: 광택 있는 / 무광 매트 / 반투명
   - 외곽선: 없음 / 가는 선 / 굵은 선
   - 깊이감: 얕은 피사계심도 / 등각투영 / 완전 플랫

3. **색상 팔레트** (정확한 HEX 코드 5개):
   - 주 배경색: #______
   - 주 강조색: #______
   - 보조색 1: #______
   - 보조색 2: #______
   - 텍스트색: #______

4. **캐릭터/오브젝트 스타일** (있다면):
   - 얼굴 표현: 심플한 점 눈 / 큰 눈 / 없음
   - 비율: 2등신 귀여움 / 리얼 비율 / 아이콘형
   - 표정: 미소 / 무표정 / 다양함

---━━━━
📐 [2단계] 레이아웃/프레임 분석
---━━━━
5. **프레임 스타일**:
   - 둥근 테두리 카드?
   - 테두리 색상(HEX)과 굵기(px)

6. **텍스트 스타일**:
   - 부제목: 색상, 굵기
   - 메인 제목: 색상, 굵기, 강조 방식
   - 설명: 색상

7. **일러스트 배치**: top / center / bottom, 크기 비율(%)

**반드시 JSON 형식으로 답변 (illustStyle 필드 필수!):**
{
  "illustStyle": {
    "type": "3D 클레이 렌더링 / 플랫 벡터 / 아이소메트릭 / 수채화 / 실사",
    "lighting": "부드러운 스튜디오 조명 / 플랫 / 강한 그림자",
    "texture": "광택 매끄러움 / 무광 매트 / 반투명",
    "outline": "없음 / 가는 선 / 굵은 선",
    "characterStyle": "2등신 귀여움 / 리얼 비율 / 심플 아이콘",
    "colorPalette": ["#주배경", "#강조색", "#보조1", "#보조2", "#텍스트"],
    "promptKeywords": "이 스타일을 재현하기 위한 영어 키워드 5-8개 (예: 3D clay render, soft shadows, pastel colors, rounded shapes, studio lighting)"
  },
  "frameStyle": "rounded-card / rectangle",
  "backgroundColor": "#E8F4FD",
  "borderColor": "#787fff",
  "borderWidth": "2px",
  "borderRadius": "16px",
  "boxShadow": "0 4px 12px rgba(0,0,0,0.1)",
  "subtitleStyle": { "color": "#6B7280", "fontSize": "14px", "fontWeight": "500" },
  "mainTitleStyle": { "color": "#1F2937", "fontSize": "28px", "fontWeight": "700" },
  "highlightStyle": { "color": "#787fff", "backgroundColor": "transparent" },
  "descStyle": { "color": "#4B5563", "fontSize": "16px" },
  "tagStyle": { "backgroundColor": "#F0F0FF", "color": "#787fff", "borderRadius": "20px" },
  "illustPosition": "bottom",
  "illustSize": "60%",
  "padding": "24px",
  "mood": "밝고 친근한 / 전문적인 / 따뜻한 등",
  "keyFeatures": ["3D 클레이 렌더링", "파스텔 색상", "둥근 형태", "부드러운 그림자"],
  "styleReproductionPrompt": "이 이미지 스타일을 정확히 재현하기 위한 완전한 영어 프롬프트 1-2문장"
}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    return response.text || '{}';
  } catch (error) {
    console.error('스타일 분석 실패:', error);
    return '{}';
  }
};
