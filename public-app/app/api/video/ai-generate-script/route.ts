/**
 * POST /api/video/ai-generate-script
 *
 * 키워드/URL/수동 입력으로 쇼츠 영상 대본(장면별)을 AI로 생성한다.
 * 기존 블로그 생성 엔진(Gemini)을 재사용.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { validateMedicalAd, countViolations } from '../../../../lib/medicalAdValidation';
import { sanitizePromptInput } from '../../../../lib/promptSanitize';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// ── Gemini 키 ──
function getGeminiKey(): string | null {
  for (let i = 0; i <= 10; i++) {
    const key = process.env[i === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`];
    if (key) return key;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 10, '/api/video/ai-generate-script');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json() as {
      input_type: 'keyword' | 'url' | 'manual';
      keyword?: string;
      url?: string;
      manual_script?: string;
      duration: number;
      tone: string;
    };

    const key = getGeminiKey();
    if (!key) return NextResponse.json({ error: 'AI API 키가 설정되지 않았습니다.' }, { status: 503 });

    const { input_type, keyword, duration, tone } = body;

    if (input_type === 'keyword' && !keyword?.trim()) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    // 프롬프트 인젝션 방어 — 사용자 입력을 sanitize. manual_script는 대본 자체라 상한을 조금 높임.
    const safeKeyword = sanitizePromptInput(keyword, 200);
    const safeManual = sanitizePromptInput(body.manual_script, 1000);
    const safeUrl = sanitizePromptInput(body.url, 300);
    const safeSubject = safeKeyword || safeManual || safeUrl;

    // 장면 수 계산
    const sceneCount = duration === 30 ? 4 : duration === 60 ? 8 : 12;
    const avgSceneDur = duration / sceneCount;

    const toneDesc = tone === 'professional' ? '전문적이고 신뢰감 있게' : tone === 'humorous' ? '유머러스하고 재밌게' : '친근하고 쉽게';

    const prompt = `당신은 치과/병원 유튜브 쇼츠 영상 대본 작가입니다.

주제: ${safeSubject}
영상 길이: ${duration}초
톤: ${toneDesc}
장면 수: ${sceneCount}개

규칙:
- 각 장면은 약 ${avgSceneDur.toFixed(0)}초
- 1문장 = 약 3~5초 (짧고 임팩트 있게)
- 첫 장면: 시청자 궁금증 유발 질문 또는 강한 hook
- 마지막 장면: 핵심 정리 + CTA
- 구어체 사용 (말하듯이)
- 의료광고법 준수 (과장/보장/비교 표현 금지)
- 각 장면에 맞는 이미지 설명도 작성 (영어, 구체적)

JSON만 출력:
[
  {
    "scene_number": 1,
    "start_time": 0,
    "end_time": ${avgSceneDur.toFixed(1)},
    "narration": "나레이션 텍스트",
    "image_prompt": "English image description for this scene"
  },
  ...
]`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4000 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `AI 응답 실패 (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSON 파싱
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI 응답에서 대본을 추출할 수 없습니다.', raw: text }, { status: 500 });
    }

    const rawScenes = JSON.parse(jsonMatch[0]) as Array<{
      scene_number: number;
      start_time: number;
      end_time: number;
      narration: string;
      image_prompt: string;
    }>;

    // 의료광고법 검증
    const scenes = rawScenes.map(s => ({
      sceneNumber: s.scene_number,
      startTime: s.start_time,
      endTime: s.end_time,
      narration: s.narration,
      imagePrompt: s.image_prompt,
      violations: validateMedicalAd(s.narration),
    }));

    const allV = scenes.flatMap(s => s.violations);
    const counts = countViolations(allV);

    return NextResponse.json({
      scenes,
      total_duration: duration,
      high_violations: counts.high,
      medium_violations: counts.medium,
    });

  } catch (err) {
    console.error('[ai-generate-script] 에러', err);
    return NextResponse.json({ error: '대본 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
