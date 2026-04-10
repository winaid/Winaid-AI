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
  const workDir = path.join(os.tmpdir(), `thumb-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { frame_time = '1', text = '', text_color = 'white', text_position = 'center' } = req.body || {};

    const inputPath = path.join(workDir, `input${path.extname(req.file.originalname) || '.mp4'}`);
    const framePath = path.join(workDir, 'frame.jpg');
    const outputPath = path.join(workDir, 'thumbnail.jpg');
    fs.renameSync(req.file.path, inputPath);

    execSync(`ffmpeg -y -i "${inputPath}" -ss ${parseFloat(frame_time) || 1} -frames:v 1 -q:v 2 "${framePath}"`, { timeout: 15000, stdio: 'pipe' });
    if (!fs.existsSync(framePath)) execSync(`ffmpeg -y -i "${inputPath}" -ss 0 -frames:v 1 -q:v 2 "${framePath}"`, { timeout: 15000, stdio: 'pipe' });

    if (text.trim()) {
      const fontPaths = ['/usr/share/fonts/truetype/noto/NotoSansKR-Black.ttf', '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc'];
      let fontOpt = '';
      for (const fp of fontPaths) { if (fs.existsSync(fp)) { fontOpt = `:fontfile=${fp}`; break; } }

      const colors = { white: 'fontcolor=white:borderw=5:bordercolor=black', yellow: 'fontcolor=yellow:borderw=5:bordercolor=black', red: 'fontcolor=red:borderw=5:bordercolor=white' };
      const positions = { top: 'y=h*0.12', center: 'y=(h-text_h)/2', bottom: 'y=h*0.78' };

      // drawtext textfile 방식 — 사용자 텍스트가 필터 문법에서 완전 분리 (인젝션 방어).
      // 200자 캡 + 제어문자 strip.
      // eslint-disable-next-line no-control-regex
      const cleaned = String(text)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
        .slice(0, 200)
        .trim();
      const textFile = path.join(workDir, 'thumb-text.txt');
      fs.writeFileSync(textFile, cleaned, { encoding: 'utf8' });

      const vf = `drawtext=textfile='${textFile}':fontsize=60${fontOpt}:${colors[text_color] || colors.white}:x=(w-text_w)/2:${positions[text_position] || positions.center}`;
      execSync(`ffmpeg -y -i "${framePath}" -vf "${vf}" -q:v 2 "${outputPath}"`, { timeout: 15000, stdio: 'pipe' });
    } else {
      fs.copyFileSync(framePath, outputPath);
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Thumbnail-Metadata', JSON.stringify({ text_used: text || '(없음)', frame_time: parseFloat(frame_time) }));
    fs.createReadStream(outputPath).pipe(res).on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: '썸네일 생성 실패' });
  }
});

module.exports = router;
