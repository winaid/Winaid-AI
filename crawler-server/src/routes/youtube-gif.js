const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { glob } = require('fs').promises ? fs : { glob: null };

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

    const baseArgs = (playerClient, useCookies = false) => [
      '--no-check-certificates',
      ...(playerClient ? ['--extractor-args', `youtube:player_client=${playerClient}`] : []),
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(useCookies && cookiePath ? ['--cookies', cookiePath] : []),
      ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
    ];

    const noCookie = !!PROXY_URL;
    const attempts = [
      {
        label: 'android + 구간 (쿠키 없이)',
        args: [
          '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
          '--merge-output-format', 'mp4',
          '--download-sections', `*${sectionStart}-${sectionEnd}`,
          '--force-keyframes-at-cuts',
          ...baseArgs('android', !noCookie), videoUrl,
        ],
        timeout: 60000,
      },
      {
        label: 'android + 전체 (쿠키 없이)',
        args: [
          '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
          '--merge-output-format', 'mp4',
          ...baseArgs('android', !noCookie), videoUrl,
        ],
        timeout: 120000,
      },
      {
        label: '기본 클라이언트 + 전체',
        args: [
          '--merge-output-format', 'mp4',
          ...baseArgs(null, !noCookie), videoUrl,
        ],
        timeout: 120000,
      },
      {
        label: 'android + 쿠키 포함',
        args: [
          '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
          '--merge-output-format', 'mp4',
          ...baseArgs('android', true), videoUrl,
        ],
        timeout: 120000,
      },
      {
        label: '최후 수단 (제한 없음)',
        args: [
          ...baseArgs(null, true), videoUrl,
        ],
        timeout: 120000,
      },
    ];

    const tryAttempt = (idx) => {
      if (idx >= attempts.length) {
        reject(new Error('모든 다운로드 방식 실패. YouTube가 서버 IP를 차단했을 수 있습니다. Railway 로그에서 상세 에러를 확인하세요.'));
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
