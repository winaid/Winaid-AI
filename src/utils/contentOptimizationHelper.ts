/**
 * 콘텐츠 최적화 헬퍼 함수
 * geminiService.ts에서 쉽게 사용할 수 있도록 통합된 인터페이스 제공
 */

import { optimizePrompt, estimateTokens } from './promptOptimizer';
import { generateHumanWritingPrompt } from './humanWritingPrompts';
import { contentCache } from './contentCache';
import type { ContentCategory } from '../types';

/**
 * 프롬프트 준비 (최적화 + 사람같은 글쓰기 규칙 추가)
 *
 * @example
 * const optimizedPrompt = prepareOptimizedPrompt(
 *   originalPrompt,
 *   'internal_medicine',
 *   'empathy'
 * );
 */
export function prepareOptimizedPrompt(
  originalPrompt: string,
  category?: ContentCategory,
  tone: 'empathy' | 'professional' | 'simple' | 'informative' = 'empathy'
): {
  prompt: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercentage: number;
} {
  // 1. 프롬프트 최적화
  const optimized = optimizePrompt(originalPrompt, {
    maxLength: 3000,
    removeExamples: false,
    compressInstructions: true
  });

  // 2. 사람같은 글쓰기 규칙 추가
  const humanRules = generateHumanWritingPrompt(category, tone);

  // 3. 결합
  const finalPrompt = optimized + '\n\n' + humanRules;

  // 4. 토큰 계산
  const originalTokens = estimateTokens(originalPrompt);
  const optimizedTokens = estimateTokens(finalPrompt);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);
  const savedPercentage = originalTokens > 0
    ? Math.round((savedTokens / originalTokens) * 100)
    : 0;

  console.log('📊 프롬프트 최적화 결과:');
  console.log(`  원본: ${originalTokens} 토큰`);
  console.log(`  최적화: ${optimizedTokens} 토큰`);
  console.log(`  절약: ${savedTokens} 토큰 (${savedPercentage}%)`);

  return {
    prompt: finalPrompt,
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercentage
  };
}

/**
 * 전체 워크플로우 (프롬프트 최적화 → AI 생성)
 *
 * @example
 * const workflow = createOptimizedWorkflow();
 *
 * // 1단계: 프롬프트 준비
 * const { prompt } = workflow.preparePrompt(originalPrompt, 'internal_medicine');
 *
 * // 2단계: AI 생성 (직접 호출)
 * const generated = await ai.generate(prompt);
 */
export function createOptimizedWorkflow() {
  const stats = {
    totalTokensSaved: 0
  };

  return {
    /**
     * 1단계: 프롬프트 준비
     */
    preparePrompt(
      originalPrompt: string,
      category?: ContentCategory,
      tone?: 'empathy' | 'professional' | 'simple' | 'informative'
    ) {
      const result = prepareOptimizedPrompt(originalPrompt, category, tone);
      stats.totalTokensSaved += result.savedTokens;
      return result;
    },

    /**
     * 통계 확인
     */
    getStats() {
      return {
        ...stats
      };
    }
  };
}

/**
 * 간단한 사용법 (한 번에 모두 처리)
 *
 * @example
 * const result = await optimizeAndGenerate(
 *   originalPrompt,
 *   (prompt) => ai.generate(prompt), // AI 생성 함수
 *   'internal_medicine'
 * );
 */
export async function optimizeAndGenerate<T>(
  originalPrompt: string,
  generateFn: (optimizedPrompt: string) => Promise<T>,
  category?: ContentCategory,
  tone?: 'empathy' | 'professional' | 'simple' | 'informative'
): Promise<{
  result: T;
  stats: {
    originalTokens: number;
    optimizedTokens: number;
    savedTokens: number;
  };
}> {
  // 1. 프롬프트 최적화
  const { prompt, originalTokens, optimizedTokens, savedTokens } = prepareOptimizedPrompt(
    originalPrompt,
    category,
    tone
  );

  // 2. AI 생성
  const result = await generateFn(prompt);

  return {
    result,
    stats: {
      originalTokens,
      optimizedTokens,
      savedTokens
    }
  };
}

/**
 * 캐시 확인 및 활용
 */
export async function getCachedOrGenerate<T>(
  cacheKey: string,
  generateFn: () => Promise<T>,
  ttlHours: number = 12
): Promise<T> {
  // 캐시에서 조회
  const cached = contentCache.get(cacheKey);
  if (cached) {
    console.log(`✅ Cache hit for: ${cacheKey}`);
    return cached as T;
  }
  
  // 캐시 미스 - 새로 생성
  console.log(`🔄 Cache miss for: ${cacheKey}, generating...`);
  const result = await generateFn();
  
  // 결과 캐싱 (TTL 적용)
  contentCache.set(cacheKey, result, { ttl: ttlHours * 60 * 60 * 1000 });
  
  return result;
}
