import { NextRequest, NextResponse } from 'next/server';

const toBase64 = (buf: ArrayBuffer): string => Buffer.from(buf).toString('base64');

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;
    if (!imageFile) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const apiKey = process.env.REMOVE_BG_API_KEY;

    if (apiKey) {
      // remove.bg API 사용
      const rbFormData = new FormData();
      rbFormData.append('image_file', imageFile);
      rbFormData.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: rbFormData,
      });

      if (!res.ok) return NextResponse.json({ error: 'remove.bg error' }, { status: res.status });

      const buffer = await res.arrayBuffer();
      const base64 = toBase64(buffer);
      return NextResponse.json({ image: `data:image/png;base64,${base64}` });
    }

    // API 키 없으면 Gemini로 대체
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 500 });

    const buffer = await imageFile.arrayBuffer();
    const base64 = toBase64(buffer);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Remove the background from this image. Return only the subject with transparent background. Output the edited image.' },
              { inlineData: { mimeType: imageFile.type, data: base64 } },
            ],
          }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );
    const data = await res.json();
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (imagePart) {
      return NextResponse.json({
        image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      });
    }
    return NextResponse.json({ error: 'Background removal failed' }, { status: 500 });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
