/**
 * POST /api/video/add-intro-outro
 *
 * 영상에 인트로/아웃로를 합성한다.
 * FFmpeg drawtext + concat 필터로 인트로/아웃로 생성 후 본편과 합치기.
 *
 * TODO: 한국어 폰트 (Noto Sans KR) 서버 설치 필요.
 *       없으면 시스템 기본 폰트로 fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/add-intro-outro');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const tmpFiles: string[] = [];

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const hospitalName = (formData.get('hospital_name') as string) || '';
    const hospitalPhone = (formData.get('hospital_phone') as string) || '';
    const hospitalDesc = (formData.get('hospital_desc') as string) || '';
    const hospitalLink = (formData.get('hospital_link') as string) || '';
    const introStyle = (formData.get('intro_style') as string) || 'none';
    const outroStyle = (formData.get('outro_style') as string) || 'none';

    if (!file) return NextResponse.json({ error: '영상 파일이 필요합니다.' }, { status: 400 });

    if (introStyle === 'none' && outroStyle === 'none') {
      // 둘 다 없으면 원본 그대로 반환
      const buf = Buffer.from(await file.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Intro-Metadata': JSON.stringify({ intro_added: false, outro_added: false }),
        },
      });
    }

    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    const tmpDir = os.tmpdir();
    const ts = Date.now();

    // 입력 파일 저장
    const mainPath = path.join(tmpDir, `intro_main_${ts}.mp4`);
    fs.writeFileSync(mainPath, Buffer.from(await file.arrayBuffer()));
    tmpFiles.push(mainPath);

    // 영상 해상도 추출
    let vw = 1080, vh = 1920;
    try {
      const probe = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${mainPath}"`,
        { timeout: 10000 },
      ).toString();
      const d = JSON.parse(probe);
      vw = d.streams?.[0]?.width || 1080;
      vh = d.streams?.[0]?.height || 1920;
    } catch { /* fallback to defaults */ }

    // 한국어 폰트 경로
    // TODO: Noto Sans KR 설치 후 경로 업데이트
    const fontPaths = [
      '/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    ];
    let fontFile = '';
    for (const fp of fontPaths) {
      if (fs.existsSync(fp)) { fontFile = fp; break; }
    }
    const fontOpt = fontFile ? `:fontfile=${fontFile}` : '';

    // ── 인트로 생성 ──
    let introPath = '';
    if (introStyle !== 'none' && hospitalName.trim()) {
      introPath = path.join(tmpDir, `intro_clip_${ts}.mp4`);
      tmpFiles.push(introPath);
      const dur = introStyle === 'simple' ? 1.5 : 3;
      const nameSize = Math.min(60, Math.round(vw / 18));
      const descSize = Math.round(nameSize * 0.5);

      let vf = `drawtext=text='${escapeFFmpeg(hospitalName)}':fontsize=${nameSize}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2`;
      if (introStyle === 'default' && hospitalDesc) {
        vf += `,drawtext=text='${escapeFFmpeg(hospitalDesc)}':fontsize=${descSize}${fontOpt}:fontcolor=0x888888:x=(w-text_w)/2:y=(h+text_h)/2+${Math.round(nameSize * 0.8)}`;
      }

      execSync(
        `ffmpeg -y -f lavfi -i color=c=white:s=${vw}x${vh}:d=${dur} -f lavfi -i anullsrc=r=44100:cl=stereo -vf "${vf}" -t ${dur} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${introPath}"`,
        { timeout: 30000, stdio: 'pipe' },
      );
    }

    // ── 아웃로 생성 ──
    let outroPath = '';
    if (outroStyle !== 'none' && hospitalName.trim()) {
      outroPath = path.join(tmpDir, `outro_clip_${ts}.mp4`);
      tmpFiles.push(outroPath);
      const dur = outroStyle === 'simple' ? 2 : 3;
      const titleSize = Math.min(48, Math.round(vw / 22));
      const lineSize = Math.round(titleSize * 0.55);
      const lineGap = Math.round(titleSize * 0.9);

      const thanksText = outroStyle === 'cta' ? '지금 전화주세요!' : '감사합니다';
      let vf = `drawtext=text='${escapeFFmpeg(thanksText)}':fontsize=${titleSize}${fontOpt}:fontcolor=0x333333:x=(w-text_w)/2:y=(h-text_h)/2-${lineGap * 2}`;

      if (hospitalPhone) {
        vf += `,drawtext=text='📞 ${escapeFFmpeg(hospitalPhone)}':fontsize=${lineSize}${fontOpt}:fontcolor=0x555555:x=(w-text_w)/2:y=(h-text_h)/2`;
      }
      if (hospitalLink) {
        vf += `,drawtext=text='${escapeFFmpeg(hospitalLink)}':fontsize=${lineSize}${fontOpt}:fontcolor=0x555555:x=(w-text_w)/2:y=(h-text_h)/2+${lineGap}`;
      }

      execSync(
        `ffmpeg -y -f lavfi -i color=c=white:s=${vw}x${vh}:d=${dur} -f lavfi -i anullsrc=r=44100:cl=stereo -vf "${vf}" -t ${dur} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${outroPath}"`,
        { timeout: 30000, stdio: 'pipe' },
      );
    }

    // ── 합치기 (concat) ──
    const outputPath = path.join(tmpDir, `intro_final_${ts}.mp4`);
    tmpFiles.push(outputPath);

    // concat 리스트 파일
    const concatList = path.join(tmpDir, `concat_${ts}.txt`);
    tmpFiles.push(concatList);
    const parts: string[] = [];
    if (introPath) parts.push(`file '${introPath}'`);
    parts.push(`file '${mainPath}'`);
    if (outroPath) parts.push(`file '${outroPath}'`);
    fs.writeFileSync(concatList, parts.join('\n'));

    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' },
    );

    const resultBuffer = fs.readFileSync(outputPath);

    // 정리
    for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* */ } }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="final_${file.name}"`,
        'X-Intro-Metadata': JSON.stringify({
          intro_added: !!introPath,
          outro_added: !!outroPath,
        }),
      },
    });

  } catch (err) {
    console.error('[add-intro-outro] 서버 에러', err);
    try {
      const fs = await import('fs');
      for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* */ } }
    } catch { /* */ }
    return NextResponse.json({ error: '인트로/아웃로 합성 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** FFmpeg drawtext용 텍스트 이스케이프 */
function escapeFFmpeg(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}
