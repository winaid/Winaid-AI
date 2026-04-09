/**
 * POST /api/video/silence-remove
 *
 * auto-editor + FFmpeg로 무음 구간을 자동 제거한다.
 * 편집 강도(soft/normal/tight)에 따라 threshold/margin 조절.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getFfmpegPath, getFfprobePath } from '../../../../lib/ffmpegPath';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const INTENSITY_PARAMS: Record<string, { threshold: string; margin: string }> = {
  soft:   { threshold: '0.04', margin: '0.3s' },
  normal: { threshold: '0.03', margin: '0.15s' },
  tight:  { threshold: '0.02', margin: '0.05s' },
};

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/silence-remove');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let workDir = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const intensity = (formData.get('intensity') as string) || 'normal';

    if (!file) return NextResponse.json({ error: '파일을 업로드해주세요.' }, { status: 400 });
    if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: '500MB 이하 파일만 가능합니다.' }, { status: 400 });

    const params = INTENSITY_PARAMS[intensity];
    if (!params) return NextResponse.json({ error: '잘못된 편집 강도입니다.' }, { status: 400 });

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    // FFmpeg + auto-editor 확인
    const ffmpeg = getFfmpegPath();
    const ffprobe = getFfprobePath();

    let autoEditorCmd = 'auto-editor';
    try { execSync('auto-editor --help', { stdio: 'pipe', timeout: 5000 }); } catch {
      return NextResponse.json({ error: 'auto-editor가 서버에 설치되어 있지 않습니다. pip install auto-editor 필요.' }, { status: 503 });
    }

    // 작업 디렉토리
    const ts = Date.now();
    workDir = path.join(os.tmpdir(), `silence_${ts}`);
    fs.mkdirSync(workDir, { recursive: true });

    const ext = path.extname(file.name) || '.mp4';
    const inputPath = path.join(workDir, `input${ext}`);
    const outputPath = path.join(workDir, `output${ext}`);

    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    // 원본 길이
    let originalDuration = 0;
    try {
      const probe = execSync(`"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`, { timeout: 15000 }).toString().trim();
      originalDuration = parseFloat(probe) || 0;
    } catch { /* */ }

    if (originalDuration > 600) {
      fs.rmSync(workDir, { recursive: true, force: true });
      return NextResponse.json({ error: '10분 이하 파일만 가능합니다.' }, { status: 400 });
    }

    // auto-editor 실행
    try {
      execSync(
        `${autoEditorCmd} "${inputPath}" --no-open --margin ${params.margin} --edit "audio:threshold=${params.threshold}" -o "${outputPath}"`,
        { timeout: 180000, stdio: 'pipe', cwd: workDir },
      );
    } catch (err) {
      console.error('[silence-remove] auto-editor 에러', err);
      // auto-editor 실패 시 원본 반환
      const buf = new Uint8Array(fs.readFileSync(inputPath));
      fs.rmSync(workDir, { recursive: true, force: true });
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': file.type || 'video/mp4',
          'X-Silence-Metadata': JSON.stringify({
            original_duration: Math.round(originalDuration * 10) / 10,
            result_duration: Math.round(originalDuration * 10) / 10,
            removed_seconds: 0,
            removed_percent: 0,
            message: 'auto-editor 처리 실패. 원본을 반환합니다.',
          }),
        },
      });
    }

    // 결과 파일 확인
    if (!fs.existsSync(outputPath)) {
      // auto-editor가 다른 이름으로 저장했을 수 있음
      const files = fs.readdirSync(workDir).filter((f: string) => f.startsWith('output') || f.includes('MODIFIED'));
      if (files.length > 0) {
        const actualOutput = path.join(workDir, files[0]);
        fs.renameSync(actualOutput, outputPath);
      }
    }

    if (!fs.existsSync(outputPath)) {
      const buf = new Uint8Array(fs.readFileSync(inputPath));
      fs.rmSync(workDir, { recursive: true, force: true });
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': file.type || 'video/mp4',
          'X-Silence-Metadata': JSON.stringify({ original_duration: originalDuration, result_duration: originalDuration, removed_seconds: 0, removed_percent: 0 }),
        },
      });
    }

    // 결과 길이
    let resultDuration = originalDuration;
    try {
      const probe = execSync(`"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`, { timeout: 15000 }).toString().trim();
      resultDuration = parseFloat(probe) || originalDuration;
    } catch { /* */ }

    const removedSeconds = Math.max(0, originalDuration - resultDuration);
    const removedPercent = originalDuration > 0 ? (removedSeconds / originalDuration) * 100 : 0;

    const resultBuffer = new Uint8Array(fs.readFileSync(outputPath));
    fs.rmSync(workDir, { recursive: true, force: true });

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': file.type || 'video/mp4',
        'Content-Disposition': `attachment; filename="edited_${file.name}"`,
        'X-Silence-Metadata': JSON.stringify({
          original_duration: Math.round(originalDuration * 10) / 10,
          result_duration: Math.round(resultDuration * 10) / 10,
          removed_seconds: Math.round(removedSeconds * 10) / 10,
          removed_percent: Math.round(removedPercent * 10) / 10,
        }),
      },
    });

  } catch (err) {
    console.error('[silence-remove] 서버 에러', err);
    try {
      if (workDir) {
        const fs = await import('fs');
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch { /* */ }
    return NextResponse.json({ error: '무음 제거 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
