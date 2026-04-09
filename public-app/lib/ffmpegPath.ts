/**
 * FFmpeg/FFprobe 경로 해결
 *
 * 시스템에 설치된 ffmpeg/ffprobe를 사용.
 * 없으면 graceful하게 실패 (각 API에서 처리).
 */

export function getFfmpegPath(): string {
  return 'ffmpeg';
}

export function getFfprobePath(): string {
  return 'ffprobe';
}

/** FFmpeg 사용 가능 여부 */
export function isFfmpegAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
