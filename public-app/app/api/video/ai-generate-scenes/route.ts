/**
 * POST /api/video/ai-generate-scenes
 *
 * 장면별 이미지를 Gemini 이미지 모델로 생성한다.
 * 기존 /api/image 의 Gemini 이미지 생성 패턴을 재사용.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { getStyleById } from '../../../../lib/videoStyles';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function getGeminiKey(): string | null {
  for (let i = 0; i <= 10; i++) {
    const key = process.env[i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`];
    if (key) return key;
  }
  return null;
}

interface SceneInput {
  scene_number: number;
  image_prompt: string;
  narration: string;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 3, '/api/video/ai-generate-scenes');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as { scenes: SceneInput[]; style_id: string };

    if (!body.scenes?.length) return NextResponse.json({ error: '장면이 필요합니다.' }, { status: 400 });

    const key = getGeminiKey();
    if (!key) return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 503 });

    const style = getStyleById(body.style_id);
    const styleSuffix = style?.promptSuffix || '';

    const sceneImages: Array<{ scene_number: number; image_url: string; prompt_used: string }> = [];

    // 장면별 이미지 생성 (순차 — 병렬은 rate limit 위험)
    for (const scene of body.scenes) {
      const fullPrompt = `Generate an illustration for a vertical short-form video (9:16 aspect ratio).
Scene description: ${scene.image_prompt}
Style: ${styleSuffix || 'clean medical illustration, professional'}
Requirements:
- Vertical composition (portrait orientation)
- No text or watermarks in the image
- High quality, vibrant colors
- Suitable for healthcare/medical content`;

      try {
        const models = ['gemini-3.1-flash-lite-preview', 'gemini-3-pro-image-preview'];
        let imageDataUrl = '';

        for (const model of models) {
          try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: {
                  responseModalities: ['IMAGE', 'TEXT'],
                  temperature: 0.6,
                },
              }),
            });

            if (!res.ok) continue;

            const data = await res.json();
            const parts = data.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
            if (imageDataUrl) break;
          } catch { continue; }
        }

        sceneImages.push({
          scene_number: scene.scene_number,
          image_url: imageDataUrl || '', // 빈 문자열이면 UI에서 플레이스홀더 표시
          prompt_used: fullPrompt.slice(0, 200),
        });

      } catch (err) {
        console.error(`[ai-generate-scenes] 장면 ${scene.scene_number} 이미지 실패`, err);
        sceneImages.push({ scene_number: scene.scene_number, image_url: '', prompt_used: '' });
      }

      // rate limit 방지
      await new Promise(r => setTimeout(r, 1000));
    }

    return NextResponse.json({ scene_images: sceneImages });

  } catch (err) {
    console.error('[ai-generate-scenes] 서버 에러', err);
    return NextResponse.json({ error: '이미지 생성 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
