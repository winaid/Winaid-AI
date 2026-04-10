/**
 * POST /api/video/add-sound-effects
 *
 * 영상에 효과음을 자동 배치 + 합성.
 *
 * 입력 (multipart/form-data):
 *   - file: 영상 또는 오디오 파일
 *   - style: 'shorts' | 'vlog' | 'explanation' | 'interview' (기본 'shorts')
 *   - density: 1~5 (기본 3)
 *   - subtitles: JSON 문자열 [{ start_time, end_time, text }] (선택)
 *
 * 응답:
 *   - body: 합성된 영상/오디오 (스트림)
 *   - X-Sfx-Metadata: { applied, count, effects, source } JSON 문자열
 *
 * 동작:
 *  1) sfx 라이브러리 비어있으면 → 원본 그대로 반환 (X-Sfx-Metadata.applied=false)
 *  2) Gemini API 호출로 효과음 배치 결정 (실패 시 룰베이스 fallback)
 *  3) 카테고리별로 무작위 mp3 매칭 (없으면 해당 배치 스킵)
 *  4) FFmpeg amix 필터로 합성 → 스트림 응답
 */

const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const {
  getRandomSfx,
  getTotalSfxCount,
  getSfxCountsByCategory,
} = require('../config/sfxLibrary');

const router = express.Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

// @google/generative-ai 는 선택 의존성 — 없거나 require 실패해도 룰베이스로 동작
let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch {
  // 모듈 미설치 — 룰베이스만 사용
}

// ──────────────────────────────────────────────────────────────────
// 효과음 배치 결정
// ──────────────────────────────────────────────────────────────────

/**
 * Gemini로 자막 분석 후 효과음 배치 추천.
 * 실패하면 룰베이스로 fallback.
 * 반환: [{ time: number, category: string }]
 */
async function decideEffectPlacements(subtitles, style, density) {
  if (!subtitles || subtitles.length === 0) return [];

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || !GoogleGenerativeAI) {
    return ruleBasedPlacement(subtitles, density);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = [
      '아래 영상 자막 데이터를 분석해서 효과음을 넣을 위치와 종류를 JSON으로 추천해주세요.',
      '',
      `스타일: ${style}`,
      `효과음 밀도: ${density}/5`,
      '',
      '카테고리 설명:',
      '- emphasis: 핵심 키워드, 중요 포인트 직전/직후',
      '- transition: 주제가 바뀌는 지점',
      '- positive: 좋은 결과, 장점 언급',
      '- negative: 주의사항, 단점 언급',
      '- funny: 유머, 가벼운 톤',
      '- notification: 새로운 정보 시작',
      '- musical: 멜로디 강조 (라이저, 드롭)',
      '',
      '밀도 기준:',
      '- 1: 가장 중요한 2~3곳만',
      '- 3: 적당히 5~8곳',
      '- 5: 거의 매 문장 10~15곳',
      '',
      '자막:',
      JSON.stringify(subtitles.map(s => ({ start: s.start_time, end: s.end_time, text: s.text }))),
      '',
      '반드시 JSON 배열만 응답 (마크다운 백틱 없이):',
      '[{"time": 3.5, "category": "emphasis"}, {"time": 8.0, "category": "transition"}]',
    ].join('\n');

    const result = await model.generateContent(prompt);
    const text = (result?.response?.text?.() || '').trim();
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return ruleBasedPlacement(subtitles, density);

    return parsed
      .filter(p => typeof p.time === 'number' && typeof p.category === 'string')
      .map(p => ({ time: p.time, category: p.category }));
  } catch (err) {
    console.warn('[sfx] AI 배치 실패, 룰베이스 fallback:', err?.message || err);
    return ruleBasedPlacement(subtitles, density);
  }
}

/** AI 없을 때: 자막 텍스트 키워드 기반 카테고리 추론 */
function ruleBasedPlacement(subtitles, density) {
  const placements = [];
  // density 1~2 → 매 3문장, 3 → 매 2문장, 4~5 → 매 문장
  const interval = density <= 2 ? 3 : density <= 3 ? 2 : 1;

  for (let i = 0; i < subtitles.length; i++) {
    if (i % interval !== 0) continue;
    const sub = subtitles[i];
    if (!sub || typeof sub.start_time !== 'number') continue;

    const text = sub.text || '';
    let category = 'emphasis';
    if (/장점|좋은|효과|추천|성공|개선/.test(text)) category = 'positive';
    else if (/주의|단점|부작용|위험|조심|금지/.test(text)) category = 'negative';
    else if (/다음|또|그리고|두 번째|세 번째|마지막/.test(text)) category = 'transition';
    else if (/알려|정보|팁|방법|비결|소개/.test(text)) category = 'notification';

    placements.push({
      time: sub.start_time + 0.2, // 문장 시작 직후
      category,
    });
  }
  return placements;
}

// ──────────────────────────────────────────────────────────────────
// FFmpeg 합성
// ──────────────────────────────────────────────────────────────────

/**
 * effects: [{ time, category, sfxFile, volume }]
 * sfxFile: { id, path, name, category } 또는 null
 *
 * FFmpeg amix 필터로 원본 오디오 + 효과음들을 한 번에 합성.
 * 효과음이 0개거나 모두 매칭 실패면 원본을 그대로 outputPath에 복사.
 */
function mixSoundEffects(inputPath, outputPath, effects) {
  // 실제 매칭된 효과음만
  const valid = effects.filter(e => e.sfxFile && fs.existsSync(e.sfxFile.path));
  if (valid.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  // -i 인자 + 필터 구성
  const inputArgs = [`-i "${inputPath}"`];
  const adelayParts = [];
  const labels = [];

  valid.forEach((e, i) => {
    inputArgs.push(`-i "${e.sfxFile.path}"`);
    const inputIdx = i + 1; // 0번은 원본
    const delayMs = Math.max(0, Math.round((e.time || 0) * 1000));
    const volume = typeof e.volume === 'number' ? e.volume : 0.6;
    const label = `sfx${i}`;
    adelayParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${volume.toFixed(2)}[${label}]`);
    labels.push(`[${label}]`);
  });

  const filter = `${adelayParts.join(';')};[0:a]${labels.join('')}amix=inputs=${labels.length + 1}:duration=first:dropout_transition=0[out]`;

  const cmd =
    `ffmpeg -y ${inputArgs.join(' ')} ` +
    `-filter_complex "${filter}" ` +
    `-map 0:v? -map "[out]" ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `"${outputPath}"`;

  execSync(cmd, { timeout: 300000, stdio: 'pipe' });
}

// ──────────────────────────────────────────────────────────────────
// 메인 라우트
// ──────────────────────────────────────────────────────────────────

router.post('/', upload.single('file'), async (req, res) => {
  const workDir = path.join(os.tmpdir(), `sfx-${uuidv4()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });

    const style = (req.body && req.body.style) || 'shorts';
    const density = Math.max(1, Math.min(5, parseInt((req.body && req.body.density) || '3', 10) || 3));
    let subtitles = null;
    try {
      subtitles = JSON.parse((req.body && req.body.subtitles) || 'null');
    } catch {
      subtitles = null;
    }

    const ext = path.extname(req.file.originalname || '') || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output${ext}`);
    fs.renameSync(req.file.path, inputPath);

    const contentType = ext.toLowerCase() === '.mp3' ? 'audio/mpeg' : 'video/mp4';

    // 1) 라이브러리가 비었으면 원본 반환 — 에러 아님
    const totalSfx = getTotalSfxCount();
    if (totalSfx === 0) {
      console.log('[sfx] 효과음 라이브러리 비어있음 — 원본 반환');
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Sfx-Metadata', JSON.stringify({
        applied: false,
        reason: 'sfx_library_empty',
        count: 0,
        effects: [],
        counts_by_category: getSfxCountsByCategory(),
      }));
      const stream = fs.createReadStream(inputPath);
      stream.pipe(res);
      stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
      return;
    }

    // 2) 배치 결정 (AI → 룰베이스 fallback)
    const placements = await decideEffectPlacements(subtitles, style, density);
    const usedAi = !!(GoogleGenerativeAI && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) && placements.length > 0;

    // 3) 카테고리별 mp3 매칭
    const effects = placements
      .map(p => ({
        time: p.time,
        category: p.category,
        sfxFile: getRandomSfx(p.category),
        volume: 0.6,
      }))
      .filter(e => e.sfxFile !== null);

    // 4) 합성 (effects 0개여도 mix 함수가 원본 복사로 처리)
    mixSoundEffects(inputPath, outputPath, effects);

    if (!fs.existsSync(outputPath)) {
      throw new Error('출력 파일이 생성되지 않았습니다.');
    }

    const metadata = {
      applied: effects.length > 0,
      count: effects.length,
      source: usedAi ? 'ai' : 'rule',
      style,
      density,
      effects: effects.map(e => ({
        time: e.time,
        category: e.category,
        sfx_id: e.sfxFile?.id || '',
        sfx_name: e.sfxFile?.name || '',
      })),
    };

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Sfx-Metadata', JSON.stringify(metadata));

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
    stream.on('error', () => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} });
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    console.error('[sfx] Error:', err);
    res.status(500).json({ error: err?.message || '효과음 처리 실패' });
  }
});

module.exports = router;
