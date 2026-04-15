/**
 * AEO/GEO 진단 — AI 플랫폼 노출 가능성 예측
 *
 * 6 카테고리 점수를 조합해 4개 플랫폼(ChatGPT/Gemini/Perplexity/Copilot)에 대해
 * likelihood(high|medium|low) 와 한국어 reason 을 만든다. 순수 함수.
 */

import type { CategoryScore, AIVisibility, AIPlatform } from './types';

function scoreOf(categories: CategoryScore[], id: string): number {
  const c = categories.find(x => x.id === id);
  return c ? c.score : 0;
}

function bucket(value: number, highThreshold: number, mediumThreshold: number): 'high' | 'medium' | 'low' {
  if (value >= highThreshold) return 'high';
  if (value >= mediumThreshold) return 'medium';
  return 'low';
}

function likelihoodLabel(l: 'high' | 'medium' | 'low'): string {
  return l === 'high' ? '높음' : l === 'medium' ? '보통' : '낮음';
}

interface Rule {
  platform: AIPlatform;
  compute: (cats: CategoryScore[]) => { score: number; reason: string; likelihood: 'high' | 'medium' | 'low' };
}

const RULES: Rule[] = [
  {
    platform: 'ChatGPT',
    compute: (cats) => {
      const s1 = scoreOf(cats, 'site_structure');
      const s2 = scoreOf(cats, 'content_quality');
      const score = Math.round((s1 + s2) / 2);
      const l = bucket(score, 70, 45);
      const reason = `ChatGPT/OpenAI 크롤러는 사이트 구조와 본문 품질을 주로 평가합니다. 사이트 구조 ${s1}점, 콘텐츠 품질 ${s2}점의 평균은 ${score}점으로 노출 가능성은 ${likelihoodLabel(l)}입니다.`;
      return { score, reason, likelihood: l };
    },
  },
  {
    platform: 'Gemini',
    compute: (cats) => {
      const s1 = scoreOf(cats, 'structured_data');
      const s2 = scoreOf(cats, 'security_tech');
      const score = Math.round((s1 + s2) / 2);
      const l = bucket(score, 65, 40);
      const reason = `Gemini(Google 생태계) 는 구조화 데이터와 기술 신호를 중시합니다. 구조화 데이터 ${s1}점, 보안·기술 ${s2}점의 평균 ${score}점으로 노출 가능성은 ${likelihoodLabel(l)}입니다.`;
      return { score, reason, likelihood: l };
    },
  },
];

export function predictAIVisibility(categories: CategoryScore[]): AIVisibility[] {
  return RULES.map(r => {
    const { reason, likelihood } = r.compute(categories);
    return { platform: r.platform, likelihood, reason };
  });
}
