/**
 * sfxLibrary — 효과음 카테고리 라이브러리
 *
 * sfx/{category}/*.mp3 파일을 자동으로 스캔.
 * 파일이 0개여도 에러 없이 빈 배열 반환 (graceful).
 *
 * 호출부에서 getTotalSfxCount()로 0 체크 후, 0이면 효과음 합성을
 * 스킵하고 원본을 그대로 반환하면 됨.
 */

const path = require('path');
const fs = require('fs');

const SFX_BASE = path.join(__dirname, '..', '..', 'sfx');

// 카테고리 정의 (bgm은 별도 라우트에서 관리하므로 제외)
const CATEGORIES = [
  'emphasis',     // 강조 (띵, 뿅, 붐 등)
  'transition',   // 전환 (슉, 휙 등)
  'positive',     // 긍정 (짜잔, 성공 등)
  'negative',     // 부정 (삐빅, 실패 등)
  'funny',        // 코믹 (뿡, 삑 등)
  'notification', // 알림 (딩동, 핑 등)
  'ambient',      // 분위기 (새소리, 빗소리 등)
  'musical',      // 음악적 (라이저, 드럼롤 등)
  'speech',       // 음성 (헉, 아하 등)
  'ui',           // UI (텍스트등장, 스와이프 등)
];

/** 단일 카테고리 스캔 — 디렉토리/파일 없으면 빈 배열 */
function loadCategory(category) {
  const dir = path.join(SFX_BASE, category);
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.mp3'))
      .map(f => ({
        id: `${category}_${path.basename(f, path.extname(f))}`,
        path: path.join(dir, f),
        name: path.basename(f, path.extname(f)),
        category,
      }));
  } catch {
    return [];
  }
}

// 한 번만 스캔하고 캐시 (서버 재시작 전까지 유지)
let _library = null;

function getSfxLibrary() {
  if (!_library) {
    _library = {};
    for (const cat of CATEGORIES) {
      _library[cat] = loadCategory(cat);
    }
  }
  return _library;
}

/** 특정 카테고리에서 무작위 1개. 없으면 null. */
function getRandomSfx(category) {
  const lib = getSfxLibrary();
  const items = lib[category] || [];
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

/** 특정 카테고리의 전체 목록 */
function getSfxByCategory(category) {
  const lib = getSfxLibrary();
  return lib[category] || [];
}

/** 전체 효과음 파일 수 — 0이면 합성 스킵 판단용 */
function getTotalSfxCount() {
  const lib = getSfxLibrary();
  return Object.values(lib).reduce((sum, arr) => sum + arr.length, 0);
}

/** 카테고리별 파일 수 (디버그/헬스체크용) */
function getSfxCountsByCategory() {
  const lib = getSfxLibrary();
  const out = {};
  for (const cat of CATEGORIES) out[cat] = (lib[cat] || []).length;
  return out;
}

module.exports = {
  CATEGORIES,
  getSfxLibrary,
  getRandomSfx,
  getSfxByCategory,
  getTotalSfxCount,
  getSfxCountsByCategory,
};
