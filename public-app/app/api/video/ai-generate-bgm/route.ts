/**
 * POST /api/video/ai-generate-bgm
 *
 * Meta MusicGen (Hugging Face Inference API)으로 AI BGM 생성.
 * 텍스트 프롬프트 → 30초 음악 생성.
 *
 * 환경변수: HUGGINGFACE_API_KEY (https://huggingface.co/settings/tokens)
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// 분위기별 영어 프롬프트
const MOOD_PROMPTS: Record<string, string> = {
  bright: 'upbeat happy ukulele acoustic guitar, bright cheerful background music, 120bpm',
  calm: 'calm soft piano ambient, peaceful relaxing background music for hospital medical video, 80bpm',
  emotional: 'emotional piano and strings, cinematic heartfelt background music, 90bpm',
  trendy: 'lofi hip hop chill beat, modern trendy background music, 85bpm',
  corporate: 'corporate inspiring motivational, professional business presentation background music, 110bpm',
};

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/ai-generate-bgm');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as {
      mood?: string;
      custom_prompt?: string;
      duration?: number;
    };

    const hfKey = process.env.HUGGINGFACE_API_KEY;
    if (!hfKey) {
      return NextResponse.json({ error: 'Hugging Face API 키가 설정되지 않았습니다. HUGGINGFACE_API_KEY 환경변수를 확인하세요.' }, { status: 503 });
    }

    // 프롬프트 결정
    const prompt = body.custom_prompt?.trim()
      || MOOD_PROMPTS[body.mood || 'calm']
      || MOOD_PROMPTS.calm;

    // MusicGen API 호출 (Hugging Face Inference)
    const model = 'facebook/musicgen-small'; // small=빠름, medium=품질↑
    const apiUrl = `https://api-inference.huggingface.co/models/${model}`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 512, // ~10초. 1536=~30초
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[ai-generate-bgm] HF 에러', res.status, errText);

      // 모델 로딩 중
      if (res.status === 503) {
        return NextResponse.json({
          error: 'AI 음악 모델을 로딩 중입니다. 20~30초 후 다시 시도해주세요.',
          loading: true,
        }, { status: 503 });
      }

      return NextResponse.json({ error: `AI 음악 생성 실패 (${res.status})` }, { status: 502 });
    }

    // 응답은 오디오 바이너리 (FLAC)
    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/flac',
        'X-Bgm-Metadata': JSON.stringify({
          prompt,
          model,
          generated: true,
        }),
      },
    });

  } catch (err) {
    console.error('[ai-generate-bgm] 에러', err);
    return NextResponse.json({ error: 'AI 음악 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
