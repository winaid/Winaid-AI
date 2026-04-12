import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || 'hospital';

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ photos: [] });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Google 이미지 검색에서 "${query}" 관련 고품질 이미지 URL 10개를 찾아줘. 실제로 접근 가능한 이미지 URL만. JSON 배열로만 출력: [{"url": "이미지URL", "alt": "설명"}]. 마크다운/코드블록 없이 JSON만.` }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      }
    );
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '[]';
    const cleaned = text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const items = JSON.parse(cleaned);

    return NextResponse.json({
      photos: items.map((item: any, i: number) => ({
        id: `google-${i}`,
        url: item.url,
        thumb: item.url,
        alt: item.alt || '',
        source: 'google',
      })),
    });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}
