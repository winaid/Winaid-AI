/**
 * Video Processor 서버 프록시 유틸 (서버 사이드)
 *
 * public-app API 라우트에서 video-processor(Railway)로 요청을 중계할 때 사용.
 * 4.5MB 이하 파일만 Vercel 경유 가능. 그 이상은 클라이언트에서 직접 호출해야 함.
 */

export function getVideoProcessorUrl(): string {
  const url = process.env.NEXT_PUBLIC_VIDEO_PROCESSOR_URL;
  if (!url) throw new Error('영상 처리 서버가 설정되지 않았습니다. NEXT_PUBLIC_VIDEO_PROCESSOR_URL 환경변수를 확인하세요.');
  return url.replace(/\/$/, '');
}

/** video-processor가 설정되어 있는지 */
export function isVideoProcessorConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VIDEO_PROCESSOR_URL;
}

/** FormData를 video-processor로 프록시 */
export async function proxyFormData(
  endpoint: string,
  formData: FormData,
  timeout = 120000,
): Promise<Response> {
  const url = `${getVideoProcessorUrl()}${endpoint}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('처리 시간이 초과되었습니다. 더 짧은 파일로 시도해주세요.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** video-processor 헬스 체크 */
export async function checkHealth(): Promise<{
  ok: boolean;
  ffmpeg: boolean;
  autoEditor: boolean;
}> {
  try {
    const url = `${getVideoProcessorUrl()}/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, ffmpeg: false, autoEditor: false };
    const data = await res.json() as { checks?: { ffmpeg?: boolean; autoEditor?: boolean } };
    return {
      ok: true,
      ffmpeg: data.checks?.ffmpeg ?? false,
      autoEditor: data.checks?.autoEditor ?? false,
    };
  } catch {
    return { ok: false, ffmpeg: false, autoEditor: false };
  }
}

/** 에러 메시지 한국어 변환 */
export function translateVideoError(error: string): string {
  const map: Record<string, string> = {
    'File too large': '파일이 너무 큽니다. 500MB 이하로 시도해주세요.',
    'Unsupported format': '지원하지 않는 파일 형식입니다.',
    'Processing timeout': '처리 시간이 초과되었습니다.',
    'Server busy': '서버가 바쁩니다. 잠시 후 다시 시도해주세요.',
  };
  return map[error] || error || '처리 중 오류가 발생했습니다.';
}
