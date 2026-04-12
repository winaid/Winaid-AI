/**
 * POST /api/video/apply-style
 *
 * 스타일 변환:
 * - FFmpeg 필터 3종: vintage_film, pencil_sketch, pastel (즉시, ~10초)
 * - Gemini AI 12종: 프레임 추출 → Gemini img2img → 재조립 (~2분)
 */

const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { FFMPEG_STYLES, GEMINI_STYLE_PROMPTS } = require('../config/styles');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `style-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const { style_id = 'original' } = req.body || {};

    // 원본이면 그대로 반환
    if (style_id === 'original') {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Style-Metadata', JSON.stringify({ style_applied: 'original', method: 'skip' }));
      fs.createReadStream(req.file.path).pipe(res);
      return;
    }

    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, 'output.mp4');
    fs.renameSync(req.file.path, inputPath);

    // ── FFmpeg 필터 스타일 ──
    if (FFMPEG_STYLES[style_id]) {
      console.log(`[style] FFmpeg 스타일: ${style_id}`);
      execSync(
        `ffmpeg -y -i "${inputPath}" -vf "${FFMPEG_STYLES[style_id]}" -c:a copy "${outputPath}"`,
        { timeout: 120000, stdio: 'pipe' }
      );

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Style-Metadata', JSON.stringify({ style_applied: style_id, method: 'ffmpeg' }));
      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on('end', () => cleanup(workDir));
      return;
    }

    // ── Gemini AI 스타일 ──
    const styleConfig = GEMINI_STYLE_PROMPTS[style_id];
    if (!styleConfig) {
      cleanup(workDir);
      return res.status(400).json({ error: `지원하지 않는 스타일: ${style_id}` });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      cleanup(workDir);
      return res.status(503).json({ error: 'Gemini API 키가 설정되지 않았습니다.' });
    }

    console.log(`[style] Gemini AI 스타일: ${style_id}`);

    // 1. 대표 프레임 추출 (2초 간격)
    const framesDir = path.join(workDir, 'frames');
    fs.mkdirSync(framesDir);
    execSync(`ffmpeg -i "${inputPath}" -vf "fps=0.5" -q:v 2 "${framesDir}/frame_%04d.jpg"`, { timeout: 60000, stdio: 'pipe' });

    const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
    if (frameFiles.length === 0) {
      cleanup(workDir);
      return res.status(500).json({ error: '프레임 추출 실패' });
    }

    // 최대 20프레임 제한
    const maxFrames = 20;
    const selectedFrames = frameFiles.length > maxFrames
      ? frameFiles.filter((_, i) => i % Math.ceil(frameFiles.length / maxFrames) === 0)
      : frameFiles;

    console.log(`[style] 프레임 ${selectedFrames.length}장 변환 시작`);

    // 2. Gemini로 각 프레임 변환 (3개씩 병렬)
    const styledDir = path.join(workDir, 'styled');
    fs.mkdirSync(styledDir);

    const fullPrompt = [styleConfig.prompt, styleConfig.negative, styleConfig.quality, 'Output same aspect ratio. High quality.'].join('\n');

    const concurrency = 3;
    for (let i = 0; i < selectedFrames.length; i += concurrency) {
      const batch = selectedFrames.slice(i, i + concurrency);
      await Promise.all(batch.map(async (file) => {
        const inputFrame = path.join(framesDir, file);
        const outputFrame = path.join(styledDir, file);

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const imageBase64 = fs.readFileSync(inputFrame).toString('base64');
            const models = ['gemini-3.1-flash-lite-preview', 'gemini-3-pro-image-preview'];

            let success = false;
            for (const model of models) {
              try {
                const apiRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-goog-api-key': geminiKey,
                    },
                    body: JSON.stringify({
                      contents: [{
                        parts: [
                          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                          { text: fullPrompt },
                        ],
                      }],
                      generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.6 },
                    }),
                  }
                );

                if (!apiRes.ok) continue;
                const data = await apiRes.json();
                const parts = data.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                  if (part.inlineData?.mimeType?.startsWith('image/')) {
                    fs.writeFileSync(outputFrame, Buffer.from(part.inlineData.data, 'base64'));
                    success = true;
                    break;
                  }
                }
                if (success) break;
              } catch { continue; }
            }

            if (success) {
              console.log(`[style] ✅ 프레임 ${file} 완료`);
              break;
            }
            throw new Error('모든 모델 실패');
          } catch {
            if (attempt === 2) {
              // 3번 실패 → 원본 복사
              console.log(`[style] ⚠️ 프레임 ${file} 원본 사용`);
              fs.copyFileSync(inputFrame, outputFrame);
            } else {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
        }
      }));

      // 배치 사이 1초 대기
      if (i + concurrency < selectedFrames.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 3. 원본 오디오 추출
    const audioPath = path.join(workDir, 'audio.mp3');
    try {
      execSync(`ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -q:a 2 "${audioPath}"`, { timeout: 30000, stdio: 'pipe' });
    } catch { /* 오디오 없는 영상 */ }

    // 4. 변환된 프레임 → 영상 세그먼트
    let totalDuration = 0;
    try {
      totalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`, { timeout: 10000 }).toString().trim()) || 0;
    } catch { /* */ }

    const segDuration = totalDuration / selectedFrames.length || 2;
    const segments = [];

    for (let i = 0; i < selectedFrames.length; i++) {
      const styledFrame = path.join(styledDir, selectedFrames[i]);
      if (!fs.existsSync(styledFrame)) continue;

      const segPath = path.join(workDir, `seg_${String(i).padStart(4, '0')}.mp4`);
      const frames = Math.round(segDuration * 30);
      const zoom = i % 2 === 0 ? '1+0.0006*on' : '1.04-0.0002*on';

      try {
        execSync(
          `ffmpeg -y -loop 1 -i "${styledFrame}" -t ${segDuration} ` +
          `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,` +
          `zoompan=z='${zoom}':d=${frames}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=1080x1920:fps=30" ` +
          `-c:v libx264 -pix_fmt yuv420p -preset fast "${segPath}"`,
          { timeout: 30000, stdio: 'pipe' }
        );
        segments.push(segPath);
      } catch { /* 스킵 */ }
    }

    if (segments.length === 0) {
      cleanup(workDir);
      return res.status(500).json({ error: '영상 세그먼트 생성 실패' });
    }

    // 5. concat
    const concatList = path.join(workDir, 'concat.txt');
    fs.writeFileSync(concatList, segments.map(s => `file '${s}'`).join('\n'));

    const videoOnly = path.join(workDir, 'video_only.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -protocol_whitelist file,pipe -i "${concatList}" -c copy "${videoOnly}"`, { timeout: 120000, stdio: 'pipe' });

    // 6. 오디오 합성
    if (fs.existsSync(audioPath)) {
      execSync(`ffmpeg -y -i "${videoOnly}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -shortest "${outputPath}"`, { timeout: 60000, stdio: 'pipe' });
    } else {
      fs.copyFileSync(videoOnly, outputPath);
    }

    console.log(`[style] ✅ Gemini AI 스타일 완료: ${style_id} (${selectedFrames.length}프레임)`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Style-Metadata', JSON.stringify({
      style_applied: style_id,
      method: 'gemini_ai',
      frames_processed: selectedFrames.length,
    }));
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => cleanup(workDir));

  } catch (err) {
    console.error('[style] 에러:', err);
    cleanup(workDir);
    res.status(500).json({ error: '스타일 변환 실패' });
  }
});

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

module.exports = router;
