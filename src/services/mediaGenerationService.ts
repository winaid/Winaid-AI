/**
 * 범용 이미지/동영상 생성 서비스
 * - 이미지: gemini-3-pro-image-preview (Nano Banana Pro)
 * - 동영상: veo-3.1-fast-generate-preview
 */
import { getAiClient, getApiKeyValue } from "./geminiClient";
import { generateCalendarFromPrompt } from "./calendarTemplateService";

// ── 이미지 생성 ──

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
export interface ImageGenerationRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  logoBase64?: string; // data:image/...;base64,xxx 형식의 로고 이미지
}

export interface ImageGenerationResult {
  imageDataUrl: string;
  mimeType: string;
}

// 달력 이미지를 Canvas로 직접 생성 (AI가 텍스트 데이터를 무시하므로 이미지로 전달)
function generateCalendarImage(year: number, month: number, holidays: string[]): string {
  const canvas = document.createElement('canvas');
  const cellW = 100, cellH = 70;
  const cols = 7;
  const headerH = 80; // 제목 영역
  const dayHeaderH = 40; // 요일 헤더
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const rows = Math.ceil((firstDay + lastDate) / 7);

  canvas.width = cols * cellW;
  canvas.height = headerH + dayHeaderH + rows * cellH;

  const ctx = canvas.getContext('2d')!;

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 제목: "5월"
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${month}월`, canvas.width / 2, 50);

  // 공휴일 목록 파싱 (예: "5-5 어린이날" → { day: 5 })
  const holidayDays = new Set<number>();
  for (const h of holidays) {
    const m = h.match(/^\d+-(\d+)/);
    if (m) holidayDays.add(parseInt(m[1], 10));
  }

  // 요일 헤더
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  ctx.font = 'bold 18px sans-serif';
  for (let i = 0; i < 7; i++) {
    const x = i * cellW + cellW / 2;
    const y = headerH + 25;
    ctx.fillStyle = i === 0 ? '#e53e3e' : i === 6 ? '#3182ce' : '#555555';
    ctx.fillText(dayNames[i], x, y);
  }

  // 구분선
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerH + dayHeaderH);
  ctx.lineTo(canvas.width, headerH + dayHeaderH);
  ctx.stroke();

  // 날짜 그리기
  ctx.font = '22px sans-serif';
  for (let d = 1; d <= lastDate; d++) {
    const idx = firstDay + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = col * cellW + cellW / 2;
    const y = headerH + dayHeaderH + row * cellH + 40;

    const isHoliday = holidayDays.has(d);
    const isSunday = col === 0;
    const isSaturday = col === 6;

    ctx.fillStyle = (isSunday || isHoliday) ? '#e53e3e' : isSaturday ? '#3182ce' : '#222222';
    ctx.font = (isHoliday) ? 'bold 22px sans-serif' : '22px sans-serif';
    ctx.fillText(String(d), x, y);
  }

  // 그리드 선
  ctx.strokeStyle = '#eeeeee';
  for (let r = 1; r <= rows; r++) {
    const y = headerH + dayHeaderH + r * cellH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let c = 1; c < cols; c++) {
    const x = c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, headerH + dayHeaderH);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}

// 해당 월의 달력 그리드 텍스트 생성
function buildCalendarGrid(year: number, month: number): string {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=일, 1=월, ...
  const lastDate = new Date(year, month, 0).getDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let grid = `${month}월 달력:\n`;
  grid += dayNames.join('  ') + '\n';

  // 첫째 주 빈칸
  let line = '    '.repeat(firstDay);
  let dayOfWeek = firstDay;

  for (let d = 1; d <= lastDate; d++) {
    line += String(d).padStart(2, ' ') + '  ';
    dayOfWeek++;
    if (dayOfWeek === 7) {
      grid += line.trimEnd() + '\n';
      line = '';
      dayOfWeek = 0;
    }
  }
  if (line.trim()) grid += line.trimEnd() + '\n';

  return grid;
}

// 한국 공휴일 (고정 공휴일만)
function getKoreanHolidays(year: number, month: number): string[] {
  const holidays: Record<string, string> = {
    '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날',
    '6-6': '현충일', '8-15': '광복절', '10-3': '개천절',
    '10-9': '한글날', '12-25': '성탄절',
  };
  const result: string[] = [];
  for (const [key, name] of Object.entries(holidays)) {
    const [m] = key.split('-').map(Number);
    if (m === month) result.push(`${key} ${name}`);
  }
  return result;
}

// 프롬프트에서 날짜/달력 관련 키워드 감지
function detectDateContext(prompt: string): { needsCalendar: boolean; months: number[]; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  const calendarKeywords = /달력|캘린더|calendar|일정|스케줄|진료\s*안내|휴진|휴무|공휴일|진료\s*시간/i;
  const needsCalendar = calendarKeywords.test(prompt);

  const months: number[] = [];
  // "3월", "12월" 등 월 감지
  const monthMatches = prompt.matchAll(/(\d{1,2})\s*월/g);
  for (const m of monthMatches) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 12) months.push(num);
  }

  // 월 언급이 없으면 현재 월
  if (months.length === 0 && needsCalendar) {
    months.push(now.getMonth() + 1);
  }

  return { needsCalendar, months, year };
}

export async function generateCustomImage(
  request: ImageGenerationRequest,
  onProgress?: (msg: string) => void
): Promise<ImageGenerationResult> {
  const ai = getAiClient();
  const progress = (msg: string) => onProgress?.(msg);

  // 달력/진료안내 감지 → HTML 템플릿으로 100% 정확한 달력 생성
  const dateCtxCheck = detectDateContext(request.prompt);
  if (dateCtxCheck.needsCalendar) {
    try {
      const calResult = await generateCalendarFromPrompt(request.prompt, onProgress);
      if (calResult) {
        return calResult;
      }
    } catch {
      // HTML 렌더링 실패 시 기존 AI 경로로 fallback
      progress('달력 템플릿 생성 실패, AI로 전환...');
    }
  }

  const aspectInstruction = getAspectInstruction(request.aspectRatio);

  // 날짜/달력 컨텍스트 자동 감지 + 달력 이미지 생성
  const dateCtx = detectDateContext(request.prompt);
  let calendarContext = '';
  let calendarImageDataUrl: string | null = null;
  if (dateCtx.needsCalendar && dateCtx.months.length > 0) {
    const parts: string[] = [];
    for (const month of dateCtx.months) {
      parts.push(buildCalendarGrid(dateCtx.year, month));
      const holidays = getKoreanHolidays(dateCtx.year, month);
      if (holidays.length > 0) {
        parts.push(`공휴일: ${holidays.join(', ')}`);
      }
      // 달력 이미지 생성 (첫 번째 월 기준)
      if (!calendarImageDataUrl) {
        try {
          calendarImageDataUrl = generateCalendarImage(dateCtx.year, month, holidays);
        } catch { /* SSR 등 canvas 사용 불가 환경에서는 텍스트만 사용 */ }
      }
    }
    calendarContext = `[정확한 달력 데이터]\n${parts.join('\n')}`;
  }

  const calendarInstruction = calendarImageDataUrl
    ? '첨부된 달력 이미지를 참고하세요. 이 달력의 날짜-요일 배치를 정확히 그대로 따라야 합니다. 날짜와 요일이 틀리면 안 됩니다.'
    : '';

  const logoInstruction = request.logoBase64
    ? '첨부된 로고 이미지를 참고하여 디자인 안에 이 로고를 자연스럽게 포함시켜 주세요. 로고의 형태와 스타일을 최대한 유지하면서 전체 디자인과 조화롭게 배치해주세요.'
    : '';

  const fullPrompt = [
    `[규칙] 사용자의 프롬프트에 충실하세요. 사용자가 요청하지 않은 정보를 임의로 추가하지 마세요.`,
    calendarInstruction,
    calendarContext,
    request.prompt,
    aspectInstruction,
    'professional quality, sharp details, crisp edges, no blur, no artifacts.',
    '한국어 텍스트가 포함된 경우 오타 없이 정확하게 렌더링해주세요.',
    logoInstruction,
  ].filter(Boolean).join('\n\n');

  // 멀티모달 contents 구성
  const contents: any[] = [{ text: fullPrompt }];

  // 달력 참고 이미지 추가
  if (calendarImageDataUrl) {
    const calMatch = calendarImageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (calMatch) {
      contents.push({
        inlineData: { mimeType: calMatch[1], data: calMatch[2] },
      });
    }
  }

  // 로고 이미지 추가
  if (request.logoBase64) {
    const match = request.logoBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      contents.push({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  }

  progress('이미지 생성 중...');

  const MAX_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      progress(`이미지 생성 시도 ${attempt}/${MAX_RETRIES}...`);

      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",  // Nano Banana Pro
        contents,
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
  const dateInfo = `${now.getMonth() + 1}월`;

  const baseInstruction = mediaType === 'image'
    ? `[시기 참고: ${dateInfo} - 계절/시기 맥락 파악용이며, 생성 프롬프트에 날짜를 포함하지 마세요]
당신은 AI 이미지 생성 프롬프트 전문가입니다.
Gemini Image Generation에 최적화된 상세 프롬프트를 작성합니다.
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 조명, 색감, 구도, 분위기 등 시각적 디테일 포함
- 텍스트가 필요한 경우 정확한 한국어 렌더링 지시 포함
- 의료 광고 가이드라인 준수 (과장/허위 표현 금지)
- 중요: 사용자가 명시적으로 요청한 내용만 프롬프트에 포함. 날짜, 숫자 등을 임의로 추가하지 마세요.`
    : `[시기 참고: ${dateInfo} - 계절/시기 맥락 파악용이며, 생성 프롬프트에 날짜를 포함하지 마세요]
당신은 AI 동영상 생성 프롬프트 전문가입니다.
VEO 3.1 영상 생성에 최적화된 상세 프롬프트를 작성합니다.
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 카메라 움직임(팬, 틸트, 줌 등), 조명, 분위기 설명 포함
- 5~8초 짧은 영상에 적합한 하나의 장면 중심
- 시네마틱하고 고품질의 영상미 지시 포함
- 중요: 사용자가 명시적으로 요청한 내용만 프롬프트에 포함. 날짜, 숫자 등을 임의로 추가하지 마세요.`;

  const imageContext = referenceImageBase64
    ? '\n\n참고 이미지가 첨부되어 있습니다. 이 이미지의 스타일, 구도, 색감, 분위기를 분석하여 비슷한 결과물을 만들 수 있는 프롬프트를 작성하세요.'
    : '';

  const userContext = userInput
    ? `\n\n사용자 추가 요청: "${userInput}"`
    : '';

  const promptText = `${baseInstruction}${imageContext}${userContext}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
프롬프트는 분위기, 색상, 구도, 그래픽 요소, 텍스트 내용, 타이포그래피, 조명, 용도 등을 구체적으로 서술하세요:
{"korean": "상세한 한국어 프롬프트", "english": "Detailed English prompt"}`;

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
  const dateInfo = `${now.getMonth() + 1}월`;

  const base = mediaType === 'image'
    ? `[시기 참고: ${dateInfo} - 계절/시기 맥락 파악용이며, 생성 프롬프트에 오늘 날짜를 넣지 마세요. 사용자가 요청한 월/날짜만 사용하세요.]
당신은 AI 이미지 생성 프롬프트 전문가이자 친절한 어시스턴트입니다.
사용자와 대화하며 Gemini Image Generation에 최적화된 프롬프트를 함께 만들어갑니다.

전문 분야:
- 병원/의료 콘텐츠에 적합한 전문적이고 깔끔한 스타일
- 조명, 색감, 구도, 분위기 등 시각적 디테일
- 텍스트가 필요한 경우 정확한 한국어 렌더링 지시
- 의료 광고 가이드라인 준수 (과장/허위 표현 금지)`
    : `[시기 참고: ${dateInfo} - 계절/시기 맥락 파악용이며, 생성 프롬프트에 오늘 날짜를 넣지 마세요. 사용자가 요청한 월/날짜만 사용하세요.]
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
- korean: 한국어 최적화 프롬프트 (항상 필수! 빈 문자열 금지!)
- english: 영어 최적화 프롬프트 (항상 필수! 빈 문자열 금지!)

🚨 JSON 구조 규칙 (절대 위반 금지!):
- korean 필드에는 반드시 한국어 프롬프트를 넣으세요.
- english 필드에는 반드시 영어 프롬프트를 넣으세요.
- 절대로 message 필드에 프롬프트를 넣지 마세요! message는 대화 텍스트만!
- "안녕", "고마워" 같은 인사에도 간단한 예시 프롬프트를 korean/english에 넣으세요.

📝 프롬프트 작성 상세 가이드 (korean/english 필드):
프롬프트는 일반 문장 형태로 작성하되, 아래 항목들을 최대한 구체적으로 포함하세요:

1. 전체 분위기/스타일: 따뜻한, 전문적인, 모던한, 밝은, 고급스러운 등
2. 색상/색감: 구체적 컬러 톤 (파스텔 핑크, 밝은 베이지, 하늘색 그라데이션 등)
3. 구도/레이아웃: 중앙 배치, 상단 제목/하단 정보, 좌우 분할 등
4. 그래픽 요소: 일러스트 스타일, 아이콘, 장식 요소, 패턴 등
5. 텍스트 내용: 포스터에 들어갈 제목, 날짜, 시간, 정보 등 (한국어 정확하게)
6. 타이포그래피: 둥근 고딕체, 굵은 제목, 깔끔한 본문 등
7. 조명/질감: 자연광, 소프트 라이팅, 매끈한 질감, 그림자 등
8. 전체적인 용도: 병원 공지 포스터, SNS 홍보, 진료 안내 등
9. 품질: 반드시 "high resolution, sharp details, crisp text, no blur, no artifacts, professional quality" 등의 고품질 지시를 영어 프롬프트 끝에 포함하세요.

🎨 색상 다양성 규칙 (매우 중요!):
- "고급스러운", "럭셔리", "프리미엄" 요청 시 금색/골드만 사용하지 마세요! 다양한 고급 팔레트를 활용하세요:
  · 딥 네이비 + 화이트 (클래식 고급감)
  · 차콜 + 실버 그레이 (모던 프리미엄)
  · 버건디/와인 + 크림 (따뜻한 고급감)
  · 포레스트 그린 + 아이보리 (자연스러운 품격)
  · 미드나이트 블루 + 로즈골드 (세련된 고급감)
  · 블랙 + 화이트 미니멀 (심플 럭셔리)
  · 딥 퍼플 + 라벤더 (우아한 고급감)
  · 골드/금색도 가능하지만, 매번 기본값으로 사용 금지! 다른 팔레트를 먼저 고려하세요.
- 같은 사용자에게 반복 요청이 오면 이전과 다른 색상 팔레트를 제안하세요.

🔥 품질 필수 규칙:
- 영어 프롬프트에 반드시 포함: "high resolution, ultra sharp, crisp edges, clean details, professional graphic design quality, no compression artifacts, no blur"
- 한국어 프롬프트에 반드시 포함: "고해상도, 선명하고 깨끗한 디테일, 흐림 없는 또렷한 텍스트와 그래픽"

예시 (좋은 프롬프트):
"밝고 따뜻한 파스텔 핑크-노랑 그라데이션 배경의 산부인과 진료 안내 포스터. 상단 중앙에 '삼일절 진료안내' 제목을 굵은 둥근 고딕체로 배치하고, 무궁화 아이콘을 제목 옆에 장식. 중앙에 둥근 모서리 사각형 안에 진료 일정 정보(3월 1일 10시-14시, 3월 2일 10시-20시)를 깔끔하게 정리. 하단에 미니멀한 달력 그리드 배치. 전체적으로 부드럽고 친근한 느낌의 병원 공지 디자인. 고해상도, 선명하고 깨끗한 디테일, 흐림 없는 또렷한 텍스트와 그래픽."

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
