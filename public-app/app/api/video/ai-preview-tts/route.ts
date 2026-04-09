/**
 * POST /api/video/ai-preview-tts
 *
 * TTS 미리듣기 — 짧은 텍스트로 목소리 프리뷰 생성.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getGcpAccessToken } from '../../../../lib/gcpAuth';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10, '/api/video/ai-preview-tts');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as { text: string; voice_name: string; speed: number };

    if (!body.text?.trim()) return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 });

    const accessToken = await getGcpAccessToken();
    if (!accessToken) return NextResponse.json({ error: 'Google Cloud 인증 실패.' }, { status: 503 });

    const ttsRes = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: body.text.slice(0, 200) },
        voice: { languageCode: 'ko-KR', name: body.voice_name || 'ko-KR-Wavenet-A' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: body.speed || 1.0, sampleRateHertz: 24000 },
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('[ai-preview-tts] TTS 실패', ttsRes.status, errText);
      return NextResponse.json({ error: `TTS 미리듣기 실패 (${ttsRes.status})` }, { status: 502 });
    }

    const data = await ttsRes.json() as { audioContent?: string };
    if (!data.audioContent) return NextResponse.json({ error: 'TTS 응답에 오디오가 없습니다.' }, { status: 502 });

    return new NextResponse(Buffer.from(data.audioContent, 'base64'), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });

  } catch (err) {
    console.error('[ai-preview-tts] 에러', err);
    return NextResponse.json({ error: 'TTS 미리듣기 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
