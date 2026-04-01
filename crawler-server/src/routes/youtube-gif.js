const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

/**
 * POST /api/youtube/gif
 * body: { videoUrl: string, start: number, end: number, width?: number }
 *
 * yt-dlp로 영상 구간 다운로드 → ffmpeg로 GIF 변환 → base64 반환
 */
router.post('/gif', async (req, res) => {
  const { videoUrl, start, end, width = 480 } = req.body;

  if (!videoUrl || start === undefined || end === undefined) {
    return res.status(400).json({ success: false, error: 'videoUrl, start, end가 필요합니다.' });
  }

  const duration = Math.min(end - start, 10); // 최대 10초
  if (duration <= 0) {
    return res.status(400).json({ success: false, error: 'end는 start보다 커야 합니다.' });
  }

  const tmpDir = os.tmpdir();
  const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const videoPath = path.join(tmpDir, `${id}.mp4`);
  const gifPath = path.join(tmpDir, `${id}.gif`);

  try {
    // 1) yt-dlp로 구간 다운로드
    await new Promise((resolve, reject) => {
      const args = [
        '--no-check-certificates',
        '--extractor-args', 'youtube:player_client=mweb',
        '--geo-bypass',
        '--no-warnings',
        '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best',
        '--download-sections', `*${start}-${start + duration}`,
        '-o', videoPath,
        '--no-playlist',
        '--quiet',
        videoUrl,
      ];
      execFile('yt-dlp', args, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[yt-dlp] Error:', stderr || err.message);
          reject(new Error(`영상 다운로드 실패: ${stderr || err.message}`));
        } else {
          resolve(stdout);
        }
      });
    });

    // 파일 존재 확인
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
    const base64 = gifBuffer.toString('base64');
    const dataUrl = `data:image/gif;base64,${base64}`;

    // 파일 크기 체크 (10MB 제한)
    if (gifBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'GIF 파일이 너무 큽니다 (10MB 초과).' });
    }

    res.json({
      success: true,
      gifDataUrl: dataUrl,
      fileSize: gifBuffer.length,
      duration,
    });
  } catch (err) {
    console.error('[youtube-gif] Error:', err.message);
    res.status(500).json({ success: false, error: err.message || '서버 오류' });
  } finally {
    // 정리
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
    try { if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath); } catch {}
  }
});

module.exports = router;
