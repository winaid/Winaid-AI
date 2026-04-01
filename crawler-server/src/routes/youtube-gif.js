const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

// YouTube 봇 차단 우회를 위한 클라이언트 목록 (순차 시도)
const YT_CLIENTS = ['mweb', 'tv_embedded', 'tv', 'android', 'web'];

/**
 * yt-dlp로 영상 다운로드 시도 (여러 클라이언트 순차 시도)
 */
function tryDownload(videoUrl, start, duration, videoPath) {
  return new Promise(async (resolve, reject) => {
    let lastError = '';

    for (const client of YT_CLIENTS) {
      try {
        await new Promise((res, rej) => {
          // 이전 시도 파일 정리
          try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}

          const args = [
            '--no-check-certificates',
            '--extractor-args', `youtube:player_client=${client}`,
            '--geo-bypass',
            '--no-warnings',
            '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best',
            '--download-sections', `*${start}-${start + duration}`,
            '-o', videoPath,
            '--no-playlist',
            '--quiet',
            videoUrl,
          ];

          console.log(`[yt-dlp] Trying client: ${client}`);
          execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) {
              console.error(`[yt-dlp] ${client} failed:`, (stderr || err.message).slice(0, 200));
              rej(new Error(stderr || err.message));
            } else {
              res(stdout);
            }
          });
        });

        // 파일 존재 확인
        if (fs.existsSync(videoPath)) {
          console.log(`[yt-dlp] Success with client: ${client}`);
          resolve(client);
          return;
        }
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }

    // 모든 클라이언트 실패 시 쿠키 파일로 최종 시도
    const cookiePath = path.join(__dirname, '..', '..', 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
      try {
        await new Promise((res, rej) => {
          try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
          const args = [
            '--no-check-certificates',
            '--cookies', cookiePath,
            '--geo-bypass',
            '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best',
            '--download-sections', `*${start}-${start + duration}`,
            '-o', videoPath,
            '--no-playlist',
            '--quiet',
            videoUrl,
          ];
          console.log('[yt-dlp] Trying with cookies file');
          execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) rej(new Error(stderr || err.message));
            else res(stdout);
          });
        });
        if (fs.existsSync(videoPath)) {
          console.log('[yt-dlp] Success with cookies');
          resolve('cookies');
          return;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    reject(new Error(`모든 방법 실패. 마지막 에러: ${lastError.slice(0, 300)}`));
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

  const tmpDir = os.tmpdir();
  const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const videoPath = path.join(tmpDir, `${id}.mp4`);
  const gifPath = path.join(tmpDir, `${id}.gif`);

  try {
    // 1) yt-dlp로 구간 다운로드 (여러 클라이언트 순차 시도)
    const usedClient = await tryDownload(videoUrl, start, duration, videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다.' });
    }

    // 2) ffmpeg로 GIF 변환
    await new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-vf', `fps=10,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`,
        '-loop', '0',
        '-y',
        gifPath,
      ];
      execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[ffmpeg] Error:', stderr || err.message);
          reject(new Error('GIF 변환 실패'));
        } else {
          resolve(stdout);
        }
      });
    });

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
      client: usedClient,
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
