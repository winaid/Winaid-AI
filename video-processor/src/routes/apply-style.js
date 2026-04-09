const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

const STYLE_FILTERS = {
  pencil_sketch: 'edgedetect=low=0.1:high=0.4,negate',
  vintage_film: 'curves=vintage,noise=c0s=10:c0f=u',
  pastel: 'eq=saturation=0.6:brightness=0.05,curves=lighter',
};

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `style-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { style_id = 'original' } = req.body || {};
    const filter = STYLE_FILTERS[style_id];

    if (!filter || style_id === 'original') {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Style-Metadata', JSON.stringify({ style_applied: style_id, method: 'skip' }));
      fs.createReadStream(req.file.path).pipe(res);
      return;
    }

    const inputPath = path.join(workDir, `input${path.extname(req.file.originalname) || '.mp4'}`);
    const outputPath = path.join(workDir, 'output.mp4');
    fs.renameSync(req.file.path, inputPath);

    execSync(`ffmpeg -y -i "${inputPath}" -vf "${filter}" -c:a copy "${outputPath}"`, { timeout: 300000, stdio: 'pipe' });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Style-Metadata', JSON.stringify({ style_applied: style_id, method: 'ffmpeg_filter' }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: '스타일 변환 실패' });
  }
});

module.exports = router;
