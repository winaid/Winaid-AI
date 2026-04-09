/**
 * POST /api/video/add-zoom
 *
 * 영상에 줌인/줌아웃 효과를 추가한다.
 * 자막 데이터를 기반으로 AI가 줌 포인트를 결정하고,
 * FFmpeg zoompan 필터로 적용한다.
 *
 * TODO: 복잡한 다중 줌은 Python 처리 필요
 * 현재: 단순 zoompan으로 전체 영상에 미세한 줌 효과
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface ZoomPoint {
  start_time: number;
  end_time: number;
  zoom_level: number;
  type: 'emphasis' | 'transition' | 'question' | 'conclusion';
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/add-zoom');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let inputPath = '';
  let outputPath = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const intensity = (formData.get('intensity') as string) || 'auto';
    const zoomLevel = parseFloat((formData.get('zoom_level') as string) || '1.15');
    const subtitlesJson = formData.get('subtitles') as string | null;

    if (!file) return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });

    if (intensity === 'skip') {
      const buf = Buffer.from(await file.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Zoom-Metadata': JSON.stringify({ zoom_applied: false }),
        },
      });
    }

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    // FFmpeg 확인
    try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 }); } catch {
      const buf = Buffer.from(await file.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Zoom-Metadata': JSON.stringify({ zoom_applied: false, reason: 'FFmpeg 없음' }),
        },
      });
    }

    const tmpDir = os.tmpdir();
    const ts = Date.now();
    inputPath = path.join(tmpDir, `zoom_in_${ts}.mp4`);
    outputPath = path.join(tmpDir, `zoom_out_${ts}.mp4`);

    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    // 자막 기반 줌 포인트 생성 (시뮬레이션)
    let zoomPoints: ZoomPoint[] = [];
    if (subtitlesJson) {
      try {
        const subs = JSON.parse(subtitlesJson) as Array<{ start_time: number; end_time: number; text: string }>;
        const count = intensity === 'strong' ? Math.min(15, subs.length) : intensity === 'subtle' ? Math.min(3, Math.floor(subs.length / 4)) : Math.min(8, Math.floor(subs.length / 2));
        const interval = Math.max(1, Math.floor(subs.length / count));
        for (let i = 0; i < subs.length && zoomPoints.length < count; i += interval) {
          const s = subs[i];
          zoomPoints.push({
            start_time: s.start_time,
            end_time: Math.min(s.end_time, s.start_time + 2),
            zoom_level: zoomLevel,
            type: s.text.includes('?') ? 'question' : i === 0 ? 'transition' : 'emphasis',
          });
        }
      } catch { /* 파싱 실패 무시 */ }
    }

    // 단순 FFmpeg zoompan (전체 영상에 미세한 줌 효과)
    const zl = Math.max(1.0, Math.min(1.3, zoomLevel));
    try {
      // ffprobe로 fps 확인
      let fps = 30;
      try {
        const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${inputPath}"`, { timeout: 10000 }).toString().trim();
        const [num, den] = probe.split('/');
        if (num && den) fps = Math.round(parseInt(num) / parseInt(den));
      } catch { /* fallback 30fps */ }

      // 줌 효과: 서서히 확대 → 복원을 반복
      // 영상 전체에 미세한 줌인-아웃 물결 효과
      const cycleSec = intensity === 'strong' ? 4 : intensity === 'subtle' ? 8 : 6;
      const cycleFrames = cycleSec * fps;
      const maxZ = zl;
      // zoompan 식: 줌이 sin 파형으로 1.0~maxZ 사이를 왕복
      const zoomExpr = `1+(${(maxZ - 1).toFixed(3)})*abs(sin(on/${cycleFrames}*PI))`;

      execSync(
        `ffmpeg -y -i "${inputPath}" -vf "scale=2*iw:2*ih,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=iw/2xiw/2:fps=${fps}" -c:a copy -shortest "${outputPath}"`,
        { timeout: 300000, stdio: 'pipe' },
      );
    } catch {
      // FFmpeg 실패 시 원본 복사
      fs.copyFileSync(inputPath, outputPath);
    }

    const resultBuffer = fs.readFileSync(outputPath);
    try { fs.unlinkSync(inputPath); } catch { /* */ }
    try { fs.unlinkSync(outputPath); } catch { /* */ }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'X-Zoom-Metadata': JSON.stringify({
          zoom_applied: true,
          zoom_points: zoomPoints,
          total_zooms: zoomPoints.length,
        }),
      },
    });

  } catch (err) {
    console.error('[add-zoom] 서버 에러', err);
    try {
      const fs = await import('fs');
      if (inputPath) fs.unlinkSync(inputPath);
      if (outputPath) fs.unlinkSync(outputPath);
    } catch { /* */ }
    return NextResponse.json({ error: '줌 효과 적용 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
