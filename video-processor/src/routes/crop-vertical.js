const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { runFfmpeg, runFfprobe } = require('../utils/safeFfmpeg');
const { safeExt, VIDEO_EXTS } = require('../utils/safeExt');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `crop-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { aspect_ratio = '9:16', crop_mode = 'center', output_resolution = '1080x1920' } = req.body || {};

    const ext = safeExt(req.file.originalname, VIDEO_EXTS);
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output.mp4`);
    fs.renameSync(req.file.path, inputPath);

    // 원본 해상도
    let srcW = 1920, srcH = 1080;
    try {
      const { stdout } = await runFfprobe([
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        inputPath,
      ], { timeout: 10000 });
      const probe = JSON.parse(stdout.toString());
      srcW = probe.streams?.[0]?.width || 1920;
      srcH = probe.streams?.[0]?.height || 1080;
    } catch { /* */ }

    // 비율 계산
    const ratios = { '9:16': [9, 16], '4:5': [4, 5], '1:1': [1, 1] };
    const [rw, rh] = ratios[aspect_ratio] || [9, 16];
    let cropH = srcH, cropW = Math.round(cropH * rw / rh);
    if (cropW > srcW) { cropW = srcW; cropH = Math.round(cropW * rh / rw); }

    // 출력 해상도
    let outW, outH;
    if (output_resolution === '720x1280') { outH = aspect_ratio === '1:1' ? 720 : 1280; outW = Math.round(outH * rw / rh); }
    else { outH = aspect_ratio === '1:1' ? 1080 : 1920; outW = Math.round(outH * rw / rh); }

    const vf = `crop=${cropW}:${cropH}:(iw-${cropW})/2:(ih-${cropH})/2,scale=${outW}:${outH}`;

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ]);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Crop-Metadata', JSON.stringify({
      original_resolution: `${srcW}x${srcH}`,
      result_resolution: `${outW}x${outH}`,
      original_aspect: `${srcW}:${srcH}`,
      result_aspect: aspect_ratio,
      faces_detected: 0,
    }));

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    console.error('[crop-vertical] err:', err.message?.slice(0, 200));
    res.status(500).json({ error: '크롭 실패' });
  }
});

module.exports = router;
