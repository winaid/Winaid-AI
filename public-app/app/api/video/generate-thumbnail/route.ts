/**
 * POST /api/video/generate-thumbnail
 *
 * 영상에서 베스트 프레임을 추출하고 텍스트를 합성하여 썸네일을 생성한다.
 * FFmpeg로 프레임 추출 + drawtext 합성.
 *
 * TODO: 한국어 폰트 (Noto Sans KR Black) 서버 설치 필요
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 5, '/api/video/generate-thumbnail');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const tmpFiles: string[] = [];

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const frameTime = parseFloat((formData.get('frame_time') as string) || '1');
    const text = (formData.get('text') as string) || '';
    const textColor = (formData.get('text_color') as string) || 'white';
    const textPosition = (formData.get('text_position') as string) || 'center';

    if (!file) return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    // FFmpeg 확인
    try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 }); } catch {
      return NextResponse.json({ error: 'FFmpeg가 서버에 설치되어 있지 않습니다.' }, { status: 503 });
    }

    const tmpDir = os.tmpdir();
    const ts = Date.now();
    const inputPath = path.join(tmpDir, `thumb_in_${ts}.mp4`);
    const framePath = path.join(tmpDir, `thumb_frame_${ts}.jpg`);
    const outputPath = path.join(tmpDir, `thumb_out_${ts}.jpg`);
    tmpFiles.push(inputPath, framePath, outputPath);

    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    // 프레임 추출
    execSync(
      `ffmpeg -y -i "${inputPath}" -ss ${Math.max(0, frameTime)} -frames:v 1 -q:v 2 "${framePath}"`,
      { timeout: 15000, stdio: 'pipe' },
    );

    if (!fs.existsSync(framePath)) {
      // 실패 시 0초에서 추출
      execSync(
        `ffmpeg -y -i "${inputPath}" -ss 0 -frames:v 1 -q:v 2 "${framePath}"`,
        { timeout: 15000, stdio: 'pipe' },
      );
    }

    // 텍스트 합성
    if (text.trim()) {
      // 한국어 폰트 탐색
      const fontPaths = [
        '/usr/share/fonts/truetype/noto/NotoSansKR-Black.ttf',
        '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
        '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
      ];
      let fontOpt = '';
      for (const fp of fontPaths) {
        if (fs.existsSync(fp)) { fontOpt = `:fontfile=${fp}`; break; }
      }

      const colors: Record<string, string> = {
        white: 'fontcolor=white:borderw=5:bordercolor=black',
        yellow: 'fontcolor=yellow:borderw=5:bordercolor=black',
        red: 'fontcolor=red:borderw=5:bordercolor=white',
      };
      const positions: Record<string, string> = {
        top: 'y=h*0.12',
        center: 'y=(h-text_h)/2',
        bottom: 'y=h*0.78',
      };

      const escaped = text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
      const vf = `drawtext=text='${escaped}':fontsize=60${fontOpt}:${colors[textColor] || colors.white}:x=(w-text_w)/2:${positions[textPosition] || positions.center}`;

      execSync(
        `ffmpeg -y -i "${framePath}" -vf "${vf}" -q:v 2 "${outputPath}"`,
        { timeout: 15000, stdio: 'pipe' },
      );
    } else {
      fs.copyFileSync(framePath, outputPath);
    }

    const resultBuffer = fs.readFileSync(outputPath);
    for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* */ } }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="thumbnail.jpg"',
        'X-Thumbnail-Metadata': JSON.stringify({
          text_used: text || '(없음)',
          frame_time: frameTime,
        }),
      },
    });

  } catch (err) {
    console.error('[generate-thumbnail] 서버 에러', err);
    try {
      const fs = await import('fs');
      for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* */ } }
    } catch { /* */ }
    return NextResponse.json({ error: '썸네일 생성 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
