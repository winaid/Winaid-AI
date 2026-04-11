const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://winai.kr,http://localhost:3000').split(',');
const SHARED_SECRET = process.env.PROCESSOR_SHARED_SECRET || '';

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
// /api/* 경로에만 적용. X-API-Secret 헤더와 PROCESSOR_SHARED_SECRET 환경변수가 일치해야 통과.
// SHARED_SECRET이 비어 있으면(개발/미설정) 경고 로그만 남기고 통과 — 기존 개발 플로우 유지.
app.use('/api', (req, res, next) => {
  if (!SHARED_SECRET) {
    if (!global.__warnedNoSecret) {
      console.warn('⚠️  PROCESSOR_SHARED_SECRET 미설정 — 인증 비활성화 (개발 모드). 프로덕션에서는 반드시 설정할 것.');
      global.__warnedNoSecret = true;
    }
    return next();
  }
  const provided = req.get('X-API-Secret') || '';
  if (provided !== SHARED_SECRET) {
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

// ── 프로덕션 가드 ──
// 개발 환경은 SHARED_SECRET 없이 부팅 가능(경고만). 프로덕션은 시크릿 누락을
// 즉시 fail-fast — 실수로 인증 없는 상태로 퍼블릭 Railway 인스턴스가 노출되는
// 회귀를 원천 차단. `NODE_ENV=production`에서만 적용되므로 로컬 개발은 영향 없음.
if (process.env.NODE_ENV === 'production' && !SHARED_SECRET) {
  console.error('FATAL: PROCESSOR_SHARED_SECRET이 설정되지 않았습니다. 프로덕션에서는 반드시 설정해야 합니다.');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  WINAI Video Processor v1.0.0             ║');
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`║  Auth: ${SHARED_SECRET ? 'ENABLED ' : 'DISABLED'}                           ║`);
  console.log('╚═══════════════════════════════════════════╝');

  // 도구 확인 — 부팅 로그에만 출력, /health 엔드포인트는 boolean만 노출
  try { const v = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0]; console.log(`✅ FFmpeg: ${v.slice(0, 50)}`); } catch { console.log('❌ FFmpeg 없음'); }
  try { const v = execSync('auto-editor --version', { stdio: 'pipe' }).toString().trim(); console.log(`✅ auto-editor: ${v}`); } catch { console.log('❌ auto-editor 없음'); }
});
