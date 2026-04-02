const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const COOKIES_PATH = path.join(__dirname, '..', '..', 'cookies.txt');
const HAS_COOKIES = fs.existsSync(COOKIES_PATH);

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

  // 공통 yt-dlp 옵션
  const baseArgs = [
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=web',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '-f', 'best[height<=720]/best',
    '--no-playlist',
    '--no-warnings',
    ...(HAS_COOKIES ? ['--cookies', COOKIES_PATH] : []),
  ];

  try {
    // ── 방법 1: 구간 다운로드 ──
    let downloadSuccess = false;

    try {
      await new Promise((resolve, reject) => {
        const args = [
          ...baseArgs,
          '--download-sections', `*${start}-${start + duration}`,
          '--force-keyframes-at-cuts',
          '-o', videoPath,
          videoUrl,
        ];
        console.log('[yt-dlp] 구간 다운로드 시도');
        execFile('yt-dlp', args, { timeout: 60000 }, (err, stdout, stderr) => {
          if (err) {
            console.error('[yt-dlp sections]', (stderr || err.message).slice(0, 200));
            reject(new Error(stderr || err.message));
          } else {
            resolve(stdout);
          }
        });
      });
      downloadSuccess = fs.existsSync(videoPath);
    } catch (e) {
      console.warn('[yt-dlp] 구간 다운로드 실패, 전체 다운로드 시도');
    }

    // ── 방법 2: 전체 다운로드 → ffmpeg 구간 추출 ──
    if (!downloadSuccess) {
      const fullVideoPath = path.join(tmpDir, `${id}_full.mp4`);

      await new Promise((resolve, reject) => {
        const args = [...baseArgs, '-o', fullVideoPath, videoUrl];
        console.log('[yt-dlp] 전체 다운로드 시도');
        execFile('yt-dlp', args, { timeout: 90000 }, (err, stdout, stderr) => {
          if (err) {
            const detail = (stderr || err.message || '').substring(0, 300);
            reject(new Error(`영상 다운로드 실패: ${detail}`));
          } else {
            resolve(stdout);
          }
        });
      });

      if (!fs.existsSync(fullVideoPath)) {
        return res.status(500).json({ success: false, error: '영상 파일이 생성되지 않았습니다.' });
      }

      // ffmpeg 구간 추출
      await new Promise((resolve, reject) => {
        const args = ['-ss', String(start), '-i', fullVideoPath, '-t', String(duration), '-c', 'copy', '-y', videoPath];
        execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
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
        '-loop', '0',
        '-y',
        gifPath,
      ];
      execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`GIF 변환 실패: ${(stderr || err.message || '').substring(0, 200)}`));
        } else {
          resolve(stdout);
        }
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
