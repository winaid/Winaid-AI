/**
 * Image Prompt Builder — hero/sub 프롬프트 전략, 스타일/프레임 블록 빌더
 *
 * imageGenerationService.ts에서 추출:
 * - buildStyleBlock()
 * - buildFrameBlock()
 * - 스타일 관련 상수 (PHOTO_STYLE_RULE, ILLUSTRATION_3D_STYLE_RULE, ...)
 * - CARD_LAYOUT_RULE
 * - STYLE_NAMES / STYLE_KEYWORDS
 *
 * ── Style Contract 시스템 ──
 * 한 블로그 글의 이미지 세트(hero/sub/retry/fallback)가 모두 같은 시각 언어를
 * 공유하도록 강제하는 계약 객체. 모든 프롬프트 경로가 이 계약을 참조한다.
 */

import type { ImageStyle } from '../../types';

// ═══════════════════════════════════════════════════
// Style Contract — 세트 단위 스타일 잠금의 Single Source of Truth
// ═══════════════════════════════════════════════════

/**
 * 이미지 세트 전체가 준수해야 할 스타일 계약.
 * hero/sub/ultraMinimal/retry/fallback 모든 경로가 이 계약을 참조한다.
 */
export interface StyleContract {
  /** 핵심 렌더링 지시 — 모든 프롬프트의 [Style] 블록에 삽입 */
  anchor: string;
  /** 절대 생성 금지 목록 — negative prompt */
  negative: string;
  /** 축약 anchor — ultraMinimal/retry 등 짧은 프롬프트용 */
  anchorShort: string;
  /** fallback SVG 팔레트 */
  fallbackPalette: { primary: string; secondary: string; accent: string };
  /** 이 스타일의 주 피사체 방향 — hero promptText 생성 시 사용 */
  subjectHint: string;
}

export const STYLE_CONTRACTS: Record<string, StyleContract> = {
  medical: {
    anchor: 'premium 3D medical render, anatomical / clinical visualization, same rendering family across all images in this set, same lighting and material language, blue-white-teal clinical palette, clean studio lighting, semi-transparent anatomical layers where relevant, educational but visually premium, single coherent scene. NOT a photograph, NOT a portrait, NOT cartoon, NOT flat vector, NOT infographic poster, NOT lifestyle stock photo.',
    negative: 'Do NOT generate: photorealistic portrait, human face close-up, lifestyle clinic photo, stock photo, editorial patient photo, beauty shot, cinematic portrait, cartoon character, flat 2D vector, flat infographic, emoji, template card, text-heavy image. No real human as main subject.',
    anchorShort: '3D medical render, anatomical clinical visualization, blue-white-teal palette, clean studio lighting, same rendering family, NOT photo, NOT portrait, NOT cartoon, NOT infographic. No text, no watermark.',
    fallbackPalette: { primary: '#0F4C75', secondary: '#1B6B93', accent: '#3DC2EC' },
    subjectHint: 'Show as anatomical 3D render, clinical cross-section, or educational medical diagram. Main subject: dental/oral anatomy, treatment mechanism, or medical structure.',
  },
  illustration: {
    anchor: '3D rendered illustration, Blender style, NOT a photograph, NOT photorealistic, soft studio lighting, pastel colors, rounded shapes, clean gradient background, single unified scene, one coherent composition, friendly stylized Korean dental clinic interior, 3D rendered character with rounded friendly features, no hanbok, no traditional costume, no text, no watermark',
    negative: 'Do NOT generate: photorealistic photo, DSLR-style image, realistic skin texture, real photograph.',
    anchorShort: '3D illustration, NOT a photo, pastel, Blender style, soft lighting, single scene, Korean clinic, no text, no watermark',
    fallbackPalette: { primary: '#667eea', secondary: '#764ba2', accent: '#a78bfa' },
    subjectHint: 'Friendly 3D rendered illustration scene in a Korean medical/dental setting.',
  },
  photo: {
    anchor: 'photorealistic, DSLR, 35mm lens, natural lighting, shallow depth of field, bokeh, modern Korean hospital or dental clinic interior, modern Korean adult in contemporary everyday clothing or professional medical attire, natural Korean facial features, calm trustworthy atmosphere, no hanbok, no traditional clothing, no cultural costume, no text, no watermark',
    negative: 'Do NOT generate: 3D render, cartoon, anime, vector art, flat illustration, clay render, isometric, infographic.',
    anchorShort: 'photorealistic, DSLR, natural lighting, bokeh, Korean hospital, no text, no watermark',
    fallbackPalette: { primary: '#374151', secondary: '#4B5563', accent: '#60A5FA' },
    subjectHint: 'Realistic editorial photo of modern Korean adult in a hospital or daily life medical context.',
  },
};

/**
 * 스타일 계약 조회.
 * custom 스타일이거나 알 수 없는 스타일이면 illustration 계약 반환.
 */
export function getStyleContract(style: ImageStyle | string): StyleContract {
  return STYLE_CONTRACTS[style] || STYLE_CONTRACTS.illustration;
}

// ── 카드뉴스 레이아웃 규칙 ──
export const CARD_LAYOUT_RULE = `[CARD IMAGE GENERATION RULE]
Render Korean text DIRECTLY into the image pixels.
Do NOT show these instructions in the image.
Only render the actual content text (subtitle, mainTitle, description).`;

// ── 프레임/스타일/텍스트 블록 분리 ──
// FRAME: 레이아웃/프레임만 (스타일 단어 금지)
// STYLE: 렌더링/질감/기법만 (프레임 단어 최소화)

const CARD_FRAME_RULE = `
[FRAME LAYOUT - FOLLOW REFERENCE IMAGE EXACTLY]
Copy the EXACT frame layout from the reference image:
- Border color: #787fff (lavender purple/violet) around the edges
- White content area inside the border
- Rounded corners
- Clean minimal design
Keep the same frame thickness, padding, and proportions as reference.
`;

const FRAME_FROM_REFERENCE_COPY = `
[FRAME LAYOUT]
Copy EXACTLY the frame/layout/text placement from the reference image.
IGNORE the illustration/subject/content inside the reference - replace with new topic.
`;

const FRAME_FROM_REFERENCE_RECOLOR = `
[FRAME LAYOUT]
Keep the frame/layout/text placement from reference image as much as possible.
Adjust overall color tone to match the requested background color.
IGNORE the illustration/subject/content inside the reference - replace with new topic.
`;

// ── 스타일 블록 ──

const PHOTO_STYLE_RULE = `
[STYLE - 실사 촬영 (PHOTOREALISTIC PHOTOGRAPHY)]
🚨 최우선 규칙: 반드시 실제 사진처럼 보여야 합니다! 🚨

✅ 필수 스타일 키워드 (모두 적용!):
- photorealistic, real photograph, DSLR camera shot, 35mm lens
- natural lighting, soft studio lighting, professional photography
- shallow depth of field, bokeh background, lens blur
- realistic skin texture, real fabric texture, authentic materials
- 4K ultra high resolution, 8K quality, professional stock photo style

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

/**
 * 스타일 블록 빌더 — ImageStyle + customStylePrompt → 프롬프트 스타일 텍스트
 * 향후 templateId 주입 시 이 함수를 확장하면 된다.
 */
export const buildStyleBlock = (style: ImageStyle, customStylePrompt?: string): string => {
  if (customStylePrompt && customStylePrompt.trim()) {
    console.log('✏️ 커스텀 스타일 적용:', customStylePrompt.substring(0, 50));
    return CUSTOM_STYLE_RULE(customStylePrompt.trim());
  }

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

/**
 * 프레임 블록 빌더 — 참고 이미지 유무 / copyMode에 따라 분기
 */
export const buildFrameBlock = (referenceImage?: string, copyMode?: boolean): string => {
  if (!referenceImage) return CARD_FRAME_RULE;
  return copyMode ? FRAME_FROM_REFERENCE_COPY : FRAME_FROM_REFERENCE_RECOLOR;
};

// ── 스타일 이름 (UI 표시용) ──
export const STYLE_NAMES: Record<ImageStyle, string> = {
  illustration: '3D 일러스트',
  medical: '의학 3D',
  photo: '실사 사진',
  custom: '커스텀',
};

// ── 짧은 스타일 키워드 (프롬프트용) ──
export const STYLE_KEYWORDS: Record<ImageStyle, string> = {
  illustration: '3D 렌더 일러스트, Blender 스타일, 부드러운 조명, 파스텔 색상, 친근한 캐릭터, 깔끔한 배경',
  medical: '의학 3D 일러스트, 해부학적 구조, 장기 단면도, 임상 조명, 교육용 다이어그램, 전문적 분위기',
  photo: '실사 사진, DSLR 촬영, 자연스러운 조명, 얕은 피사계심도, 전문 병원 환경, 사실적 질감',
  custom: '사용자 지정 스타일',
};

// ── 블로그 이미지용 슬림 스타일 키워드 (오케스트레이터에서 사용) ──
// StyleContract.anchor에서 파생 — 계약과 동기화 보장
export const BLOG_IMAGE_STYLE_COMPACT: Record<string, string> = {
  illustration: STYLE_CONTRACTS.illustration.anchor,
  medical: STYLE_CONTRACTS.medical.anchor,
  photo: STYLE_CONTRACTS.photo.anchor,
};

// ── 오케스트레이터용 짧은 스타일 키워드 ──
// StyleContract.anchorShort에서 파생
export const STYLE_KEYWORD_SHORT: Record<string, string> = {
  illustration: STYLE_CONTRACTS.illustration.anchorShort,
  medical: STYLE_CONTRACTS.medical.anchorShort,
  photo: STYLE_CONTRACTS.photo.anchorShort,
};
