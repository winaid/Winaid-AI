const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

const PROXY_URL = process.env.PROXY_URL || '';

// ── 쿠키 탐색 ──
function findCookiePath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'youtube-cookies.txt'),
    path.join(__dirname, '..', '..', 'cookies.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── 영상 캐시: videoId → 파일 경로 (10분 TTL) ──
const videoCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_DIR = path.join(os.tmpdir(), 'yt-gif-cache');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

setInterval(() => {
  const now = Date.now();
  for (const [videoId, entry] of videoCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL && entry.refCount <= 0) {
      try { fs.unlinkSync(entry.path); } catch {}
      videoCache.delete(videoId);
      console.log(`[cache] 만료 삭제: ${videoId}`);
    }
  }
}, 60000);

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] || '';
}

async function getCachedVideo(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) throw new Error('유효하지 않은 YouTube URL');

  const cached = videoCache.get(videoId);
  if (cached && fs.existsSync(cached.path)) {
    cached.refCount++;
    console.log(`[cache] ✅ 히트: ${videoId} (${(fs.statSync(cached.path).size / 1024 / 1024).toFixed(1)}MB)`);
    return { path: cached.path, videoId, fromCache: true };
  }

  console.log(`[cache] ❌ 미스: ${videoId} — 다운로드 시작`);
  const outputPath = path.join(CACHE_DIR, `${videoId}.mp4`);

  await downloadVideo(videoUrl, outputPath);

  const actualPath = findOutputFile(outputPath);
  if (!actualPath) throw new Error('영상 다운로드 실패');

  videoCache.set(videoId, { path: actualPath, createdAt: Date.now(), refCount: 1 });
  console.log(`[cache] 💾 저장: ${videoId} (${(fs.statSync(actualPath).size / 1024 / 1024).toFixed(1)}MB)`);

  return { path: actualPath, videoId, fromCache: false };
}

function releaseCachedVideo(videoId) {
  const cached = videoCache.get(videoId);
  if (cached) cached.refCount = Math.max(0, cached.refCount - 1);
}

// ── 영상 다운로드 (240p 최적화) ──
function downloadVideo(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const cookiePath = findCookiePath();
    const noCookie = !!PROXY_URL;

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

    const attempts = [
      {
        label: 'android 240p (쿠키 없이)',
        args: ['-f', 'bestvideo[height<=240]+bestaudio/best[height<=240]/best', '--merge-output-format', 'mp4', ...baseArgs('android', !noCookie), videoUrl],
        timeout: 60000,
      },
      {
        label: 'android 전체 최저 (쿠키 없이)',
        args: ['-f', 'worstvideo+worstaudio/worst', '--merge-output-format', 'mp4', ...baseArgs('android', !noCookie), videoUrl],
        timeout: 120000,
      },
      {
        label: '기본 클라이언트 (쿠키 없이)',
        args: ['--merge-output-format', 'mp4', ...baseArgs(null, !noCookie), videoUrl],
        timeout: 120000,
      },
      {
        label: 'android + 쿠키',
        args: ['-f', 'worstvideo+worstaudio/worst', '--merge-output-format', 'mp4', ...baseArgs('android', true), videoUrl],
        timeout: 120000,
      },
    ];

    const tryAttempt = (idx) => {
      if (idx >= attempts.length) {
        reject(new Error('모든 다운로드 방식 실패. 잠시 후 다시 시도해주세요.'));
        return;
      }
      const { label, args: attemptArgs, timeout } = attempts[idx];
      console.log(`[download] 시도 ${idx + 1}/${attempts.length}: ${label}...`);

      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}

      execFile('yt-dlp', attemptArgs, { timeout }, (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || '').substring(0, 200);
          console.error(`[download] ${label} 실패:`, detail);
          tryAttempt(idx + 1);
        } else {
          console.log(`[download] ${label} 성공`);
          resolve(stdout);
        }
      });
    };

    tryAttempt(0);
  });
}

// ── ffmpeg GIF 변환 (fps 8, 64색) ──
function ffmpegExtractGif(inputPath, outputPath, start, duration, width) {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', String(start),
      '-i', inputPath,
      '-t', String(duration),
      '-vf', `fps=8,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer`,
      '-loop', '0',
      '-y',
      outputPath,
    ];
    console.log(`[ffmpeg] GIF 변환 (start=${start}s, duration=${duration}s, width=${width})...`);
    execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').substring(0, 300);
        console.error('[ffmpeg] Error:', detail);
        reject(new Error(`GIF 변환 실패: ${detail}`));
      } else {
        console.log('[ffmpeg] GIF 완료');
        resolve(stdout);
      }
    });
  });
}

// ── 출력 파일 탐색 (yt-dlp가 파일명을 바꿀 수 있음) ──
function findOutputFile(basePath) {
  if (fs.existsSync(basePath)) return basePath;
  const dir = path.dirname(basePath);
  const base = path.basename(basePath, path.extname(basePath));
  try {
    const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
    if (files.length > 0) {
      const found = path.join(dir, files[0]);
      console.log(`[findFile] ${path.basename(basePath)} → ${files[0]}`);
      return found;
    }
  } catch {}
  return null;
}

// ── GIF 생성 엔드포인트 ──
router.post('/gif', async (req, res) => {
  const { videoUrl, start, end, width = 480 } = req.body;

  if (!videoUrl || start === undefined || end === undefined) {
    return res.status(400).json({ success: false, error: 'videoUrl, start, end가 필요합니다.' });
  }

  const duration = Math.min(end - start, 10);
  if (duration <= 0) {
    return res.status(400).json({ success: false, error: 'end는 start보다 커야 합니다.' });
  }

  const videoId = extractVideoId(videoUrl);
  const gifPath = path.join(os.tmpdir(), `gif_${videoId}_${start}_${end}_${Date.now()}.gif`);

  try {
    const { path: videoPath, videoId: vid, fromCache } = await getCachedVideo(videoUrl);
    console.log(`[gif] 영상 준비 완료 (캐시: ${fromCache ? '히트' : '미스'})`);

    await ffmpegExtractGif(videoPath, gifPath, start, duration, Math.min(width, 360));

    if (!fs.existsSync(gifPath)) {
      releaseCachedVideo(vid);
      return res.status(500).json({ success: false, error: 'GIF 변환 실패' });
    }

    const gifBuffer = fs.readFileSync(gifPath);
    releaseCachedVideo(vid);

    if (gifBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'GIF가 10MB 초과. 더 짧은 구간을 시도하세요.' });
    }

    console.log(`[gif] ✅ 성공: ${(gifBuffer.length / 1024).toFixed(0)}KB (캐시: ${fromCache ? '히트' : '미스'})`);
    res.json({
      success: true,
      gifDataUrl: `data:image/gif;base64,${gifBuffer.toString('base64')}`,
      fileSize: gifBuffer.length,
      duration,
      fromCache,
    });
  } catch (err) {
    console.error('[gif] Error:', err.message);
    releaseCachedVideo(videoId);
    res.status(500).json({ success: false, error: err.message || '서버 오류' });
  } finally {
    try { if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath); } catch {}
  }
});

// 캐시 상태 (헬스체크용)
router.getCacheSize = () => videoCache.size;

module.exports = router;
