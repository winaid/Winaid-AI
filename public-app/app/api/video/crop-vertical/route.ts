/**
 * POST /api/video/crop-vertical
 *
 * 가로(16:9) 영상을 세로(9:16) 비율로 자동 크롭한다.
 * 얼굴 추적 모드, 중앙 고정 모드, 수동 지정 모드를 지원.
 *
 * 현재 구현: 중앙 고정 모드 (FFmpeg crop filter)
 * TODO: 얼굴 추적 모드 — mediapipe/OpenCV + FFmpeg sendcmd
 *
 * FFmpeg가 서버에 설치되어 있어야 한다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── 타입 ──

type AspectRatio = '9:16' | '4:5' | '1:1';
type CropMode = 'face_tracking' | 'center' | 'manual';
type OutputResolution = '1080x1920' | '720x1280' | 'auto';

interface CropVerticalResponse {
  download_url: string;
  original_resolution: string;
  result_resolution: string;
  original_aspect: string;
  result_aspect: string;
  faces_detected: number;
  duration: number;
}

// ── 비율 계산 ──

function getAspectRatioValues(ratio: AspectRatio): { w: number; h: number } {
  switch (ratio) {
    case '9:16': return { w: 9, h: 16 };
    case '4:5': return { w: 4, h: 5 };
    case '1:1': return { w: 1, h: 1 };
  }
}

function detectAspectLabel(w: number, h: number): string {
  const r = w / h;
  if (Math.abs(r - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(r - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(r - 4 / 5) < 0.05) return '4:5';
  if (Math.abs(r - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(r - 1) < 0.05) return '1:1';
  return `${w}:${h}`;
}

function getOutputDimensions(
  resolution: OutputResolution,
  ratio: AspectRatio,
  srcW: number,
  srcH: number,
): { outW: number; outH: number } {
  const { w: rw, h: rh } = getAspectRatioValues(ratio);

  if (resolution === '1080x1920') {
    // 세로 기준: 높이 1920, 너비는 비율에 맞게
    const outH = ratio === '1:1' ? 1080 : 1920;
    const outW = ratio === '1:1' ? 1080 : Math.round(outH * rw / rh);
    return { outW, outH };
  }
  if (resolution === '720x1280') {
    const outH = ratio === '1:1' ? 720 : 1280;
    const outW = ratio === '1:1' ? 720 : Math.round(outH * rw / rh);
    return { outW, outH };
  }

  // auto — 원본 높이 기준
  const cropH = srcH;
  const cropW = Math.round(cropH * rw / rh);
  return { outW: Math.min(cropW, srcW), outH: cropH };
}

// ── FFmpeg crop 필터 생성 ──

function buildCropFilter(
  srcW: number,
  srcH: number,
  ratio: AspectRatio,
  mode: CropMode,
  manualX?: number,
  outW?: number,
  outH?: number,
): string {
  const { w: rw, h: rh } = getAspectRatioValues(ratio);

  // 크롭 사이즈 (원본 높이 기준)
  let cropH = srcH;
  let cropW = Math.round(cropH * rw / rh);

  if (cropW > srcW) {
    cropW = srcW;
    cropH = Math.round(cropW * rh / rw);
  }

  // 크롭 위치
  let cropX: string;
  let cropY: string;

  if (mode === 'manual' && manualX !== undefined) {
    // 수동 지정: x 좌표 (0~1 비율)
    const px = Math.round(manualX * srcW - cropW / 2);
    cropX = String(Math.max(0, Math.min(px, srcW - cropW)));
    cropY = String(Math.max(0, Math.round((srcH - cropH) / 2)));
  } else {
    // 중앙 고정 (face_tracking도 현재는 중앙으로 fallback)
    cropX = `(iw-${cropW})/2`;
    cropY = `(ih-${cropH})/2`;
  }

  // crop + scale
  const parts = [`crop=${cropW}:${cropH}:${cropX}:${cropY}`];
  if (outW && outH) {
    parts.push(`scale=${outW}:${outH}`);
  }

  return parts.join(',');
}

// ── 영상 메타데이터 추출 ──

async function getVideoInfo(filePath: string): Promise<{ width: number; height: number; duration: number } | null> {
  try {
    const { execSync } = await import('child_process');
    const probe = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of json "${filePath}"`,
      { timeout: 15000 },
    ).toString();
    const data = JSON.parse(probe);
    const stream = data.streams?.[0];
    const duration = parseFloat(stream?.duration || data.format?.duration || '0');
    return {
      width: stream?.width || 0,
      height: stream?.height || 0,
      duration,
    };
  } catch {
    return null;
  }
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/crop-vertical');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let inputPath = '';
  let outputPath = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const aspectRatio = (formData.get('aspect_ratio') as AspectRatio) || '9:16';
    const cropMode = (formData.get('crop_mode') as CropMode) || 'center';
    const outputResolution = (formData.get('output_resolution') as OutputResolution) || '1080x1920';
    const manualX = formData.get('manual_x') ? parseFloat(formData.get('manual_x') as string) : undefined;

    if (!file) {
      return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });
    }

    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기가 500MB를 초과합니다.' }, { status: 400 });
    }

    // 임시 파일 저장
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tmpDir = os.tmpdir();
    const ext = path.extname(file.name) || '.mp4';
    const inputName = `crop_input_${Date.now()}${ext}`;
    const outputName = `crop_output_${Date.now()}.mp4`;
    inputPath = path.join(tmpDir, inputName);
    outputPath = path.join(tmpDir, outputName);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(inputPath, Buffer.from(arrayBuffer));

    // 영상 정보 추출
    const info = await getVideoInfo(inputPath);
    if (!info || info.width === 0 || info.height === 0) {
      return NextResponse.json({ error: '영상 정보를 읽을 수 없습니다. 지원되는 형식인지 확인해주세요.' }, { status: 400 });
    }

    // 이미 세로 영상인 경우
    if (info.height > info.width && aspectRatio === '9:16') {
      // 세로 영상이지만 해상도 변환이 필요할 수 있으므로 진행
    }

    // 출력 해상도 계산
    const { outW, outH } = getOutputDimensions(outputResolution, aspectRatio, info.width, info.height);

    // FFmpeg 필터 생성
    const vf = buildCropFilter(info.width, info.height, aspectRatio, cropMode, manualX, outW, outH);

    // 얼굴 추적 모드 안내
    let facesDetected = 0;
    if (cropMode === 'face_tracking') {
      // TODO: mediapipe/OpenCV로 얼굴 추적 구현
      // 현재는 중앙 고정으로 fallback
      facesDetected = 0; // 추후 구현 시 실제 감지 수
    }

    // FFmpeg 실행
    const { execSync } = await import('child_process');
    try {
      execSync(
        `ffmpeg -y -i "${inputPath}" -vf "${vf}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}"`,
        { timeout: 300000, stdio: 'pipe' },
      );
    } catch (ffmpegErr) {
      console.error('[crop-vertical] FFmpeg 에러', ffmpegErr);
      return NextResponse.json({ error: '영상 변환에 실패했습니다. FFmpeg 오류.' }, { status: 500 });
    }

    // 결과 파일 읽기
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: '출력 파일이 생성되지 않았습니다.' }, { status: 500 });
    }

    const resultBuffer = fs.readFileSync(outputPath);

    // 임시 파일 정리
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }

    // 응답: 바이너리로 직접 반환 (작은 영상) or URL
    // Vercel 환경에서는 파일 시스템 한계가 있으므로 blob으로 반환
    const response: CropVerticalResponse = {
      download_url: '', // 클라이언트에서 blob URL로 처리
      original_resolution: `${info.width}x${info.height}`,
      result_resolution: `${outW}x${outH}`,
      original_aspect: detectAspectLabel(info.width, info.height),
      result_aspect: aspectRatio.replace(':', ':'),
      faces_detected: facesDetected,
      duration: Math.round(info.duration * 10) / 10,
    };

    // 영상 바이너리 + 메타데이터를 멀티파트로 반환은 복잡하므로,
    // 메타데이터를 헤더에 넣고 바이너리를 body로 반환
    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="cropped_${file.name}"`,
        'X-Crop-Metadata': JSON.stringify(response),
      },
    });

  } catch (err) {
    console.error('[crop-vertical] 서버 에러', err);
    // 임시 파일 정리
    try {
      const fs = await import('fs');
      if (inputPath) fs.unlinkSync(inputPath);
      if (outputPath) fs.unlinkSync(outputPath);
    } catch { /* ignore */ }
    return NextResponse.json({ error: '영상 크롭 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
