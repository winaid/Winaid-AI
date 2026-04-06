import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { topic } = await req.json();
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return NextResponse.json({ query: 'professional clinic' });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 한국어 주제에 어울리는 Pexels 스톡 사진 검색어를 영어 3단어로 만들어줘. 배경 사진으로 쓸 거라 추상적이고 분위기 있는 키워드가 좋아.
예시:
- "임플란트 사후관리" → "dental clinic interior"
- "올바른 양치질과 치실 사용" → "toothbrush dental hygiene"
- "피부 보톡스 효과" → "beauty skincare clinic"
- "척추 디스크 예방" → "spine health wellness"

주제: "${topic}"
영어 검색어만 출력 (따옴표 없이):` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 50 },
        }),
      }
    );
    const data = await res.json();
    const query = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'professional clinic';
    return NextResponse.json({ query: query.replace(/['"]/g, '').slice(0, 50) });
  } catch {
    return NextResponse.json({ query: 'professional clinic' });
  }
}
