/**
 * POST /api/video/add-bgm
 *
 * 영상에 BGM을 합성한다.
 * FFmpeg amix 필터로 원본 오디오 + BGM 을 볼륨 조절하여 믹싱.
 *
 * TODO: 실제 BGM 파일이 서버에 없으면 graceful skip
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getFfmpegPath, getFfprobePath } from '../../../../lib/ffmpegPath';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/add-bgm');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let inputPath = '';
  let outputPath = '';
  let bgmPath = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bgmId = (formData.get('bgm_id') as string) || '';
    const volume = parseInt((formData.get('volume') as string) || '15') / 100; // 0~0.5

    if (!file) return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });
    if (!bgmId) return NextResponse.json({ error: 'BGM ID가 필요합니다.' }, { status: 400 });

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = os.tmpdir();
    inputPath = path.join(tmpDir, `bgm_input_${Date.now()}.mp4`);
    outputPath = path.join(tmpDir, `bgm_output_${Date.now()}.mp4`);

    // 입력 파일 저장
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    // BGM 파일 경로 — public/sfx/bgm/ 에서 찾기
    // bgmId 형식: "calm_01" → path: "/sfx/bgm/calm/calm_01.mp3"
    const mood = bgmId.replace(/_\d+$/, '');
    const publicDir = path.join(process.cwd(), 'public');
    bgmPath = path.join(publicDir, 'sfx', 'bgm', mood, `${bgmId}.mp3`);

    if (!fs.existsSync(bgmPath)) {
      // BGM 파일이 아직 없으면 원본 그대로 반환 (graceful skip)
      const resultBuffer = fs.readFileSync(inputPath);
      fs.unlinkSync(inputPath);
      return new NextResponse(resultBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="bgm_${file.name}"`,
          'X-Bgm-Metadata': JSON.stringify({ bgm_applied: false, reason: 'BGM 파일이 아직 준비되지 않았습니다.' }),
        },
      });
    }

    // FFmpeg: BGM 합성
    const { execSync } = await import('child_process');

    const ffmpeg = getFfmpegPath();
    const ffprobe = getFfprobePath();

    const vol = Math.max(0, Math.min(0.5, volume)).toFixed(2);
    try {
      execSync(
        `"${ffmpeg}" -y -i "${inputPath}" -i "${bgmPath}" ` +
        `-filter_complex "[1]volume=${vol},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]" ` +
        `-map 0:v -map "[out]" -c:v copy -c:a aac -b:a 128k "${outputPath}"`,
        { timeout: 300000, stdio: 'pipe' },
      );
    } catch (err) {
      console.error('[add-bgm] FFmpeg 에러', err);
      // FFmpeg 실패해도 원본 반환
      const resultBuffer = fs.readFileSync(inputPath);
      try { fs.unlinkSync(inputPath); } catch { /* */ }
      return new NextResponse(resultBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Bgm-Metadata': JSON.stringify({ bgm_applied: false, reason: 'BGM 합성 처리 실패. 원본을 반환합니다.' }),
        },
      });
    }

    const resultBuffer = fs.readFileSync(outputPath);

    // 정리
    try { fs.unlinkSync(inputPath); } catch { /* */ }
    try { fs.unlinkSync(outputPath); } catch { /* */ }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="bgm_${file.name}"`,
        'X-Bgm-Metadata': JSON.stringify({ bgm_applied: true, bgm_id: bgmId, volume: Math.round(volume * 100) }),
      },
    });

  } catch (err) {
    console.error('[add-bgm] 서버 에러', err);
    try {
      const fs = await import('fs');
      if (inputPath) fs.unlinkSync(inputPath);
      if (outputPath) fs.unlinkSync(outputPath);
    } catch { /* */ }
    return NextResponse.json({ error: 'BGM 합성 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
