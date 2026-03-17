/**
 * Image Edit Service
 * 이미지 스타일 변환, 배경 변경, 부분 수정 등
 * imageGenerationService.ts에서 분리됨 (Phase 2)
 */

import { GEMINI_MODEL, TIMEOUTS, callGeminiRaw } from "../geminiClient";
import { DESIGNER_PERSONA } from "../calendarTemplateService";

// 카드뉴스 스타일 참고 이미지 분석 함수 (표지/본문 구분)
export const analyzeStyleReferenceImage = async (base64Image: string, isCover: boolean = false): Promise<string> => {
  try {
    const mimeType = base64Image.includes('png') ? 'image/png' : 'image/jpeg';
    const base64Data = base64Image.split(',')[1];

    const result = await callGeminiRaw('gemini-3.1-flash-lite-preview', {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
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
      generationConfig: {
        responseMimeType: "application/json"
      }
    }, TIMEOUTS.QUICK_OPERATION);

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || '').join('');
    return text || '{}';
  } catch (error) {
    console.error('스타일 분석 실패:', error);
    return '{}';
  }
};

// =============================================
// 🎨 이미지 스타일 변환 (사진→일러스트, 일러스트→3D 등)
// Nano Banana Pro의 이미지 이해 + 생성 능력 활용
// =============================================

export type StyleTransformType = 'to_illustration' | 'to_3d_clay' | 'to_watercolor' | 'to_minimal' | 'to_photo' | 'to_anime';

const STYLE_TRANSFORM_PROMPTS: Record<StyleTransformType, string> = {
  to_illustration: 'Transform this image into a clean flat vector illustration style. Use bold outlines, flat colors, minimal shadows. Keep the same composition and subject but render it as a modern minimal illustration suitable for a medical clinic social media post.',
  to_3d_clay: 'Transform this image into a 3D clay/Blender render style. Soft rounded shapes, pastel colors, subtle ambient occlusion, clay-like material texture, soft studio lighting. Keep the same composition but render everything as cute 3D clay figures/objects.',
  to_watercolor: 'Transform this image into a soft watercolor painting style. Gentle color bleeds, paper texture, loose brushstrokes, warm pastel palette. Keep the same composition but render it as an artistic watercolor illustration.',
  to_minimal: 'Transform this image into an ultra-minimalist design. Reduce to essential shapes only, use maximum 3 colors, geometric simplification, generous whitespace, clean modern aesthetic suitable for premium medical branding.',
  to_photo: 'Transform this image into a photorealistic style. Natural lighting, DSLR quality, shallow depth of field, realistic textures and materials. Keep the same composition but render it as a professional photograph.',
  to_anime: 'Transform this image into a soft anime/manhwa illustration style. Clean linework, cel-shading, bright pastel colors, kawaii aesthetic, large expressive eyes for characters. Suitable for friendly medical clinic social media.',
};

export const transformImageStyle = async (
  base64Image: string,
  transformType: StyleTransformType,
  customPrompt?: string,
): Promise<string> => {
  const stylePrompt = customPrompt || STYLE_TRANSFORM_PROMPTS[transformType];

  const [meta, base64Data] = base64Image.split(',');
  const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callGeminiRaw(GEMINI_MODEL.IMAGE_PRO, {
        contents: [{ role: "user", parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `${DESIGNER_PERSONA}\n\n[STYLE TRANSFORMATION]\n${stylePrompt}\n\n[RULES]\n- Keep the SAME composition, subject, and layout\n- Change ONLY the rendering style/technique\n- Output should be high quality, suitable for professional medical clinic use\n- Maintain clean, readable design\n- Do NOT add any text to the image` },
        ] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);
      if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
      }
      lastError = new Error('이미지 데이터를 받지 못했습니다.');
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw new Error(`스타일 변환 실패: ${lastError?.message || '알 수 없는 오류'}`);
};

// =============================================
// 🖼️ 이미지 배경 변경 (의사 사진 등 배경 교체)
// =============================================

export const changeImageBackground = async (
  base64Image: string,
  backgroundDescription: string,
): Promise<string> => {
  const [meta, base64Data] = base64Image.split(',');
  const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callGeminiRaw(GEMINI_MODEL.IMAGE_PRO, {
        contents: [{ role: "user", parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `[BACKGROUND REPLACEMENT]\nKeep the main subject/person in this image exactly as they are.\nRemove the existing background and replace it with: ${backgroundDescription}\n\n[RULES]\n- Do NOT modify the main subject (person, object)\n- Only change the background\n- Make the transition between subject and new background look natural\n- Maintain professional medical/clinical aesthetic\n- High quality, clean edges around the subject` },
        ] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.3,
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);
      if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
      }
      lastError = new Error('이미지 데이터를 받지 못했습니다.');
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw new Error(`배경 변경 실패: ${lastError?.message || '알 수 없는 오류'}`);
};

// =============================================
// 🔄 이미지 부분 수정 (Inpainting - 특정 영역 텍스트/요소 변경)
// =============================================

export const editImageRegion = async (
  base64Image: string,
  editInstruction: string,
): Promise<string> => {
  const [meta, base64Data] = base64Image.split(',');
  const mimeType = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callGeminiRaw(GEMINI_MODEL.IMAGE_PRO, {
        contents: [{ role: "user", parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `[IMAGE EDITING INSTRUCTION]\n${editInstruction}\n\n[RULES]\n- Make ONLY the requested changes\n- Keep everything else in the image EXACTLY the same\n- Maintain the same style, colors, and quality\n- Output should look natural and seamless\n- Do NOT change the overall layout or composition` },
        ] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.3,
        },
      }, TIMEOUTS.IMAGE_GENERATION);

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);
      if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
      }
      lastError = new Error('이미지 데이터를 받지 못했습니다.');
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw new Error(`이미지 편집 실패: ${lastError?.message || '알 수 없는 오류'}`);
};
