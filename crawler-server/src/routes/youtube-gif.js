const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const COOKIE_PATH = path.join(__dirname, '..', '..', 'youtube-cookies.txt');
const PROXY_URL = process.env.PROXY_URL || '';

function ytdlpDownload(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const hasCookies = fs.existsSync(COOKIE_PATH);
    const args = [
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=web',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(hasCookies ? ['--cookies', COOKIE_PATH] : []),
      ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
      videoUrl,
    ];
    console.log('[yt-dlp] Starting download...');
    execFile('yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').substring(0, 500);
        console.error('[yt-dlp] Error:', detail);
        reject(new Error(`영상 다운로드 실패: ${detail}`));
      } else {
        console.log('[yt-dlp] Download complete');
        resolve(stdout);
      }
    });
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
    console.log('[ffmpeg] Extracting GIF...');
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

  try {
    // 1) yt-dlp로 전체 영상 다운로드 (포맷 제한 없이)
    await ytdlpDownload(videoUrl, videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다.' });
    }

    // 2) ffmpeg로 구간 추출 + GIF 변환 (한 번에)
    await ffmpegExtractGif(videoPath, gifPath, start, duration, width);

    if (!fs.existsSync(gifPath)) {
      return res.status(500).json({ success: false, error: 'GIF 파일이 생성되지 않았습니다.' });
    }

    // 3) base64로 반환
    const gifBuffer = fs.readFileSync(gifPath);

    if (gifBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'GIF 파일이 너무 큽니다 (10MB 초과).' });
    }

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
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
    try { if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath); } catch {}
  }
});

module.exports = router;
