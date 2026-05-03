/**
 * POST /api/video/card-to-shorts
 *
 * 카드뉴스 슬라이드 이미지들 → 9:16 세로 쇼츠 영상 변환.
 *
 * 입력 (multipart/form-data):
 *   - images:           슬라이드 이미지 파일들 (1~20개, png/jpg)
 *   - slide_duration:   슬라이드당 초 (기본 4)
 *   - slide_durations:  JSON 배열 [4, 5, 3, ...] — 자동 모드용 (선택)
 *   - transition:       'fade' | 'slide' | 'zoom' | 'none' (기본 fade)
 *   - transition_duration: 초 (기본 0.5)
 *   - bgm_enabled:      'true' | 'false'
 *   - bgm_mood:         'calm' | 'bright' | 'emotional' | 'trendy' | 'corporate'
 *   - bgm_volume:       0~50 (기본 15)
 *   - aspect_ratio:     '9:16' | '1:1' (기본 9:16)
 *   - narration_audio:  단일 mp3 (선택, 미구현 — 자리만)
 *
 * 응답:
 *   - body: 합성된 mp4 (스트림)
 *   - X-Shorts-Metadata: { slides, duration, transition, bgm } JSON
 *
 * 동작:
 *   1) 각 이미지 → Ken Burns 줌 (줌인/줌아웃 교대) 영상 세그먼트
 *   2) xfade 체이닝으로 전환 합성 (실패 시 단순 concat fallback)
 *   3) 무음 오디오 트랙 추가 (BGM/나레이션 합성을 위한 토대)
 *   4) (옵션) 나레이션 합성
 *   5) (옵션) BGM amix 합성
 *   6) 스트림 응답 + 메타데이터
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { runFfmpeg, runFfprobe } = require('../utils/safeFfmpeg');

const router = express.Router();

// 슬라이드 이미지 20장 + 나레이션 1개 = 최대 ~100MB
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// xfade 전환 이름 매핑 — 입력은 lookup 키로만 사용 → 화이트리스트 enforce
const XFADE_MAP = {
  fade: 'fade',
  slide: 'slideright',
  zoom: 'smoothup',
};

// BGM mood 화이트리스트 — path traversal 차단 (sfx/bgm/<mood>/ 디렉토리 lookup)
const BGM_MOOD_RE = /^[a-z0-9_]{1,32}$/;

router.post(
  '/',
  upload.fields([
    { name: 'images', maxCount: 20 },
    { name: 'narration_audio', maxCount: 1 },
  ]),
  async (req, res) => {
    const workDir = path.join(os.tmpdir(), `card-shorts-${uuidv4()}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      const images = (req.files && req.files['images']) || [];
      const narrationFile = (req.files && req.files['narration_audio'] && req.files['narration_audio'][0]) || null;

      if (images.length === 0) {
        return res.status(400).json({ error: '슬라이드 이미지가 필요합니다.' });
      }

      const slideDuration = Math.max(1, Math.min(15, parseFloat(req.body.slide_duration) || 4));
      const transition = req.body.transition || 'fade';
      const transitionDur = Math.max(0, Math.min(2, parseFloat(req.body.transition_duration) || 0.5));
      const bgmEnabled = req.body.bgm_enabled === 'true';
      const bgmMoodRaw = req.body.bgm_mood || 'calm';
      const bgmMood = BGM_MOOD_RE.test(bgmMoodRaw) ? bgmMoodRaw : 'calm';
      const bgmVolume = Math.max(0, Math.min(50, parseFloat(req.body.bgm_volume) || 15));
      const aspect = req.body.aspect_ratio || '9:16';

      const size = aspect === '9:16' ? '1080:1920' : '1080:1080';

      // 슬라이드별 duration: 명시된 배열 > 고정값
      let durations = null;
      try { durations = JSON.parse(req.body.slide_durations || 'null'); } catch {}
      if (!Array.isArray(durations) || durations.length !== images.length) {
        durations = images.map(() => slideDuration);
      }
      durations = durations.map(d => Math.max(1, Math.min(15, parseFloat(d) || slideDuration)));

      // ── 1) 각 이미지 → Ken Burns 영상 세그먼트 ──
      const segments = [];
      const fps = 30;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dur = durations[i];
        const segPath = path.join(workDir, `seg_${String(i).padStart(3, '0')}.mp4`);
        const frames = Math.round(dur * fps);

        // Ken Burns: 짝수 인덱스는 줌인, 홀수는 줌아웃 (피로도 분산)
        const zoomExpr = i % 2 === 0
          ? `1+0.0008*on`        // 줌인 (1.0 → 1.024 over 30fps*1s)
          : `1.05-0.0003*on`;    // 줌아웃 (1.05 → ~1.04)

        // scale → pad → zoompan
        // pad으로 9:16 캔버스에 중앙 정렬, zoompan으로 미세 줌
        await runFfmpeg([
          '-y',
          '-loop', '1',
          '-i', img.path,
          '-t', String(dur),
          '-vf',
            `scale=${size}:force_original_aspect_ratio=decrease,` +
            `pad=${size}:(ow-iw)/2:(oh-ih)/2:black,` +
            `zoompan=z='${zoomExpr}':d=${frames}:` +
            `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'fast',
          '-r', String(fps),
          segPath,
        ], { timeout: 60000 });
        segments.push({ path: segPath, duration: dur });
      }

      // ── 2) 전환 효과로 합치기 ──
      let videoPath;
      if (transition === 'none' || segments.length <= 1) {
        // 단순 concat (필터 없음)
        const listPath = path.join(workDir, 'concat.txt');
        fs.writeFileSync(
          listPath,
          segments.map(s => `file '${s.path.replace(/'/g, "'\\''")}'`).join('\n'),
        );
        videoPath = path.join(workDir, 'merged.mp4');
        await runFfmpeg([
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-protocol_whitelist', 'file,pipe',
          '-i', listPath,
          '-c', 'copy',
          videoPath,
        ], { timeout: 60000 });
      } else {
        // xfade 체이닝 — XFADE_MAP 으로 화이트리스트 enforce
        const xfadeType = XFADE_MAP[transition] || 'fade';
        videoPath = segments[0].path;
        let cumDur = segments[0].duration;

        for (let i = 1; i < segments.length; i++) {
          const next = segments[i];
          const outputPath = path.join(workDir, `xfade_${i}.mp4`);
          // offset = 누적 길이 - transitionDur*i. xfade는 offset부터 transition 시작
          const offset = Math.max(0, cumDur - transitionDur);

          try {
            await runFfmpeg([
              '-y',
              '-i', videoPath,
              '-i', next.path,
              '-filter_complex', `xfade=transition=${xfadeType}:duration=${transitionDur}:offset=${offset.toFixed(2)}`,
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'fast',
              '-r', String(fps),
              outputPath,
            ], { timeout: 90000 });
            videoPath = outputPath;
            cumDur = cumDur + next.duration - transitionDur;
          } catch (xerr) {
            // xfade 실패 → 단순 concat fallback (남은 세그먼트도 모두 단순 합치기)
            console.warn('[card-to-shorts] xfade 실패, concat fallback:', xerr.message?.slice(0, 200));
            const listPath = path.join(workDir, `concat_fb_${i}.txt`);
            const remaining = [{ path: videoPath, duration: cumDur }, ...segments.slice(i)];
            fs.writeFileSync(
              listPath,
              remaining.map(s => `file '${s.path.replace(/'/g, "'\\''")}'`).join('\n'),
            );
            const fallbackPath = path.join(workDir, `merged_fb_${i}.mp4`);
            await runFfmpeg([
              '-y',
              '-f', 'concat',
              '-safe', '0',
              '-protocol_whitelist', 'file,pipe',
              '-i', listPath,
              '-c', 'copy',
              fallbackPath,
            ], { timeout: 60000 });
            videoPath = fallbackPath;
            cumDur = remaining.reduce((sum, s) => sum + s.duration, 0);
            break;
          }
        }
      }

      // ── 3) 무음 오디오 트랙 추가 (이후 BGM/나레이션 합성을 위한 토대) ──
      let videoDuration = durations.reduce((a, b) => a + b, 0);
      try {
        const { stdout } = await runFfprobe([
          '-i', videoPath,
          '-show_entries', 'format=duration',
          '-v', 'quiet',
          '-of', 'csv=p=0',
        ]);
        videoDuration = parseFloat(stdout.toString().trim()) || videoDuration;
      } catch { /* */ }

      const withAudioPath = path.join(workDir, 'with_audio.mp4');
      await runFfmpeg([
        '-y',
        '-i', videoPath,
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', String(videoDuration),
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        withAudioPath,
      ], { timeout: 60000 });
      let currentPath = withAudioPath;

      // ── 4) 나레이션 합성 (옵션) ──
      // narration_audio가 단일 mp3로 들어오면 무음 트랙 위에 덧씌움
      if (narrationFile) {
        const narPath = path.join(workDir, 'with_narration.mp4');
        await runFfmpeg([
          '-y',
          '-i', currentPath,
          '-i', narrationFile.path,
          '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[out]',
          '-map', '0:v',
          '-map', '[out]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          narPath,
        ], { timeout: 90000 });
        currentPath = narPath;
      }

      // ── 5) BGM 합성 (옵션) ──
      let bgmApplied = false;
      if (bgmEnabled) {
        // bgmMood 는 BGM_MOOD_RE 통과 — path traversal 차단
        const bgmDir = path.join(__dirname, '..', '..', 'sfx', 'bgm', bgmMood);
        let bgmFile = null;
        try {
          if (fs.existsSync(bgmDir)) {
            const files = fs.readdirSync(bgmDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (files.length > 0) {
              bgmFile = path.join(bgmDir, files[Math.floor(Math.random() * files.length)]);
            }
          }
        } catch {}

        if (bgmFile) {
          const bgmPath = path.join(workDir, 'with_bgm.mp4');
          const vol = (bgmVolume / 100).toFixed(2);
          await runFfmpeg([
            '-y',
            '-i', currentPath,
            '-i', bgmFile,
            '-filter_complex', `[1]volume=${vol},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]`,
            '-map', '0:v',
            '-map', '[out]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '128k',
            bgmPath,
          ], { timeout: 120000 });
          currentPath = bgmPath;
          bgmApplied = true;
        }
      }

      // ── 6) 응답 ──
      if (!fs.existsSync(currentPath)) {
        throw new Error('출력 파일이 생성되지 않았습니다.');
      }

      const metadata = {
        slides: images.length,
        duration: Math.round(videoDuration * 10) / 10,
        transition,
        bgm: bgmApplied,
        narration: !!narrationFile,
        aspect,
      };

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Shorts-Metadata', JSON.stringify(metadata));

      const stream = fs.createReadStream(currentPath);
      stream.pipe(res);
      stream.on('end', () => {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      });
      stream.on('error', () => {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      });
    } catch (err) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      console.error('[card-to-shorts] Error:', err.message?.slice(0, 200));
      res.status(500).json({ error: '영상 변환 실패' });
    }
  },
);

module.exports = router;
