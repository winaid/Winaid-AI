const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { runFfmpeg } = require('../utils/safeFfmpeg');
const { safeExt, VIDEO_EXTS } = require('../utils/safeExt');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

// bgm_id 정규식: 알파벳/숫자/언더스코어 1~64자만. path traversal / 셸 보간 차단.
const BGM_ID_RE = /^[a-z0-9_]{1,64}$/;

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `bgm-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { bgm_id = 'calm_01', volume = '15' } = req.body || {};

    if (typeof bgm_id !== 'string' || !BGM_ID_RE.test(bgm_id)) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ error: 'invalid_bgm_id' });
    }

    const vol = Math.max(0, Math.min(50, parseInt(volume))) / 100;

    const ext = safeExt(req.file.originalname, VIDEO_EXTS);
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output.mp4`);
    fs.renameSync(req.file.path, inputPath);

    // BGM 파일 — bgm_id 가 위 정규식 통과했으므로 mood 도 안전 (suffix 만 제거)
    const mood = bgm_id.replace(/_\d+$/, '');
    if (!BGM_ID_RE.test(mood)) {
      // suffix 제거 후 결과가 정규식 미통과 (이론상 불가, 방어)
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ error: 'invalid_bgm_id_mood' });
    }
    const bgmPath = path.join(__dirname, '..', '..', 'sfx', 'bgm', mood, `${bgm_id}.mp3`);

    if (!fs.existsSync(bgmPath)) {
      // BGM 파일 없으면 원본 반환
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Bgm-Metadata', JSON.stringify({ bgm_applied: false, reason: 'BGM 파일 없음' }));
      fs.createReadStream(inputPath).pipe(res).on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
      return;
    }

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-i', bgmPath,
      '-filter_complex',
        `[1]volume=${vol.toFixed(2)},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]`,
      '-map', '0:v',
      '-map', '[out]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ]);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Bgm-Metadata', JSON.stringify({ bgm_applied: true, bgm_id, volume: parseInt(volume) }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    console.error('[add-bgm] err:', err.message?.slice(0, 200));
    res.status(500).json({ error: 'BGM 합성 실패' });
  }
});

module.exports = router;
