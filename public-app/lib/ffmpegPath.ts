/**
 * FFmpeg/FFprobe 경로 해결
 *
 * 1순위: 시스템 설치된 ffmpeg
 * 2순위: @ffmpeg-installer/ffmpeg npm 패키지
 */

let cachedPath: string | null = null;
let cachedProbePath: string | null = null;

export function getFfmpegPath(): string {
  if (cachedPath) return cachedPath;

  // 시스템 ffmpeg 확인
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 });
    cachedPath = 'ffmpeg';
    return cachedPath;
  } catch { /* not found */ }

  // npm 패키지
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path) {
      cachedPath = installer.path;
      return cachedPath;
    }
  } catch { /* not installed */ }

  // fallback
  cachedPath = 'ffmpeg';
  return cachedPath;
}

export function getFfprobePath(): string {
  if (cachedProbePath) return cachedProbePath;

  try {
    const { execSync } = require('child_process');
    execSync('ffprobe -version', { stdio: 'pipe', timeout: 3000 });
    cachedProbePath = 'ffprobe';
    return cachedProbePath;
  } catch { /* */ }

  // ffprobe는 @ffprobe-installer/ffprobe 패키지가 별도로 필요
  // 없으면 시스템 경로 시도
  cachedProbePath = 'ffprobe';
  return cachedProbePath;
}

/** FFmpeg 사용 가능 여부 */
export function isFfmpegAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    const ffmpeg = getFfmpegPath();
    execSync(`"${ffmpeg}" -version`, { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
