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

    let useAutoEditor = false;
    try { execSync('auto-editor --help', { stdio: 'pipe', timeout: 5000 }); useAutoEditor = true; } catch { /* fallback to ffmpeg */ }

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

    // 무음 제거 실행
    if (useAutoEditor) {
      // auto-editor 사용 (최고 품질)
      try {
        execSync(
          `auto-editor "${inputPath}" --no-open --margin ${params.margin} --edit "audio:threshold=${params.threshold}" -o "${outputPath}"`,
          { timeout: 180000, stdio: 'pipe', cwd: workDir },
        );
      } catch (err) {
        console.error('[silence-remove] auto-editor 에러', err);
      }
    }

    if (!fs.existsSync(outputPath)) {
      // auto-editor 없거나 실패 → FFmpeg silencedetect + 수동 컷으로 fallback
      try {
        const thresholdDb = params.threshold === '0.04' ? '-35' : params.threshold === '0.02' ? '-25' : '-30';
        // FFmpeg로 무음 구간 감지 → 비무음 구간만 추출
        const detectResult = execSync(
          `"${ffmpeg}" -i "${inputPath}" -af "silencedetect=noise=${thresholdDb}dB:d=0.5" -f null - 2>&1`,
          { timeout: 60000 },
        ).toString();

        // silence_start/silence_end 파싱
        const silenceRegex = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
        const silences: Array<{ start: number; end: number }> = [];
        let match;
        while ((match = silenceRegex.exec(detectResult))) {
          silences.push({ start: parseFloat(match[1]), end: parseFloat(match[2]) });
        }

        if (silences.length > 0) {
          // 비무음 구간 계산
          const segments: Array<{ start: number; end: number }> = [];
          let cursor = 0;
          for (const s of silences) {
            if (s.start > cursor + 0.1) segments.push({ start: cursor, end: s.start });
            cursor = s.end;
          }
          if (cursor < originalDuration - 0.1) segments.push({ start: cursor, end: originalDuration });

          // FFmpeg concat으로 비무음 구간만 합치기
          const filterParts = segments.map((seg, i) =>
            `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
          ).join(';');
          const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
          const filter = `${filterParts};${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

          execSync(
            `"${ffmpeg}" -y -i "${inputPath}" -filter_complex "${filter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -c:a aac "${outputPath}"`,
            { timeout: 180000, stdio: 'pipe' },
          );
        }
      } catch (err) {
        console.error('[silence-remove] FFmpeg fallback 에러', err);
      }
    }

    // 여전히 출력 파일 없으면 원본 반환
    if (!fs.existsSync(outputPath)) {
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
            message: '무음 제거 도구를 사용할 수 없어 원본을 반환합니다.',
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
