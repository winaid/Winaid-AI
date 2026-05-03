/**
 * POST /api/hospital-images/auto-tag — Gemini Vision 으로 이미지 자동 태깅
 * body: { imageId?: string, imageUrl: string }
 * response: { tags: string[], altText: string, description: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { checkAuth } from '../../../../lib/apiAuth';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_HOSTS = [
  'supabase.co',
  'storage.googleapis.com',
  'googleusercontent.com',
];

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

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
  if (!isAllowedImageUrl(body.imageUrl)) {
    return NextResponse.json({ error: 'untrusted_image_url' }, { status: 400 });
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

      // checkAuth 통과 + 명시적 .eq('user_id', owner) 로 소유권 강제. RLS 우회.
      const db = supabaseAdmin ?? supabase;
      if (db && body.imageId) {
        const { data: updated, error } = await db.from('hospital_images').update({
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
- **임플란트**: 임플란트 나사(티타늄 픽스처)·지대주·보철물·식립 장면·임플란트 교육용 모형
  ❌ 사랑니 모형·잇몸/뼈 해부도·턱관절 사진·크라운/인레이 샘플 → "임플란트" 아님
  ❌ 치아 뿌리 해부도·치아 구조도 → "임플란트" 아님 (실제 티타늄 나사가 명확히 보일 때만)
- **치아교정**: 브라켓·와이어·투명교정·교정 전후
- **스케일링**: 치석 제거·구강 위생 도구
- **충치치료**: 충치 단계도·레진·인레이·크라운 치료 장면·충치 진행 모형
- **신경치료**: 근관 치료·치수·치아 내부 구조(루트캐널) 해부도
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
- **구강질환**: 구내염·구강건조증·구취·혀 질환·잇몸 붓기·잇몸 출혈 사진
- **마우스가드**: 이갈이/스포츠/코골이 구강 장치
- **마취**: 국소마취·수면마취·전신마취 관련 장면·도구·주사 이미지
- **부작용**: 시술/치료 후 부작용·합병증·실패 사례·주의 경고 관련 이미지
- **레이저치료**: 치과용 레이저 시술 (치은 성형·민감성 치료·연조직 레이저)
- **치아본**: 디지털 구강 스캐너·본뜨기(인상 채득)·석고 모형 제작 장면
- **교합치료**: 교합 조정·교합 안정 장치·보톡스 주사를 통한 교합 이완
- **심미보철치료**: 올세라믹·지르코니아 크라운·심미 인레이 등 외모 개선 목적 보철
- **보존치료**: 충치 제거 후 레진·인레이·온레이로 자연치아를 살리는 시술·장면

### B. 장면/공간 태그 (하나만 선택)
- **기사**: 뉴스 기사·신문 캡처·언론 보도 이미지. 반드시 A 시술/질환 태그와 병행 사용.
  예: 사랑니 기사 → ["사랑니", "기사"], 임플란트 뉴스 → ["임플란트", "기사"]
  기사 내용에 맞는 시술 태그가 없으면 ["일반", "기사"]
- **의료진**: 의사·스탭 얼굴·유니폼
- **수술**: 실제 수술 진행 장면 (시술 중에만)
- **상담**: 의료진·환자 대화 장면 — 시술 태그 병행 금지, 단독 부여
- **장비**: X-ray·CT·3D 스캐너·진료 기기
- **진료실**: 진료 의자·공간
- **병원내부**: 복도·라운지
- **대기실**: 대기실 공간
- **외관**: 건물 외부
- **로고**: 로고·브랜드 그래픽
- **일반**: 그래프·통계표·일반 로고 등 어떤 시술에도 해당 안 되는 경우만 (뉴스 기사는 "기사" 태그 사용)

## 규칙
1. **최대 2개 태그**
2. 시술/질환 태그에 해당되면 **반드시 그 태그 사용**. "일반"은 정말로 어떤 시술에도 해당 안 될 때만.
3. 뉴스 기사·신문 캡처 → "기사" 태그 필수 + 내용에 맞는 시술 태그 병행.
4. "임플란트"는 실제 티타늄 나사가 명확히 보일 때만.
5. 상담 장면은 "상담" 태그만 단독.
6. 그래프·차트·통계 이미지 → "일반".

## 분류 예시 (Few-shot)
- 티타늄 임플란트 나사·지대주 클로즈업 → tags:["임플란트"]
- 임플란트 교육용 나사 모형 세트 → tags:["임플란트"]
- 매복 사랑니 X-ray·발치 전 사진 → tags:["사랑니"]
- 사랑니 뿌리 기울어진 해부 모형 → tags:["사랑니"]
- 치아 교정 브라켓·와이어 장착 사진 → tags:["치아교정"]
- 충치 진행 단계 다이어그램·모형 → tags:["충치치료"]
- 치아 내부 신경(치수·루트캐널) 해부도 → tags:["신경치료"]
- TMJ 턱관절 해부도·디스크 구조 이미지 → tags:["턱관절"]
- 잇몸 붓기·출혈·구내염 사진 → tags:["구강질환"]
- 잇몸 수술·치주 치료 장면 → tags:["잇몸치료"]
- 사랑니 발치 관련 신문기사 캡처 → tags:["사랑니","기사"]
- 임플란트 부작용 뉴스 기사 → tags:["임플란트","기사"]
- 치과 관련 통계 그래프 이미지 → tags:["일반"]
- 의사가 환자에게 X-ray 설명하는 장면 → tags:["상담"]
- 진료 의자·조명이 있는 치과 진료실 → tags:["진료실"]

altText는 반드시 실제로 보이는 내용 기반 (추측·환각 금지).`;

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
  const t0 = Date.now();
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8_000) });
    if (!imgRes.ok) {
      console.warn(`[auto-tag] image fetch ${imgRes.status}`);
      return null;
    }
    mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    base64 = Buffer.from(buffer).toString('base64');
    console.log(`[auto-tag] image fetch ${Date.now() - t0}ms, base64 ${Math.round(base64.length / 1024)}KB`);
    if (base64.length > 26_000_000) {
      console.warn('[auto-tag] image too large');
      return null;
    }
  } catch (e) {
    console.error('[auto-tag] image fetch failed:', (e as Error).message);
    return null;
  }

  // 2) Gemini Vision 호출 — Pro 먼저, 타임아웃 시 Flash-Lite 폴백
  const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
      altText: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['tags', 'altText', 'description'],
  };

  const makeBody = () => ({
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
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  for (const [model, timeout] of [
    ['gemini-3.1-pro-preview', 13_000],
    ['gemini-3.1-flash-lite-preview', 8_000],
  ] as [string, number][]) {
    const t1 = Date.now();
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(makeBody()),
        signal: AbortSignal.timeout(timeout),
      });
      if (!resp.ok) {
        const errText = (await resp.text()).slice(0, 300);
        console.warn(`[auto-tag] ${model} ${resp.status}: ${errText}`);
        continue;
      }
      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      if (!text) {
        console.warn(`[auto-tag] ${model} empty output`);
        continue;
      }
      console.log(`[auto-tag] ${model} OK ${Date.now() - t1}ms`);
      return JSON.parse(text);
    } catch (e) {
      console.warn(`[auto-tag] ${model} failed (${Date.now() - t1}ms): ${(e as Error).message}`);
    }
  }
  return null;
}
