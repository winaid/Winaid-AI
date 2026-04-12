import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../lib/guestRateLimit';

export async function POST(req: NextRequest) {
  // 게스트 rate limit — Gemini 호출이라 분당 10회 제한
  const gate = gateGuestRequest(req, 10, '/api/pexels-query');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { topic, category } = await req.json();
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return NextResponse.json({ query: 'professional clinic' });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 병원 마케팅 주제에 어울리는 Pexels 스톡 사진 검색어를 영어 2~3단어로 만들어줘.

규칙:
- 사람 얼굴이 안 나오는 사물/환경/장비 사진이 나올 검색어
- 병원/의료/건강 관련 분위기
- 카드뉴스 배경으로 쓸 거라 깔끔하고 밝은 톤

예시:
- "임플란트 사후관리" → "dental tools clean"
- "올바른 양치질" → "toothbrush mint fresh"
- "피부 보톡스" → "skincare products minimal"
- "척추 디스크" → "medical clinic bright"
- "스케일링" → "dental chair equipment"
- "치아미백" → "dental whitening tools"

절대 금지: 사람, 얼굴, 인물이 나올 수 있는 검색어 (portrait, person, doctor, patient, woman, man)
반드시: 사물, 장비, 공간, 재료 위주 (tools, equipment, interior, products, ingredients)

진료과: ${category || '치과'}
주제: "${topic}"
영어 검색어만 출력 (따옴표 없이). 반드시 진료과에 맞는 검색어를 사용 (치과면 dental, 피부과면 skincare/dermatology, 정형외과면 orthopedic):` }] }],
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
