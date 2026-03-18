/**
 * contentQualityService — 콘텐츠 품질 검사 SOT
 *
 * AI 냄새 검사와 FactCheck 통합의 단일 출처.
 * geminiService.ts와 postProcessingService.ts에서 중복된 함수를 통합.
 *
 * 소비자: generateContentJob, postProcessingService, pressReleaseService 등
 */

import { Type } from '@google/genai';
import type { FactCheckReport } from '../types';
import { detectAiSmell } from '../utils/humanWritingPrompts';
import { callGemini } from './geminiClient';

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

// ── LLM 기반 AI 냄새 상세 분석 (postProcessingService.ts에서 이동) ──

/**
 * AI 냄새 상세 분석 함수 (LLM 기반)
 * 8~15점 경계선 구간에서 어디를 수정해야 하는지 구체적으로 알려줌
 *
 * 분석 항목:
 * ① 문장 리듬 단조로움 (0~25점)
 * ② 판단 단정형 글쓰기 (0~20점)
 * ③ 현장감 부재 (0~20점)
 * ④ 템플릿 구조 (0~15점)
 * ⑤ 가짜 공감 (0~10점)
 * ⑥ 행동 유도 실패 (0~10점)
 */
export const analyzeAiSmell = async (
  htmlContent: string,
  topic: string
): Promise<{
  total_score: number;
  sentence_rhythm: { score: number; issues: string[]; fix_suggestions: string[] };
  judgment_avoidance: { score: number; issues: string[]; fix_suggestions: string[] };
  lack_of_realism: { score: number; issues: string[]; fix_suggestions: string[] };
  template_structure: { score: number; issues: string[]; fix_suggestions: string[] };
  fake_empathy: { score: number; issues: string[]; fix_suggestions: string[] };
  cta_failure: { score: number; issues: string[]; fix_suggestions: string[] };
  priority_fixes: string[];
}> => {
  const currentYear = new Date().getFullYear();

  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  const prompt = `당신은 AI가 쓴 글과 사람이 쓴 글을 구분하는 전문가입니다.

📅 **오늘 날짜: ${todayStr}** (이것이 현재 시점입니다. 미래가 아닙니다!)

아래 블로그 글의 "AI 냄새"를 분석하고, 어디를 수정해야 하는지 구체적으로 알려주세요.

[분석 대상 글]
주제: "${topic}"
본문:
${htmlContent.substring(0, 8000)}

[중요]
🚨 의료광고법 준수 필수! - 수정 제안 시 절대 위반 금지! 🚨
[중요]

**fix_suggestions 작성 시 반드시 아래 규칙을 준수하세요:**

❌ **절대 금지 표현 (수정 제안에 포함하면 안 됨!):**
• "~이면 OO병입니다", "~이면 OO이 아닙니다" → 질병 단정 금지!
• "바로 OO과로 가세요", "당장 병원 가세요" → 직접적 병원 방문 권유 금지!
• "3일 이상이면 비염", "일주일 넘으면 폐렴" → 기간+질병 단정 금지!
• "확실히 ~입니다", "반드시 ~해야 합니다" → 단정적 표현 금지!

✅ **허용되는 대안 표현:**
• "~일 가능성이 높습니다" → "이런 패턴이 반복되는 경우가 있습니다"
• "바로 병원 가세요" → "변화를 기록해두는 것도 방법입니다"
• "3일이면 비염" → "며칠째 지속되는 경우도 있습니다"
• "반드시 ~해야" → "~하는 것도 하나의 방법입니다"

[중요]
🤖 AI 냄새 분석 기준 (총 100점 - 낮을수록 좋음!)
[중요]

---
① 문장 리듬 단조로움 (0~25점) ★ 가장 중요
---
체크 포인트:
• 동일 종결어미 3회 이상 반복 ("~습니다", "~있습니다" 연속) → +7점
• 문장 시작 패턴 3회 이상 반복 ("요즘", "많은 경우" 반복) → +6점
• 문단 길이가 너무 균일함 → +6점
• 질문·감탄·짧은 문장 없이 설명만 연속 → +6점
• '설명 문단 + 불릿포인트 리스트' 기계적 반복 → +5점
• 출처(심평원, 질병청, 과거 연도 등) 언급으로 문맥 끊김 → +4점

**수정 방향:**
✅ 불릿포인트 요약을 하나 삭제하고 대화체/Q&A 형식으로 변경
✅ 출처 언급 없이 자연스럽게 서술 (출처 표기 절대 금지)
✅ 구체적 연도 삭제 → '최근', '이번 겨울' 등으로 대체 (※ 참고: 현재 연도는 ${currentYear}년)

**issues에 실제 문제가 되는 문장/패턴을 구체적으로 적어주세요!**
예: "~수 있습니다"가 3번 연속 나옴 (문단 2)", "모든 문장이 '요즘'으로 시작"

---
② 판단 단정형 글쓰기 (0~20점)
---
체크 포인트:
• 한 문단에 조건/가능성 종결 3회 이상 ("~일 수 있습니다" 집중) → +8점
• 명확한 기준 없이 "확인 필요"만 반복 → +7점
• 글 전체에서 저자 의견/판단 0회 → +5점
• '단정하기 어렵고', '오해가 생기기 쉽습니다' 등 회피형 반복 → +4점

**수정 방향 (의료광고법 준수!):**
✅ '단정하기 어렵습니다' → '이런 경우엔 다른 원인도 생각해볼 수 있습니다'
✅ '~떠올리게 됩니다' → '한번 체크해보시는 게 좋겠어요'
✅ 가능성 나열 → '이 패턴이 반복되면 확인이 필요한 시점이에요'
⚠️ 주의: "~이면 OO병입니다" 같은 질병 단정은 절대 금지!

---
③ 현장감 부재 (0~20점)
---
체크 포인트:
• 시간/계절/상황 맥락 전무 → +7점
• 실제 질문/고민 시나리오 없음 → +7점
• 구체적 연도/날짜(${currentYear - 1}년, ${currentYear}년 10월 등) 삽입으로 이질감 → +5점
• 3인칭 관찰자('많은 경우', '어떤 경우에는') 시점만 존재 → +4점

**수정 방향:**
✅ 연도/날짜 삭제 → '최근 유행하는', '이번 겨울에는'으로 대체
✅ 구체적 상황 묘사 추가 (예: '회의 중에 기침이 터져서 곤란했던 적')
✅ 기관명(건강보험심사평가원 등)을 자연스럽게 순화

---
④ 템플릿 구조 (0~15점)
---
체크 포인트:
• 정의→원인→증상→치료 순서 그대로 → +6점
• 문단 간 전환어 없이 나열만 → +4점
• '서론-본론1(문단+리스트)-본론2(문단+리스트)-결론-CTA' 전형적 구조 → +4점
• 소제목에 이모지(🎯, 📌, ⚠️, ✅) 정형화 패턴 → +3점

**수정 방향:**
✅ 본론 중 한 부분은 리스트 없이 줄글로만 서술
✅ 소제목 이모지 제거하거나 질문형('감기일까요?')으로 변경
✅ 결론 문단 삭제하고 CTA에 핵심 메시지 통합

---
⑤ 가짜 공감 (0~10점)
---
체크 포인트:
• "걱정되실 수 있습니다" 류 범용 공감만 존재 → +4점
• 구체적 상황·감정 지목 없음 → +3점
• 공감 문장이 항상 문단 첫 줄에만 위치 → +3점
• '참 애매하게 시작될 때가 많아요' 같은 범용적 멘트 → +2점

**수정 방향:**
✅ '애매하죠?' → '자고 일어났는데 침 삼키기가 무섭다면' (구체적 고통)
✅ 감기 걸렸을 때의 짜증나는 감정 언급 (일 능률 저하, 약 기운 몽롱함 등)

---
⑥ 행동 유도 실패 (0~10점)
---
체크 포인트:
• 매번 동일한 CTA 문구로 종결 → +4점
• 시점·조건 없는 막연한 권유 → +3점
• 독자 상황별 분기 없음 → +3점
• '자가 판단으로는 정리가 안 될 수 있습니다' 같은 행동 유보 → +3점

**수정 방향 (의료광고법 준수!):**
✅ '확인' 대신 구체적 행동 권유: '체온 재보기', '수분 섭취 늘리기'
✅ '확인' 표현 반복 완화 (의료기관 유도 느낌 최소화):
   ❌ "확인해보세요", "확인이 필요합니다" 반복
   ❌ "기준을 세우다", "기준을 마련하다", "판단이 정리되다" (추상 명사 연결 금지)
   ✅ "상황을 한 번 정리해보는 것도 도움이 됩니다"
   ✅ "흐름을 한 번 정리해볼 시점일 수 있습니다"
   ※ '확인' 대체어: 정리, 살펴보기, 흐름 파악, 체크
🔥 권유 표현은 **마지막 소제목의 마지막 문단에서만 딱 한 번** 허용!
⚠️ 주의: "바로 OO과 가세요" 같은 직접적 병원 방문 권유는 절대 금지!

[중요]
⚠️ 분석 시 주의사항
[중요]

1. **issues**에는 실제 글에서 발견된 구체적인 문제점을 적어주세요
   - ❌ "문장 리듬이 단조로움" (너무 일반적)
   - ✅ "'~수 있습니다'가 2문단에서 4번 연속 사용됨" (구체적)

2. **fix_suggestions**에는 바로 적용할 수 있는 수정 제안을 적어주세요
   - ❌ "문장을 다양하게 써라" (너무 일반적)
   - ✅ "2문단 3번째 '~수 있습니다'를 '~인 경우도 있더라고요'로 변경" (구체적)
   - 🚨 의료광고법 위반 표현(질병 단정, 병원 방문 권유)은 절대 포함 금지!

3. **priority_fixes**에는 가장 점수가 높은 항목부터 우선 수정 사항을 적어주세요

JSON 형식으로 응답해주세요.`;

  try {
    const result = await callGemini({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'json',
      schema: {
        type: Type.OBJECT,
        properties: {
          total_score: { type: Type.INTEGER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } },
          priority_fixes: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["total_score", "issues", "priority_fixes"]
      },
      timeout: 60000,
    });

    const convertedResult = {
      total_score: result.total_score || 0,
      sentence_rhythm: { score: 0, issues: result.issues || [], fix_suggestions: [] },
      judgment_avoidance: { score: 0, issues: [], fix_suggestions: [] },
      lack_of_realism: { score: 0, issues: [], fix_suggestions: [] },
      template_structure: { score: 0, issues: [], fix_suggestions: [] },
      fake_empathy: { score: 0, issues: [], fix_suggestions: [] },
      cta_failure: { score: 0, issues: [], fix_suggestions: [] },
      priority_fixes: result.priority_fixes || []
    };

    console.log('🤖 AI 냄새 분석 완료:', convertedResult.total_score, '점');
    return convertedResult;
  } catch (error) {
    console.error('AI 냄새 분석 실패:', error);
    return {
      total_score: 0,
      sentence_rhythm: { score: 0, issues: ['분석 실패'], fix_suggestions: [] },
      judgment_avoidance: { score: 0, issues: [], fix_suggestions: [] },
      lack_of_realism: { score: 0, issues: [], fix_suggestions: [] },
      template_structure: { score: 0, issues: [], fix_suggestions: [] },
      fake_empathy: { score: 0, issues: [], fix_suggestions: [] },
      cta_failure: { score: 0, issues: [], fix_suggestions: [] },
      priority_fixes: ['AI 냄새 분석 중 오류가 발생했습니다.']
    };
  }
};

// ── LLM 기반 AI 냄새 재검사 (postProcessingService.ts에서 이동) ──

/**
 * AI 냄새 재검사 함수 (수동 재생성 후 사용)
 * 패턴 매칭(규칙 기반) + LLM 분석을 통합하여 FactCheckReport 반환
 */
export const recheckAiSmell = async (htmlContent: string): Promise<FactCheckReport> => {
  console.log('🔄 AI 냄새 재검사 시작...');

  // 🔍 먼저 detectAiSmell() 기반 즉시 검사 실행 (빠른 패턴 매칭)
  const quickCheck = runAiSmellCheck(htmlContent);
  console.log('🔍 빠른 패턴 검사 결과:', {
    score: quickCheck.score,
    critical: quickCheck.criticalIssues.length,
    warning: quickCheck.warningIssues.length
  });

  // 치명적 문제가 있으면 바로 경고
  if (quickCheck.criticalIssues.length > 0) {
    console.warn('🚨 치명적 AI 냄새 패턴 발견 (즉시 수정 필요):', quickCheck.criticalIssues);
  }

  // HTML에서 텍스트만 추출
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';

  const prompt = `
당신은 의료 블로그 콘텐츠 품질 검사 전문가입니다.
아래 블로그 글을 분석하여 팩트 체크 리포트를 작성해주세요.

[검사 대상 글]
${textContent}

[검사 항목]

1. **팩트 정확성 (fact_score)**: 0~100점
- 의학적으로 검증된 정보인가?
- 출처가 명확한가?
- 과장되거나 잘못된 정보는 없는가?

2. **의료법 안전성 (safety_score)**: 0~100점
- 치료 효과를 단정하지 않는가?
- 병원 방문을 직접 권유하지 않는가?
- 자가 진단을 유도하지 않는가?

3. **전환력 점수 (conversion_score)**: 0~100점
- 의료법을 준수하면서도 자연스럽게 행동을 유도하는가?
- CTA가 강요가 아닌 제안 형태인가?

**4. AI 냄새 점수 (ai_smell_score)**: 0~100점 (낮을수록 좋음)
- 문장 리듬이 단조로운가? (0~25점)
- 판단 단정형 글쓰기가 반복되는가? (0~20점)
- 현장감이 부족한가? (0~20점)
- 템플릿 구조가 뚜렷한가? (0~15점)
- 가짜 공감 표현이 있는가? (0~10점)
- 행동 유도가 실패했는가? (0~10점)

**AI 냄새 점수 계산:**
= 문장 리듬(25) + 판단 단정(20) + 현장감 부재(20) + 템플릿 구조(15) + 가짜 공감(10) + CTA 실패(10)

**평가 기준:**
- 0~20점: 사람 글 수준 ✅
- 21~40점: 경계선 (부분 수정 권장) ⚠️
- 41점 이상: AI 냄새 강함 (재작성 필요) ❌

5. **검증된 팩트 개수 (verified_facts_count)**: 숫자
- 글에서 검증 가능한 의학 정보의 개수

6. **문제점 (issues)**: 배열
- 발견된 문제점들을 구체적으로 나열

7. **개선 제안 (recommendations)**: 배열
- 구체적인 개선 방법 제안

JSON 형식으로 응답해주세요.`;

  try {
    const result = await callGemini({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'json',
      schema: {
        type: Type.OBJECT,
        properties: {
          fact_check: {
            type: Type.OBJECT,
            properties: {
              fact_score: { type: Type.INTEGER },
              verified_facts_count: { type: Type.INTEGER },
              safety_score: { type: Type.INTEGER },
              conversion_score: { type: Type.INTEGER },
              ai_smell_score: { type: Type.INTEGER },
              issues: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["fact_score", "safety_score", "conversion_score", "ai_smell_score", "verified_facts_count", "issues", "recommendations"]
          }
        },
        required: ["fact_check"]
      },
      timeout: 60000,
    });
    console.log('✅ AI 냄새 재검사 완료:', result.fact_check);

    // 🔍 detectAiSmell() 결과와 AI 분석 결과 통합
    let factCheck: FactCheckReport = result.fact_check;
    factCheck = integrateAiSmellToFactCheck(factCheck, quickCheck);

    // AI 냄새 상세 분석 추가 (모든 점수에서 상세 분석 제공)
    const aiSmellScore = factCheck.ai_smell_score || 0;
    console.log(`• 통합 AI 냄새 점수: ${aiSmellScore}점 (패턴 검사 + AI 분석)`);

    try {
      const detailedAnalysis = await analyzeAiSmell(textContent, '');
      factCheck.ai_smell_analysis = detailedAnalysis;
      console.log('✅ AI 냄새 상세 분석 완료:', detailedAnalysis.total_score, '점');
    } catch (analysisError) {
      console.error('⚠️ AI 냄새 상세 분석 실패:', analysisError);
    }

    return factCheck;
  } catch (error) {
    console.error('❌ AI 냄새 재검사 실패:', error);
    throw new Error('AI 냄새 재검사 중 오류가 발생했습니다.');
  }
};
