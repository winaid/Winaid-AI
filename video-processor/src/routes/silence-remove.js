const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { runFfmpeg, runFfprobe, runTool } = require('../utils/safeFfmpeg');
const { safeExt, VIDEO_EXTS } = require('../utils/safeExt');

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

    const ext = safeExt(req.file.originalname, VIDEO_EXTS);
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output${ext}`);
    fs.renameSync(req.file.path, inputPath);

    // 원본 길이
    let originalDuration = 0;
    try {
      const { stdout } = await runFfprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        inputPath,
      ], { timeout: 15000 });
      originalDuration = parseFloat(stdout.toString().trim()) || 0;
    } catch { /* */ }

    if (originalDuration > 600) {
      cleanup(workDir);
      return res.status(400).json({ error: '10분 이하 파일만 가능합니다.' });
    }

    // 1순위: auto-editor
    let autoEditorAvailable = false;
    try {
      await runTool('auto-editor', ['--version'], { timeout: 5000 });
      autoEditorAvailable = true;
    } catch { /* */ }

    let autoEditorSucceeded = false;
    if (autoEditorAvailable) {
      try {
        await runTool('auto-editor', [
          inputPath,
          '--no-open',
          '--margin', params.margin,
          '--edit', `audio:threshold=${params.threshold}`,
          '-o', outputPath,
        ], { timeout: 180000, cwd: workDir });
        if (fs.existsSync(outputPath)) {
          autoEditorSucceeded = true;
          console.log(`✅ auto-editor 무음 제거 완료 (${intensity})`);
        }
      } catch (err) {
        console.error('auto-editor 실패:', err.message?.slice(0, 200));
      }
    }

    // 2순위: FFmpeg silencedetect fallback
    if (!fs.existsSync(outputPath)) {
      try {
        // silencedetect 결과는 ffmpeg 가 stderr 로 출력 — execFileAsync 에서 stderr 로 받음
        let detectResult = '';
        try {
          const { stderr } = await runFfmpeg([
            '-i', inputPath,
            '-af', `silencedetect=noise=${params.db}dB:d=0.5`,
            '-f', 'null', '-',
          ], { timeout: 60000 });
          detectResult = (stderr || '').toString();
        } catch (e) {
          // ffmpeg 가 -f null 출력에 대해 비-0 종료 코드를 낼 수 있으나 stderr 는 살아있음
          detectResult = (e && e.stderr ? e.stderr.toString() : '');
        }

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

            await runFfmpeg([
              '-y',
              '-i', inputPath,
              '-filter_complex', filter,
              '-map', '[outv]',
              '-map', '[outa]',
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-c:a', 'aac',
              outputPath,
            ], { timeout: 180000 });
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
      const { stdout } = await runFfprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        outputPath,
      ], { timeout: 15000 });
      resultDuration = parseFloat(stdout.toString().trim()) || originalDuration;
    } catch { /* */ }

    const removedSeconds = Math.max(0, originalDuration - resultDuration);
    const removedPercent = originalDuration > 0 ? (removedSeconds / originalDuration) * 100 : 0;

    // 결과 파일 전송
    res.setHeader('Content-Type', req.file.mimetype || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="edited_output${ext}"`);
    res.setHeader('X-Silence-Metadata', JSON.stringify({
      original_duration: Math.round(originalDuration * 10) / 10,
      result_duration: Math.round(resultDuration * 10) / 10,
      removed_seconds: Math.round(removedSeconds * 10) / 10,
      removed_percent: Math.round(removedPercent * 10) / 10,
      method: autoEditorSucceeded ? 'auto-editor' : 'ffmpeg',
    }));

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => cleanup(workDir));
    stream.on('error', () => cleanup(workDir));

  } catch (err) {
    console.error('[silence-remove] 에러:', err.message?.slice(0, 200));
    cleanup(workDir);
    res.status(500).json({ error: '무음 제거 중 오류가 발생했습니다.' });
  }
});

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

module.exports = router;
