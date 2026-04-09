/**
 * Video Processor 클라이언트 유틸 (프론트엔드)
 *
 * 프론트에서 영상 처리 요청 시 파일 크기에 따라 경로를 자동 분기:
 * - 4MB 이하: Vercel API 경유 (/api/video/...)
 * - 4MB 초과: video-processor 직접 호출 (CORS)
 *
 * 사용법:
 *   const { blob, headers } = await processVideo(file, '/silence-remove', { intensity: 'normal' });
 */

const VERCEL_PROXY_LIMIT = 4 * 1024 * 1024; // 4MB

function getProcessorUrl(): string | null {
  return typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_VIDEO_PROCESSOR_URL || null)
    : null;
}

export interface VideoProcessResult {
  blob: Blob;
  headers: Record<string, string>;
}

/**
 * 영상 처리 요청 — 파일 크기에 따라 경로 자동 분기
 *
 * @param file 영상/오디오 파일
 * @param endpoint 슬래시 포함 경로 (예: '/silence-remove')
 * @param params 추가 파라미터 (FormData에 append)
 * @param timeout 타임아웃 (ms)
 */
export async function processVideo(
  file: File,
  endpoint: string,
  params: Record<string, string> = {},
  timeout = 180000,
): Promise<VideoProcessResult> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [k, v] of Object.entries(params)) {
    formData.append(k, v);
  }

  const processorUrl = getProcessorUrl();
  const isLarge = file.size > VERCEL_PROXY_LIMIT;

  // 경로 결정
  let url: string;
  if (isLarge && processorUrl) {
    // 큰 파일 → video-processor 직접
    url = `${processorUrl.replace(/\/$/, '')}/api/video${endpoint}`;
  } else {
    // 작은 파일 or 환경변수 미설정 → Vercel 경유
    url = `/api/video${endpoint}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      // JSON 에러 응답 시도
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        throw new Error(data.error || `처리 실패 (${res.status})`);
      }
      throw new Error(`영상 처리 실패 (${res.status})`);
    }

    // 메타데이터 헤더 수집
    const headers: Record<string, string> = {};
    for (const key of ['x-silence-metadata', 'x-crop-metadata', 'x-bgm-metadata', 'x-intro-metadata', 'x-zoom-metadata', 'x-style-metadata', 'x-thumbnail-metadata', 'x-tts-metadata', 'x-assemble-metadata']) {
      const val = res.headers.get(key);
      if (val) headers[key] = val;
    }

    const blob = await res.blob();
    return { blob, headers };

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('처리 시간이 초과되었습니다. 더 짧은 파일로 시도해주세요.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** video-processor 서버 상태 확인 (프론트에서 호출) */
export async function checkProcessorHealth(): Promise<boolean> {
  const url = getProcessorUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
