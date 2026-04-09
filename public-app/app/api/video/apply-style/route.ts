/**
 * POST /api/video/apply-style
 *
 * FFmpeg 필터로 영상 스타일 변환.
 * 현재 지원: pencil_sketch, vintage_film, pastel (FFmpeg 필터)
 * TODO: AI 변환 스타일 (웹툰, 애니 등)
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getStyleById } from '../../../../lib/videoStyles';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/apply-style');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let inputPath = '';
  let outputPath = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const styleId = (formData.get('style_id') as string) || 'original';

    if (!file) return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });

    const style = getStyleById(styleId);
    if (!style) return NextResponse.json({ error: '알 수 없는 스타일입니다.' }, { status: 400 });

    // original이면 원본 그대로
    if (styleId === 'original' || !style.ffmpegFilter) {
      const buf = Buffer.from(await file.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Style-Metadata': JSON.stringify({ style_applied: styleId, method: 'skip' }),
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
          'X-Style-Metadata': JSON.stringify({ style_applied: 'original', method: 'ffmpeg_unavailable' }),
        },
      });
    }

    const tmpDir = os.tmpdir();
    const ts = Date.now();
    inputPath = path.join(tmpDir, `style_in_${ts}.mp4`);
    outputPath = path.join(tmpDir, `style_out_${ts}.mp4`);

    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    execSync(
      `ffmpeg -y -i "${inputPath}" -vf "${style.ffmpegFilter}" -c:a copy "${outputPath}"`,
      { timeout: 300000, stdio: 'pipe' },
    );

    const resultBuffer = fs.readFileSync(outputPath);
    try { fs.unlinkSync(inputPath); } catch { /* */ }
    try { fs.unlinkSync(outputPath); } catch { /* */ }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="styled_${file.name}"`,
        'X-Style-Metadata': JSON.stringify({ style_applied: styleId, method: 'ffmpeg_filter' }),
      },
    });

  } catch (err) {
    console.error('[apply-style] 서버 에러', err);
    try {
      const fs = await import('fs');
      if (inputPath) fs.unlinkSync(inputPath);
      if (outputPath) fs.unlinkSync(outputPath);
    } catch { /* */ }
    return NextResponse.json({ error: '스타일 변환 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
