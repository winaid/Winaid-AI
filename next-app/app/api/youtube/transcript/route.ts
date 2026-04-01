import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body as { url?: string };

    if (!url?.trim()) {
      return NextResponse.json({ success: false, error: 'URL을 입력해주세요.' }, { status: 400 });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json({ success: false, error: '유효한 유튜브 URL이 아닙니다.' }, { status: 400 });
    }

    let transcript: { text: string }[] = [];
    let language = 'ko';

    // 한국어 자막 우선
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    } catch {
      // 한국어 없으면 자동 생성 자막
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
        language = 'auto';
      } catch {
        // 그것도 없으면 영어
        try {
          transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
          language = 'en';
        } catch {
          return NextResponse.json({ success: false, error: '자막을 추출할 수 없습니다. 자막이 없거나 비공개 영상일 수 있습니다.' }, { status: 404 });
        }
      }
    }

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ success: false, error: '자막이 비어있습니다.' }, { status: 404 });
    }

    // 자막 텍스트 정리
    const lines = transcript.map(t => t.text.trim()).filter(Boolean);
    // 중복 연속 라인 제거
    const deduped: string[] = [];
    for (const line of lines) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
        deduped.push(line);
      }
    }

    let fullText = deduped.join(' ').replace(/\s+/g, ' ').trim();
    // 최대 15,000자
    if (fullText.length > 15000) fullText = fullText.slice(0, 15000);

    return NextResponse.json({
      success: true,
      transcript: fullText,
      language,
      charCount: fullText.length,
    });
  } catch (err) {
    console.error('[youtube/transcript] Error:', err);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
