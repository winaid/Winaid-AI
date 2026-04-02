const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const PROXY_URL = process.env.PROXY_URL || '';

function findCookiePath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'youtube-cookies.txt'),
    path.join(__dirname, '..', '..', 'cookies.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[cookies] Using: ${path.basename(p)}`);
      return p;
    }
  }
  return null;
}

function ytdlpDownload(videoUrl, outputPath, start, end) {
  return new Promise((resolve, reject) => {
    const cookiePath = findCookiePath();
    const sectionStart = Math.max(0, start - 5);
    const sectionEnd = end + 5;

    const commonArgs = [
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=web',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(cookiePath ? ['--cookies', cookiePath] : []),
      ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
    ];

    const attempts = [
      {
        label: '480p 구간 다운로드',
        args: [
          '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4',
          '--download-sections', `*${sectionStart}-${sectionEnd}`,
          '--force-keyframes-at-cuts',
          ...commonArgs, videoUrl,
        ],
        timeout: 60000,
      },
      {
        label: '아무 포맷 구간 다운로드',
        args: [
          '--merge-output-format', 'mp4',
          '--download-sections', `*${sectionStart}-${sectionEnd}`,
          '--force-keyframes-at-cuts',
          ...commonArgs, videoUrl,
        ],
        timeout: 60000,
      },
      {
        label: '전체 다운로드 (최저화질)',
        args: [
          '-f', 'worstvideo+worstaudio/worst',
          '--merge-output-format', 'mp4',
          ...commonArgs, videoUrl,
        ],
        timeout: 120000,
      },
    ];

    const tryAttempt = (idx) => {
      if (idx >= attempts.length) {
        reject(new Error('모든 다운로드 방식 실패. 영상 URL을 확인하세요.'));
        return;
      }
      const { label, args: attemptArgs, timeout } = attempts[idx];
      console.log(`[yt-dlp] 시도 ${idx + 1}/${attempts.length}: ${label}...`);

      // 이전 시도 파일 정리
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}

      execFile('yt-dlp', attemptArgs, { timeout }, (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || '').substring(0, 300);
          console.error(`[yt-dlp] ${label} 실패:`, detail);
          tryAttempt(idx + 1);
        } else {
          console.log(`[yt-dlp] ${label} 성공`);
          resolve(stdout);
        }
      });
    };

    tryAttempt(0);
  });
}

function ffmpegExtractGif(inputPath, outputPath, start, duration, width) {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', String(start),
      '-i', inputPath,
      '-t', String(duration),
      '-vf', `fps=10,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`,
      '-loop', '0',
      '-y',
      outputPath,
    ];
    console.log(`[ffmpeg] Extracting GIF (start=${start}s, duration=${duration}s, width=${width})...`);
    execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').substring(0, 300);
        console.error('[ffmpeg] Error:', detail);
        reject(new Error(`GIF 변환 실패: ${detail}`));
      } else {
        console.log('[ffmpeg] GIF complete');
        resolve(stdout);
      }
    });
  });
}

function findOutputFile(basePath) {
  if (fs.existsSync(basePath)) return basePath;
  const dir = path.dirname(basePath);
  const base = path.basename(basePath, path.extname(basePath));
  try {
    const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
    if (files.length > 0) {
      const found = path.join(dir, files[0]);
      console.log(`[findFile] Expected ${path.basename(basePath)}, found ${files[0]}`);
      return found;
    }
  } catch {}
  return null;
}

router.post('/gif', async (req, res) => {
  const { videoUrl, start, end, width = 480 } = req.body;

  if (!videoUrl || start === undefined || end === undefined) {
    return res.status(400).json({ success: false, error: 'videoUrl, start, end가 필요합니다.' });
  }

  const duration = Math.min(end - start, 10);
  if (duration <= 0) {
    return res.status(400).json({ success: false, error: 'end는 start보다 커야 합니다.' });
  }

  const tmpDir = os.tmpdir();
  const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const videoPath = path.join(tmpDir, `${id}.mp4`);
  const gifPath = path.join(tmpDir, `${id}.gif`);
  let actualVideoPath = null;

  try {
    await ytdlpDownload(videoUrl, videoPath, start, end);

    actualVideoPath = findOutputFile(videoPath);
    if (!actualVideoPath) {
      return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다. yt-dlp 출력을 확인하세요.' });
    }

    const fileSize = fs.statSync(actualVideoPath).size;
    console.log(`[gif] Video file: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

    const ffmpegStart = fileSize < 20 * 1024 * 1024 ? Math.min(start, 5) : start;
    await ffmpegExtractGif(actualVideoPath, gifPath, ffmpegStart, duration, width);

    if (!fs.existsSync(gifPath)) {
      return res.status(500).json({ success: false, error: 'GIF 파일이 생성되지 않았습니다.' });
    }

    const gifBuffer = fs.readFileSync(gifPath);

    if (gifBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'GIF 파일이 너무 큽니다 (10MB 초과). 더 짧은 구간을 시도하세요.' });
    }

    console.log(`[gif] Success: ${(gifBuffer.length / 1024).toFixed(0)}KB GIF`);
    res.json({
      success: true,
      gifDataUrl: `data:image/gif;base64,${gifBuffer.toString('base64')}`,
      fileSize: gifBuffer.length,
      duration,
    });
  } catch (err) {
    console.error('[youtube-gif] Error:', err.message);
    res.status(500).json({ success: false, error: err.message || '서버 오류' });
  } finally {
    const cleanups = [videoPath, gifPath, actualVideoPath].filter(Boolean);
    for (const f of cleanups) {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
});

module.exports = router;
