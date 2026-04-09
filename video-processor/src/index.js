const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://winai.kr,http://localhost:3000').split(',');

app.use(helmet());
app.use(compression());
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '1mb' }));

// 상태 확인
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'winai-video-processor', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  const checks = {};
  const errors = {};
  try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 }); checks.ffmpeg = true; } catch (e) { checks.ffmpeg = false; errors.ffmpeg = e.message?.slice(0, 200); }

  // auto-editor: 여러 경로 시도
  let aeFound = false;
  const aePaths = ['auto-editor', '/usr/local/bin/auto-editor', '/opt/autoeditor/bin/auto-editor'];
  for (const p of aePaths) {
    try { execSync(`${p} --version`, { stdio: 'pipe', timeout: 5000 }); aeFound = true; checks.autoEditorPath = p; break; } catch { /* next */ }
  }
  checks.autoEditor = aeFound;
  if (!aeFound) {
    // which/find로 어디 있는지 탐색
    try { checks.autoEditorWhich = execSync('which auto-editor 2>/dev/null || find / -name auto-editor -type f 2>/dev/null | head -5', { stdio: 'pipe', timeout: 5000 }).toString().trim(); } catch { checks.autoEditorWhich = 'not found'; }
    try { checks.pythonVersion = execSync('python3 --version', { stdio: 'pipe', timeout: 3000 }).toString().trim(); } catch { /* */ }
    try { checks.pipList = execSync('/opt/autoeditor/bin/pip list 2>/dev/null | grep auto', { stdio: 'pipe', timeout: 3000 }).toString().trim(); } catch { checks.pipList = 'venv not found'; }
  }

  try { execSync('ffprobe -version', { stdio: 'pipe', timeout: 3000 }); checks.ffprobe = true; } catch (e) { checks.ffprobe = false; }
  res.json({ status: 'ok', checks });
});

// 라우트
const silenceRemove = require('./routes/silence-remove');
const cropVertical = require('./routes/crop-vertical');
const addBgm = require('./routes/add-bgm');
const addIntroOutro = require('./routes/add-intro-outro');
const addZoom = require('./routes/add-zoom');
const generateThumbnail = require('./routes/generate-thumbnail');
const applyStyle = require('./routes/apply-style');

app.use('/api/video/silence-remove', silenceRemove);
app.use('/api/video/crop-vertical', cropVertical);
app.use('/api/video/add-bgm', addBgm);
app.use('/api/video/add-intro-outro', addIntroOutro);
app.use('/api/video/add-zoom', addZoom);
app.use('/api/video/generate-thumbnail', generateThumbnail);
app.use('/api/video/apply-style', applyStyle);

app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  WINAI Video Processor v1.0.0             ║');
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log('╚═══════════════════════════════════════════╝');

  // 도구 확인
  try { const v = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0]; console.log(`✅ FFmpeg: ${v.slice(0, 50)}`); } catch { console.log('❌ FFmpeg 없음'); }
  try { const v = execSync('auto-editor --version', { stdio: 'pipe' }).toString().trim(); console.log(`✅ auto-editor: ${v}`); } catch { console.log('❌ auto-editor 없음'); }
});
