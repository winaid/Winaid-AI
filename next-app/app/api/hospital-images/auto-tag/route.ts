/**
 * POST /api/hospital-images/auto-tag — Gemini Vision 으로 이미지 자동 태깅
 * body: { imageId?: string, imageUrl: string }
 * response: { tags: string[], altText: string, description: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { checkAuth } from '../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const owner = await resolveImageOwner(request);

  let body: { imageId?: string; imageUrl?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
  }
  if (!body.imageUrl) {
    return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
  }

  try {
    const parsed = await analyzeImageWithGemini(body.imageUrl);
    if (parsed) {
      const result = {
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: unknown) => typeof t === 'string').slice(0, 3)
          : ['일반'],
        altText: typeof parsed.altText === 'string' ? parsed.altText.slice(0, 200) : '',
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 200) : '',
      };

      if (supabase && body.imageId) {
        await supabase.from('hospital_images').update({
          tags: result.tags,
          alt_text: result.altText,
          ai_description: result.description,
        })
        .eq('id', body.imageId)
        .eq('user_id', owner);  // 소유권 검증 — 타인 이미지 업데이트 방지
      }

      return NextResponse.json(result);
    }
  } catch { /* fallback */ }

  return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
}

// ── Gemini Vision 직접 호출 (inlineData) ──

const SYSTEM_INSTRUCTION = `당신은 치과 블로그 이미지 분류 전문가입니다.
실제 이미지를 보고 **최대 2개** 태그로만 분류하세요.

## 태그 구분 기준

### A. 시술/질환 태그 (하나만 선택, 해당 없으면 생략)
- **임플란트**: 실제 임플란트 나사·지대주·임플란트 보철물·식립 장면
  ❌ 일반 치아, 잇몸/뼈 해부도, 턱관절 사진, 크라운/인레이 샘플 → "임플란트" 아님
- **치아교정**: 브라켓·와이어·투명교정·교정 전후
- **스케일링**: 치석 제거·구강 위생 도구
- **충치치료**: 충치 단계도·레진·인레이·크라운 치료 장면
- **신경치료**: 근관 치료·치수
- **사랑니**: 매복 사랑니·발치
- **소아치과**: 어린이 환자
- **치아미백**: 미백 시술·전후
- **라미네이트**: 라미네이트·심미 보철 샘플
- **틀니**: 틀니·의치

### B. 장면/공간 태그 (하나만 선택)
- **의료진**: 의사·스탭 얼굴·유니폼
- **수술**: 실제 수술 진행 장면 (시술 중에만)
- **상담**: 의료진·환자 대화 장면
- **장비**: X-ray·CT·3D 스캐너·진료 기기
- **진료실**: 진료 의자·공간
- **병원내부**: 복도·라운지
- **대기실**: 대기실 공간
- **외관**: 건물 외부
- **로고**: 로고·브랜드 그래픽
- **일반**: 위 해당 없는 모든 경우 (해부도, 뉴스 기사, 그래프, 샘플 사진 등)

## 규칙
1. **최대 2개 태그**
2. **애매하면 "일반"**
3. 해부도·뉴스·그래프·모형 → "일반"
4. "임플란트" 는 실제 임플란트 시술/보철물이 명확히 보일 때만

## 출력
JSON 만. 마크다운/코드펜스 금지.
{"tags":["태그1","태그2"],"altText":"이미지 실제 내용 1문장","description":"어떤 블로그 주제에 어울리는지 1문장"}

altText 는 반드시 **실제로 보이는 내용** 기반 (추측·환각 금지).`;

async function analyzeImageWithGemini(
  imageUrl: string,
): Promise<{ tags: string[]; altText: string; description: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[auto-tag] GEMINI_API_KEY not set');
    return null;
  }

  // 1) 이미지 fetch → base64
  let base64: string;
  let mimeType: string;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.warn(`[auto-tag] image fetch ${imgRes.status}`);
      return null;
    }
    mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    base64 = Buffer.from(buffer).toString('base64');
    // 26MB 초과 이미지 거부
    if (base64.length > 26_000_000) {
      console.warn('[auto-tag] image too large');
      return null;
    }
  } catch (e) {
    console.error('[auto-tag] image fetch failed:', (e as Error).message);
    return null;
  }

  // 2) Gemini Vision 호출 (multimodal inlineData)
  const model = 'gemini-3.1-flash-lite-preview';
  const apiBody = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: '이 이미지를 실제로 보고 분류해주세요.' },
      ],
    }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 500,
    },
  };

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(apiBody),
    });
    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 300);
      console.warn(`[auto-tag] gemini ${resp.status}: ${errText}`);
      return null;
    }
    const data = await resp.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join('');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      console.warn('[auto-tag] gemini output no JSON');
      return null;
    }
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    console.error('[auto-tag] gemini call failed:', (e as Error).message);
    return null;
  }
}
