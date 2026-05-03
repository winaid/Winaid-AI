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

/**
 * 텍스트를 drawtext textfile용으로 안전하게 정리 + 디스크에 저장 후 경로 반환.
 * - 200자 캡
 * - 제어문자(0x00-0x1F 중 줄바꿈/탭 제외)·zero-width·특수 이모지 sandwich 제거
 * - NUL 문자 제거
 * 반환: { path: 저장된 파일 절대경로 } 또는 null(빈 텍스트)
 * textfile 방식은 drawtext 파라미터 syntax와 완전 분리되므로 `:`, `'`, `\` 등을 escape할 필요 없음.
 */
function writeDrawtextFile(workDir, basename, rawText) {
  if (!rawText) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = String(rawText)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 제어문자 strip (줄바꿈/탭은 유지)
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')  // zero-width chars
    .slice(0, 200)
    .trim();
  if (!cleaned) return null;
  const filePath = path.join(workDir, basename);
  fs.writeFileSync(filePath, cleaned, { encoding: 'utf8' });
  return filePath;
}

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

    const ext = safeExt(req.file.originalname, VIDEO_EXTS);
    const mainPath = path.join(workDir, `main${ext}`);
    fs.renameSync(req.file.path, mainPath);

    let vw = 1080, vh = 1920;
    try {
      const { stdout } = await runFfprobe([
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        mainPath,
      ], { timeout: 10000 });
      const probe = JSON.parse(stdout.toString());
      vw = probe.streams?.[0]?.width || 1080;
      vh = probe.streams?.[0]?.height || 1920;
    } catch { /* */ }

    const fontPaths = ['/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf', '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'];
    let fontOpt = '';
    for (const fp of fontPaths) { if (fs.existsSync(fp)) { fontOpt = `:fontfile=${fp}`; break; } }

    const parts = [];

    // 인트로
    // drawtext는 text=... 파라미터 문법 대신 textfile=... 로 분리 → 사용자 문자열이
    // 필터 chain 문법에 영향을 줄 수 없음(인젝션 방어).
    if (intro_style !== 'none' && hospital_name.trim()) {
      const introPath = path.join(workDir, 'intro.mp4');
      const dur = intro_style === 'simple' ? 1.5 : 3;
      const sz = Math.min(60, Math.round(vw / 18));
      const nameFile = writeDrawtextFile(workDir, 'intro-name.txt', hospital_name);
      if (nameFile) {
        let vf = `drawtext=textfile='${nameFile}':fontsize=${sz}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2`;
        if (intro_style === 'default' && hospital_desc) {
          const descFile = writeDrawtextFile(workDir, 'intro-desc.txt', hospital_desc);
          if (descFile) {
            vf += `,drawtext=textfile='${descFile}':fontsize=${Math.round(sz * 0.5)}${fontOpt}:fontcolor=0x888888:x=(w-text_w)/2:y=(h+text_h)/2+${Math.round(sz * 0.8)}`;
          }
        }
        await runFfmpeg([
          '-y',
          '-f', 'lavfi', '-i', `color=c=white:s=${vw}x${vh}:d=${dur}`,
          '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
          '-vf', vf,
          '-t', String(dur),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-shortest',
          introPath,
        ], { timeout: 30000 });
        parts.push(introPath);
      }
    }

    parts.push(mainPath);

    // 아웃로
    if (outro_style !== 'none' && hospital_name.trim()) {
      const outroPath = path.join(workDir, 'outro.mp4');
      const dur = outro_style === 'simple' ? 2 : 3;
      const sz = Math.min(48, Math.round(vw / 22));
      const thanks = outro_style === 'cta' ? '지금 전화주세요!' : '감사합니다';
      const thanksFile = writeDrawtextFile(workDir, 'outro-thanks.txt', thanks);
      if (thanksFile) {
        let vf = `drawtext=textfile='${thanksFile}':fontsize=${sz}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(sz * 1.8)}`;
        if (hospital_phone) {
          const phoneFile = writeDrawtextFile(workDir, 'outro-phone.txt', hospital_phone);
          if (phoneFile) {
            vf += `,drawtext=textfile='${phoneFile}':fontsize=${Math.round(sz * 0.55)}${fontOpt}:fontcolor=0x555555:x=(w-text_w)/2:y=(h-text_h)/2`;
          }
        }
        await runFfmpeg([
          '-y',
          '-f', 'lavfi', '-i', `color=c=white:s=${vw}x${vh}:d=${dur}`,
          '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
          '-vf', vf,
          '-t', String(dur),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-shortest',
          outroPath,
        ], { timeout: 30000 });
        parts.push(outroPath);
      }
    }

    const outputPath = path.join(workDir, 'final.mp4');
    const concatList = path.join(workDir, 'concat.txt');
    // concat 리스트 라인은 ffmpeg 가 파싱 — single quote escape 는 ffmpeg concat demuxer 문법 준수.
    fs.writeFileSync(
      concatList,
      parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    );
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-protocol_whitelist', 'file,pipe',
      '-i', concatList,
      '-c', 'copy',
      outputPath,
    ], { timeout: 120000 });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Intro-Metadata', JSON.stringify({ intro_added: intro_style !== 'none', outro_added: outro_style !== 'none' }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    console.error('[add-intro-outro] err:', err.message?.slice(0, 200));
    res.status(500).json({ error: '인트로/아웃로 실패' });
  }
});

module.exports = router;
