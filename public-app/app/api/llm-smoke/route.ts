/**
 * /api/llm-smoke — 개발 전용 smoke endpoint.
 *
 * 프로덕션(NODE_ENV === 'production') 에서는 404 반환. Phase 0 검증용.
 *
 * 사용법:
 *   GET /api/llm-smoke?task=refine_chat&text=안녕하세요&cache=1
 *
 *   cache=1 이면 systemBlocks 에 고정 문자열을 cacheable: true 로 주입한다.
 *   같은 요청을 두 번 보내면 두 번째 응답의 usage.cacheReadTokens 가 > 0 이어야 함.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@winaid/blog-core';
import type { CacheableBlock, LLMTaskKind } from '@winaid/blog-core';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const VALID_TASKS: readonly LLMTaskKind[] = [
  'blog_draft',
  'blog_section_regen',
  'blog_polish',
  'blog_seo',
  'blog_lawcheck',
  'blog_final',
  'press',
  'refine_auto',
  'refine_chat',
  'card_news',
  'style_learn',
  'score_crawled_post',
  'landing_chat',
  'search_ground',
];

/**
 * 캐시 검증용 고정 prefix (500자 안팎).
 * 실제 의료광고법 프롬프트 블록과 유사한 길이/구조로 작성해 cache hit 거동을 확인.
 */
const CACHE_PREFIX_TEXT = `[의료광고법 — 간결 버전]
- "최고/최초/유일/완치/100%/보장" 단정 금지
- "~하세요/~받으세요" 행동 유도 금지
- "전후 비교/체험기" 암시 금지
- 효과/결과 주장 금지 (대신 "도움이 될 수 있습니다" 식 완곡 표현)
- 타 병원과의 비교 금지
- 환자 개인정보 노출 금지

[응답 형식]
- 한국어 존댓말
- 2~3문장으로 간결하게
- 마크다운 없이 일반 텍스트로
- 의료적 사실 확신이 없으면 "상담을 권합니다" 로 마무리

[추가 가이드]
이 시스템 프롬프트는 동일 세션에서 여러 번 재사용될 수 있으므로
캐시(Anthropic prompt caching)로 재사용 시 비용이 90% 이상 절감됩니다.`;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const taskRaw = searchParams.get('task') || 'refine_chat';
  const text = searchParams.get('text') || '안녕하세요';
  const cache = searchParams.get('cache') === '1';

  if (!(VALID_TASKS as readonly string[]).includes(taskRaw)) {
    return NextResponse.json(
      { error: `invalid task "${taskRaw}". valid: ${VALID_TASKS.join(',')}` },
      { status: 400 },
    );
  }
  const task = taskRaw as LLMTaskKind;

  const systemBlocks: CacheableBlock[] = [
    {
      type: 'text',
      text: '너는 병원 콘텐츠를 다루는 AI 어시스턴트다. 의료광고법 준수가 최우선이다.',
    },
  ];
  if (cache) {
    systemBlocks.push({
      type: 'text',
      text: CACHE_PREFIX_TEXT,
      cacheable: true,
      cacheTtl: '5m',
    });
  }

  try {
    const resp = await callLLM({
      task,
      systemBlocks,
      userPrompt: text,
      temperature: 0.5,
      maxOutputTokens: 512,
      abortSignal: request.signal,
    });
    return NextResponse.json(resp);
  } catch (err) {
    const message = (err as Error).message || 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
