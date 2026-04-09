const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `bgm-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { bgm_id = 'calm_01', volume = '15' } = req.body || {};
    const vol = Math.max(0, Math.min(50, parseInt(volume))) / 100;

    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output.mp4`);
    fs.renameSync(req.file.path, inputPath);

    // BGM 파일 — public-app의 sfx에서 찾기 (같은 프로젝트라면)
    // Railway에서는 BGM 파일을 이 서버에도 포함해야 함
    // TODO: BGM 파일을 이 서버의 /app/sfx/ 에 복사하거나 URL로 다운로드
    const mood = bgm_id.replace(/_\d+$/, '');
    const bgmPath = path.join(__dirname, '..', '..', 'sfx', 'bgm', mood, `${bgm_id}.mp3`);

    if (!fs.existsSync(bgmPath)) {
      // BGM 파일 없으면 원본 반환
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Bgm-Metadata', JSON.stringify({ bgm_applied: false, reason: 'BGM 파일 없음' }));
      fs.createReadStream(inputPath).pipe(res).on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
      return;
    }

    execSync(
      `ffmpeg -y -i "${inputPath}" -i "${bgmPath}" ` +
      `-filter_complex "[1]volume=${vol.toFixed(2)},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]" ` +
      `-map 0:v -map "[out]" -c:v copy -c:a aac -b:a 128k "${outputPath}"`,
      { timeout: 300000, stdio: 'pipe' }
    );

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Bgm-Metadata', JSON.stringify({ bgm_applied: true, bgm_id, volume: parseInt(volume) }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: 'BGM 합성 실패' });
  }
});

module.exports = router;
