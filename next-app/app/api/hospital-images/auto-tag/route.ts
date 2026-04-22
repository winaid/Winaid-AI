/**
 * POST /api/hospital-images/auto-tag — Gemini Vision 으로 이미지 자동 태깅
 * body: { imageId?: string, imageUrl: string }
 * response: { tags: string[], altText: string, description: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { checkAuth } from '../../../../lib/apiAuth';
import { callLLM } from '../../../../lib/llm';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SYSTEM_INSTRUCTION = `당신은 치과 블로그 이미지 분류 전문가입니다.
각 이미지를 **최대 2개** 태그로만 분류하세요.

## 태그 구분 기준

### A. 시술/질환 태그 (하나만 선택, 해당 없으면 생략)
- **임플란트**: 실제 임플란트 나사·지대주·임플란트 보철물·식립 장면
  ❌ 일반 치아 사진, 잇몸/뼈 해부도, 턱관절 사진 → "임플란트" 아님
- **치아교정**: 브라켓·와이어·투명교정 장치·교정 전후·교정 시뮬레이션
- **스케일링**: 치석 제거 장면·구강 위생 도구·치석 이미지
- **충치치료**: 충치 단계 진행도·레진·인레이·크라운 치료 장면
- **신경치료**: 근관 치료·치수 관련 이미지
- **사랑니**: 매복 사랑니·사랑니 발치 관련
- **소아치과**: 어린이 환자·소아 치과 진료
- **치아미백**: 미백 시술·미백 전후
- **라미네이트**: 라미네이트·심미 보철물
- **틀니**: 틀니·의치·덴쳐

### B. 장면/공간 태그 (하나만 선택)
- **의료진**: 의사·스탭 얼굴·유니폼 포커스
- **수술**: 실제 수술 진행 장면, 수술 도구 사용 중 (시술 중에만. 장비 단독 X)
- **상담**: 의료진·환자 대화 장면, 상담실
- **장비**: X-ray·CT·3D 스캐너·진료 기기 (단독 사진)
- **진료실**: 진료 의자·진료실 공간
- **병원내부**: 복도·라운지 등 공용 공간
- **대기실**: 대기실 공간
- **외관**: 병원 건물 외부
- **로고**: 병원 로고·브랜드 그래픽
- **일반**: 위 해당 없는 모든 경우 (해부도, 뉴스 기사, 그래프, 일반 치아 사진 등)

## 규칙
1. **최대 2개 태그** (A+B 각 하나씩 또는 둘 중 하나만)
2. **애매하면 "일반"**
3. "임플란트" 는 실제 임플란트 시술/보철물이 명확히 보일 때만
4. 해부학 그림·뉴스 기사 캡처·그래프·일반 치아 사진 → 무조건 "일반"
5. 같은 시술 태그 여러 개 동시 부여 금지 (예: "임플란트"+"수술" 중 실제 수술 장면이면 둘 다 OK, 아니면 "임플란트"만)

JSON 으로만 출력. 마크다운/코드펜스 금지.`;

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: { imageId?: string; imageUrl?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
  }
  if (!body.imageUrl) {
    return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
  }

  try {
    const res = await callLLM({
      task: 'diagnostic_extract',
      systemBlocks: [{
        type: 'text',
        text: SYSTEM_INSTRUCTION,
        cacheable: true,
      }],
      userPrompt: `이 이미지 URL 을 분석해서 태그를 추천하세요: ${body.imageUrl}

출력 형식 (JSON 만):
{"tags":["태그1","태그2"],"altText":"이미지 내용 1문장","description":"어떤 블로그 주제에 어울리는지 1문장"}`,
      temperature: 0.2,
      maxOutputTokens: 500,
    });

    const text = (res.text ?? '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      const result = {
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string').slice(0, 5) : ['일반'],
        altText: typeof parsed.altText === 'string' ? parsed.altText.slice(0, 200) : '',
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 200) : '',
      };

      if (supabase && body.imageId) {
        await supabase.from('hospital_images').update({
          tags: result.tags,
          alt_text: result.altText,
          ai_description: result.description,
        }).eq('id', body.imageId);
      }

      return NextResponse.json(result);
    }
  } catch { /* fallback */ }

  return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
}
