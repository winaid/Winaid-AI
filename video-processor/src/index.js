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
  try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 }); checks.ffmpeg = true; } catch { checks.ffmpeg = false; }
  try { execSync('auto-editor --version', { stdio: 'pipe', timeout: 3000 }); checks.autoEditor = true; } catch { checks.autoEditor = false; }
  try { execSync('ffprobe -version', { stdio: 'pipe', timeout: 3000 }); checks.ffprobe = true; } catch { checks.ffprobe = false; }
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
