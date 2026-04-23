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
        const { data: updated, error } = await supabase.from('hospital_images').update({
          tags: result.tags,
          alt_text: result.altText,
          ai_description: result.description,
        })
        .eq('id', body.imageId)
        .eq('user_id', owner)  // 소유권 검증 — 타인 이미지 업데이트 방지
        .select();

        if (error) {
          console.error('[auto-tag] update failed:', error.message);
          return NextResponse.json({ error: 'db_update_failed' }, { status: 500 });
        }
        if (!updated || updated.length === 0) {
          console.warn(`[auto-tag] no rows updated (id=${body.imageId} owner=${owner}) — ownership mismatch`);
          return NextResponse.json({ error: 'ownership_mismatch', hint: 'image owner does not match current user' }, { status: 403 });
        }
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
- **임플란트**: 임플란트 나사(티타늄 픽스처)·지대주·보철물·식립 장면·**임플란트 교육용 모형**
  ❌ 사랑니 모형·잇몸/뼈 해부도·턱관절 사진·크라운/인레이 샘플 → "임플란트" 아님
  ❌ 치아 뿌리 해부도나 치아 구조도는 절대 "임플란트" 아님 (실제 티타늄 나사가 명확히 보일 때만)
- **치아교정**: 브라켓·와이어·투명교정·교정 전후
- **스케일링**: 치석 제거·구강 위생 도구
- **충치치료**: 충치 단계도·레진·인레이·크라운 치료 장면·**충치 진행 모형**
- **신경치료**: 근관 치료·치수
- **사랑니**: 매복 사랑니·사랑니 발치·사랑니 모형·사랑니 해부도 (치아 뿌리가 기울어진 모형도 포함)
- **소아치과**: 어린이 환자
- **치아미백**: 미백 시술·전후
- **라미네이트**: 라미네이트·심미 보철 샘플
- **틀니**: 틀니·의치
- **턱관절**: 턱관절(TMJ) 해부도·장애·교합 치료·악관절 이미지
- **잇몸치료**: 치주 수술·치근활택술(SRP)·잇몸이식·깊은 잇몸 치료 (스케일링보다 전문적)
- **보철**: 크라운·브릿지·인레이·온레이 (임플란트 외 보철물)
  ❌ 임플란트 보철은 "임플란트"
- **구강검진**: 정기 검진 장면·파노라마/세팔로/CT 촬영 결과
- **치아외상**: 파절·탈구·외상 치료·치아 파손 사진
- **예방치료**: 불소 도포·실란트·구강 위생 교육 도구
- **발치**: 일반 발치 (사랑니 제외)
- **악교정**: 양악수술·턱교정·악교정 전후 사진
- **구강질환**: 구내염·구강건조증·구취·혀 질환
- **마우스가드**: 이갈이/스포츠/코골이 구강 장치
- **마취**: 국소마취·수면마취·전신마취 관련 장면·도구·주사 이미지
- **레이저치료**: 치과용 레이저 시술 (치은 성형·민감성 치료·연조직 레이저)
- **치아본**: 디지털 구강 스캐너·본뜨기(인상 채득)·석고 모형 제작 장면
- **교합치료**: 교합 조정·교합 안정 장치·보톡스 주사를 통한 교합 이완 (턱관절 해부와 별도)

### B. 장면/공간 태그 (하나만 선택)
- **의료진**: 의사·스탭 얼굴·유니폼
- **수술**: 실제 수술 진행 장면 (시술 중에만)
- **상담**: 의료진·환자 대화 장면
  ⚠️ 상담 장면에는 시술 태그(임플란트·충치치료·신경치료 등) 절대 병행 금지.
  "상담" 태그만 단독 부여. 범용 이미지로 어떤 주제 글에든 사용 가능해야 함.
- **장비**: X-ray·CT·3D 스캐너·진료 기기
- **진료실**: 진료 의자·공간
- **병원내부**: 복도·라운지
- **대기실**: 대기실 공간
- **외관**: 건물 외부
- **로고**: 로고·브랜드 그래픽
- **일반**: 뉴스 기사 캡처·그래프·통계표·병원 로고가 아닌 일반 로고 등 **어떤 시술에도 해당 안 되는 경우만**

## 규칙
1. **최대 2개 태그**
2. 시술/질환 태그에 하나라도 해당되면 **반드시 그 태그 사용**. "일반"은 정말로 어떤 시술에도 해당 안 될 때만.
3. 뉴스 기사 캡처·그래프·통계표 → "일반". (치아/시술 모형은 해당 시술 태그로 분류)
4. "임플란트" 는 실제 임플란트 시술/보철물이 명확히 보일 때만
5. **상담 장면은 "상담" 태그만 단독** — 의사가 환자와 대화/설명하는 장면에 시술 태그 병행 금지.
6. **뉴스 기사/캡처** — 기사 내용이 다루는 시술/질환에 맞는 태그 분류.
   예: 사랑니 발치 뉴스 → "사랑니", 임플란트 합병증 뉴스 → "임플란트", 마취 관련 뉴스 → "마취"
   장면 태그는 "일반" (뉴스 기사는 진료실/수술 장면이 아니므로)
7. **그래프/차트/통계** — 숫자·축·범례가 보이는 통계 이미지 → "일반" 태그.

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
  const model = 'gemini-3.1-pro-preview';
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
