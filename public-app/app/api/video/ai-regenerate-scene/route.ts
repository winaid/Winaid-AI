/**
 * POST /api/video/ai-regenerate-scene
 *
 * 단일 장면 이미지 재생성.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getStyleById } from '../../../../lib/videoStyles';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function getGeminiKey(): string | null {
  for (let i = 0; i <= 10; i++) {
    const key = process.env[i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`];
    if (key) return key;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10, '/api/video/ai-regenerate-scene');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as { scene_number: number; image_prompt: string; style_id: string };

    const key = getGeminiKey();
    if (!key) return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 503 });

    const style = getStyleById(body.style_id);
    const fullPrompt = `Generate an illustration: ${body.image_prompt}, ${style?.promptSuffix || ''}, vertical 9:16, no text, high quality`;

    const models = ['gemini-3.1-flash-lite-preview', 'gemini-2.0-flash-exp'];
    let imageDataUrl = '';

    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.7 },
            }),
          },
        );
        if (!res.ok) continue;
        const data = await res.json();
        for (const part of (data.candidates?.[0]?.content?.parts || [])) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
        if (imageDataUrl) break;
      } catch { continue; }
    }

    return NextResponse.json({
      scene_number: body.scene_number,
      image_url: imageDataUrl,
      prompt_used: fullPrompt.slice(0, 200),
    });

  } catch (err) {
    console.error('[ai-regenerate-scene] 에러', err);
    return NextResponse.json({ error: '이미지 재생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
