/**
 * 범용 이미지/동영상 생성 서비스
 * - 이미지: gemini-3.1-flash-image-preview
 * - 동영상: veo-3.1-fast-generate-preview
 */
import { getAiClient, getApiKeyValue } from "./geminiClient";

// ── 이미지 생성 ──

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
export type ImageTemplate = 'free' | 'closure' | 'schedule' | 'event' | 'sns';

const IMAGE_TEMPLATE_PROMPTS: Record<ImageTemplate, string> = {
  free: '',
  closure: `병원/의원 휴진 공지 이미지를 만들어주세요.
깔끔하고 전문적인 디자인으로, 배경은 밝고 부드러운 톤입니다.
텍스트는 한국어로 크고 읽기 쉽게 배치합니다.
의료기관다운 신뢰감 있는 디자인이어야 합니다.`,
  schedule: `병원/의원 진료 일정 안내 이미지를 만들어주세요.
깔끔한 표 형태 또는 캘린더 형태로, 요일과 시간이 명확히 보여야 합니다.
전문적이면서도 따뜻한 느낌의 의료 디자인입니다.`,
  event: `병원/의원 이벤트 또는 할인 안내 이미지를 만들어주세요.
시선을 끄는 디자인이되 의료기관의 신뢰감을 유지합니다.
한국어 텍스트가 중심이며, 밝고 긍정적인 느낌입니다.`,
  sns: `병원/의원 SNS 게시용 이미지를 만들어주세요.
모바일에서 보기 좋은 레이아웃, 간결한 텍스트, 눈에 띄는 컬러.
전문적이면서도 친근한 느낌의 의료 콘텐츠입니다.`,
};

export interface ImageGenerationRequest {
  prompt: string;
  template: ImageTemplate;
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

  const templatePrompt = IMAGE_TEMPLATE_PROMPTS[request.template];
  const aspectInstruction = getAspectInstruction(request.aspectRatio);

  const fullPrompt = [
    templatePrompt,
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

  const fullPrompt = [
    request.prompt,
    '한국어 텍스트가 포함된 경우 정확하게 렌더링해주세요.',
    '전문적이고 깔끔한 의료 콘텐츠 스타일입니다.',
  ].join('\n\n');

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

    const generatedVideos = operation.response?.generatedVideos;
    if (!generatedVideos || generatedVideos.length === 0) {
      throw new Error('동영상을 생성하지 못했습니다.');
    }

    const video = generatedVideos[0].video;

    if (!video?.name) {
      throw new Error('동영상 파일 정보를 가져올 수 없습니다.');
    }

    // Google API에서 실제 동영상 바이너리 다운로드
    progress('동영상 다운로드 중...');
    const apiKey = getApiKeyValue();
    const downloadUrl = `https://generativelanguage.googleapis.com/v1beta/${video.name}?alt=media&key=${apiKey}`;
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
