const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const COOKIE_PATH = path.join(__dirname, '..', '..', 'youtube-cookies.txt');
const PROXY_URL = process.env.PROXY_URL || '';

function downloadWithYtdlp(videoUrl, start, duration, outputPath, useCookies, useSection) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=web',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(useCookies && fs.existsSync(COOKIE_PATH) ? ['--cookies', COOKIE_PATH] : []),
      ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      ...(useSection ? ['--download-sections', `*${start}-${start + duration}`, '--force-keyframes-at-cuts'] : []),
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
      videoUrl,
    ];
    const timeout = useSection ? 60000 : 90000;
    console.log(`[yt-dlp] ${useSection ? '구간' : '전체'} 다운로드 (cookies=${useCookies})`);
    execFile('yt-dlp', args, { timeout }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[yt-dlp] 실패:`, (stderr || err.message).slice(0, 200));
        reject(new Error((stderr || err.message || '').substring(0, 300)));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * POST /api/youtube/gif
 * body: { videoUrl: string, start: number, end: number, width?: number }
 */
router.post('/gif', async (req, res) => {
  const { videoUrl, start, end, width = 480 } = req.body;

  if (!videoUrl || start === undefined || end === undefined) {
    return res.status(400).json({ success: false, error: 'videoUrl, start, end가 필요합니다.' });
  }

  const duration = Math.min(end - start, 10);
  if (duration <= 0) {
    return res.status(400).json({ success: false, error: 'end는 start보다 커야 합니다.' });
  }

  const hasCookies = fs.existsSync(COOKIE_PATH);
  const tmpDir = os.tmpdir();
  const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const videoPath = path.join(tmpDir, `${id}.mp4`);
  const gifPath = path.join(tmpDir, `${id}.gif`);

  try {
    let downloadSuccess = false;

    // ── 1차: 쿠키 + 구간 다운로드 ──
    if (hasCookies) {
      try {
        await downloadWithYtdlp(videoUrl, start, duration, videoPath, true, true);
        downloadSuccess = fs.existsSync(videoPath);
      } catch { /* next */ }
    }

    // ── 2차: 쿠키 없이 구간 다운로드 ──
    if (!downloadSuccess) {
      try {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        await downloadWithYtdlp(videoUrl, start, duration, videoPath, false, true);
        downloadSuccess = fs.existsSync(videoPath);
      } catch { /* next */ }
    }

    // ── 3차: 쿠키 + 전체 다운로드 → ffmpeg 구간 추출 ──
    if (!downloadSuccess) {
      const fullVideoPath = path.join(tmpDir, `${id}_full.mp4`);

      try {
        await downloadWithYtdlp(videoUrl, start, duration, fullVideoPath, hasCookies, false);
      } catch (e) {
        // 쿠키로도 전체 다운로드 실패 시 쿠키 없이 재시도
        if (hasCookies) {
          try {
            if (fs.existsSync(fullVideoPath)) fs.unlinkSync(fullVideoPath);
            await downloadWithYtdlp(videoUrl, start, duration, fullVideoPath, false, false);
          } catch (e2) {
            return res.status(500).json({ success: false, error: `영상 다운로드 실패: ${e2.message}` });
          }
        } else {
          return res.status(500).json({ success: false, error: `영상 다운로드 실패: ${e.message}` });
        }
      }

      if (!fs.existsSync(fullVideoPath)) {
        return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다.' });
      }

      // ffmpeg 구간 추출
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-ss', String(start), '-i', fullVideoPath, '-t', String(duration), '-c', 'copy', '-y', videoPath],
          { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(`구간 추출 실패: ${(stderr || err.message || '').substring(0, 200)}`));
            else resolve(stdout);
          });
      });

      try { fs.unlinkSync(fullVideoPath); } catch {}
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다.' });
    }

    // ── GIF 변환 ──
    await new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-vf', `fps=10,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`,
        '-loop', '0', '-y', gifPath,
      ];
      execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`GIF 변환 실패: ${(stderr || err.message || '').substring(0, 200)}`));
        else resolve(stdout);
      });
    });

    if (!fs.existsSync(gifPath)) {
      return res.status(500).json({ success: false, error: 'GIF 파일이 생성되지 않았습니다.' });
    }

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
