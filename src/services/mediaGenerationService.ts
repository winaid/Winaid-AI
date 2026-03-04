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

  const fullPrompt = [
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

  const fullPrompt = request.prompt;

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

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{"korean": "한국어 최적화 프롬프트", "english": "English optimized prompt"}`;

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
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts }],
  });

  const text = response.text?.trim() || '';

  // JSON 파싱 (코드블록 감싸져 있을 수 있음)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('프롬프트 생성 결과를 파싱할 수 없습니다.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
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
- 반드시 JSON으로만 응답하세요. 다른 형식은 절대 사용하지 마세요.
- message: 사용자에게 보여줄 대화 텍스트 (항상 필수)
- korean: 한국어 최적화 프롬프트 (프롬프트를 제안/수정할 때만 포함)
- english: 영어 최적화 프롬프트 (프롬프트를 제안/수정할 때만 포함)
- 단순 대화(인사, 질문 등)에는 message만 포함하고 korean/english는 생략하세요.
- 프롬프트를 제안할 때는 message + korean + english 모두 포함하세요.`;
}

export async function chatPromptGenerator(
  history: ChatMessage[],
  userMessage: string,
  mediaType: PromptMediaType,
  referenceImageBase64?: string,
): Promise<ChatMessage> {
  const ai = getAiClient();

  // Gemini contents 형식으로 변환 (assistant → model의 JSON 응답 원형 복원)
  const contents: any[] = history.map((msg) => ({
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
          korean: { type: 'string' as any, description: '한국어 최적화 프롬프트 (제안할 때만)' },
          english: { type: 'string' as any, description: '영어 최적화 프롬프트 (제안할 때만)' },
        },
        required: ['message'],
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
