const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

function escapeFF(text) { return text.replace(/\\/g, '\\\\').replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/%/g, '%%'); }

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `intro-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { hospital_name = '', hospital_phone = '', hospital_desc = '', intro_style = 'none', outro_style = 'none' } = req.body || {};

    if (intro_style === 'none' && outro_style === 'none') {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Intro-Metadata', JSON.stringify({ intro_added: false, outro_added: false }));
      fs.createReadStream(req.file.path).pipe(res);
      return;
    }

    const ext = path.extname(req.file.originalname) || '.mp4';
    const mainPath = path.join(workDir, `main${ext}`);
    fs.renameSync(req.file.path, mainPath);

    let vw = 1080, vh = 1920;
    try {
      const probe = JSON.parse(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${mainPath}"`, { timeout: 10000 }).toString());
      vw = probe.streams?.[0]?.width || 1080; vh = probe.streams?.[0]?.height || 1920;
    } catch { /* */ }

    const fontPaths = ['/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf', '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'];
    let fontOpt = '';
    for (const fp of fontPaths) { if (fs.existsSync(fp)) { fontOpt = `:fontfile=${fp}`; break; } }

    const parts = [];

    // 인트로
    if (intro_style !== 'none' && hospital_name.trim()) {
      const introPath = path.join(workDir, 'intro.mp4');
      const dur = intro_style === 'simple' ? 1.5 : 3;
      const sz = Math.min(60, Math.round(vw / 18));
      let vf = `drawtext=text='${escapeFF(hospital_name)}':fontsize=${sz}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2`;
      if (intro_style === 'default' && hospital_desc) {
        vf += `,drawtext=text='${escapeFF(hospital_desc)}':fontsize=${Math.round(sz * 0.5)}${fontOpt}:fontcolor=0x888888:x=(w-text_w)/2:y=(h+text_h)/2+${Math.round(sz * 0.8)}`;
      }
      execSync(`ffmpeg -y -f lavfi -i color=c=white:s=${vw}x${vh}:d=${dur} -f lavfi -i anullsrc=r=44100:cl=stereo -vf "${vf}" -t ${dur} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${introPath}"`, { timeout: 30000, stdio: 'pipe' });
      parts.push(introPath);
    }

    parts.push(mainPath);

    // 아웃로
    if (outro_style !== 'none' && hospital_name.trim()) {
      const outroPath = path.join(workDir, 'outro.mp4');
      const dur = outro_style === 'simple' ? 2 : 3;
      const sz = Math.min(48, Math.round(vw / 22));
      const thanks = outro_style === 'cta' ? '지금 전화주세요!' : '감사합니다';
      let vf = `drawtext=text='${escapeFF(thanks)}':fontsize=${sz}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(sz * 1.8)}`;
      if (hospital_phone) vf += `,drawtext=text='${escapeFF(hospital_phone)}':fontsize=${Math.round(sz * 0.55)}${fontOpt}:fontcolor=0x555555:x=(w-text_w)/2:y=(h-text_h)/2`;
      execSync(`ffmpeg -y -f lavfi -i color=c=white:s=${vw}x${vh}:d=${dur} -f lavfi -i anullsrc=r=44100:cl=stereo -vf "${vf}" -t ${dur} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${outroPath}"`, { timeout: 30000, stdio: 'pipe' });
      parts.push(outroPath);
    }

    const outputPath = path.join(workDir, 'final.mp4');
    const concatList = path.join(workDir, 'concat.txt');
    fs.writeFileSync(concatList, parts.map(p => `file '${p}'`).join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}"`, { timeout: 120000, stdio: 'pipe' });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Intro-Metadata', JSON.stringify({ intro_added: intro_style !== 'none', outro_added: outro_style !== 'none' }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: '인트로/아웃로 실패' });
  }
});

module.exports = router;
