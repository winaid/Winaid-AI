/**
 * POST /api/video/ai-assemble
 *
 * AI 쇼츠 최종 조립:
 * 이미지(data URL) → 영상 클립 + 나레이션 합성 + BGM 믹싱 → 최종 MP4
 *
 * FFmpeg 필수. Vercel 서버리스에서는 제한적 — Railway/VPS 권장.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface SceneImageInput {
  scene_number: number;
  image_url: string; // data:image/... 또는 URL
  duration: number;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 2, '/api/video/ai-assemble');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const tmpFiles: string[] = [];

  try {
    const body = await request.json() as {
      scene_images: SceneImageInput[];
      audio_url?: string;
      add_bgm?: boolean;
      bgm_mood?: string;
      bgm_volume?: number;
    };

    if (!body.scene_images?.length) {
      return NextResponse.json({ error: '장면 이미지가 필요합니다.' }, { status: 400 });
    }

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    // FFmpeg 확인
    try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 }); } catch {
      return NextResponse.json({ error: 'FFmpeg가 서버에 설치되어 있지 않습니다.' }, { status: 503 });
    }

    const tmpDir = path.join(os.tmpdir(), `ai_assemble_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    tmpFiles.push(tmpDir);

    // ── PHASE 1: 이미지 → 영상 클립 ──
    const sceneClips: string[] = [];
    for (const scene of body.scene_images) {
      const imgPath = path.join(tmpDir, `img_${scene.scene_number}.png`);
      const clipPath = path.join(tmpDir, `clip_${scene.scene_number}.mp4`);

      // data URL → 파일로 저장
      if (scene.image_url.startsWith('data:')) {
        const base64 = scene.image_url.split(',')[1];
        if (base64) fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
        else continue;
      } else if (scene.image_url.startsWith('http')) {
        const res = await fetch(scene.image_url);
        fs.writeFileSync(imgPath, Buffer.from(await res.arrayBuffer()));
      } else {
        continue;
      }

      const dur = Math.max(1, scene.duration);
      const frames = Math.round(dur * 30);

      try {
        // Ken Burns 효과: 미세한 줌인으로 정지 이미지에 생동감
        execSync(
          `ffmpeg -y -loop 1 -i "${imgPath}" -t ${dur} ` +
          `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,` +
          `zoompan=z='min(1.06,1+0.0002*on)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30" ` +
          `-c:v libx264 -preset fast -pix_fmt yuv420p "${clipPath}"`,
          { timeout: 60000, stdio: 'pipe' },
        );
        sceneClips.push(clipPath);
      } catch (err) {
        console.error(`[ai-assemble] 클립 생성 실패 scene ${scene.scene_number}`, err);
      }
    }

    if (sceneClips.length === 0) {
      return NextResponse.json({ error: '영상 클립을 생성할 수 없습니다.' }, { status: 500 });
    }

    // ── PHASE 2: 클립 합치기 ──
    const concatList = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(concatList, sceneClips.map(c => `file '${c}'`).join('\n'));

    const scenesVideo = path.join(tmpDir, 'scenes.mp4');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${scenesVideo}"`,
      { timeout: 120000, stdio: 'pipe' },
    );

    let currentFile = scenesVideo;

    // ── PHASE 3: 나레이션 합성 ──
    if (body.audio_url) {
      const narrationPath = path.join(tmpDir, 'narration.mp3');

      if (body.audio_url.startsWith('data:') || body.audio_url.startsWith('blob:')) {
        // blob URL은 서버에서 접근 불가 → 이 경우 스킵
      } else if (body.audio_url.startsWith('http')) {
        const res = await fetch(body.audio_url);
        fs.writeFileSync(narrationPath, Buffer.from(await res.arrayBuffer()));
      }

      if (fs.existsSync(narrationPath)) {
        const withNarration = path.join(tmpDir, 'with_narration.mp4');
        try {
          execSync(
            `ffmpeg -y -i "${currentFile}" -i "${narrationPath}" -map 0:v -map 1:a -c:v copy -shortest "${withNarration}"`,
            { timeout: 120000, stdio: 'pipe' },
          );
          currentFile = withNarration;
        } catch {
          // 나레이션 합성 실패 시 무음 영상으로 진행
          const withSilence = path.join(tmpDir, 'with_silence.mp4');
          execSync(
            `ffmpeg -y -i "${currentFile}" -f lavfi -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -shortest -c:v copy -c:a aac "${withSilence}"`,
            { timeout: 30000, stdio: 'pipe' },
          );
          currentFile = withSilence;
        }
      } else {
        // 나레이션 없으면 무음 오디오 트랙 추가
        const withSilence = path.join(tmpDir, 'with_silence.mp4');
        execSync(
          `ffmpeg -y -i "${currentFile}" -f lavfi -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -shortest -c:v copy -c:a aac "${withSilence}"`,
          { timeout: 30000, stdio: 'pipe' },
        );
        currentFile = withSilence;
      }
    }

    // ── PHASE 4: BGM (옵션) ──
    if (body.add_bgm && body.bgm_mood && body.bgm_mood !== 'skip') {
      const bgmId = `${body.bgm_mood}_01`;
      const bgmPath = path.join(process.cwd(), 'public', 'sfx', 'bgm', body.bgm_mood, `${bgmId}.mp3`);

      if (fs.existsSync(bgmPath)) {
        const withBgm = path.join(tmpDir, 'with_bgm.mp4');
        const vol = Math.max(0, Math.min(0.5, (body.bgm_volume || 15) / 100)).toFixed(2);
        try {
          execSync(
            `ffmpeg -y -i "${currentFile}" -i "${bgmPath}" ` +
            `-filter_complex "[1]volume=${vol},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]" ` +
            `-map 0:v -map "[out]" -c:v copy -c:a aac "${withBgm}"`,
            { timeout: 120000, stdio: 'pipe' },
          );
          currentFile = withBgm;
        } catch { /* BGM 실패 무시 */ }
      }
    }

    // ── 결과 반환 ──
    const resultBuffer = fs.readFileSync(currentFile);

    // 임시 디렉토리 정리
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }

    // 영상 길이 측정
    let totalDuration = 0;
    try {
      const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${currentFile}"`, { timeout: 10000 }).toString().trim();
      totalDuration = parseFloat(probe) || 0;
    } catch { /* */ }

    return new NextResponse(new Uint8Array(resultBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="ai_shorts.mp4"',
        'X-Assemble-Metadata': JSON.stringify({
          total_duration: Math.round(totalDuration * 10) / 10,
          scenes_count: sceneClips.length,
        }),
      },
    });

  } catch (err) {
    console.error('[ai-assemble] 서버 에러', err);
    // 정리
    try {
      const fs = await import('fs');
      for (const f of tmpFiles) { try { fs.rmSync(f, { recursive: true, force: true }); } catch { /* */ } }
    } catch { /* */ }
    return NextResponse.json({ error: '영상 조립 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
