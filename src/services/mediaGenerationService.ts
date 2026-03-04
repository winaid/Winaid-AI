/**
 * 범용 이미지/동영상 생성 서비스
 * - 이미지: gemini-3.1-flash-image-preview
 * - 동영상: veo-3.1-fast-generate-preview
 */
import { getAiClient, getApiKeyValue } from "./geminiClient";

// ── 이미지 생성 ──

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
export interface ImageGenerationRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
}

export interface ImageGenerationResult {
  imageDataUrl: string;
  mimeType: string;
}

export async function generateCustomImage(
  request: ImageGenerationRequest,
  onProgress?: (msg: string) => void
): Promise<ImageGenerationResult> {
  const ai = getAiClient();
  const progress = (msg: string) => onProgress?.(msg);

  const aspectInstruction = getAspectInstruction(request.aspectRatio);

  const now = new Date();
  const dateInfo = `[현재 날짜: ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일]`;

  const fullPrompt = [
    dateInfo,
    request.prompt,
    aspectInstruction,
    '한국어 텍스트가 포함된 경우 오타 없이 정확하게 렌더링해주세요.',
    '워터마크, 로고, 해시태그 없이 깔끔하게 생성해주세요.',
  ].filter(Boolean).join('\n\n');

  progress('이미지 생성 중...');

  const MAX_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      progress(`이미지 생성 시도 ${attempt}/${MAX_RETRIES}...`);

      const result = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ text: fullPrompt }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.6,
        },
      });

      const parts = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        const data = imagePart.inlineData.data;
        progress('이미지 생성 완료!');
        return {
          imageDataUrl: `data:${mimeType};base64,${data}`,
          mimeType,
        };
      }

      lastError = new Error('이미지 데이터를 받지 못했습니다.');
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    } catch (error: any) {
      lastError = error;
      console.error(`이미지 생성 에러 (시도 ${attempt}):`, error?.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw lastError || new Error('이미지 생성에 실패했습니다.');
}

function getAspectInstruction(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case '1:1': return '정사각형(1:1) 비율로 생성해주세요.';
    case '16:9': return '가로형(16:9) 와이드 비율로 생성해주세요.';
    case '9:16': return '세로형(9:16) 모바일 비율로 생성해주세요.';
    case '4:3': return '4:3 비율로 생성해주세요.';
    default: return '';
  }
}


// ── 동영상 생성 ──

export type VideoAspectRatio = '16:9' | '9:16';

export interface VideoGenerationRequest {
  prompt: string;
  aspectRatio: VideoAspectRatio;
}

export interface VideoGenerationResult {
  videoUrl: string;
}

export async function generateVideo(
  request: VideoGenerationRequest,
  onProgress?: (msg: string) => void
): Promise<VideoGenerationResult> {
  const ai = getAiClient();
  const progress = (msg: string) => onProgress?.(msg);

  const now = new Date();
  const dateInfo = `[현재 날짜: ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일]`;
  const fullPrompt = `${dateInfo}\n\n${request.prompt}`;

  progress('동영상 생성 요청 중...');

  try {
    // generateVideos는 long-running operation을 반환
    let operation = await (ai.models as any).generateVideos({
      model: "veo-3.1-fast-generate-preview",
      prompt: fullPrompt,
      config: {
        aspectRatio: request.aspectRatio === '9:16' ? '9:16' : '16:9',
        numberOfVideos: 1,
      },
    });

    progress('동영상 생성 중... (1~3분 소요)');

    // 폴링으로 완료 대기
    const MAX_POLLS = 60; // 최대 10분
    let pollCount = 0;

    while (!operation.done && pollCount < MAX_POLLS) {
      await new Promise(r => setTimeout(r, 10000)); // 10초마다 체크
      pollCount++;
      progress(`동영상 생성 중... (${pollCount * 10}초 경과)`);

      operation = await (ai.operations as any).getVideosOperation({
        operation: operation,
      });
    }

    if (!operation.done) {
      throw new Error('동영상 생성 시간이 초과되었습니다. 다시 시도해주세요.');
    }

    // operation 자체에 generatedVideos가 있을 수도 있고, response 안에 있을 수도 있음
    const generatedVideos =
      operation.response?.generatedVideos ??
      (operation as any).generatedVideos;

    if (!generatedVideos || generatedVideos.length === 0) {
      console.error('Video operation result:', JSON.stringify(operation, null, 2));
      throw new Error('동영상을 생성하지 못했습니다.');
    }

    const videoEntry = generatedVideos[0];
    const videoUri =
      videoEntry?.video?.uri ??
      videoEntry?.video?.name ??
      videoEntry?.uri ??
      videoEntry?.name;

    if (!videoUri) {
      console.error('Video entry structure:', JSON.stringify(videoEntry, null, 2));
      throw new Error('동영상 파일 정보를 가져올 수 없습니다.');
    }

    // Google API에서 실제 동영상 바이너리 다운로드
    progress('동영상 다운로드 중...');
    const apiKey = getApiKeyValue();
    // uri가 전체 URL일 수도 있고, 리소스 이름일 수도 있음
    const downloadUrl = videoUri.startsWith('http')
      ? `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/${videoUri}?alt=media&key=${apiKey}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`동영상 다운로드 실패 (${response.status})`);
    }

    const blob = await response.blob();
    const videoBlob = new Blob([blob], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(videoBlob);

    progress('동영상 생성 완료!');
    return { videoUrl: blobUrl };

  } catch (error: any) {
    console.error('동영상 생성 에러:', error?.message || error);

    // 사용자 친화적 에러 메시지
    if (error?.message?.includes('not found') || error?.message?.includes('not supported')) {
      throw new Error('VEO 3.1 모델을 사용할 수 없습니다. API 키에 동영상 생성 권한이 필요합니다.');
    }
    if (error?.message?.includes('quota') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('API 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }

    throw error;
  }
}


// ── AI 프롬프트 생성기 ──

export type PromptMediaType = 'image' | 'video';

export interface GeneratedPrompt {
  korean: string;
  english: string;
}

export async function generateOptimizedPrompt(
  userInput: string,
  mediaType: PromptMediaType,
  referenceImageBase64?: string,
): Promise<GeneratedPrompt> {
  const ai = getAiClient();

  const now = new Date();
  const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const baseInstruction = mediaType === 'image'
    ? `[현재 날짜: ${dateInfo}]
당신은 AI 이미지 생성 프롬프트 전문가입니다.
Gemini Image Generation에 최적화된 상세 프롬프트를 작성합니다.
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 조명, 색감, 구도, 분위기 등 시각적 디테일 포함
- 텍스트가 필요한 경우 정확한 한국어 렌더링 지시 포함
- 의료 광고 가이드라인 준수 (과장/허위 표현 금지)`
    : `[현재 날짜: ${dateInfo}]
당신은 AI 동영상 생성 프롬프트 전문가입니다.
VEO 3.1 영상 생성에 최적화된 상세 프롬프트를 작성합니다.
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 카메라 움직임(팬, 틸트, 줌 등), 조명, 분위기 설명 포함
- 5~8초 짧은 영상에 적합한 하나의 장면 중심
- 시네마틱하고 고품질의 영상미 지시 포함`;

  const imageContext = referenceImageBase64
    ? '\n\n참고 이미지가 첨부되어 있습니다. 이 이미지의 스타일, 구도, 색감, 분위기를 분석하여 비슷한 결과물을 만들 수 있는 프롬프트를 작성하세요.'
    : '';

  const userContext = userInput
    ? `\n\n사용자 추가 요청: "${userInput}"`
    : '';

  const promptText = `${baseInstruction}${imageContext}${userContext}

반드시 아래 JSON 형식으로만 응답하세요. korean/english 값은 구조화된 JSON 문자열이어야 합니다:
{
  "korean": "{\"image_meta\":{\"category\":\"카테고리\",\"purpose\":\"용도\"},\"visual_style\":{\"mood_keywords\":[\"분위기1\",\"분위기2\"],\"color_palette\":{\"primary_background\":\"배경색\",\"accent_color\":\"#HEX\"},\"graphic_elements\":[{\"object\":\"요소\",\"location\":\"위치\",\"style\":\"스타일\"}],\"layout_structure\":{\"header\":\"상단\",\"body\":\"본문\"}},\"content_summary\":{\"title\":\"제목\",\"key_points\":[\"내용1\"]}}",
  "english": "{\"image_meta\":{\"category\":\"Category\",\"purpose\":\"Purpose\"},\"visual_style\":{\"mood_keywords\":[\"mood1\",\"mood2\"],\"color_palette\":{\"primary_background\":\"bg color\",\"accent_color\":\"#HEX\"},\"graphic_elements\":[{\"object\":\"element\",\"location\":\"position\",\"style\":\"style\"}],\"layout_structure\":{\"header\":\"top\",\"body\":\"main\"}},\"content_summary\":{\"title\":\"Title\",\"key_points\":[\"point1\"]}}"
}`;

  // 멀티모달 contents 구성
  const parts: any[] = [{ text: promptText }];

  if (referenceImageBase64) {
    // data:image/png;base64,xxxx 에서 mimeType과 data 추출
    const match = referenceImageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      parts.unshift({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object' as any,
        properties: {
          korean: { type: 'string' as any, description: '한국어 최적화 프롬프트' },
          english: { type: 'string' as any, description: 'English optimized prompt' },
        },
        required: ['korean', 'english'],
      },
    },
  });

  const text = response.text?.trim() || '';
  const parsed = JSON.parse(text);
  return {
    korean: parsed.korean || '',
    english: parsed.english || '',
  };
}


// ── 채팅 기반 프롬프트 생성기 ──

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  prompt?: GeneratedPrompt; // AI 응답일 때만 존재
}

/** 채팅 응답 JSON 스키마 */
interface ChatResponseJson {
  message: string;
  korean?: string;
  english?: string;
}

function getSystemInstruction(mediaType: PromptMediaType): string {
  const now = new Date();
  const dateInfo = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const base = mediaType === 'image'
    ? `[현재 날짜: ${dateInfo}]
당신은 AI 이미지 생성 프롬프트 전문가이자 친절한 어시스턴트입니다.
사용자와 대화하며 Gemini Image Generation에 최적화된 프롬프트를 함께 만들어갑니다.

전문 분야:
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 조명, 색감, 구도, 분위기 등 시각적 디테일
- 텍스트가 필요한 경우 정확한 한국어 렌더링 지시
- 의료 광고 가이드라인 준수 (과장/허위 표현 금지)`
    : `[현재 날짜: ${dateInfo}]
당신은 AI 동영상 생성 프롬프트 전문가이자 친절한 어시스턴트입니다.
사용자와 대화하며 VEO 3.1 영상 생성에 최적화된 프롬프트를 함께 만들어갑니다.

전문 분야:
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 카메라 움직임(팬, 틸트, 줌 등), 조명, 분위기 설명
- 5~8초 짧은 영상에 적합한 하나의 장면 중심
- 시네마틱하고 고품질의 영상미`;

  return `${base}

응답 규칙:
- message: 사용자에게 보여줄 대화 텍스트 (항상 필수)
- korean: 구조화된 JSON 형식의 한국어 프롬프트 (항상 필수!)
- english: 구조화된 JSON 형식의 영어 프롬프트 (항상 필수!)

🚨 프롬프트 형식 (korean/english 필드 안에 이 JSON 구조를 문자열로 넣으세요!):
korean/english 필드의 값은 반드시 아래와 같은 구조화된 JSON 문자열이어야 합니다:
{
  "image_meta": {
    "category": "이미지 카테고리 (예: Medical_Poster, Hospital_Interior, Treatment_Info)",
    "purpose": "이미지 용도 설명"
  },
  "visual_style": {
    "mood_keywords": ["분위기1", "분위기2", "분위기3"],
    "color_palette": {
      "primary_background": "배경색 설명",
      "accent_color": "#HEX코드",
      "text_color": "#HEX코드"
    },
    "typography": {
      "font_style": "폰트 스타일",
      "characteristics": ["특징1", "특징2"]
    },
    "graphic_elements": [
      {"object": "요소명", "location": "위치", "style": "스타일"}
    ],
    "layout_structure": {
      "header": "상단 레이아웃",
      "body": "본문 레이아웃",
      "footer": "하단 레이아웃"
    }
  },
  "content_summary": {
    "title": "제목",
    "key_points": ["핵심 내용1", "핵심 내용2"]
  }
}

⚠️ 중요: korean 필드에는 한국어 JSON, english 필드에는 영어 JSON을 넣으세요.
- 절대로 message 필드에 프롬프트를 넣지 마세요! message는 대화 텍스트만!

⚡ 핵심 원칙: 사용자가 이미지/영상 주제, 장면, 키워드를 조금이라도 언급하면 즉시 프롬프트를 생성하세요!
- 사용자가 원하는 것을 되물어보지 말고, 바로 프롬프트를 만들어주세요.
- "어떤 스타일을 원하시나요?", "더 구체적으로 알려주세요" 같은 되묻기는 최소화하세요.
- 정보가 부족해도 합리적으로 추론하여 프롬프트를 먼저 제안하고, message에서 수정 가능하다고 안내하세요.`;
}

export async function chatPromptGenerator(
  history: ChatMessage[],
  userMessage: string,
  mediaType: PromptMediaType,
  referenceImageBase64?: string,
): Promise<ChatMessage> {
  const ai = getAiClient();

  // 최근 6개 메시지만 유지 (3턴) → 토큰 절약 + 속도 유지
  const recentHistory = history.slice(-6);

  // Gemini contents 형식으로 변환 (assistant → model의 JSON 응답 원형 복원)
  const contents: any[] = recentHistory.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{
      text: msg.role === 'assistant'
        ? JSON.stringify({ message: msg.text, ...(msg.prompt || {}) })
        : msg.text,
    }],
  }));

  // 새 사용자 메시지 추가
  const userParts: any[] = [{ text: userMessage }];
  if (referenceImageBase64) {
    const match = referenceImageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      userParts.unshift({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  }
  contents.push({ role: 'user', parts: userParts });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: getSystemInstruction(mediaType),
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object' as any,
        properties: {
          message: { type: 'string' as any, description: '사용자에게 보여줄 대화 텍스트' },
          korean: { type: 'string' as any, description: '한국어 최적화 프롬프트 (필수)' },
          english: { type: 'string' as any, description: '영어 최적화 프롬프트 (필수)' },
        },
        required: ['message', 'korean', 'english'],
      },
    },
    contents,
  });

  const text = response.text?.trim() || '';

  // JSON 모드이므로 바로 파싱
  let parsed: ChatResponseJson;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON 파싱 실패 시 텍스트 그대로 반환
    return { role: 'assistant', text: text || '응답을 처리할 수 없습니다.' };
  }

  const prompt: GeneratedPrompt | undefined =
    parsed.korean && parsed.english
      ? { korean: parsed.korean, english: parsed.english }
      : undefined;

  return {
    role: 'assistant',
    text: parsed.message || (prompt ? '프롬프트를 생성했습니다!' : ''),
    prompt,
  };
}
