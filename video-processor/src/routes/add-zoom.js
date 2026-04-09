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
  const workDir = path.join(os.tmpdir(), `zoom-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { intensity = 'auto', zoom_level = '1.15' } = req.body || {};
    const zl = Math.max(1.0, Math.min(1.3, parseFloat(zoom_level)));

    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output.mp4`);
    fs.renameSync(req.file.path, inputPath);

    let fps = 30;
    try {
      const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${inputPath}"`, { timeout: 10000 }).toString().trim();
      const [num, den] = probe.split('/');
      if (num && den) fps = Math.round(parseInt(num) / parseInt(den));
    } catch { /* */ }

    const cycleSec = intensity === 'strong' ? 4 : intensity === 'subtle' ? 8 : 6;
    const cycleFrames = cycleSec * fps;
    const zoomExpr = `1+(${(zl - 1).toFixed(3)})*abs(sin(on/${cycleFrames}*PI))`;

    try {
      execSync(
        `ffmpeg -y -i "${inputPath}" -vf "scale=2*iw:2*ih,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=iw/2xiw/2:fps=${fps}" -c:a copy -shortest "${outputPath}"`,
        { timeout: 300000, stdio: 'pipe' }
      );
    } catch {
      fs.copyFileSync(inputPath, outputPath);
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Zoom-Metadata', JSON.stringify({ zoom_applied: true }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: '줌 효과 실패' });
  }
});

module.exports = router;
