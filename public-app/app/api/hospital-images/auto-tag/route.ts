/**
 * POST /api/hospital-images/auto-tag — Gemini Vision 으로 이미지 자동 태깅
 * body: { imageId?: string, imageUrl: string }
 * response: { tags: string[], altText: string, description: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@winaid/blog-core';
import { gateGuestRequest } from '../../../../lib/guestRateLimit';
import { callLLM } from '@winaid/blog-core';
import { resolveImageOwner } from '../../../../lib/serverAuth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const TAG_LIST = [
  '임플란트', '치아교정', '스케일링', '충치치료', '신경치료',
  '사랑니', '소아치과', '치아미백', '라미네이트', '틀니',
  '의료진', '병원내부', '상담', '수술', '장비',
  '진료실', '대기실', '외관', '로고', '일반',
].join(', ');

export async function POST(request: NextRequest) {
  const gate = gateGuestRequest(request, 100);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const owner = await resolveImageOwner(request);

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
        text: `병원 블로그 이미지 분류 전문가. 사용 가능 태그: ${TAG_LIST}`,
        cacheable: false,
      }],
      userPrompt: `이 이미지 URL 을 분석해서 태그를 추천하세요: ${body.imageUrl}

JSON 만 응답:
{"tags":["태그1","태그2"],"altText":"이미지 설명 1문장","description":"적합한 블로그 주제 1문장"}`,
      temperature: 0.3,
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

      // gateGuestRequest + 명시적 .eq('user_id', owner) 로 소유권 강제. RLS 우회.
      const db = supabaseAdmin ?? supabase;
      if (db && body.imageId) {
        await db.from('hospital_images').update({
          tags: result.tags,
          alt_text: result.altText,
          ai_description: result.description,
        }).eq('id', body.imageId).eq('user_id', owner);
      }

      return NextResponse.json(result);
    }
  } catch { /* fallback */ }

  return NextResponse.json({ tags: ['일반'], altText: '', description: '' });
}
