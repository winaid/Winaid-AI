const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { execSync } = require('child_process');
const { timingSafeEqual, randomBytes } = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://winai.kr,http://localhost:3000').split(',');

// ── PROCESSOR_SHARED_SECRET 결정 ──
// production: 환경변수 필수 (없으면 startup fail-fast)
// dev/test: 환경변수 없으면 32-byte 무작위 자동 생성 + 콘솔 출력
//   → silent-allow 회귀 차단. 호출자는 출력된 값을 X-API-Secret 헤더로 사용.
const SHARED_SECRET = (() => {
  const env = process.env.PROCESSOR_SHARED_SECRET || '';
  if (env) return env;
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: PROCESSOR_SHARED_SECRET is required in production.');
    process.exit(1);
  }
  const generated = randomBytes(32).toString('hex');
  console.warn('⚠️  PROCESSOR_SHARED_SECRET 환경변수 미설정 — dev 임시 시크릿 자동 생성:');
  console.warn(`   ${generated}`);
  console.warn('   클라이언트 호출 시 X-API-Secret 헤더에 위 값 사용.');
  return generated;
})();

/** Timing-safe string equality — 길이 다르면 false 즉시. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

app.use(helmet());
app.use(compression());
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '1mb' }));

// 상태 확인 — 인증 불필요, 정보 최소 공개
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'winai-video-processor', version: '1.0.0' });
});

// Health — 필요한 도구(ffmpeg/ffprobe/auto-editor) 존재 여부만 boolean으로.
// 경로/버전/pip list 등 상세 정보는 공개하지 않음.
app.get('/health', (req, res) => {
  const checks = {};
  try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 }); checks.ffmpeg = true; } catch { checks.ffmpeg = false; }
  try { execSync('ffprobe -version', { stdio: 'pipe', timeout: 3000 }); checks.ffprobe = true; } catch { checks.ffprobe = false; }

  let aeFound = false;
  const aePaths = ['auto-editor', '/usr/local/bin/auto-editor', '/opt/autoeditor/bin/auto-editor'];
  for (const p of aePaths) {
    try { execSync(`${p} --version`, { stdio: 'pipe', timeout: 5000 }); aeFound = true; break; } catch { /* next */ }
  }
  checks.autoEditor = aeFound;

  res.json({ status: 'ok', checks });
});

// ── 인증 미들웨어 ──
// /api/* 모든 경로에 적용. X-API-Secret 헤더 ↔ SHARED_SECRET timing-safe 비교.
// dev/test 에서도 SHARED_SECRET 가 자동 생성되므로 silent-allow 없음.
app.use('/api', (req, res, next) => {
  const provided = req.get('X-API-Secret') || '';
  if (!safeEqual(provided, SHARED_SECRET)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
});

// 라우트
const silenceRemove = require('./routes/silence-remove');
const cropVertical = require('./routes/crop-vertical');
const addBgm = require('./routes/add-bgm');
const addIntroOutro = require('./routes/add-intro-outro');
const addZoom = require('./routes/add-zoom');
const generateThumbnail = require('./routes/generate-thumbnail');
const applyStyle = require('./routes/apply-style');
const addSoundEffects = require('./routes/add-sound-effects');
const cardToShorts = require('./routes/card-to-shorts');

app.use('/api/video/silence-remove', silenceRemove);
app.use('/api/video/crop-vertical', cropVertical);
app.use('/api/video/add-bgm', addBgm);
app.use('/api/video/add-intro-outro', addIntroOutro);
app.use('/api/video/add-zoom', addZoom);
app.use('/api/video/generate-thumbnail', generateThumbnail);
app.use('/api/video/apply-style', applyStyle);
app.use('/api/video/add-sound-effects', addSoundEffects);
app.use('/api/video/card-to-shorts', cardToShorts);

app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  WINAI Video Processor v1.0.0             ║');
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log('║  Auth: ENABLED (always)                   ║');
  console.log('╚═══════════════════════════════════════════╝');

  // 도구 확인 — 부팅 로그에만 출력, /health 엔드포인트는 boolean만 노출
  try { const v = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0]; console.log(`✅ FFmpeg: ${v.slice(0, 50)}`); } catch { console.log('❌ FFmpeg 없음'); }
  try { const v = execSync('auto-editor --version', { stdio: 'pipe' }).toString().trim(); console.log(`✅ auto-editor: ${v}`); } catch { console.log('❌ auto-editor 없음'); }
});
