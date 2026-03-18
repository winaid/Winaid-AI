/**
 * contentQualityService — 콘텐츠 품질 검사 SOT
 *
 * AI 냄새 검사와 FactCheck 통합의 단일 출처.
 * geminiService.ts와 postProcessingService.ts에서 중복된 함수를 통합.
 *
 * 소비자: generateContentJob, postProcessingService, pressReleaseService 등
 */

import type { FactCheckReport } from '../types';
import { detectAiSmell } from '../utils/humanWritingPrompts';

// ── HTML → 텍스트 추출 ──

function stripHtmlToText(htmlContent: string): string {
  return htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── AI 냄새 검사 ──

export interface AiSmellResult {
  detected: boolean;
  patterns: string[];
  score: number;
  criticalIssues: string[];
  warningIssues: string[];
}

export function runAiSmellCheck(htmlContent: string): AiSmellResult {
  const textContent = stripHtmlToText(htmlContent);
  const result = detectAiSmell(textContent);

  const criticalIssues: string[] = [];
  const warningIssues: string[] = [];

  for (const pattern of result.patterns) {
    if (
      pattern.includes('허용: 0회') ||
      pattern.includes('절대 금지') ||
      pattern.includes('의료광고법') ||
      pattern.includes('금지!')
    ) {
      criticalIssues.push(pattern);
    } else {
      warningIssues.push(pattern);
    }
  }

  return { ...result, criticalIssues, warningIssues };
}

// ── FactCheck 통합 ──

export function integrateAiSmellToFactCheck(
  factCheck: FactCheckReport,
  aiSmellResult: AiSmellResult,
): FactCheckReport {
  const existingScore = factCheck.ai_smell_score || 0;
  const detectedScore = aiSmellResult.score;
  const finalScore = Math.max(existingScore, detectedScore);
  const criticalPenalty = aiSmellResult.criticalIssues.length * 5;
  const adjustedScore = Math.min(100, finalScore + criticalPenalty);

  const newIssues = [...(factCheck.issues || [])];
  const newRecommendations = [...(factCheck.recommendations || [])];

  for (const issue of aiSmellResult.criticalIssues) {
    if (!newIssues.includes(issue)) {
      newIssues.push(`🚨 ${issue}`);
    }
  }

  for (const warning of aiSmellResult.warningIssues.slice(0, 3)) {
    if (!newIssues.includes(warning)) {
      newIssues.push(`⚠️ ${warning}`);
    }
  }

  if (aiSmellResult.criticalIssues.length > 0) {
    newRecommendations.push('🚨 의료광고법 위반 표현 즉시 수정 필요');
  }
  if (adjustedScore > 15) {
    newRecommendations.push('AI 냄새 점수 15점 초과 - 문장 패턴 다양화 권장');
  }

  return {
    ...factCheck,
    ai_smell_score: adjustedScore,
    issues: newIssues,
    recommendations: newRecommendations,
  };
}

// ── 미계산 FactCheck 기본값 ──

/**
 * 보도자료 등 실시간 품질 검사를 아직 적용하지 않는 경로에서 사용.
 * 하드코딩 가짜 점수 대신 명시적으로 "미계산" 상태임을 표시.
 */
export function createPendingFactCheck(): FactCheckReport {
  return {
    fact_score: 0,
    safety_score: 0,
    conversion_score: 0,
    ai_smell_score: 0,
    verified_facts_count: 0,
    issues: [],
    recommendations: ['품질 점수 미계산 — 생성 후 AI 보정 기능으로 검사하세요'],
  };
}

/**
 * 생성된 HTML에 대해 실제 AI 냄새 검사를 수행하고 FactCheck를 반환.
 * pressReleaseService 등에서 가짜 점수 대신 사용.
 */
export function evaluateContentQuality(htmlContent: string): FactCheckReport {
  const aiSmellResult = runAiSmellCheck(htmlContent);
  const baseFactCheck = createPendingFactCheck();
  return integrateAiSmellToFactCheck(baseFactCheck, aiSmellResult);
}
