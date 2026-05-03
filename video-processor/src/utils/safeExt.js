/**
 * Filename extension whitelist sanitizer.
 *
 * 사용자 제어 originalname (multer req.file.originalname) 의 path.extname() 결과를
 * 셸 보간에 그대로 흘려보내지 않도록 화이트리스트 정규식 + 도메인별 허용 set 으로 정정.
 *
 * 공격 벡터 차단:
 *   originalname = 'foo".mp4; rm -rf / #'
 *   path.extname()  → '.mp4; rm -rf / #'
 *   execSync(`ffmpeg -i "input${ext}"`) → 셸 명령 실행
 *
 * 본 함수 사용 시:
 *   safeExt('foo".mp4; rm -rf / #', VIDEO_EXTS) → '.mp4' (정규식 미일치 → fallback)
 */

const path = require('path');

/** 일반 비디오 확장자. */
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];

/** 일반 오디오 확장자. */
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];

/** 일반 이미지 확장자. */
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * 안전한 확장자 추출 + 화이트리스트 강제.
 *
 * @param {string} originalname multer 의 req.file.originalname 등 사용자 입력
 * @param {string[]} allowed 허용 확장자 리스트 (예: VIDEO_EXTS)
 * @param {string} [fallback] 미일치 시 반환값. 미지정 시 allowed[0]
 * @returns {string} '.mp4' 같은 안전한 확장자 (소문자, 알파벳/숫자만, 6자 이하)
 */
function safeExt(originalname, allowed, fallback) {
  const fb = fallback || (allowed && allowed[0]) || '.bin';
  if (typeof originalname !== 'string' || originalname.length === 0) return fb;
  const raw = path.extname(originalname).toLowerCase();
  // strict 정규식: 점 + 알파벳/숫자 1~6자만
  if (!/^\.[a-z0-9]{1,6}$/.test(raw)) return fb;
  if (Array.isArray(allowed) && !allowed.includes(raw)) return fb;
  return raw;
}

module.exports = {
  safeExt,
  VIDEO_EXTS,
  AUDIO_EXTS,
  IMAGE_EXTS,
};
