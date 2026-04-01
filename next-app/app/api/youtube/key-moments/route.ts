import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json() as { transcript?: string };
    if (!transcript?.trim()) {
      return NextResponse.json({ success: false, error: '자막이 필요합니다.' }, { status: 400 });
    }

    // Gemini에 핵심 구간 추출 요청
    const geminiRes = await fetch(new URL('/api/gemini', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `아래는 병원 유튜브 영상의 자막입니다.
블로그나 SNS에 GIF로 활용하기 좋은 핵심 장면 3~5개를 추출해주세요.

각 장면:
- start: 시작 시간 (초 단위)
- end: 끝 시간 (초 단위, start+3~8초)
- description: 왜 이 구간이 중요한지 한 줄
- usage: 추천 용도 (블로그 삽입 / SNS 공유 / 카드뉴스 배경)

JSON 배열로만 출력:
[{"start":45,"end":52,"description":"원장이 시술 과정을 설명","usage":"블로그 삽입"}]

자막의 흐름을 기준으로 시간을 추정하세요. 자막 전체 길이에 비례하여 배분.

${transcript.slice(0, 6000)}`,
        model: 'gemini-3.1-flash-lite-preview',
        temperature: 0.3,
        maxOutputTokens: 1000,
        responseType: 'json',
      }),
    });

    if (!geminiRes.ok) {
      return NextResponse.json({ success: false, error: 'AI 분석 실패' }, { status: 500 });
    }

    const geminiData = await geminiRes.json() as { text?: string };
    if (!geminiData.text) {
      return NextResponse.json({ success: false, error: 'AI 응답이 비어있습니다.' }, { status: 500 });
    }

    let moments: { start: number; end: number; description: string; usage: string }[] = [];
    try {
      const jsonMatch = geminiData.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        moments = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json({ success: false, error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, moments });
  } catch (err) {
    console.error('[youtube/key-moments] Error:', err);
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });
  }
}
