const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

const INTENSITY = {
  soft:   { threshold: '0.04', margin: '0.3s', db: '-35' },
  normal: { threshold: '0.03', margin: '0.15s', db: '-30' },
  tight:  { threshold: '0.02', margin: '0.05s', db: '-25' },
};

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `silence-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const intensity = req.body.intensity || 'normal';
    const params = INTENSITY[intensity];
    if (!params) return res.status(400).json({ error: '잘못된 편집 강도입니다.' });

    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output${ext}`);
    fs.renameSync(req.file.path, inputPath);

    // 원본 길이
    let originalDuration = 0;
    try {
      originalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`, { timeout: 15000 }).toString().trim()) || 0;
    } catch { /* */ }

    if (originalDuration > 600) {
      cleanup(workDir);
      return res.status(400).json({ error: '10분 이하 파일만 가능합니다.' });
    }

    // 1순위: auto-editor
    let useAutoEditor = false;
    try { execSync('auto-editor --version', { stdio: 'pipe', timeout: 3000 }); useAutoEditor = true; } catch { /* */ }

    if (useAutoEditor) {
      try {
        execSync(
          `auto-editor "${inputPath}" --no-open --margin ${params.margin} --edit "audio:threshold=${params.threshold}" -o "${outputPath}"`,
          { timeout: 180000, stdio: 'pipe', cwd: workDir }
        );
        console.log(`✅ auto-editor 무음 제거 완료 (${intensity})`);
      } catch (err) {
        console.error('auto-editor 실패:', err.message?.slice(0, 200));
      }
    }

    // 2순위: FFmpeg silencedetect fallback
    if (!fs.existsSync(outputPath)) {
      try {
        const detectResult = execSync(
          `ffmpeg -i "${inputPath}" -af "silencedetect=noise=${params.db}dB:d=0.5" -f null - 2>&1`,
          { timeout: 60000 }
        ).toString();

        const silenceRegex = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
        const silences = [];
        let m;
        while ((m = silenceRegex.exec(detectResult))) {
          silences.push({ start: parseFloat(m[1]), end: parseFloat(m[2]) });
        }

        if (silences.length > 0) {
          const segments = [];
          let cursor = 0;
          for (const s of silences) {
            if (s.start > cursor + 0.1) segments.push({ start: cursor, end: s.start });
            cursor = s.end;
          }
          if (cursor < originalDuration - 0.1) segments.push({ start: cursor, end: originalDuration });

          if (segments.length > 0) {
            const filterParts = segments.map((seg, i) =>
              `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
            ).join(';');
            const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
            const filter = `${filterParts};${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

            execSync(
              `ffmpeg -y -i "${inputPath}" -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -c:a aac "${outputPath}"`,
              { timeout: 180000, stdio: 'pipe' }
            );
            console.log(`✅ FFmpeg fallback 무음 제거 완료 (${silences.length}개 무음 구간)`);
          }
        }
      } catch (err) {
        console.error('FFmpeg fallback 실패:', err.message?.slice(0, 200));
      }
    }

    // 결과 없으면 원본 복사
    if (!fs.existsSync(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
    }

    // 결과 길이
    let resultDuration = originalDuration;
    try {
      resultDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`, { timeout: 15000 }).toString().trim()) || originalDuration;
    } catch { /* */ }

    const removedSeconds = Math.max(0, originalDuration - resultDuration);
    const removedPercent = originalDuration > 0 ? (removedSeconds / originalDuration) * 100 : 0;

    // 결과 파일 전송
    res.setHeader('Content-Type', req.file.mimetype || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="edited_${req.file.originalname}"`);
    res.setHeader('X-Silence-Metadata', JSON.stringify({
      original_duration: Math.round(originalDuration * 10) / 10,
      result_duration: Math.round(resultDuration * 10) / 10,
      removed_seconds: Math.round(removedSeconds * 10) / 10,
      removed_percent: Math.round(removedPercent * 10) / 10,
      method: useAutoEditor && fs.existsSync(outputPath) ? 'auto-editor' : 'ffmpeg',
    }));

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => cleanup(workDir));
    stream.on('error', () => cleanup(workDir));

  } catch (err) {
    console.error('[silence-remove] 에러:', err);
    cleanup(workDir);
    res.status(500).json({ error: '무음 제거 중 오류가 발생했습니다.' });
  }
});

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

module.exports = router;
