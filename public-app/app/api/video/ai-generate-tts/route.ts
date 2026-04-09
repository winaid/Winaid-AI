/**
 * POST /api/video/ai-generate-tts
 *
 * 장면별 나레이션을 Google Cloud TTS로 생성하고 하나로 합친다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getGcpAccessToken } from '../../../../lib/gcpAuth';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface SceneInput {
  scene_number: number;
  narration: string;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 5, '/api/video/ai-generate-tts');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as {
      scenes: SceneInput[];
      voice_id: string;        // ttsVoices의 id
      voice_name: string;      // API에 넘길 이름
      engine: string;          // 'gemini' | 'chirp3_hd' | 'legacy'
      model?: string;          // Gemini 모델명
      speed: number;
      style_prompt?: string;   // Gemini TTS 스타일 프롬프트
    };

    if (!body.scenes?.length) return NextResponse.json({ error: '장면이 필요합니다.' }, { status: 400 });

    const accessToken = await getGcpAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Cloud 인증 실패. 서비스 계정을 확인해주세요.' }, { status: 503 });
    }

    const audioBuffers: Buffer[] = [];
    const timestamps: Array<{ scene_number: number; start_time: number; end_time: number }> = [];

    const engine = body.engine || 'legacy';
    const voiceName = body.voice_name || 'ko-KR-Wavenet-A';
    const speed = Math.max(0.5, Math.min(2.0, body.speed || 1.0));

    // 장면별 TTS 생성
    for (const scene of body.scenes) {
      // 엔진별 요청 body 구성
      let ttsBody: Record<string, unknown>;

      if (engine === 'gemini') {
        // Gemini 2.5 TTS — 모델 지정 + 스타일 프롬프트
        ttsBody = {
          input: {
            text: scene.narration,
            ...(body.style_prompt ? { prompt: body.style_prompt } : {}),
          },
          voice: {
            languageCode: 'ko-KR',
            name: voiceName,  // 'Kore', 'Charon' 등
            ...(body.model ? { modelName: body.model } : {}),
          },
          audioConfig: { audioEncoding: 'MP3' },
        };
      } else if (engine === 'chirp3_hd') {
        // Chirp 3 HD
        ttsBody = {
          input: { text: scene.narration },
          voice: { languageCode: 'ko-KR', name: voiceName },
          audioConfig: { audioEncoding: 'MP3' },
        };
      } else {
        // Legacy (Standard/WaveNet/Neural2)
        ttsBody = {
          input: { text: scene.narration },
          voice: { languageCode: 'ko-KR', name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: speed, pitch: 0, sampleRateHertz: 24000 },
        };
      }

      const ttsRes = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsBody),
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        console.error(`[ai-generate-tts] TTS 실패 scene ${scene.scene_number}`, ttsRes.status, errText);
        // 실패한 장면은 무음으로 대체 (graceful)
        audioBuffers.push(Buffer.alloc(0));
        continue;
      }

      const data = await ttsRes.json() as { audioContent?: string };
      if (data.audioContent) {
        audioBuffers.push(Buffer.from(data.audioContent, 'base64'));
      }
    }

    // 유효한 오디오가 없으면 에러
    const validBuffers = audioBuffers.filter(b => b.length > 0);
    if (validBuffers.length === 0) {
      return NextResponse.json({ error: 'TTS 생성에 실패했습니다. 모든 장면에서 오류 발생.' }, { status: 502 });
    }

    // FFmpeg로 합치기
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execSync } = await import('child_process');

    const tmpDir = os.tmpdir();
    const ts = Date.now();
    const tmpFiles: string[] = [];

    // FFmpeg 확인
    let ffmpegAvailable = false;
    try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 }); ffmpegAvailable = true; } catch { /* */ }

    if (!ffmpegAvailable || validBuffers.length === 1) {
      // FFmpeg 없거나 장면 1개면 첫 번째 유효한 오디오 반환
      const buf = new Uint8Array(validBuffers[0]);
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Tts-Metadata': JSON.stringify({
            total_duration: 0,
            scene_timestamps: body.scenes.map((s, i) => ({ scene_number: s.scene_number, start_time: i * 5, end_time: (i + 1) * 5 })),
          }),
        },
      });
    }

    // 장면별 파일 저장
    let currentTime = 0;
    const concatParts: string[] = [];

    // 0.3초 무음 파일
    const silencePath = path.join(tmpDir, `tts_silence_${ts}.mp3`);
    tmpFiles.push(silencePath);
    try {
      execSync(`ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t 0.3 -c:a libmp3lame "${silencePath}"`, { timeout: 10000, stdio: 'pipe' });
    } catch { /* 무음 생성 실패 무시 */ }

    for (let i = 0; i < audioBuffers.length; i++) {
      const buf = audioBuffers[i];
      if (buf.length === 0) continue;

      const scenePath = path.join(tmpDir, `tts_scene_${ts}_${i}.mp3`);
      tmpFiles.push(scenePath);
      fs.writeFileSync(scenePath, buf);

      // 길이 측정
      let duration = 3;
      try {
        const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${scenePath}"`, { timeout: 10000 }).toString().trim();
        duration = parseFloat(probe) || 3;
      } catch { /* fallback */ }

      timestamps.push({
        scene_number: body.scenes[i].scene_number,
        start_time: Math.round(currentTime * 10) / 10,
        end_time: Math.round((currentTime + duration) * 10) / 10,
      });

      concatParts.push(`file '${scenePath}'`);
      if (i < audioBuffers.length - 1 && fs.existsSync(silencePath)) {
        concatParts.push(`file '${silencePath}'`);
        currentTime += 0.3;
      }
      currentTime += duration;
    }

    // concat
    const listPath = path.join(tmpDir, `tts_list_${ts}.txt`);
    const outputPath = path.join(tmpDir, `tts_output_${ts}.mp3`);
    tmpFiles.push(listPath, outputPath);

    fs.writeFileSync(listPath, concatParts.join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`, { timeout: 60000, stdio: 'pipe' });

    const resultBuffer = fs.readFileSync(outputPath);
    for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch { /* */ } }

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="narration.mp3"',
        'X-Tts-Metadata': JSON.stringify({
          total_duration: Math.round(currentTime * 10) / 10,
          scene_timestamps: timestamps,
        }),
      },
    });

  } catch (err) {
    console.error('[ai-generate-tts] 서버 에러', err);
    return NextResponse.json({ error: 'TTS 생성 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
