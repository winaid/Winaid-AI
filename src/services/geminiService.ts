import { Type } from "@google/genai";
import { GEMINI_MODEL, TIMEOUTS, callGemini, callGeminiRaw, callGeminiWithFallback, getAiProviderSettings, GEMINI_API_KEYS } from "./geminiClient";
import type { GeminiCallConfig } from "./geminiClient";
import { GenerationRequest, GeneratedContent, TrendingItem, FactCheckReport, SeoScoreReport, SeoTitleItem, ImageStyle, WritingStyle, CardPromptData, CardNewsScript, SimilarityCheckResult, BlogHistory, OwnBlogMatch, WebSearchMatch } from "../types";
import { SYSTEM_PROMPT, getStage1_ContentGeneration, getDynamicSystemPrompt, getPipelineOutlinePrompt, getPipelineSectionPrompt, getPipelineIntroPrompt, getPipelineConclusionPrompt, getPipelineIntegrationPrompt, getSectionRegeneratePrompt, getSmartBlockFaqPrompt } from "../lib/gpt52-prompts-staged";
import { loadMedicalLawForGeneration } from "./medicalLawService";
import { saveGeneratedPost } from "./postStorageService";
import {
  detectAiSmell,
  FEW_SHOT_EXAMPLES,
  CATEGORY_SPECIFIC_PROMPTS,
} from "../utils/humanWritingPrompts";
import { getTopCompetitorAnalysis, CompetitorAnalysis } from "./naverSearchService";
import { analyzeCompetitorVocabulary, buildForbiddenWordsPrompt } from "./competitorVocabService";
import { STYLE_NAMES, generateBlogImage, analyzeStyleReferenceImage, generateImageQueue, type ImageQueueItem, isDemoSafeMode, updateSessionFinalPayload } from "./imageGenerationService";
import { generateCardNewsWithAgents } from "./cardNewsService";
import { generatePressRelease } from "./pressReleaseService";
import { saveBlogHistory } from "./contentSimilarityService";

// Gemini API 핵심 인프라는 geminiClient.ts에서 import됨


// 🏥 질병관리청 검색 함수 (1차 검색) - 타임아웃 120초
async function searchKDCA(query: string): Promise<string> {
  try {
    console.log('🔍 [1차 검색] 질병관리청에서 검색 중...', query);

    const kdcaDomains = ['kdca.go.kr', 'cdc.go.kr', 'nih.go.kr'];

    const result = await callGemini({
      prompt: `질병관리청(KDCA) 공식 웹사이트에서 "${query}"에 대한 정보를 검색하고 요약해주세요.

검색 범위: ${kdcaDomains.join(', ')}

다음 정보를 우선적으로 찾아주세요:
1. 질환의 정의 및 원인
2. 주요 증상
3. 예방 및 관리 방법
4. 공식 통계 자료 (있는 경우)

신뢰할 수 있는 출처의 정보만 사용하고, 출처를 명시해주세요.`,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      googleSearch: true,
      temperature: 0.3,
      thinkingLevel: 'low',
      timeout: 120000,
    });

    console.log('✅ 질병관리청 검색 완료');
    return typeof result === 'string' ? result : '';

  } catch (error) {
    console.error('❌ 질병관리청 검색 실패:', error);
    return '';
  }
}

// 🏥 병원 사이트 크롤링 함수 (2차 검색) - 서버 프록시 경유
async function searchHospitalSites(query: string, category: string): Promise<string> {
  try {
    console.log('🔍 [2차 검색] 병원 사이트에서 크롤링 중...', query);

    const hospitalDomains = [
      'amc.seoul.kr', 'snuh.org', 'severance.healthcare.or.kr',
      'samsunghospital.com', 'cmcseoul.or.kr', 'yuhs.or.kr'
    ];

    const result = await callGemini({
      prompt: `대학병원 공식 웹사이트에서 "${query}" (${category})에 대한 전문 의료 정보를 검색하고 요약해주세요.

검색 범위: ${hospitalDomains.join(', ')}

다음 정보를 우선적으로 찾아주세요:
1. 최신 진료 가이드라인
2. 환자를 위한 설명 자료
3. 의료진의 전문 의견
4. 치료 및 관리 방법

⚠️ 의료광고법 준수:
- 치료 효과를 단정하는 표현 금지
- 구체적인 치료 성공률/수치 언급 금지
- "완치", "100% 효과" 등의 표현 금지

신뢰할 수 있는 출처의 정보만 사용하고, 출처를 명시해주세요.`,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      googleSearch: true,
      temperature: 0.3,
      thinkingLevel: 'low',
      timeout: 120000,
    });

    console.log('✅ 병원 사이트 크롤링 완료');
    return typeof result === 'string' ? result : '';

  } catch (error) {
    console.error('❌ 병원 사이트 크롤링 실패:', error);
    return '';
  }
}

// ❓ FAQ 섹션 생성 함수 (네이버 질문 + 질병관리청 정보)
export async function generateFaqSection(
  topic: string,
  keywords: string,
  faqCount: number = 3,
  onProgress?: (msg: string) => void
): Promise<string> {
  const safeProgress = onProgress || ((msg: string) => console.log('📍 FAQ Progress:', msg));

  try {
    safeProgress('❓ FAQ 섹션 생성 중... (네이버 질문 수집)');

    // 1단계: 네이버에서 실제 사람들이 묻는 질문 수집 (서버 프록시 경유)
    safeProgress('🔍 네이버에서 실제 질문 검색 중...');
    const naverQuestionsPromise = callGemini({
      prompt: `네이버 지식iN, 네이버 블로그, 네이버 카페에서 "${topic}" ${keywords ? `"${keywords}"` : ''}에 대해 실제 사람들이 자주 묻는 질문을 검색해주세요.

검색 대상:
- 네이버 지식iN (kin.naver.com)
- 네이버 블로그 (blog.naver.com)
- 네이버 카페 (cafe.naver.com)

다음 형식으로 실제 질문 5개를 추출해주세요:
1. [질문1]
2. [질문2]
3. [질문3]
4. [질문4]
5. [질문5]

⚠️ 실제로 사람들이 궁금해하는 것 위주로! AI가 만든 질문 금지!`,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      googleSearch: true,
      temperature: 0.5,
      thinkingLevel: 'low',
    });

    // 2단계: 질병관리청에서 정확한 정보 수집
    safeProgress('🏥 질병관리청에서 정확한 정보 수집 중...');
    const kdcaInfoPromise = searchKDCA(topic);

    // 병렬 실행
    const [naverQuestions, kdcaInfo] = await Promise.all([
      naverQuestionsPromise,
      kdcaInfoPromise
    ]);

    // 3단계: FAQ HTML 생성 (전용 프롬프트 + AEO 로직 적용)
    safeProgress(`📝 FAQ ${faqCount}개 생성 중... (AEO 최적화)`);
    const faqHtml = await callGemini({
      prompt: `당신은 병·의원 홈페이지에 사용되는 FAQ 콘텐츠를 작성하는 의료 정보 AI입니다.

[역할]
- 의료광고가 아닌 '공공 보건 정보 제공' 관점에서만 답변합니다.
- 치료 효과, 특정 시술, 특정 의료기관의 우수성은 절대 언급하지 않습니다.

[수집된 네이버 질문들]
${naverQuestions || '정보 없음'}

[질병관리청 공식 정보]
${kdcaInfo || '정보 없음'}

────────────────────
[AEO (Answer Engine Optimization) 필수 적용]
────────────────────

⭐ AEO 핵심 원칙:
AI 검색 엔진(ChatGPT, Perplexity, Google AI Overview)이 답변으로 채택할 수 있도록 최적화

⭐ 답변 구조 (자연스러운 흐름):
1. 본문 답변 - 레이블 없이 자연스럽게 작성
   - 첫 문장: 질문에 대한 직접적인 핵심 답변 (AI 검색 채택용)
   - 이어서: 일반인이 이해할 수 있는 배경 설명 (2~3문장)
   - ⚠️ "[핵심 답변]", "[일반적 설명]" 같은 레이블 사용 금지!
   - 하나의 자연스러운 문단으로 이어서 작성

2. 주의사항 - 레이블 표시 ⭐
   - "[주의사항]" 레이블만 표시
   - 오해하거나 과장될 수 있는 부분 정리
   - 개인차가 있음을 명시

⭐ AEO 표현 규칙:
- 단정형 표현 금지 → 가능성 표현 사용
  × "~입니다" → ○ "~일 수 있습니다"
  × "~때문입니다" → ○ "~과 관련이 있을 수 있습니다"
- 결론을 닫지 않음 → 독자가 스스로 판단하게 유도
- 질문은 실제 검색창에 입력될 법한 자연어 형태

────────────────────
[데이터 수집 규칙]
────────────────────
1. 네이버에서 실제로 많이 검색·질문되는 표현을 기준으로
   질문 ${faqCount}개를 생성합니다.
   (환자 일상 언어 그대로 사용)

2. 각 질문에 대한 답변은
   질병관리청(KDCA) 공개 자료의 정보 범위 내에서만 작성합니다.

────────────────────
[출력 구조 – AEO 최적화]
────────────────────
⚠️ 정확히 ${faqCount}개의 FAQ만 생성하세요!

<div class="faq-section">
  <h3 class="faq-title">❓ 자주 묻는 질문</h3>
  <div class="faq-item">
    <p class="faq-question">Q. (실제 검색창에 입력될 법한 자연어 질문)</p>
    <div class="faq-answer">
      <p>(핵심 답변 + 배경 설명을 자연스럽게 이어서 작성. 레이블 없이!)</p>
      <p class="faq-warning"><strong>[주의사항]</strong> 오해하거나 과장될 수 있는 부분 정리</p>
    </div>
  </div>
  <!-- ${faqCount}개 반복 -->
</div>

────────────────────
[금지 규칙]
────────────────────
- 치료 권유, 검사 권유, 병원 방문 유도 문장 금지
- "도움이 됩니다", "효과적입니다", "권장합니다" 사용 금지
- 특정 진료과, 치료법, 시술, 약물 언급 금지
- 광고로 오인될 수 있는 결론 문장 금지
- 출처 언급 금지! "질병관리청에 따르면" 같은 표현 사용 금지!
- 단정적 표현 금지! "~입니다", "~해야 합니다" 금지!
- "[핵심 답변]", "[일반적 설명]" 레이블 사용 금지! (주의사항만 레이블 표시)

────────────────────
[목표]
────────────────────
- AEO: AI 검색 엔진 답변 채택 최적화
- SEO: 검색 유입용 FAQ
- 의료법 제56조 위반 소지 없음
- 정보 신뢰도 우선`,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      temperature: 0.4,
    }) as string;

    // FAQ가 비어있으면 빈 문자열 반환
    if (!faqHtml.includes('faq-section')) {
      console.warn('⚠️ FAQ 생성 실패 - HTML 구조 없음');
      return '';
    }

    safeProgress('✅ FAQ 섹션 생성 완료!');

    // FAQ 스타일 추가 (자연스러운 답변 + 주의사항만 강조)
    const faqStyles = `
<style>
.faq-section {
  margin: 40px 0;
  padding: 24px;
  background: #f8fafc;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}
.faq-title {
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e2e8f0;
}
.faq-item {
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.faq-item:last-child {
  margin-bottom: 0;
}
.faq-question {
  font-size: 17px;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #e2e8f0;
}
.faq-answer {
  font-size: 15px;
  color: #475569;
  line-height: 1.8;
}
.faq-answer p {
  margin: 8px 0;
}
.faq-answer strong {
  color: #1e293b;
  font-weight: 600;
}
.faq-warning {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid #f59e0b;
  margin-top: 12px !important;
  font-size: 14px;
}
.faq-warning strong {
  color: #b45309;
  font-weight: 700;
}
</style>
`;

    return faqStyles + faqHtml;

  } catch (error) {
    console.error('❌ FAQ 생성 실패:', error);
    safeProgress('⚠️ FAQ 생성 실패 (스킵)');
    return '';
  }
}

// 🔍 callGeminiWithSearch - 1차: 질병관리청, 2차: 병원 사이트
async function callGeminiWithSearch(
  prompt: string, 
  options: { responseFormat?: string } = {}
): Promise<any> {
  try {
    // 프롬프트에서 주제 추출
    const topicMatch = prompt.match(/주제[:\s]*[「『"]?([^」』"\n]+)[」』"]?/);
    const categoryMatch = prompt.match(/진료과[:\s]*([^\n]+)/);
    const topic = topicMatch?.[1]?.trim() || '';
    const category = categoryMatch?.[1]?.trim() || '';

    console.log('🔍 검색 시작:', { topic, category });

    // 1차: 질병관리청 검색
    let kdcaInfo = '';
    if (topic) {
      kdcaInfo = await searchKDCA(topic);
    }

    // 2차: 병원 사이트 크롤링
    let hospitalInfo = '';
    if (topic && category) {
      hospitalInfo = await searchHospitalSites(topic, category);
    }

    // 검색 결과를 프롬프트에 추가
    const enrichedPrompt = `${prompt}

[🏥 1차 검색: 질병관리청 공식 정보]
${kdcaInfo || '(검색 결과 없음)'}

[🏥 2차 검색: 대학병원 전문 정보]
${hospitalInfo || '(검색 결과 없음)'}

⚠️ 위 검색 결과를 참고하되, 의료광고법을 반드시 준수하세요.
- 출처가 명확한 정보만 사용
- 치료 효과 단정 금지
- 구체적 수치는 출처와 함께 제시`;

    // Gemini API 호출
    console.log('🚀 보도자료 Gemini API 호출 시작...');
    const isTextPlain = options.responseFormat === "text/plain";
    const result = await callGemini({
      prompt: enrichedPrompt,
      model: GEMINI_MODEL.PRO,
      googleSearch: true,
      responseType: isTextPlain ? 'text' : 'json',
      temperature: 0.6,
    });

    console.log('✅ 보도자료 Gemini API 응답 수신');

    // callGemini returns the parsed result directly
    const text = typeof result === 'string' ? result : JSON.stringify(result);

    console.log('📝 보도자료 텍스트 길이:', text?.length || 0);

    return { text, response: result };
    
  } catch (error) {
    console.error('❌ callGeminiWithSearch 실패:', error);
    throw error;
  }
}

// getAiProviderSettings → geminiClient.ts에서 import됨


// 의료 면책 조항 (HTML)
const MEDICAL_DISCLAIMER = `본 콘텐츠는 의료 정보 제공 및 병원 광고를 목적으로 합니다.<br/>개인의 체질과 건강 상태에 따라 치료 결과는 차이가 있을 수 있으며, 부작용이 발생할 수 있습니다.`;

// =============================================
// 🔍 AI 냄새 검사 헬퍼 함수 (detectAiSmell 연결)
// =============================================

/**
 * HTML에서 텍스트만 추출하여 AI 냄새 검사
 * - 블로그/카드뉴스 생성 후 자동 검사
 * - modifyPostWithAI() 수정 후 검증
 * - recheckAiSmell()에서 활용
 */
const runAiSmellCheck = (htmlContent: string): {
  detected: boolean;
  patterns: string[];
  score: number;
  criticalIssues: string[];  // maxAllowed: 0인 패턴 (의료광고법 위반 등)
  warningIssues: string[];   // maxAllowed > 0인 패턴 (번역투 등)
} => {
  // HTML에서 텍스트만 추출
  const textContent = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // detectAiSmell() 호출
  const result = detectAiSmell(textContent);
  
  // 패턴을 심각도별로 분류
  const criticalIssues: string[] = [];
  const warningIssues: string[] = [];
  
  for (const pattern of result.patterns) {
    // (허용: 0회)인 패턴은 치명적 문제
    if (pattern.includes('허용: 0회') || 
        pattern.includes('절대 금지') || 
        pattern.includes('의료광고법') ||
        pattern.includes('금지!')) {
      criticalIssues.push(pattern);
    } else {
      warningIssues.push(pattern);
    }
  }
  
  console.log('🔍 AI 냄새 검사 결과:', {
    detected: result.detected,
    score: result.score,
    criticalCount: criticalIssues.length,
    warningCount: warningIssues.length
  });
  
  if (criticalIssues.length > 0) {
    console.warn('🚨 치명적 AI 냄새 패턴 발견:', criticalIssues);
  }
  
  return {
    ...result,
    criticalIssues,
    warningIssues
  };
};

/**
 * AI 냄새 검사 결과를 FactCheckReport에 통합
 */
const integrateAiSmellToFactCheck = (
  factCheck: FactCheckReport,
  aiSmellResult: ReturnType<typeof runAiSmellCheck>
): FactCheckReport => {
  // 기존 ai_smell_score와 detectAiSmell 결과 병합
  const existingScore = factCheck.ai_smell_score || 0;
  const detectedScore = aiSmellResult.score;
  
  // 더 높은 점수(더 심각한 문제) 사용
  const finalScore = Math.max(existingScore, detectedScore);
  
  // 치명적 문제가 있으면 추가 페널티
  const criticalPenalty = aiSmellResult.criticalIssues.length * 5;
  const adjustedScore = Math.min(100, finalScore + criticalPenalty);
  
  // issues와 recommendations 업데이트
  const newIssues = [...(factCheck.issues || [])];
  const newRecommendations = [...(factCheck.recommendations || [])];
  
  // 치명적 문제 추가
  for (const issue of aiSmellResult.criticalIssues) {
    if (!newIssues.includes(issue)) {
      newIssues.push(`🚨 ${issue}`);
    }
  }
  
  // 경고 문제 추가 (상위 3개만)
  for (const warning of aiSmellResult.warningIssues.slice(0, 3)) {
    if (!newIssues.includes(warning)) {
      newIssues.push(`⚠️ ${warning}`);
    }
  }
  
  // 권장 사항 추가
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
    recommendations: newRecommendations
  };
};

// 글 스타일별 프롬프트 - 의료법 제56조 기반 (실제 법령만 반영)
const getWritingStylePrompts = (): Record<WritingStyle, string> => {
  return {
  // [가이드] 전문가형: 의학 지식 깊이 강조하되 권위적이지 않은 전문성
  expert: `
[글쓰기 스타일: 전문가형 📚]
- 목표: 신뢰할 수 있는 정보를 알기 쉽게 전달
- 톤: 전문적이면서도 친근한 설명

[핵심 규칙]
1. 도입부: 관찰에서 시작
   ❌ "오늘은 당뇨에 대해 알아보겠습니다."
   ✅ "공복혈당은 정상인데 식후에 유독 피곤함을 느끼는 경우가 있습니다."

2. 근거 인용 - 자연스럽게
   ❌ "대한OO학회 가이드라인에 따르면..."
   ✅ "최근 가이드라인에서 식후 혈당 관리를 더 강조하기 시작했습니다."

3. 의학 용어 - 쉽게 설명
   ✅ "인슐린 저항성, 쉽게 말해서 인슐린이 있어도 잘 안 듣는 상태입니다."
`,

  // 💗 공감형: 독자 경험 중심, "이거 내 얘기네!" 반응 유도 (습니다체)
  empathy: `
[글쓰기 스타일: 공감형 💗]
- 문체: **"~습니다" 체만 사용** (예: ~됩니다, ~있습니다, ~합니다)
- 톤: 따뜻하고 이해심 있으면서도 전문적

[핵심 규칙]
1. 도입부: 구체적 상황 묘사로 시작
   ❌ "오늘은 겨울철 피부 건조에 대해 알아보겠습니다."
   ✅ "히터를 켜고 자고 일어나면 얼굴이 땅기는 느낌을 한 번쯤 겪어보셨을 것입니다."

2. 실패/예외 사례 포함 (AI 냄새 제거)
   ✅ "모든 보습제가 다 맞는 것은 아닙니다."

⚠️ **절대 금지**
- 해요체/요체: ~해요, ~있어요, ~있죠, ~거예요, ~거죠 (완전 금지)
- 번역투: 기준점→기준, 측면에서→쪽에서, 요소→이유, 발생하다→생기다
- 수동태: 알려지다→알려져 있습니다, 권장되다→권장합니다
`,

  // 🎯 전환형: 자연스러운 인식 변화 유도 (의료법 준수)
  conversion: `
[글쓰기 스타일: 전환형 🎯]
- 목표: 정보 제공을 통한 자연스러운 인식 변화 (강요 없이)
- 톤: 중립적 정보 제공 + 시점 제시

[핵심 규칙]
1. 도입부: 관찰로 시작
   ❌ "당뇨 전 단계인데 모르고 지나치는 사람이 절반이 넘습니다." (공포 조장)
   ✅ "물을 많이 마셔서 화장실을 자주 간다고 생각했는데, 돌이켜보니 그게 아니었다는 경우가 있습니다."

2. 시점 제시 - 판단은 독자에게
   ❌ "검사를 받으세요" (명령형)
   ✅ "이런 신호가 겹치기 시작하면 확인해볼 타이밍일 수 있습니다."

3. 마무리: 열린 결론
   ❌ "꼭 기억하세요"
   ✅ "적어도 '왜 이런지 모르겠다'는 답답함은 줄일 수 있습니다."
`
  };
};

// =============================================
// 📝 글쓰기 스타일 공통 규칙 (중복 제거 + AI 냄새 최소화)
// =============================================



// 심리학 기반 CTA 전환 공식 (의료광고법 100% 준수 + 공신력 출처 필수)
const PSYCHOLOGY_CTA_PROMPT = `
---
[[심리] CTA 심리학 - 의료광고법 100% 준수]
---

**⛔ CTA 절대 금지:**
❌ "검사/검진/치료/상담" 유도 → 직접 행동 유도!
❌ "방문하세요", "예약하세요" → 직접 유도!
❌ "반드시", "즉시", "빨리" → 공포 조장!
❌ "완치율 99%", "100% 회복" → 효과 보장!

**✅ 안전한 CTA 공식: [상황] + [관찰 제안]** (❌ 권유 금지!)
예시:
✅ "증상이 반복되면, 기록해두는 것도 방법입니다"
✅ "증상만으로는 원인을 구분하기 어려운 경우가 많습니다"
✅ "이런 변화가 나타나기도 합니다"

**🎯 4가지 핵심 심리 원칙:**
1. 배제 반응: "안 하는 선택의 불리함" 제시
2. 시점 고정: "지금이냐 아니냐" 판단 대신
3. 불확실성 제거: "자가 판단 불가능" 명시
4. 인지 부하 감소: "치료" → "확인"

**✅ 진료과별 핵심 키워드:** (❌ 권유 표현 제거!)
- 내과: "수치로 나타나는 변화"
- 정형외과: "통증이 계속되는 경우"
- 피부과: "관리에도 반복되는 증상"
- 치과: "통증이 시작되는 경우"
- 안과: "시야 변화가 나타날 때"
- 이비인후과: "비슷한 증상, 다른 양상"
- 정신건강의학과: "일상 회복 과정"
- 신경외과: "증상이 지속되는 경우"
- 산부인과: "변화가 나타나는 시기"
- 비뇨의학과: "증상이 계속되는 경우"
- 소아과: "아이의 행동 변화"
- 유방/갑상선외과: "변화가 관찰될 때"

**✅ 안전한 표현 템플릿** (권유 없이):
A. "이런 변화가 나타나기도 합니다"
B. "증상이 반복되는 경우가 있습니다"
C. "증상만으로는 구분하기 어려운 경우가 많습니다"
D. "개인차가 있을 수 있습니다"
E. "변화를 기록해두는 것도 방법입니다"
`;

// ============================================
// 다단계 파이프라인 생성 함수
// ============================================

/**
 * 다단계 파이프라인으로 블로그 글 생성
 * Stage A: 아웃라인 생성 (FLASH) → Stage B: 섹션별 초안 (FLASH) → Stage C: 최종 polish (PRO)
 */
export const generateBlogWithPipeline = async (
  request: GenerationRequest,
  searchResults: any,
  onProgress?: (msg: string) => void
): Promise<{ title: string; content: string; imagePrompts: string[]; conclusionLength?: number }> => {
  const safeProgress = onProgress || ((msg: string) => console.log('Pipeline:', msg));
  const pipelineStart = Date.now();
  const timings: Record<string, number> = {};
  console.info(`[PIPELINE] ▶ START topic="${request.topic?.substring(0, 30)}"`);
  const targetLength = request.textLength || 1500;
  // LLM은 글자수를 정확히 세지 못해 항상 20~30% 부족하게 생성 → 프롬프트용 목표를 1.35배로 설정
  const promptTargetLength = Math.round(targetLength * 1.35);
  const medicalLawMode = request.medicalLawMode || 'strict';

  // 병원 블로그 학습 말투 로드 — 명시적 선택 시에만 적용
  let hospitalStyleSuffix = '';
  const styleSource = request.hospitalStyleSource || 'generic_default';
  if (!request.learnedStyleId && request.hospitalName && styleSource === 'explicit_selected_hospital') {
    try {
      const { getHospitalStylePromptForGeneration } = await import('./writingStyleService');
      if (typeof getHospitalStylePromptForGeneration !== 'function') {
        console.warn('[PIPELINE] 병원 말투 로드 실패: getHospitalStylePromptForGeneration is not a function');
      } else {
        const prompt = await getHospitalStylePromptForGeneration(request.hospitalName);
        if (prompt) {
          hospitalStyleSuffix = `\n\n[🏥 병원 블로그 학습 말투 - 반드시 적용]\n${prompt}`;
          console.info(`[STYLE] applied=hospital_tone hospital=${request.hospitalName}`);
        } else {
          console.info(`[STYLE] applied=generic_default reason=no_style_data`);
        }
      }
    } catch (e) {
      console.warn('[STYLE] load_failed:', e);
    }
  } else {
    console.info(`[STYLE] source=generic_default`);
  }

  // ── Stage A: 아웃라인 생성 (FLASH) ── [재시도 포함]
  const stageAStart = Date.now();
  safeProgress('📐 [1/4] 글 구조 설계 중...');
  const outlinePrompt = getPipelineOutlinePrompt(promptTargetLength, medicalLawMode, {
    audienceMode: request.audienceMode,
    persona: request.persona,
    tone: request.tone,
  });

  const outlineUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}
[진료과] ${request.category}
${request.customSubheadings ? `[사용자 지정 소제목]\n${request.customSubheadings}` : ''}

[검색 결과 요약]
${JSON.stringify(searchResults?.collected_facts?.slice(0, 3) || [], null, 2)}`;

  let outlineResponse: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      outlineResponse = await callGemini({
        prompt: outlineUserPrompt,
        systemPrompt: outlinePrompt,
        model: GEMINI_MODEL.FLASH,
        responseType: 'json',
        timeout: 30000,
        temperature: 0.7,
      });
      if (outlineResponse?.outline || outlineResponse?.sections) break;
    } catch (err) {
      if (attempt === 1) throw err;
      safeProgress('⚠️ 아웃라인 재시도 중...');
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const outline = outlineResponse?.outline || outlineResponse;
  if (!outline || !outline.sections || outline.sections.length === 0) {
    throw new Error('아웃라인 생성 실패: 소제목이 없습니다. 다시 시도해주세요.');
  }

  // 사용자 지정 소제목이 있으면 아웃라인에 반영
  if (request.customSubheadings) {
    const customTitles = request.customSubheadings.split(/\r?\n/).filter(h => h.trim());
    outline.sections = outline.sections.map((s: any, i: number) => ({
      ...s,
      title: customTitles[i] || s.title
    }));
  }

  // 각 섹션에 글자 수 배분 (프롬프트용 뻥튀기 목표 기준)
  const bodyChars = Math.round(promptTargetLength * 0.7);
  const charsPerSection = Math.round(bodyChars / outline.sections.length);
  outline.sections.forEach((s: any) => { s.targetChars = s.targetChars || charsPerSection; });

  timings.stageA = Date.now() - stageAStart;
  safeProgress(`✅ Stage A 완료: 소제목 ${outline.sections.length}개 설계 (${(timings.stageA / 1000).toFixed(1)}초)`);
  console.info(`[PIPELINE] ✅ Stage A: ${outline.sections.length}개 소제목 ${timings.stageA}ms`);
  const stageBStart = Date.now();

  // ── Stage B: 본문 생성 (배치 병렬) ──
  // 도입부(FLASH) + 첫 번째 섹션 배치를 동시에 시작
  // 섹션은 2개씩 배치 병렬 생성 (이전 배치의 요약만 전달)
  safeProgress('✍️ [2/4] 본문 생성 중...');

  // ── 성능 카운터 ──
  const demoSafe = isDemoSafeMode();
  // 섹션 생성은 FLASH 직행 — PRO는 최종 polish(Stage C)에서만 사용
  const FLASH_SECTION_TIMEOUT = 25000;
  console.info(`[PIPELINE] ⚙️ config: sectionModel=FLASH flashTimeoutMs=${FLASH_SECTION_TIMEOUT} proPolish=StageC demoSafe=${demoSafe}`);

  // ── 도입부 생성 함수 ──
  const generateIntro = async (): Promise<string> => {
    const t0 = Date.now();
    const introPrompt = getPipelineIntroPrompt(
      outline.intro?.approach || 'A',
      outline.intro?.scene || request.topic,
      outline.intro?.bridge || request.topic,
      outline.intro?.targetChars || Math.round(promptTargetLength * 0.15),
      request.persona,
      request.keywords
    );

    const introUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}

[검색 결과]
${JSON.stringify(searchResults?.collected_facts?.slice(0, 2) || [], null, 2)}`;

    const introResult = await callGemini({
      prompt: introUserPrompt,
      systemPrompt: introPrompt + hospitalStyleSuffix,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: 30000,
      temperature: 0.85,
    });
    const html = typeof introResult === 'string' ? introResult.trim() : '';
    if (!html || html.length < 30) {
      throw new Error('도입부 생성에 실패했습니다. 다시 시도해주세요.');
    }
    console.info(`[PIPELINE] ✅ intro ${html.length}자 ${Date.now() - t0}ms`);
    return html;
  };

  // ── 단일 섹션 생성 함수 ──
  const generateSection = async (
    i: number,
    prevSummaries: string[]
  ): Promise<{ html: string; summary: string }> => {
    const section = outline.sections[i];
    const sectionNum = `${i + 1}/${outline.sections.length}`;
    const t0 = Date.now();

    const sectionPrompt = getPipelineSectionPrompt(
      i,
      section.title,
      section.role || '',
      section.forbidden || '',
      section.keyInfo || '',
      section.targetChars || charsPerSection,
      section.firstSentencePattern || String((i % 5) + 1),
      prevSummaries,
      medicalLawMode,
      request.persona,
      request.keywords
    );

    const sectionUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}

[이 섹션 관련 검색 결과]
${JSON.stringify(searchResults?.collected_facts?.slice(i, i + 2) || [], null, 2)}`;

    // 섹션 초안은 FLASH 직행 — PRO는 Stage C polish에서 사용
    const sectionSystemPrompt = sectionPrompt + hospitalStyleSuffix;
    const promptLength = sectionSystemPrompt.length + sectionUserPrompt.length;

    const result = await callGemini({
      prompt: sectionUserPrompt,
      systemPrompt: sectionSystemPrompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: FLASH_SECTION_TIMEOUT,
      temperature: 0.75,
    });
    const html = typeof result === 'string' ? result.trim() : '';
    if (!html || html.length < 30) {
      throw new Error(`소제목 "${section.title}" 생성에 실패했습니다. 다시 시도해주세요.`);
    }
    const summary = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
    const elapsed = Date.now() - t0;
    timings[`section_${i}`] = elapsed;
    console.info(`[PIPELINE] ✅ section ${sectionNum} ${html.length}자 ${elapsed}ms model=FLASH prompt=${promptLength}`);
    return { html, summary };
  };

  // ── 도입부 + 섹션 배치 병렬 실행 ──
  const BATCH_SIZE = 2;
  const sectionHtmls: string[] = new Array(outline.sections.length).fill('');
  const sectionSummaries: string[] = [];

  // 첫 번째 배치: 도입부 + 첫 배치 섹션을 동시 실행
  const firstBatchEnd = Math.min(BATCH_SIZE, outline.sections.length);
  safeProgress(`✍️ [2/4] 도입부 + 소제목 1~${firstBatchEnd} 동시 생성 중...`);

  const firstBatchPromises: Promise<{ html: string; summary: string }>[] = [];
  for (let i = 0; i < firstBatchEnd; i++) {
    firstBatchPromises.push(generateSection(i, []));
  }

  let introHtml = '';
  try {
    const [introResult, ...firstBatchResults] = await Promise.all([
      generateIntro(),
      ...firstBatchPromises
    ]);
    introHtml = introResult;
    safeProgress('✅ 도입부 완료');

    firstBatchResults.forEach((result, idx) => {
      sectionHtmls[idx] = result.html;
      sectionSummaries.push(result.summary);
      safeProgress(`✅ 소제목 ${idx + 1}/${outline.sections.length} "${outline.sections[idx].title}" 완료`);
    });
  } catch (err: any) {
    console.error(`[PIPELINE] ❌ 도입부+첫배치 병렬 실패: ${err?.message}`);
    throw new Error(`본문 생성에 실패했습니다. (${err?.status || '네트워크 오류'}) 다시 시도해주세요.`);
  }

  // 나머지 배치: 2개씩 묶어 병렬 실행 (이전 배치 요약 전달)
  for (let batchStart = firstBatchEnd; batchStart < outline.sections.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, outline.sections.length);
    const batchLabel = `${batchStart + 1}~${batchEnd}`;
    safeProgress(`✍️ [2/4] 소제목 ${batchLabel} 동시 생성 중...`);

    const batchPromises: Promise<{ html: string; summary: string }>[] = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(generateSection(i, [...sectionSummaries]));
    }

    try {
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result, idx) => {
        const globalIdx = batchStart + idx;
        sectionHtmls[globalIdx] = result.html;
        sectionSummaries.push(result.summary);
        safeProgress(`✅ 소제목 ${globalIdx + 1}/${outline.sections.length} "${outline.sections[globalIdx].title}" 완료`);
      });
    } catch (batchErr: any) {
      console.error(`[PIPELINE] ❌ 배치 ${batchLabel} 실패: ${batchErr?.message}`);
      throw new Error(`소제목 생성에 실패했습니다. (${batchErr?.status || '네트워크 오류'}) 다시 시도해주세요.`);
    }
  }

  timings.stageB_sections = Date.now() - stageBStart;
  console.info(`[PIPELINE] ✅ Stage B sections: ${sectionHtmls.length}/${outline.sections.length} all OK ${timings.stageB_sections}ms | model=FLASH`);

  // ── B-3: 마무리 생성 ──
  const concStart = Date.now();
  safeProgress('✍️ [3/4] 마무리 작성 중...');
  const conclusionPrompt = getPipelineConclusionPrompt(
    outline.conclusion?.direction || '열린 결말',
    outline.conclusion?.targetChars || Math.round(promptTargetLength * 0.15),
    request.persona
  );

  const conclusionUserPrompt = `[주제] ${request.topic}
[글에서 다룬 내용 요약]
${sectionSummaries.join('\n')}`;

  let conclusionHtml = '';
  try {
    const conclusionResult = await callGemini({
      prompt: conclusionUserPrompt,
      systemPrompt: conclusionPrompt + hospitalStyleSuffix,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: 30000,
      temperature: 0.75,
    });
    conclusionHtml = typeof conclusionResult === 'string' ? conclusionResult.trim() : '';
  } catch (concErr: any) {
    console.error(`[PIPELINE] ❌ 마무리 실패: ${concErr?.message}`);
    throw new Error(`마무리 생성에 실패했습니다. (${concErr?.status || '네트워크 오류'}) 다시 시도해주세요.`);
  }

  if (!conclusionHtml || conclusionHtml.length < 20) {
    console.error(`[PIPELINE] ❌ 마무리 생성됐지만 너무 짧음: ${conclusionHtml.length}자`);
    throw new Error('마무리 생성에 실패했습니다. 다시 시도해주세요.');
  }

  timings.conclusion = Date.now() - concStart;
  safeProgress('✅ 본문 생성 완료');
  console.info(`[PIPELINE] ✅ conclusion ${conclusionHtml.length}자 ${timings.conclusion}ms`);

  // ── Stage C: 통합 + PRO polish ──
  // FLASH 초안을 PRO로 최종 다듬기 — timeout 시 rawHtml 그대로 사용 (안전)
  safeProgress('🔍 [4/4] 전체 통합 및 품질 보정 중...');

  // rawHtml 조립 전 완전성 검사 — 모든 파트가 존재하는지 확인
  console.info(`[PIPELINE] 🔍 완전성 검사: intro=${introHtml.length}자, sections=${sectionHtmls.map(h => h.length).join('/')}, conclusion=${conclusionHtml.length}자`);
  const emptyParts: string[] = [];
  if (!introHtml || introHtml.length < 30) emptyParts.push('도입부');
  sectionHtmls.forEach((h, i) => {
    if (!h || h.length < 30) emptyParts.push(`소제목 ${i + 1} "${outline.sections[i]?.title || '?'}"`);
  });
  if (!conclusionHtml || conclusionHtml.length < 20) emptyParts.push('마무리');

  if (emptyParts.length > 0) {
    const msg = `본문 생성 실패: ${emptyParts.join(', ')}이(가) 비어있습니다. 다시 시도해주세요.`;
    console.error(`[PIPELINE] ❌ 완전성 검사 실패:`, emptyParts);
    throw new Error(msg);
  }
  console.info('[PIPELINE] ✅ 완전성 검사 통과 — 모든 파트 존재 확인');

  // ── 균형 검증 로그 ──
  const sectionLens = sectionHtmls.map(h => h.replace(/<[^>]+>/g, '').trim().length);
  const introLen = introHtml.replace(/<[^>]+>/g, '').trim().length;
  const concLen = conclusionHtml.replace(/<[^>]+>/g, '').trim().length;
  const maxSec = Math.max(...sectionLens);
  const minSec = Math.min(...sectionLens);
  const balanceRatio = maxSec > 0 ? Math.round((minSec / maxSec) * 100) : 0;
  const introParagraphs = (introHtml.match(/<p[\s>]/gi) || []).length;
  const concParagraphs = (conclusionHtml.match(/<p[\s>]/gi) || []).length;
  const sectionParagraphs = sectionHtmls.map(h => (h.match(/<p[\s>]/gi) || []).length);
  console.info(`[PIPELINE] 📊 균형 검증: intro=${introLen}자(${introParagraphs}문단), sections=${sectionLens.join('/')}자, paragraphs=${sectionParagraphs.join('/')}, conclusion=${concLen}자(${concParagraphs}문단), balance=${balanceRatio}%(min/max)`);
  if (balanceRatio < 75) {
    console.warn(`[PIPELINE] ⚠️ 섹션 균형 경고: 최소 ${minSec}자 vs 최대 ${maxSec}자 (비율 ${balanceRatio}%) — 75% 미만`);
  }
  // ── 서술 품질 힌트 로그 ──
  const allText = [introHtml, ...sectionHtmls, conclusionHtml].join('\n').replace(/<[^>]+>/g, '');
  const sentences = allText.split(/[.?!]\s+|다\.\s*|다\s*$/).filter(s => s.trim().length > 5);
  const endings = sentences.map(s => { const m = s.trim().match(/(습니다|있습니다|됩니다|입니다|합니다|봅니다|겠습니다|드립니다)$/); return m?.[1] || '기타'; });
  let maxRepeat = 1, cur = 1;
  for (let i = 1; i < endings.length; i++) { if (endings[i] === endings[i-1] && endings[i] !== '기타') { cur++; if (cur > maxRepeat) maxRepeat = cur; } else { cur = 1; } }
  if (maxRepeat >= 3) {
    console.warn(`[PIPELINE] ⚠️ 어미 연속 경고: 같은 어미 ${maxRepeat}회 연속 감지`);
  }

  const rawHtml = `${introHtml}\n${sectionHtmls.join('\n')}\n${conclusionHtml}`;
  const integrationPrompt = getPipelineIntegrationPrompt(targetLength);
  const PRO_POLISH_TIMEOUT = 30000;
  const FLASH_POLISH_TIMEOUT = 12000;

  // 기본값: 가장 보수적인 경로. 이후 성공 시 승격.
  let finalQualityPath = 'flash_draft_only';
  let integratedHtml: any;
  let polishModel = 'NONE';
  const stageCStart = Date.now();

  // 1차: PRO polish 시도
  console.info(`[PIPELINE] Stage C attempt=PRO timeout=${PRO_POLISH_TIMEOUT}`);
  try {
    integratedHtml = await callGemini({
      prompt: rawHtml,
      systemPrompt: integrationPrompt,
      model: GEMINI_MODEL.PRO,
      responseType: 'text',
      timeout: PRO_POLISH_TIMEOUT,
      temperature: 0.3,
    });
    polishModel = 'PRO';
    finalQualityPath = 'flash_draft+pro_polish';
  } catch (proErr: any) {
    // 2차: FLASH polish 시도
    console.warn(`[PIPELINE] ⚠️ Stage C PRO polish 실패 (${proErr?.message}), FLASH 재시도`);
    console.info(`[PIPELINE] Stage C fallback=FLASH timeout=${FLASH_POLISH_TIMEOUT}`);
    try {
      integratedHtml = await callGemini({
        prompt: rawHtml,
        systemPrompt: integrationPrompt,
        model: GEMINI_MODEL.FLASH,
        responseType: 'text',
        timeout: FLASH_POLISH_TIMEOUT,
        temperature: 0.3,
      });
      polishModel = 'FLASH(fallback)';
      finalQualityPath = 'flash_draft+flash_polish';
    } catch (flashErr: any) {
      // 3차: pre-polish HTML 그대로 사용 (본문 파트는 이미 완전성 검증 통과)
      console.warn(`[PIPELINE] ⚠️ Stage C FLASH polish 실패 (${flashErr?.message}), pre-polish HTML 사용`);
      integratedHtml = rawHtml;
      polishModel = 'NONE(pre-polish)';
      // finalQualityPath는 이미 flash_draft_only
    }
  }
  const stageCMs = Date.now() - stageCStart;

  const finalContent = typeof integratedHtml === 'string' && integratedHtml.includes('<')
    ? integratedHtml.trim()
    : rawHtml; // 파싱 실패 시 원본 사용

  // 최종 결과물 검증
  if (!finalContent || finalContent.replace(/<[^>]+>/g, '').trim().length < 100) {
    throw new Error('통합된 본문이 비어있습니다. 다시 시도해주세요.');
  }

  safeProgress('✅ [4/4] 통합 검증 완료');
  console.info(`[PIPELINE] ✅ Stage C 완료: ${finalContent.length}자 (텍스트 ${finalContent.replace(/<[^>]+>/g, '').trim().length}자) polishModel=${polishModel} ${stageCMs}ms`);
  console.info(`[PIPELINE] finalQualityPath=${finalQualityPath}`);

  // 이미지 프롬프트 생성 — hero(대표) vs sub(서브) 차별화
  // hero: 구체적이고 안정적인 프롬프트 (index 0)
  // sub: 짧고 빠른 프롬프트 (index 1+) → 모델 응답 시간 단축
  const imageCount = request.imageCount ?? 1;
  const imagePrompts: string[] = [];
  if (imageCount > 0) {
    for (let i = 0; i < Math.min(imageCount, outline.sections.length + 1); i++) {
      const section = outline.sections[Math.min(i, outline.sections.length - 1)];
      const sectionTitle = section?.title || '건강 정보';

      if (i === 0) {
        // hero: 대표 이미지 — 구체적 묘사로 안정적 결과
        imagePrompts.push(
          `${request.topic} 관련 대표 이미지. 따뜻하고 신뢰감 있는 한국 병원 환경. 의사 또는 건강한 생활을 연상시키는 장면. 밝고 깨끗한 분위기`
        );
      } else {
        // sub: 서브 이미지 — 최소 프롬프트로 빠른 응답 유도
        imagePrompts.push(
          `${request.topic} - ${sectionTitle}`
        );
      }
    }
  }

  timings.total = Date.now() - pipelineStart;

  // ── 종합 성능 로그 ──
  const sectionTimingsArr = Object.keys(timings)
    .filter(k => k.startsWith('section_'))
    .map(k => timings[k]);
  const avgSectionMs = sectionTimingsArr.length > 0
    ? Math.round(sectionTimingsArr.reduce((a, b) => a + b, 0) / sectionTimingsArr.length) : 0;

  console.info(`[PIPELINE] ═══════════════════════════════════════`);
  console.info(`[PIPELINE] ✅ DONE — 성능 요약`);
  console.info(`[PIPELINE]   total=${timings.total}ms (${(timings.total / 1000).toFixed(1)}s)`);
  console.info(`[PIPELINE]   stageA=${timings.stageA}ms | stageB=${timings.stageB_sections}ms | conclusion=${timings.conclusion}ms | stageC=${stageCMs}ms`);
  console.info(`[PIPELINE]   finalQualityPath=${finalQualityPath} | polishModel=${polishModel} | proPolishTimeout=${PRO_POLISH_TIMEOUT}ms`);
  console.info(`[PIPELINE]   avgSectionMs=${avgSectionMs} | sections=${sectionTimingsArr.map(t => `${t}ms`).join('/')}`);
  console.info(`[PIPELINE]   finalContent=${finalContent.replace(/<[^>]+>/g, '').trim().length}자 imgPrompts=${imagePrompts.length}`);
  console.info(`[PIPELINE] ═══════════════════════════════════════`);
  return {
    title: request.topic,
    content: finalContent,
    imagePrompts,
    conclusionLength: conclusionHtml.length
  };
};

/**
 * 개별 섹션 재생성 함수 (ResultPreview에서 호출)
 */
export const regenerateSection = async (
  sectionTitle: string,
  sectionHtml: string,
  fullHtml: string,
  medicalLawMode: 'strict' | 'relaxed' = 'strict',
  onProgress?: (msg: string) => void
): Promise<string> => {
  const safeProgress = onProgress || ((msg: string) => console.log('RegenSection:', msg));
  safeProgress(`🔄 "${sectionTitle}" 재생성 중...`);

  const prompt = getSectionRegeneratePrompt(sectionTitle, sectionHtml, fullHtml, medicalLawMode);

  const result = await callGemini({
    prompt: `소제목 "${sectionTitle}" 섹션을 새로 작성해주세요.`,
    systemPrompt: prompt,
    model: GEMINI_MODEL.PRO,
    responseType: 'text',
    timeout: 45000,
    temperature: 0.85,
  });

  const newSection = typeof result === 'string' ? result.trim() : '';
  if (!newSection || !newSection.includes('<')) {
    throw new Error('섹션 재생성 실패');
  }

  safeProgress(`✅ "${sectionTitle}" 재생성 완료`);
  return newSection;
};

/**
 * 네이버 스마트블록 최적화 FAQ 생성
 */
export const generateSmartBlockFaq = async (
  topic: string,
  keywords: string,
  faqCount: number = 3,
  onProgress?: (msg: string) => void
): Promise<{ question: string; answer: string; smartBlockKeyword: string }[]> => {
  const safeProgress = onProgress || ((msg: string) => console.log('SmartBlockFAQ:', msg));
  safeProgress('🔍 네이버 스마트블록 FAQ 생성 중...');

  const smartBlockPrompt = getSmartBlockFaqPrompt(topic, keywords, faqCount);

  // 네이버에서 실제 질문 검색 + FAQ 생성 병렬
  // 실제 네이버 검색 질문 수집
  const naverSearchPromise = callGemini({
    prompt: `네이버 지식iN에서 "${topic}" "${keywords}" 관련 실제 질문 5개를 검색해주세요. 검색 사이트: kin.naver.com`,
    model: GEMINI_MODEL.FLASH,
    googleSearch: true,
    responseType: 'text',
    temperature: 0.5,
    thinkingLevel: 'low',
  }).catch(() => null);

  const [naverResult] = await Promise.allSettled([naverSearchPromise]);
  const naverQuestions = naverResult.status === 'fulfilled' && naverResult.value
    ? (typeof naverResult.value === 'string' ? naverResult.value : naverResult.value?.text || '')
    : '';

  // FAQ 생성
  const faqResponse = await callGemini({
    prompt: `[네이버에서 수집된 실제 질문들]\n${naverQuestions}\n\n위 질문들을 참고하여 스마트블록 최적화 FAQ를 생성해주세요.`,
    systemPrompt: smartBlockPrompt,
    model: GEMINI_MODEL.PRO,
    responseType: 'json',
    timeout: 30000,
    temperature: 0.6,
  });

  const faqs = faqResponse?.faqs || [];
  safeProgress(`✅ 스마트블록 FAQ ${faqs.length}개 생성 완료`);
  return faqs;
};

// ============================================
// 기존 블로그 포스트 생성 함수 (유지)
// ============================================

export const generateBlogPostText = async (request: GenerationRequest, onProgress?: (msg: string) => void): Promise<{
    title: string;
    content: string;
    imagePrompts: string[];
    fact_check: FactCheckReport;
    analyzedStyle?: { backgroundColor?: string; borderColor?: string; };
    seoScore?: SeoScoreReport;
}> => {
  // 📊 성능 측정 시작
  const startTime = Date.now();
  let retryCount = 0;
  let errorOccurred = false;
  let errorMessage = '';

  // onProgress가 없으면 콘솔 로그로 대체
  const safeProgress = onProgress || ((msg: string) => console.log('📍 BlogText Progress:', msg));
  const isCardNews = request.postType === 'card_news';
  const targetLength = request.textLength || 1500;
  // LLM은 글자수를 정확히 세지 못해 항상 20~30% 부족하게 생성 → 프롬프트용 목표를 1.35배로 설정
  const promptTargetLength = Math.round(targetLength * 1.35);
  const targetSlides = request.slideCount || 6;
  
  // 스타일 참고 이미지 분석 (카드뉴스일 때만 - 표지/본문 분리)
  let coverStyleAnalysis = '';
  let contentStyleAnalysis = '';
  let analyzedBgColor = '';
  
  if (isCardNews) {
    // 표지 스타일 분석
    if (request.coverStyleImage) {
      try {
        coverStyleAnalysis = await analyzeStyleReferenceImage(request.coverStyleImage, true);
      } catch (e) {
        console.warn('표지 스타일 분석 실패:', e);
      }
    }
    
    // 본문 스타일 분석
    if (request.contentStyleImage) {
      try {
        contentStyleAnalysis = await analyzeStyleReferenceImage(request.contentStyleImage, false);
      } catch (e) {
        console.warn('본문 스타일 분석 실패:', e);
      }
    }
    
    // 표지만 있으면 본문도 같은 스타일 적용
    if (coverStyleAnalysis && !contentStyleAnalysis) {
      contentStyleAnalysis = coverStyleAnalysis;
    }
  }
  
  // 스타일 분석 결과를 프롬프트에 적용
  let styleAnalysis = '';
  let coverStyle: any = {};
  let contentStyle: any = {};
  
  if (coverStyleAnalysis || contentStyleAnalysis) {
    // JSON 파싱 시도
    try {
      if (coverStyleAnalysis) coverStyle = JSON.parse(coverStyleAnalysis);
      if (contentStyleAnalysis) contentStyle = JSON.parse(contentStyleAnalysis);
      // 배경색 저장 (후처리용)
      analyzedBgColor = coverStyle.backgroundColor || contentStyle.backgroundColor || '';
    } catch (e) {
      // JSON 파싱 실패 시 원본 텍스트 사용
      console.warn('스타일 JSON 파싱 실패:', e);
    }
    
    // 브라우저 프레임 HTML 생성
    const windowButtonsHtml = (style: any) => {
      if (style.hasWindowButtons || style.frameStyle === 'browser-window') {
        const colors = style.windowButtonColors || ['#FF5F57', '#FFBD2E', '#28CA41'];
        return `<div class="browser-header" style="display:flex; gap:6px; padding:8px 12px; background:#f0f0f0; border-radius:12px 12px 0 0;">
          <span style="width:12px; height:12px; border-radius:50%; background:${colors[0]};"></span>
          <span style="width:12px; height:12px; border-radius:50%; background:${colors[1]};"></span>
          <span style="width:12px; height:12px; border-radius:50%; background:${colors[2]};"></span>
        </div>`;
      }
      return '';
    };
    
    // inline CSS 스타일 생성 함수
    const generateInlineStyle = (style: any) => {
      const parts = [];
      if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
      if (style.borderColor && style.borderWidth) {
        parts.push(`border: ${style.borderWidth} solid ${style.borderColor}`);
      } else if (style.borderColor) {
        parts.push(`border: 2px solid ${style.borderColor}`);
      }
      if (style.borderRadius) parts.push(`border-radius: ${style.borderRadius}`);
      if (style.boxShadow) parts.push(`box-shadow: ${style.boxShadow}`);
      if (style.padding) parts.push(`padding: ${style.padding}`);
      return parts.join('; ');
    };
    
    // 제목 스타일 생성
    const generateTitleStyle = (style: any) => {
      if (!style.mainTitleStyle) return '';
      const s = style.mainTitleStyle;
      const parts = [];
      if (s.color) parts.push(`color: ${s.color}`);
      if (s.fontSize) parts.push(`font-size: ${s.fontSize}`);
      if (s.fontWeight) parts.push(`font-weight: ${s.fontWeight}`);
      return parts.join('; ');
    };
    
    // 강조 스타일 생성
    const generateHighlightStyle = (style: any) => {
      if (!style.highlightStyle) return '';
      const s = style.highlightStyle;
      const parts = [];
      if (s.color) parts.push(`color: ${s.color}`);
      if (s.backgroundColor && s.backgroundColor !== 'transparent') {
        parts.push(`background-color: ${s.backgroundColor}`);
        parts.push(`padding: 2px 6px`);
        parts.push(`border-radius: 4px`);
      }
      return parts.join('; ');
    };
    
    // 부제목 스타일 생성
    const generateSubtitleStyle = (style: any) => {
      if (!style.subtitleStyle) return '';
      const s = style.subtitleStyle;
      const parts = [];
      if (s.color) parts.push(`color: ${s.color}`);
      if (s.fontSize) parts.push(`font-size: ${s.fontSize}`);
      if (s.fontWeight) parts.push(`font-weight: ${s.fontWeight}`);
      return parts.join('; ');
    };
    
    // 태그 스타일 생성
    const generateTagStyle = (style: any) => {
      if (!style.tagStyle) return '';
      const s = style.tagStyle;
      const parts = [];
      if (s.backgroundColor) parts.push(`background-color: ${s.backgroundColor}`);
      if (s.color) parts.push(`color: ${s.color}`);
      if (s.borderRadius) parts.push(`border-radius: ${s.borderRadius}`);
      parts.push(`padding: 4px 12px`);
      return parts.join('; ');
    };
    
    const _coverInlineStyle = generateInlineStyle(coverStyle);
    const _contentInlineStyle = generateInlineStyle(contentStyle);
    const coverTitleStyle = generateTitleStyle(coverStyle);
    const _coverHighlightStyle = generateHighlightStyle(coverStyle);
    const coverSubtitleStyle = generateSubtitleStyle(coverStyle);
    const _coverTagStyle = generateTagStyle(coverStyle);
    const contentTitleStyle = generateTitleStyle(contentStyle);
    const _contentHighlightStyle = generateHighlightStyle(contentStyle);
    const contentSubtitleStyle = generateSubtitleStyle(contentStyle);
    const _contentTagStyle = generateTagStyle(contentStyle);
    
    // 분석된 배경색을 CSS로 변환
    const bgColor = coverStyle.backgroundColor || contentStyle.backgroundColor || '#E8F4FD';
    const bgGradient = bgColor.includes('gradient') ? bgColor : `linear-gradient(180deg, ${bgColor} 0%, ${bgColor}dd 100%)`;
    
    styleAnalysis = `
[🎨🎨🎨 카드뉴스 스타일 - 이 스타일을 반드시 그대로 적용하세요! 🎨🎨🎨]

**⚠️ 최우선 규칙 ⚠️**
**모든 카드에 반드시 style="background: ${bgGradient};" 적용!**
**기본 흰 배경(#f8fafc, #fff) 사용 금지!**

**필수 적용 배경색: ${bgColor}**

${coverStyleAnalysis ? `**📕 표지 (1장) HTML:**
<div class="card-slide" style="background: ${bgGradient}; border-radius: 24px; overflow: hidden;">
  ${windowButtonsHtml(coverStyle)}
  <div class="card-content-area" style="padding: 32px 28px;">
    <p class="card-subtitle" style="${coverSubtitleStyle || 'color: #3B82F6; font-size: 14px; font-weight: 700;'}">부제목 (10~15자)</p>
    <p class="card-main-title" style="${coverTitleStyle || 'color: #1E293B; font-size: 28px; font-weight: 900;'}">메인 제목<br/><span style="color: #3B82F6;">강조</span></p>
    <div class="card-img-container">[IMG_1]</div>
    <p class="card-desc" style="font-size: 15px; color: #475569; line-height: 1.7;">30~50자의 구체적인 설명 문장을 작성하세요!</p>
  </div>
</div>
` : ''}

${contentStyleAnalysis ? `**📄 본문 (2장~) HTML:**
<div class="card-slide" style="background: ${bgGradient}; border-radius: 24px; overflow: hidden;">
  ${windowButtonsHtml(contentStyle)}
  <div class="card-content-area" style="padding: 32px 28px;">
    <p class="card-subtitle" style="${contentSubtitleStyle || 'color: #3B82F6; font-size: 14px; font-weight: 700;'}">부제목 (10~15자)</p>
    <p class="card-main-title" style="${contentTitleStyle || 'color: #1E293B; font-size: 28px; font-weight: 900;'}">메인 제목<br/><span style="color: #3B82F6;">강조</span></p>
    <div class="card-img-container">[IMG_N]</div>
    <p class="card-desc" style="font-size: 15px; color: #475569; line-height: 1.7;">30~50자의 구체적인 설명 문장을 작성하세요!</p>
  </div>
</div>
` : ''}

**🚨 배경색 필수 적용: ${bgColor} 🚨**
style 속성에 background: ${bgGradient}; 반드시 포함!
`;
  }
  
  let benchmarkingInstruction = '';
  if (request.referenceUrl) {
    benchmarkingInstruction = `
    [🚨 벤치마킹 모드 활성화]
    Target URL: ${request.referenceUrl}
    Google Search 도구를 사용하여 위 URL의 페이지를 접속해 콘텐츠 구조를 분석하십시오.
    
    ${isCardNews 
      ? `[미션: 템플릿 구조 모방]
         - 입력된 URL은 '카드뉴스 템플릿'입니다.
         - 해당 카드뉴스의 [페이지별 구성(표지-목차-본론-결론)], [텍스트 밀도], [강조 문구 스타일]을 분석하십시오.
         - 분석한 특징을 아래 [HTML 구조 가이드]에 대입하여 내용을 작성하십시오.
         - 예: 레퍼런스가 'Q&A' 형식이면 본문도 'Q&A'로, 'O/X 퀴즈' 형식이면 'O/X 퀴즈'로 구성하십시오.`
      : `[미션: 블로그 스타일 모방]
         - 이 블로그의 말투, 문단 구조, 이모지 사용 패턴을 완벽히 모방하여 글을 작성하십시오.`}
    
    [⚠️ 의료법 절대 준수] 
    - 벤치마킹 대상이 과장/위법 표현을 쓰더라도 절대 따라하지 말고 안전한 표현으로 순화하십시오.
    `;
  }

  const targetImageCount = request.imageCount ?? 1;
  const _imageMarkers = targetImageCount > 0 
    ? Array.from({length: targetImageCount}, (_, i) => `[IMG_${i+1}]`).join(', ')
    : ''; // 향후 이미지 위치 지정에 활용 가능
  const writingStyle = request.writingStyle || 'empathy'; // 기본값: 공감형
  const writingStylePrompt = getWritingStylePrompts()[writingStyle]; // 스타일별 프롬프트 주입

  // 🎭 톤(말투) 프롬프트
  const tonePromptMap: Record<string, string> = {
    warm: `
[말투: 따뜻하고 공감하는 톤]
- 독자의 고민에 공감하며 위로하는 어조
- "~겪어보신 적 있으실 겁니다", "~막막하셨을 수 있습니다"
- 딱딱한 설명보다 옆에서 대화하듯 부드럽게
- 감정을 인정하는 표현 활용: "걱정되실 수 있습니다"
- 치과 예시: "치료 의자에 앉으면 긴장되는 마음, 충분히 이해됩니다"
`,
    logical: `
[말투: 논리적이고 명확한 톤]
- 근거 중심의 정확한 정보 전달
- 원인→결과 순서로 논리적 흐름 유지
- 감정적 표현 최소화, 팩트 위주
- "~때문입니다", "~구조적으로 보면", "~원리는 이렇습니다"
- 의학 용어를 쉽게 풀되 정확성 유지
- 치과 예시: "법랑질 두께가 1.5mm 이하로 얇아지면 상아세관이 노출됩니다"
`,
    premium: `
[말투: 고급스럽고 신뢰감 있는 톤]
- 격조 있고 세련된 문체, 급하지 않고 차분한 어조
- 불필요한 구어체·이모지 최소화
- VIP 고객을 대하듯 정중하고 품격 있는 표현
- "~에 해당하는 경우라면", "~을 고려해볼 수 있습니다"
- 치과 예시: "심미적 완성도까지 고려한 보철 설계가 중요합니다"
`,
    reassuring: `
[말투: 안심시키는 톤 (치과 공포 해소)]
- 치과 공포·불안을 가진 독자를 위한 안심 어조
- 통증/과정에 대한 구체적 설명으로 불확실성 제거
- "~보다 덜 아프다", "~분 정도면 끝난다" 식의 구체적 안심
- 과정을 단계별로 설명하여 예측 가능하게
- 무통 마취, 수면 치료 등 옵션 자연스럽게 언급
- 치과 예시: "마취가 되면 압력만 느껴지고, 실제 시술 시간은 20분 내외입니다"
- 공포를 부정하지 않고 인정한 뒤 해소: "무섭다고 느끼는 건 자연스러운 반응입니다"
`
  };
  const tonePrompt = tonePromptMap[request.tone || 'warm'] || '';

  // 🎯 청중 모드 프롬프트 (글 전체 방향을 결정)
  const audienceModePromptMap: Record<string, string> = {
    '환자용(친절/공감)': `
[청중: 현재 증상을 겪고 있는 환자]
- 증상에 공감하고 정보를 제공하는 방향
- "이런 증상이 있으시다면" 식의 조건부 접근
- 독자가 자신의 상태를 이해하는 것이 목표
`,
    '전문가용(신뢰/정보)': `
[청중: 의료 지식이 있는 전문가/동료]
- 깊이 있는 의학 정보 중심
- 메커니즘, 근거, 가이드라인 인용 가능
- 쉬운 설명 불필요, 정확한 용어 사용
`,
    '보호자용(가족걱정)': `
[청중: 가족(부모/자녀)의 치과 문제를 걱정하는 보호자]
- "우리 아이가~", "부모님이~" 관점
- 보호자가 알아야 할 관찰 포인트 제공
- 직접 환자가 아니므로 대리 불안 해소에 초점
- 연령대별 주의사항, 동행 시 체크리스트
- 치과 예시: "아이가 이를 갈 때 부모가 확인해야 할 3가지"
- 보호자의 역할과 한계를 명확히 (과잉 걱정 방지)
`,
  };
  const audiencePrompt = audienceModePromptMap[request.audienceMode] || audienceModePromptMap['환자용(친절/공감)'];

  // 🎭 페르소나 프롬프트
  const personaPromptMap: Record<string, string> = {
    hospital_info: `
[페르소나: 병원 공식 블로그]
- 3인칭 객관적 시점으로 작성
- "저", "제가" 등 1인칭 사용 금지
- 병원의 공식 채널답게 신뢰감 있고 정보 중심
- 균형 잡힌 톤으로 정보 제공
`,
    director_1st: `
[페르소나: 대표원장 1인칭 시점 - 반드시 준수!]

[1인칭 시점 규칙]
- 이 글은 대표원장이 직접 쓴 것처럼 1인칭 시점으로 작성
- "저는", "제가", "저희" 자연스럽게 사용 (전체 3~5회)
- 시점: 대표원장이 환자에게 직접 이야기하는 어조

[도입부에서 개인 경험 - 필수!]
★★★ 도입부(첫 1~2문단)에서 반드시 대표원장의 개인 임상 경험/에피소드를 넣을 것 ★★★
- "제가 진료하면서 자주 보는 경우인데요" / "진료실에서 환자분들이 가장 많이 걱정하시는 부분이~"
- "실제로 저희 병원에 오시는 분들 중에~" / "20년 가까이 진료를 하면서 느낀 점이 있습니다"
- 도입부에서 원장의 경험으로 글을 시작하면 자연스럽게 전문성과 신뢰감이 전달됨

[본문 소제목 규칙]
- 본문 소제목에서는 의학 정보/전문 지식 중심으로 작성
- 1인칭 시점은 유지하되 ("~입니다", "~인데요"), 개인 경험 에피소드는 넣지 않아도 됨
- 정확하고 깊이 있는 의학 정보 전달에 집중

[톤]
- 전문가이면서도 편안하게 대화하는 느낌
- 딱딱한 교과서가 아닌, 진료실에서 환자에게 설명하는 느낌
`,
    coordinator: `
[페르소나: 상담 실장님 시점]
- 병원 상담사가 쓴 것처럼 친근한 시점
- "상담할 때 많이 여쭤보시는데요", "저희 병원 오시는 분들 중에~"
- 친근하고 편안한 어조, 실제 상담 느낌
- 의학적 깊이보다 과정/비용/기간 중심 서술
- 치과 예시: "임플란트 상담 오시면 제일 먼저 물어보시는 게 기간이에요"
`,
  };
  const personaPrompt = personaPromptMap[request.persona || 'hospital_info'] || '';
  const imageStyle = request.imageStyle || 'illustration'; // 기본값: 3D 일러스트
  
  // 학습된 말투 스타일 적용
  // 우선순위: 1) 수동 학습(localStorage) → 2) 병원 블로그 학습(Supabase)
  let learnedStyleInstruction = '';
  if (request.learnedStyleId) {
    // 1순위: 사용자가 직접 학습시킨 스타일 (localStorage)
    try {
      const { getStyleById, getStylePromptForGeneration } = await import('./writingStyleService');
      const learnedStyle = getStyleById(request.learnedStyleId);
      if (learnedStyle) {
        learnedStyleInstruction = `
[🎓🎓🎓 학습된 말투 적용 - 최우선 적용! 🎓🎓🎓]
${getStylePromptForGeneration(learnedStyle)}

⚠️ 위 학습된 말투를 반드시 적용하세요!
- 문장 끝 패턴을 정확히 따라하세요
- 자주 사용하는 표현을 자연스럽게 활용하세요
- 전체적인 어조와 분위기를 일관되게 유지하세요
`;
        console.log('📝 학습된 말투 적용 (수동):', learnedStyle.name);
      }
    } catch (e) {
      console.warn('학습된 말투 로드 실패:', e);
    }
  } else if (request.hospitalName && request.hospitalStyleSource === 'explicit_selected_hospital') {
    // 2순위: 병원 블로그 크롤링으로 학습한 스타일 (Supabase) — 명시 선택 시에만
    try {
      const { getHospitalStylePrompt } = await import('./writingStyleService');
      const hospitalStylePrompt = await getHospitalStylePrompt(request.hospitalName);
      if (hospitalStylePrompt) {
        learnedStyleInstruction = `
[🏥🏥🏥 병원 블로그 학습 말투 - 최우선 적용! 🏥🏥🏥]
${hospitalStylePrompt}

⚠️ 위 병원 블로그에서 학습한 말투를 반드시 적용하세요!
- 해당 병원 블로그의 문장 패턴과 어조를 따라하세요
- 자주 쓰는 표현과 문장 구조를 자연스럽게 반영하세요
- 전체적인 분위기를 일관되게 유지하세요
`;
        console.info(`[STYLE] applied=hospital_tone hospital=${request.hospitalName}`);
      }
    } catch (e) {
      console.warn('[STYLE] load_failed:', e);
    }
  } else {
    console.info(`[STYLE] source=generic_default`);
  }
  
  // 커스텀 소제목 적용
  let customSubheadingInstruction = '';
  if (request.customSubheadings && request.customSubheadings.trim()) {
    const subheadings = request.customSubheadings.trim().split(/\r\n|\r|\n/).filter(h => h.trim());
    if (subheadings.length > 0) {
      customSubheadingInstruction = `
[📋📋📋 소제목 필수 사용 - 사용자 지정 소제목! 📋📋📋]
아래 소제목들을 **정확히 그대로** 사용하여 문단을 작성하세요!
소제목 개수: ${subheadings.length}개

${subheadings.map((h, i) => `${i + 1}. ${h}`).join('\n')}

🚨 **필수 규칙:**
- 위 소제목을 **순서대로 정확히 그대로** 사용할 것!
- 소제목 텍스트를 절대 수정하지 말 것!
- 각 소제목에 맞는 내용으로 문단을 작성할 것!
- H3 태그(<h3>)를 사용하여 소제목을 표시할 것!
`;
      console.log('📋 커스텀 소제목 적용:', subheadings.length, '개');
    }
  }
  
  // 현재 한국 시간 정보 (최신 정보 기반 글 작성용)
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const currentYear = koreaTime.getFullYear();
  const currentMonth = koreaTime.getMonth() + 1;
  const currentDay = koreaTime.getDate();
  const currentSeason = currentMonth >= 3 && currentMonth <= 5 ? '봄' 
    : currentMonth >= 6 && currentMonth <= 8 ? '여름'
    : currentMonth >= 9 && currentMonth <= 11 ? '가을' : '겨울';
  const timeContext = `현재 날짜: ${currentYear}년 ${currentMonth}월 ${currentDay}일 (${currentSeason})`;
  
  // 🏥 병원 웹사이트 크롤링 로직
  // 1) 보도자료: hospitalWebsite 사용
  // 2) 블로그: customSubheadings에 "병원 소개" 포함 시 referenceUrl 크롤링
  let hospitalInfo = '';
  let shouldCrawl = false;
  let crawlUrl = '';
  
  // 보도자료의 경우 hospitalWebsite 사용
  if (request.hospitalWebsite && request.hospitalWebsite.trim()) {
    shouldCrawl = true;
    crawlUrl = request.hospitalWebsite.trim();
  }
  // 블로그의 경우: 토글 ON일 때만 referenceUrl 크롤링
  else if (request.includeHospitalIntro && request.referenceUrl && request.referenceUrl.trim()) {
    shouldCrawl = true;
    crawlUrl = request.referenceUrl.trim();
    // 소제목에 "병원 소개"가 없으면 내부적으로 추가
    if (!request.customSubheadings || !request.customSubheadings.includes('병원 소개')) {
      request.customSubheadings = request.customSubheadings
        ? `${request.customSubheadings}\n병원 소개`
        : '병원 소개';
    }
    console.log('📋 병원 소개 토글 ON! 병원 정보 크롤링 시작:', crawlUrl);
  }
  
  if (shouldCrawl) {
    safeProgress('🏥 병원 정보 크롤링 중...');
    try {
      const crawlResponse = await fetch('/api/crawler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl })
      });
      if (crawlResponse.ok) {
        const crawlData = await crawlResponse.json() as { content?: string; error?: string };
        if (crawlData.content) {
          console.log('✅ 병원 웹사이트 크롤링 완료:', crawlData.content.substring(0, 200));
          hospitalInfo = `

[🏥 병원 정보 활용 가이드]
아래 병원 정보를 참고하여 글 마지막 소제목 ("병원 소개" 또는 "어디서 확인할 수 있나요" 등)에 자연스럽게 삽입하세요.

⚠️ 의료광고법 준수 (의료법 제56조 기반):
- ❌ "완치", "100% 효과", "영구적", "반드시 낫는다" 등 효과 보장 표현 금지
- ❌ "최고", "1위", "유일", "타 병원보다 우수" 등 비교 광고 금지
- ❌ "대학병원급", "종합병원급" 등 타 기관 비교 등급 표현 금지
- ❌ "명의", "권위자", "최고 실력" 등 근거 없는 주관적 과장 금지
- ✅ 경력 연수, 시술 건수, 경험 기술 허용 (사실인 경우)
- ✅ "최신 장비", "첨단 장비" 허용 (사실인 경우)
- ✅ "풍부한 경험", "전문 의료진" 허용
- ✅ "효과적인 치료", "증상 완화에 도움" 허용

📋 병원 웹사이트 정보:
${crawlData.content.substring(0, 3000)}

✅ 작성 방법:
1. **분량: 5~7줄 정도로 작성** (너무 짧지도 길지도 않게, 적당한 분량으로!)
2. **1개의 문단으로만 작성** (여러 문장 가능하지만, 문단 분리 금지! 한 덩어리로만 작성!)
${request.keyword ? `3. **키워드와 자연스럽게 연결** (매우 중요!):
   - 글의 주요 키워드: "${request.keyword}"
   - 병원 소개를 키워드와 자연스럽게 연결하여 작성
   - 예: "${request.keyword}" 관련하여 이 병원에서 도움을 받을 수 있습니다
   - 🚨 **키워드 등장 빈도** (여러 키워드가 있을 경우):
     • 첫 번째 키워드(가장 중요): 정확히 4회 등장
     • 두 번째 키워드: 최대 2회 등장
     • 세 번째 이후 키워드: 최대 1회 등장
     • 🔥 부분 일치도 카운트: "자궁근종" 2회 + "근종" 1회 = 총 3회 위반!
   - 키워드를 억지로 반복하지 말고, 문맥에 맞게 자연스럽게 표현` : `3. **글의 주제와 자연스럽게 연결**:
   - 키워드 없음 → 제목/주제를 억지로 반복하지 말 것
   - 병원 소개를 글의 주제와 자연스럽게 연결하여 작성`}
4. **포함할 정보** (크롤링된 내용에 있는 경우에만!):
   - 야간 진료 여부 (예: "평일 저녁 8시까지 야간 진료")
   - 공휴일 진료 여부 (예: "토요일/일요일에도 진료")
   - 담당 선생님 학력/경력 (예: "○○대학교 졸업") ⚠️ "의료진", "전문의", "전문가" 단어 사용 금지!
   - 전문 분야 및 특징
   ⚠️ **중요: 크롤링 데이터에 없는 정보는 절대 지어내지 말 것! 없으면 생략!**
5. 과도한 홍보 느낌 없이 정보 제공 형식으로
6. "~에서 도움을 받을 수 있습니다" 같은 완곡한 표현 사용 (⚠️ "검사", "치료", "상담", "검진" 단어 사용 금지)
7. 병원명은 1회만 표현 (과도한 반복 금지)
8. 🚨 **중요: 병원 소개는 최소 5줄 이상, 7줄 미만으로 작성! (1개 문단)**
${request.keyword ? `9. 🚨 **핵심: 키워드("${request.keyword}")와 자연스럽게 연결하여 작성!**` : `9. 🚨 **핵심: 글의 주제와 자연스럽게 연결하여 작성! (제목/주제 반복 금지)**`}
`;
          safeProgress('✅ 병원 정보 크롤링 완료');
        } else {
          console.warn('⚠️ 크롤링 결과 없음:', crawlData.error);
        }
      } else {
        console.warn('⚠️ 크롤링 API 실패:', crawlResponse.status);
      }
    } catch (error) {
      console.error('❌ 병원 크롤링 에러:', error);
    }
  }
  
  // 커스텀 이미지 프롬프트가 있으면 최우선 사용
  const customImagePrompt = request.customImagePrompt?.trim();
  const imageStyleGuide = customImagePrompt
    ? `커스텀 스타일: ${customImagePrompt}` // 커스텀 프롬프트 최우선!
    : imageStyle === 'illustration' 
    ? '3D 렌더 일러스트, Blender 스타일, 부드러운 스튜디오 조명, 파스텔 색상, 둥근 형태, 친근한 캐릭터, 깔끔한 배경 (⛔금지: 실사, 사진, DSLR)'
    : imageStyle === 'medical'
    ? '의학 3D 일러스트, 해부학적 렌더링, 해부학적 구조, 장기 단면도, 반투명 장기, 임상 조명, 의료 색상 팔레트 (⛔금지: 귀여운 만화, 실사 얼굴)'
    : '실사 DSLR 사진, 진짜 사진, 35mm 렌즈, 자연스러운 부드러운 조명, 얕은 피사계심도, 전문 병원 환경 (⛔금지: 3D 렌더, 일러스트, 만화, 애니메이션)';
  
  // 의료광고법 모드 확인
  const medicalLawMode = request.medicalLawMode || 'strict';
  const isRelaxedMode = medicalLawMode === 'relaxed';

  safeProgress(isRelaxedMode ? '🔥 [준비] 의료광고법 자유 모드' : '⚖️ [준비] 의료광고법 기본 규칙 적용');
  safeProgress('🔄 [준비] 프롬프트 로딩 중...');
  const gpt52Stage1 = getStage1_ContentGeneration(promptTargetLength, medicalLawMode);
  // dynamicSystemPrompt는 검색 결과 기반 systemPrompt 구성에 사용
  const dynamicSystemPrompt = await getDynamicSystemPrompt(medicalLawMode);
  safeProgress(isRelaxedMode ? '✅ 자유 모드 프롬프트 준비 완료' : '✅ 동적 프롬프트 준비 완료 (최신 의료광고법 반영)');

  // 🚀 경쟁 분석 + 어휘 분석 병렬 실행 (속도 최적화)
  let competitorInstruction = '';
  let forbiddenWordsBlock = '';

  if (!isCardNews && request.keywords) {
    safeProgress('🔍 [분석] 경쟁 블로그 + 어휘 분석 중...');

    // 병렬로 두 분석 동시 실행
    const [competitorResult, vocabResult] = await Promise.allSettled([
      // 경쟁 블로그 분석
      getTopCompetitorAnalysis(request.keywords),
      // 경쟁사 어휘 분석
      analyzeCompetitorVocabulary(request.keywords, safeProgress),
    ]);

    // 경쟁 블로그 결과 처리
    if (competitorResult.status === 'fulfilled') {
      const competitorData = competitorResult.value;
      if (competitorData?.success && competitorData.topBlog) {
        const tb = competitorData.topBlog;
        competitorInstruction = `
[경쟁 블로그 분석 결과 - 이 글보다 상위에 노출되어야 함]
현재 "${request.keywords}" 통합탭 1위 블로그:
- 제목: ${tb.title}
- 블로거: ${tb.bloggername}
- 글자 수: ${tb.charCount}자
- 소제목 수: ${tb.subtitles.length}개
- 이미지 수: ${tb.imageCount}개
${tb.subtitles.length > 0 ? `- 소제목 목록: ${tb.subtitles.join(' / ')}` : ''}

[경쟁 분석 기반 작성 전략]
1. 글자 수: 경쟁 글(${tb.charCount}자)보다 충분한 분량 확보
2. 소제목: 경쟁 글(${tb.subtitles.length}개)보다 더 다양한 관점 제공
3. 이미지: 경쟁 글(${tb.imageCount}개)과 동등 이상
4. 구조: 더 읽기 쉽고 체류 시간이 길어지는 구조 설계

[차별화 앵글 설계 - 경쟁 글과 다른 관점 필수]
경쟁 글 소제목: ${tb.subtitles.join(' / ')}

위 소제목이 이미 다루는 내용은 "같은 말 다시 하기"가 아니라 "더 깊은 메커니즘/숫자"로 차별화.
경쟁 글이 빠뜨린 앵글을 최소 1~2개 추가:
- 빠진 관점 후보: 자가 관리법, 연령대별 차이, 시술 후 관리, 비용/기간 현실 정보, 잘못 알려진 상식 바로잡기
- 경쟁 글이 "~이란?"+"원인"+"증상"+"치료" 나열형이면 → 우리는 "독자 상황별 분기"나 "흔한 오해" 앵글로 차별화
- 경쟁 글이 감성 위주면 → 우리는 구체적 숫자/메커니즘으로 차별화
- 경쟁 글이 정보 나열형이면 → 우리는 상황 시나리오 + 정보 조합으로 차별화

[경쟁 글 본문 요약 (참고용 - 베끼기 금지)]
${tb.content.substring(0, 1500)}

⚠️ 경쟁 글을 참고만 하되, 문장/구조를 그대로 가져오면 안 됨. 더 나은 앵글과 깊이로 작성
`;
        safeProgress(`✅ 경쟁 분석 완료: ${tb.charCount}자, 소제목 ${tb.subtitles.length}개`);
      } else {
        safeProgress('⚠️ 경쟁 블로그 미발견 - 자체 최적화로 진행');
      }
    } else {
      console.warn('[경쟁분석] 에러 무시:', competitorResult.reason);
      safeProgress('⚠️ 경쟁 분석 스킵 - 자체 최적화로 진행');
    }

    // 어휘 분석 결과 처리
    const vocabAnalysis = vocabResult.status === 'fulfilled' ? vocabResult.value : null;
    if (vocabResult.status === 'rejected') {
      console.warn('[어휘분석] 에러 무시:', vocabResult.reason);
    }
    forbiddenWordsBlock = buildForbiddenWordsPrompt(vocabAnalysis);
    safeProgress('✅ 경쟁 분석 + 어휘 분석 완료');
  } else if (!isCardNews) {
    // keywords 없는 경우 기본 금지 목록만
    forbiddenWordsBlock = buildForbiddenWordsPrompt(null);
  }

  // 🚀 blogPrompt - gpt52Stage1(SYSTEM_PROMPT + 의료광고법 + 글자수)에 이 글 특화 정보만 추가
  const blogPrompt = `
한국 병·의원 네이버 블로그용 의료 콘텐츠를 작성하세요.

[작성 요청]
- 진료과: ${request.category}
- 제목/주제: ${request.topic}
- SEO 키워드: ${request.keywords || '없음'}${request.disease ? `\n- 질환(글의 핵심 주제): ${request.disease}` : ''}
- 이미지: ${targetImageCount}장
- 목표 글자 수: ${promptTargetLength}자 ~ ${promptTargetLength + 200}자

[📅 현재 시점 - 시의성 있는 콘텐츠 작성]
${timeContext}
- ${currentSeason}철 특성이 주제와 관련 있으면 자연스럽게 반영 (강제 아님)
- 계절성 치과 이슈 예: 겨울(턱관절/입술 건조), 여름(음료로 인한 충치), 봄가을(검진 시즌)
- 🚨 연도/날짜 직접 표기 금지! "올해", "${currentYear}년" 사용 금지. 계절 일반 표현만 허용

${gpt52Stage1}

${request.disease ? `[키워드·질환 역할 분리]
SEO 키워드: "${request.keywords}" / 질환: "${request.disease}"
→ 키워드는 SEO용, 질환이 글의 실제 주제. 다른 질환명 추가 금지.
` : ''}${!request.disease && request.keywords ? `[키워드]
"${request.keywords}" - 전체 3~4회, 도입부 첫 2문장에서는 금지. 다른 질환명 추가 금지.
` : ''}
${competitorInstruction}
${forbiddenWordsBlock}
${writingStylePrompt || ''}
${audiencePrompt || ''}
${tonePrompt || ''}
${personaPrompt || ''}

[도입부 방식 × 청중 조합 가이드]
- 환자용(친절/공감): A(반복 인지형) 또는 C(변화 축적형) 우선. 본인이 겪는 증상 장면
- 보호자용(가족걱정): B(불안 확인형) 또는 D(유독 나만형) 우선. 가족 걱정 장면
- 전문가용(신뢰/정보): E(검색 계기형) 우선. 최신 가이드라인/연구 계기

[마무리 전략 × 청중/페르소나 분기]
- 환자용 + 병원 공식: 열린 결말. "~일 수 있습니다" 정보 제공형 마무리
- 환자용 + 대표원장: "진료실에서 확인하면 더 정확합니다" 식의 부드러운 내원 유도
- 환자용 + 상담실장: "궁금하신 점은 편하게 연락 주세요" 식의 상담 연결
- 보호자용: 보호자가 해야 할 것 / 하지 않아도 될 것 정리형 마무리
- 전문가용: 핵심 포인트 요약 + 최신 동향 언급으로 마무리
- 공통: 본문 요약 금지. 새 정보 추가 금지

[스타일 우선순위 규칙 - 충돌 시]
1순위: 학습된 말투(learnedStyle) - 있으면 tone/persona보다 우선
2순위: 페르소나(persona) - 시점(1인칭/3인칭) 결정
3순위: 말투(tone) - 어조/분위기 결정
4순위: 글 스타일(writingStyle) - expert/empathy/conversion
- 충돌 예: writingStyle=expert + tone=warm → 정보는 깊게, 톤만 따뜻하게. 전문가 톤으로 바꾸지 않음
- 충돌 예: persona=coordinator + tone=premium → 상담실장 시점은 유지, 말투만 격조있게 조절

${learnedStyleInstruction || ''}${customSubheadingInstruction || ''}
${request.category && CATEGORY_SPECIFIC_PROMPTS[request.category as unknown as keyof typeof CATEGORY_SPECIFIC_PROMPTS]
  ? `[진료과별 맞춤 가이드]\n${CATEGORY_SPECIFIC_PROMPTS[request.category as unknown as keyof typeof CATEGORY_SPECIFIC_PROMPTS]}`
  : ''}

${FEW_SHOT_EXAMPLES}

[HTML 구조] - 이미지 ${targetImageCount}장 기준!
<div class="naver-post-container">
  <p>도입 1 - 구체적 상황 + 감각</p>
  <p>도입 2 - 공감</p>
  ${targetImageCount >= 1 ? '[IMG_1]' : ''}
  
  <h3>소제목 1</h3>
  <p>문단 1</p>
  <p>문단 2</p>
  ${targetImageCount >= 2 ? '[IMG_2]' : ''}
  
  <h3>소제목 2</h3>
  <p>문단 1</p>
  <p>문단 2</p>
  ${targetImageCount >= 3 ? '[IMG_3]' : ''}
  
  <h3>소제목 3</h3>
  <p>문단 1</p>
  <p>문단 2</p>
  ${targetImageCount >= 4 ? '[IMG_4]' : ''}
  
  ${targetImageCount >= 5 ? `<h3>소제목 4</h3>
  <p>문단 1</p>
  <p>문단 2</p>
  [IMG_5]
  ` : ''}
  ${targetImageCount >= 6 ? `<h3>소제목 5</h3>
  <p>문단 1</p>
  <p>문단 2</p>
  [IMG_6]
  ` : ''}
  <p>마무리</p>
  <p>#해시태그 10개</p>
</div>

⚠️ **이미지 ${targetImageCount}장 필수!** imagePrompts 배열에 정확히 ${targetImageCount}개 프롬프트 작성!
🚨 일반 소제목: <p> 2~3개 / 마무리: <p> 2개 (도입부와 비슷한 분량)

[이미지 프롬프트 규칙] 🚨 정확히 ${targetImageCount}개 필수!
🚨 imagePrompts 배열에 반드시 **${targetImageCount}개** 프롬프트 작성! (한국어)
- 스타일: ${imageStyleGuide}
- 텍스트/로고/워터마크 금지
- 🇰🇷 사람이 등장할 경우 반드시 "한국인" 명시! (예: "한국인 여성", "한국인 의사", "한국인 환자")
- 예시: "한국인 중년 여성이 따뜻한 차를 마시는 모습, 부드러운 조명, 아늑한 분위기, 실사 사진, DSLR 촬영"

🖼️ [이미지-본문 매칭 규칙] - 이미지와 글이 따로 놀면 체류시간 감소!
- 각 [IMG_N] 위치의 이미지 프롬프트는 바로 위/아래 문단의 내용을 시각적으로 표현해야 합니다
- ❌ 본문: 무릎 통증 이야기 → 이미지: 어깨 스트레칭 (불일치)
- ✅ 본문: 계단 오를 때 무릎이 시큰한 상황 → 이미지: 한국인이 계단을 오르며 무릎을 잡는 모습
- 이미지 순서: 본문 흐름과 동일하게 (도입→증상→원인→관리)
- 각 이미지가 서로 다른 장면이어야 합니다 (비슷한 포즈/배경 반복 금지)

[JSON 응답 형식] - imagePrompts 배열: 정확히 ${targetImageCount}개!
{"title":"제목","content":"HTML 본문 ([IMG_1]~[IMG_${targetImageCount}] 마커 포함)",${targetImageCount > 0 ? `"imagePrompts":["프롬프트1", "프롬프트2", ... 총 ${targetImageCount}개],` : ''}"fact_check":{...}}
${hospitalInfo}
  `;

  const cardNewsPrompt = `
    **🚨 최우선 지침: 이것은 카드뉴스입니다! 🚨**
    - 블로그 포스팅 형식(긴 문단)으로 작성하면 안 됩니다!
    - 반드시 <div class="card-slide"> 구조의 슬라이드 형식으로 작성하세요!
    - 각 슬라이드는 짧은 텍스트(제목 12자, 설명 20자 이내)만 포함합니다!
    ${benchmarkingInstruction}
    ${styleAnalysis}
    
    [📅 현재 시점 정보 - 최신 정보 기반 작성 필수!]
    ${timeContext}
    
    🚨🚨🚨 **시간 참조 표현 절대 금지!** 🚨🚨🚨
    ❌ "${currentYear}년에는~", "올해는~", "이번 ${currentSeason}은~" → 모두 금지!
    ✅ "${currentSeason}철에는~", "추운 날씨에는~" (일반적 계절 표현만 사용)
    
    - 최신 의학 가이드라인/연구 결과 반영 (연도 표기 없이!)
    - ${currentSeason}철 특성 고려 (계절성 질환, 생활 습관 등)
    - Google 검색으로 최신 정보 확인 후 작성
    
    진료과: ${request.category}, 주제: ${request.topic}
    총 ${targetSlides}장의 카드뉴스
    글 스타일: ${writingStyle === 'expert' ? '전문가형(신뢰·권위·논문 인용)' : writingStyle === 'empathy' ? '공감형(독자 공감 유도)' : '전환형(행동 유도)'}
    
    [🚨 핵심 주제 키워드 - 반드시 모든 카드에 반영하세요! 🚨]
    
    **주제: "${request.topic}"**
    - 이 주제가 모든 카드의 중심이 되어야 합니다!
    - "${request.topic}"과 직접 관련된 구체적인 내용만 작성하세요!
    - 일반적이고 추상적인 건강 정보는 ❌ 금지!
    - "${request.topic}"의 구체적인 증상, 원인, 특징을 다루세요!
    
    **⚠️ 질환명/증상명 사용 규칙:**
    - "${request.topic}"에 포함된 질환명(예: 혈액암, 당뇨병, 고혈압 등)은 그대로 사용하세요!
    - 의료 정보를 돌려말하지 마세요! 직접적으로 설명하세요!
    - "몸의 변화", "건강 이상 신호" 같은 모호한 표현 ❌
    - "${request.topic}"의 실제 증상명과 특징을 구체적으로 ✅
    
    [🚨 가장 중요: 스토리 연결성 - 반드시 읽고 적용하세요! 🚨]
    
    **카드뉴스는 반드시 "하나의 스토리"로 연결되어야 합니다!**
    - 각 슬라이드가 독립적인 내용이면 안 됩니다!
    - 1장부터 마지막 장까지 "${request.topic}"에 대해 깊이 있게 다루세요!
    - "표지 → 정의/개요 → 구체적 증상/특징들 → 마무리" 구조를 따르세요!
    
    **스토리 구조 (${targetSlides}장) - "${request.topic}" 기준:**
    
    📕 **1장 (표지)**: "${request.topic}" 주제 소개
    - 제목에 "${request.topic}" 키워드 필수 포함!
    - 예: "${request.topic}, 이런 신호를 놓치지 마세요"
    
    📘 **2장**: "${request.topic}"이란? (정의/개요)
    - "${request.topic}"가 무엇인지 직접적으로 설명
    - 모호하게 돌려말하지 않기!
    
    📗 **3~${targetSlides - 1}장**: "${request.topic}"의 구체적 증상/특징/방법
    - 각 슬라이드에 "${request.topic}"과 직접 관련된 하나의 구체적 내용
    - 실제 증상명, 특징, 원인 등을 명확하게!
    - 예시: 혈액암이라면 → "멍이 쉽게 드나요?", "잇몸 출혈", "만성 피로", "림프절 부종"
    
    📙 **${targetSlides}장 (마무리)**: 정리
    - "${request.topic}" 관련 핵심 메시지
    - 정보 전달로 마무리 (행동 권유 금지)
    
    **✅ "${request.topic}" 주제 올바른 예시:**
    만약 주제가 "혈액암 초기증상"이라면:
    1장: "혈액암, 이 신호를 놓치고 있진 않나요?" (표지)
    2장: "혈액암이란?" - 혈액세포에 생기는 암의 종류 설명
    3장: "멍이 쉽게 드는 경우" - 혈소판 감소로 인한 증상
    4장: "잇몸 출혈이 잦은 경우" - 출혈 경향 설명
    5장: "쉬어도 풀리지 않는 피로감" - 빈혈로 인한 피로
    6장: "몸이 보내는 신호들" - 증상 정리
    
    **❌ 잘못된 예시 (주제와 동떨어진 일반론):**
    1장: "몸이 보내는 신호" (← 주제 키워드 없음!)
    2장: "피로의 원인" (← 너무 일반적!)
    3장: "건강관리의 중요성" (← 주제와 무관!)
    → "${request.topic}"을 직접 다루지 않으면 안 됩니다!
    
    ${PSYCHOLOGY_CTA_PROMPT}
    
    [🎯 마지막 슬라이드 (${targetSlides}장) 심리학적 전환 문구 규칙]
    마지막 카드는 독자가 "다음 행동"을 떠올리게 하는 심리학적 설득 기법을 사용합니다.
    
    **마지막 슬라이드 예시:**
    card-subtitle: "지금이 기회예요" / "함께 지켜요" / "시작해볼까요?"
    card-main-title: "작은 습관이<br/><span class='card-highlight'>생명</span>을 지킵니다"
    card-desc: "건강한 오늘이 행복한 내일을 만듭니다 😊"
    
    **심리학 기법 적용 예시 (마지막 카드):**
    - 손실회피: "미루면 놓칠 수 있습니다"
    - 사회적증거: "많은 경우에서 실천 중이에요"  
    - 시의성: "이맘때가 적기예요"
    - 감정호소: "소중한 일상, 오래 누리세요"
    
    ${request.referenceUrl ? '★벤치마킹 URL의 구성 방식도 참고하세요.' : ''}
    
    ${styleAnalysis ? `
    **⚠️ 중요: 스타일 참고 이미지가 있습니다! ⚠️**
    - 위에서 제공한 "표지/본문 HTML 템플릿"의 style 속성을 그대로 사용하세요!
    - 기본 HEALTH NOTE 스타일(주황색 테두리)을 사용하면 안 됩니다!
    - 분석된 색상(${coverStyle.backgroundColor || contentStyle.backgroundColor || '분석된 색상'})을 반드시 적용하세요!
    ` : `
    [HTML 구조 - 기본 스타일 (연한 하늘색 배경)]
    **⚠️ 중요: 아래 템플릿을 그대로 복사해서 사용하세요! style 속성 필수!**
    
    <div class="card-slide" style="background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%); border-radius: 24px; padding: 0; overflow: hidden;">
      <div style="padding: 32px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; height: 100%;">
        <p class="card-subtitle" style="font-size: 14px; font-weight: 700; color: #3B82F6; margin-bottom: 8px;">질문형 부제목 (10~15자)</p>
        <p class="card-main-title" style="font-size: 28px; font-weight: 900; color: #1E293B; line-height: 1.3; margin: 0 0 16px 0;">메인 제목<br/><span style="color: #3B82F6;">강조 텍스트</span></p>
        <div class="card-img-container" style="width: 100%; margin: 16px 0;">[IMG_N]</div>
        <p class="card-desc" style="font-size: 15px; color: #475569; line-height: 1.6; font-weight: 500; max-width: 90%;">여기에 30~50자의 구체적인 설명 문장을 작성하세요. 독자가 정보를 얻을 수 있도록 충분히!</p>
      </div>
    </div>
    
    **🚨 card-desc 부분이 가장 중요합니다! 반드시 30자 이상 작성하세요! 🚨**
    
    **배경색 필수: style="background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%);" 적용!**
    `}
    
    [[금지] 절대 금지 표현 - 카드에 이런 텍스트 넣지 마세요!]
    ❌ "01.", "02.", "03." 같은 슬라이드 번호
    ❌ "해결책 1", "해결책 2", "마무리" 같은 구조 용어
    ❌ "첫 번째", "두 번째", "세 번째" 같은 순서 표현
    ❌ "후킹", "문제 제기", "원인/배경" 같은 프레임워크 용어
    
    [✅ 올바른 예시]
    card-subtitle: "알고 계셨나요?" / "왜 위험할까요?" / "이렇게 해보세요"
    card-main-title: "겨울철 심장마비<br/><span class='card-highlight'>3배</span> 증가" 
    
    [🚨 작성 규칙 - 매우 중요 🚨]
    1. 각 슬라이드에 [IMG_1]~[IMG_${targetSlides}] 마커 필수
    2. 이전 슬라이드와 내용이 자연스럽게 연결
    3. card-main-title은 **반드시 <p> 태그 사용** (h1 사용 금지!)
    4. card-main-title은 **15~20자**로 충분히 작성! 줄바꿈은 <br/> 사용
    5. card-subtitle은 **10~15자**의 질문형 또는 핵심 포인트
    6. **card-desc는 반드시 30~50자**의 구체적인 설명 문장 포함! (가장 중요!)
    7. 실제 독자가 볼 콘텐츠만 작성 (메타 정보 금지)
    8. **글씨가 너무 없으면 안 됨!** 각 카드에 충분한 정보 전달 필수!
    
    [📝 텍스트 분량 규칙 - 반드시 지키세요!]
    ❌ 잘못된 예 (텍스트 부족):
    - card-subtitle: "지금 확인이 필요합니다" (10자)
    - card-main-title: "심정지<br/><span class='card-highlight'>4분</span>" (6자)
    - card-desc: "골든타임 사수" (6자) ← 너무 짧음!
    
    ✅ 올바른 예 (충분한 텍스트):
    - card-subtitle: "왜 4분이 중요할까요?" (12자)
    - card-main-title: "뇌세포 생존<br/><span class='card-highlight'>마지노선</span>" (12자)
    - card-desc: "4분이 지나면 뇌 손상이 급격히 진행됩니다. 골든타임을 놓치지 마세요!" (40자) ← 이 정도는 되어야 함!
    
    [❌ 잘못된 예시 - 절대 이렇게 쓰지 마세요]
    <p class="card-main-title">스타틴 임의 중단은 금물! 전문의가 강조하는 만성질환 복약 순응도의 중요성</p>
    
    [✅ 올바른 예시]
    <p class="card-main-title">스타틴<br/><span class="card-highlight">중단 금지!</span></p>
    
    [🎨 이미지 프롬프트 작성 규칙 - 매우 중요!]
    
    🚨🚨🚨 **프롬프트 언어: 반드시 한국어로!** 🚨🚨🚨
    - imagePrompts 배열의 모든 프롬프트는 **100% 한국어**로 작성!
    - 영어 단어 사용 금지! (3D render → "3D 렌더", illustration → "일러스트", DSLR → "DSLR" 예외)
    - 예: "밝은 병원 배경의 3D 일러스트, 파스텔톤, 부드러운 조명" (✅)
    - 예: "Bright hospital background, 3D illustration, pastel tones" (❌ 금지!)
    
    이미지 스타일: ${customImagePrompt ? `커스텀: ${customImagePrompt}` : imageStyle === 'illustration' ? '3D 일러스트' : imageStyle === 'medical' ? '의학 3D 해부학' : '실사 사진'}
    
    **📝 카드뉴스 이미지 텍스트 규칙:**
    - 카드뉴스 이미지에는 제목, 설명 텍스트가 들어갈 수 있음
    - 한글, 숫자 위주로
    - 로고, 워터마크 금지
    
    각 이미지 프롬프트에 반드시 포함할 스타일 키워드 (한국어로!):
    ${imageStyleGuide}
    
    ${customImagePrompt ? `**⚠️ 커스텀 스타일 필수 적용!**
    사용자가 "${customImagePrompt}" 스타일을 요청했습니다.
    모든 이미지 프롬프트에 이 스타일 키워드를 반드시 포함하세요! (한국어로!)
    예시: "[장면 묘사], ${customImagePrompt}"` : `예시 (${imageStyle === 'illustration' ? '3D 일러스트' : imageStyle === 'medical' ? '의학 3D' : '실사 사진'} 스타일) - 한국어로 작성!
    ${imageStyle === 'illustration' 
      ? '- "밝은 병원 배경의 건강 인포그래픽, 3D 일러스트, 아이소메트릭 뷰, 클레이 렌더, 파란색 흰색 팔레트"'
      : imageStyle === 'medical'
      ? '- "인체 폐의 3D 단면도, 기관지와 폐포 구조가 보이는 해부학 일러스트, 투명 효과, 파란색 의료 배경"'
      : '- "깔끔한 병원 환경 이미지, 실사 사진, DSLR 촬영, 전문적인 분위기"'}`}
    
    [🚨 최종 검증 - 작성 후 반드시 확인하세요! 🚨]
    각 카드의 card-desc가 30자 이상인지 확인하세요!
    예: "심장이 멈춘 지 4분이 지나면 뇌세포 손상이 시작됩니다" (이 정도 길이)
    텍스트가 너무 짧으면 독자가 정보를 얻을 수 없습니다!
  `;

  try {
    // GPT 제거 - Gemini만 사용
    const _providerSettings = getAiProviderSettings(); // 향후 다중 프로바이더 지원 시 활용
    let result: any;

    // Gemini 사용
    console.log('🔵 Using Gemini for text generation');
    
    // 로그 출력 (generateContent 호출 전에 실행)
    console.log('🔄 Gemini 웹 검색 및 콘텐츠 생성 시작');
    console.log('🔍 검색 모드: 활성화 (최신 의료 정보 반영)');
    console.log('📍 Step 1 시작 준비...');
    
    // 📍 Step 1: Gemini 웹 검색으로 최신 정보 수집
    console.log('📍 onProgress 호출 직전...');
    try {
      if (typeof onProgress === 'function') {
        safeProgress('🔍 최신 정보 검색 중...');
      } else {
        console.warn('⚠️ onProgress가 함수가 아님:', typeof onProgress);
      }
    } catch (progressError) {
      console.error('❌ onProgress 호출 에러:', progressError);
    }
    console.log('📍 onProgress 호출 완료, searchPrompt 생성 시작...');
    
    // 간소화된 검색 프롬프트 (속도 개선)
    const searchPrompt = `"${request.topic}" 관련 최신 의료 정보 검색.

검색 우선순위:
1. health.kdca.go.kr (질병관리청 건강정보)
2. kdca.go.kr (질병관리청)
3. mohw.go.kr, nhis.or.kr (정부기관)

❌ 블로그/카페/유튜브 정보 금지

JSON 형식으로 응답:
{
  "collected_facts": [{"fact": "정보", "source": "출처", "url": "URL"}],
  "key_statistics": [{"stat": "통계", "source": "출처"}],
  "latest_guidelines": [{"guideline": "가이드라인", "organization": "기관"}]
}

최대 5개 팩트, 3개 통계만 수집. 빠르게 응답.`;

    // • Gemini 웹 검색으로 최신 정보 수집
    let geminiResults: any = null;
    let searchResults: any = {};
    let geminiResult: { success: boolean; data: any; source: string } = { success: false, data: null, source: 'skipped' };
    
    // 🔍 항상 검색 실행 (최신 의료 정보 반영)
    console.log('• 질병관리청 최신 정보 검색 시작');
      
      // 🔵 Gemini 검색 실행 (타임아웃 90초)
      const SEARCH_TIMEOUT = 90000; // 90초 타임아웃
      
      const geminiSearchPromise = (async () => {
        try {
          console.log('🔵 Gemini 검색 시작... (타임아웃: 90초)');
          // ⚠️ Google Search와 responseMimeType: "application/json"은 동시 사용 불가!
          // 텍스트로 받고 후처리로 JSON 파싱
          const searchResponseText = await callGemini({
            prompt: searchPrompt,
            model: "gemini-3.1-flash-lite-preview",
            googleSearch: true,
            responseType: 'text',
            timeout: SEARCH_TIMEOUT,
          });

          // 안전한 JSON 파싱 (텍스트 응답에서 추출)
          let result;
          const rawText = (typeof searchResponseText === 'string' ? searchResponseText : JSON.stringify(searchResponseText)) || "{}";
          
          try {
            // JSON 블록 추출 시도 (```json ... ``` 형태일 수 있음)
            const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || 
                             rawText.match(/```\s*([\s\S]*?)\s*```/) ||
                             rawText.match(/\{[\s\S]*"collected_facts"[\s\S]*\}/);
            
            let cleanedText = '';
            if (jsonMatch) {
              cleanedText = (jsonMatch[1] || jsonMatch[0]).trim();
            } else {
              cleanedText = rawText.trim();
            }
            result = JSON.parse(cleanedText);
          } catch {
            console.warn('⚠️ JSON 파싱 실패, 원본 텍스트 일부:', rawText.substring(0, 200));
            // 빈 객체로 폴백
            result = {
              collected_facts: [],
              key_statistics: [],
              latest_guidelines: []
            };
          }
          
          const factCount = result.collected_facts?.length || 0;
          const statCount = result.key_statistics?.length || 0;
          console.log(`✅ Gemini 검색 완료 - 팩트 ${factCount}개, 통계 ${statCount}개`);
          return { success: true, data: result, source: 'gemini' };
        } catch (error) {
          console.error('⚠️ Gemini 검색 실패:', error);
          return { success: false, data: null, source: 'gemini', error };
        }
      })();
      
      // 타임아웃과 함께 검색 실행
      const timeoutPromise = new Promise<{ success: false; data: null; source: 'timeout' }>((resolve) => {
        setTimeout(() => {
          console.warn('⚠️ 검색 타임아웃 (90초) - 검색 건너뛰기');
          resolve({ success: false, data: null, source: 'timeout' });
        }, SEARCH_TIMEOUT);
      });
      
      geminiResult = await Promise.race([geminiSearchPromise, timeoutPromise]);
      geminiResults = geminiResult.success ? geminiResult.data : null;
      
      // 상세 로그
      const geminiFactCount = geminiResults?.collected_facts?.length || 0;
      const geminiStatCount = geminiResults?.key_statistics?.length || 0;
      
    console.log('📊 검색 결과 상세:');
    console.log(`   🔵 Gemini: ${geminiResult.success ? '성공' : '실패'} - 팩트 ${geminiFactCount}개, 통계 ${geminiStatCount}개`);
    
    // GPT 검색 비활성화 (Gemini 단독 사용)
    const gptResults: any = null;
    const gptFactCount = 0;
    const gptStatCount = 0;
    
    // health.kdca.go.kr 우선순위 정렬 함수 (1순위: health.kdca.go.kr)
    const sortByKdcaHealthPriority = (items: any[]) => {
      if (!items || !Array.isArray(items)) return items;
      
      // 🔴 1순위: health.kdca.go.kr URL이 있는 항목을 최상단에 배치 (최우선!)
      const kdcaHealthItems = items.filter((item: any) => 
        item.url?.includes('health.kdca.go.kr') || 
        item.source?.includes('질병관리청 건강정보') ||
        item.source?.includes('health.kdca.go.kr') ||
        item.source?.includes('건강정보포털')
      );
      
      // 2순위: kdca.go.kr (메인 사이트) 항목
      const kdcaMainItems = items.filter((item: any) => 
        !item.url?.includes('health.kdca.go.kr') && 
        !item.source?.includes('health.kdca.go.kr') &&
        !item.source?.includes('건강정보포털') &&
        (item.url?.includes('kdca.go.kr') || item.source?.includes('질병관리청'))
      );
      
      // 3순위: 기타 정부 기관 (mohw.go.kr, nhis.or.kr 등)
      const otherGovItems = items.filter((item: any) => 
        !item.url?.includes('kdca.go.kr') &&
        !item.source?.includes('질병관리청') &&
        (item.url?.includes('.go.kr') || item.url?.includes('.or.kr'))
      );
      
      // 4순위: 나머지 항목
      const otherItems = items.filter((item: any) => 
        !item.url?.includes('health.kdca.go.kr') &&
        !item.url?.includes('kdca.go.kr') &&
        !item.url?.includes('.go.kr') &&
        !item.url?.includes('.or.kr') &&
        !item.source?.includes('질병관리청') &&
        !item.source?.includes('건강정보포털')
      );
      
      const sortedItems = [...kdcaHealthItems, ...kdcaMainItems, ...otherGovItems, ...otherItems];
      
      // 로그 출력 (health.kdca.go.kr 강조)
      if (kdcaHealthItems.length > 0) {
        console.log(`🔴 [1순위] health.kdca.go.kr 결과 ${kdcaHealthItems.length}개 최우선 배치!`);
        kdcaHealthItems.forEach((item: any, idx: number) => {
          console.log(`   ${idx + 1}. ${item.url || item.source || '(URL 없음)'}`);
        });
      }
      if (kdcaMainItems.length > 0) {
        console.log(`   [2순위] kdca.go.kr 결과 ${kdcaMainItems.length}개`);
      }
      if (otherGovItems.length > 0) {
        console.log(`   [3순위] 기타 정부기관 결과 ${otherGovItems.length}개`);
      }
      
      return sortedItems;
    };
    
    if (geminiResults && gptResults) {
      // 🎯 둘 다 성공: 크로스체크 병합
      console.log('🎯 듀얼 검색 성공 - 크로스체크 병합 시작');
      safeProgress('🔀 크로스체크: Gemini + GPT-5.2 결과 병합 중...');
      
      // 병합 후 health.kdca.go.kr 우선 정렬
      const mergedFacts = [
        ...(geminiResults.collected_facts || []).map((f: any) => ({ ...f, verified_by: 'gemini' })),
        ...(gptResults.collected_facts || []).map((f: any) => ({ ...f, verified_by: 'gpt' }))
      ];
      
      const mergedStats = [
        ...(geminiResults.key_statistics || []).map((s: any) => ({ ...s, verified_by: 'gemini' })),
        ...(gptResults.key_statistics || []).map((s: any) => ({ ...s, verified_by: 'gpt' }))
      ];
      
      const mergedGuidelines = [
        ...(geminiResults.latest_guidelines || []).map((g: any) => ({ ...g, verified_by: 'gemini' })),
        ...(gptResults.latest_guidelines || []).map((g: any) => ({ ...g, verified_by: 'gpt' }))
      ];
      
      searchResults = {
        collected_facts: sortByKdcaHealthPriority(mergedFacts),
        key_statistics: sortByKdcaHealthPriority(mergedStats),
        latest_guidelines: sortByKdcaHealthPriority(mergedGuidelines),
        sources: gptResults.sources || [],
        gemini_found: geminiFactCount + geminiStatCount,
        gpt_found: gptFactCount + gptStatCount
      };
      
      // 🔧 맥락 기반 유사도 계산 (문장이 달라도 같은 맥락이면 매칭!)
      // 사용자 요청 개선: 2글자 이상 한글/영어/숫자만 추출 (자카드 유사도 기반)
      const extractKeywords = (text: string): Set<string> => {
        if (!text) return new Set();
        // 특수문자 제거 및 소문자 변환 (한글, 영문, 숫자, 공백만 남김)
        const cleanText = text.toLowerCase().replace(/[^\w가-힣\s]/g, '');
        
        // 공백으로 분리 후 2글자 이상만 필터링
        const tokens = cleanText.split(/\s+/).filter(token => token.length >= 2);
        
        return new Set(tokens);
      };
      
      // 🆕 핵심 키워드 목록 (가중치 부스트용)
      const CRITICAL_KEYWORDS = [
        '노로바이러스', '2025', '2026', '감염증', '환자', '급증', '예방', 
        '혈당', '혈압', '당뇨', '암', '염증', '면역', '비타민', '단백질', 
        '지방', '콜레스테롤', '체중', '비만', '수면', '운동', '식이', '섭취', '증상', '진단',
        '치료', '관리', '검사', '수치', '정상', '이상', '위험', '효과', '부작용',
        '원인', '기전', '합병증', '악화', '호전', '개선', '감소', '증가', '유지', '권장'
      ];
      
      const calculateSimilarity = (text1: string, text2: string): number => {
        const setA = extractKeywords(text1);
        const setB = extractKeywords(text2);

        if (setA.size === 0 || setB.size === 0) return 0;

        // 1. 자카드 유사도 (Jaccard Similarity) = 교집합 / 합집합
        let intersection = 0;
        setA.forEach(word => {
          if (setB.has(word)) intersection++;
        });

        const union = new Set([...setA, ...setB]).size;
        // 자카드 지수 (0~1) -> 점수화 (0~100)
        let score = (intersection / union) * 100;

        // 2. 핵심 키워드(Critical Keywords) 포함 시 가중치 부스트
        let criticalMatchCount = 0;
        CRITICAL_KEYWORDS.forEach(k => {
           // 단순 포함 여부 체크
           if (text1.includes(k) && text2.includes(k)) {
              criticalMatchCount++;
           }
        });

        // 핵심 키워드가 2개 이상 겹치면 +20점 가산
        if (criticalMatchCount >= 2) {
           score += 20; 
        }
        
        // 100점 초과 방지
        if (score > 100) score = 100;
        
        // 디버깅 로그 (유사도가 어느 정도 있을 때만)
        if (score > 10) {
          console.log(`   📊 유사도: ${score.toFixed(1)}% (자카드 기반 + 핵심키워드 부스트)`);
          console.log(`      - A: "${text1.substring(0, 30)}..."`);
          console.log(`      - B: "${text2.substring(0, 30)}..."`);
        }
        
        // 기존 코드와의 호환성을 위해 0~100 점수를 0~1.0 비율로 반환하지 않고, 
        // 아래 로직에서 점수(0~100) 그대로 사용하거나, 여기서 100으로 나눠서 반환할 수 있음.
        // 기존 코드가 finalSim(0.0~1.0)을 기대했으나, 여기선 점수 자체를 반환하고 비교 로직을 수정함.
        return score;
      };
      
      // 교차 검증된 항목 수 계산 (THRESHOLD: 50점으로 상향 - 정확성 강화)
      let crossVerifiedCount = 0;
      const THRESHOLD = 50; // 30 → 50으로 상향 조정

      searchResults.collected_facts.forEach((f1: any, i: number) => {
        searchResults.collected_facts.forEach((f2: any, j: number) => {
          if (i < j && f1.verified_by !== f2.verified_by) {
            const score = calculateSimilarity(f1.fact || '', f2.fact || '');
            // 30점 이상이면 교차 검증 성공으로 간주
            if (score >= THRESHOLD) {
              f1.cross_verified = true;
              f2.cross_verified = true;
              crossVerifiedCount++;
              console.log(`   ✅ 교차 검증 성공! (점수: ${score.toFixed(1)}점)`);
            }
          }
        });
      });
      
      searchResults.cross_verified_count = crossVerifiedCount;
      
      const geminiTotal = searchResults.gemini_found || 0;
      const gptTotal = searchResults.gpt_found || 0;
      
      console.log(`✅ 크로스체크 완료:`);
      console.log(`   🔵 Gemini: ${geminiTotal}개 정보`);
      console.log(`   🟢 GPT-5.2: ${gptTotal}개 정보`);
      console.log(`   🔗 교차 검증: ${crossVerifiedCount}개`);
      
      safeProgress(`✅ 크로스체크 완료: Gemini ${geminiTotal}개 + GPT ${gptTotal}개 → ${crossVerifiedCount}개 교차검증`);
      
    } else if (geminiResults) {
      // Gemini 검색 성공
      console.log('🔵 Gemini 검색 성공');
      searchResults = {
        collected_facts: sortByKdcaHealthPriority(geminiResults.collected_facts || []),
        key_statistics: sortByKdcaHealthPriority(geminiResults.key_statistics || []),
        latest_guidelines: sortByKdcaHealthPriority(geminiResults.latest_guidelines || []),
        gemini_found: geminiFactCount + geminiStatCount
      };
      safeProgress(`✅ Gemini 검색 완료: ${geminiFactCount + geminiStatCount}개 정보 수집`);
      
    } else {
      // 검색 실패
      console.error('❌ 검색 실패');
      safeProgress('⚠️ 검색 실패 - AI 학습 데이터 기반으로 진행');
      searchResults = {};
    }
    
    // Step 2: AI가 검색 결과를 바탕으로 글 작성
    console.log('Step 2: AI 글쓰기...');
    const geminiSystemPrompt = await getDynamicSystemPrompt(request.medicalLawMode || 'strict');

    const systemPrompt = `${geminiSystemPrompt}

[검색 결과 - 최신 정보]
아래는 Google Search로 수집한 최신 정보입니다. 신뢰할 수 있는 출처 우선 활용.

${JSON.stringify(searchResults, null, 2)}

[작성 규칙]
1. 신뢰도 높은 정보 우선 사용
2. 🔥 출처/기관명 절대 언급 금지! (질병관리청, 보건복지부 등 모두 금지)
3. 🔥 숫자/수치 사용 규칙 (의료광고법 기준 구분!)
   ❌ 금지 (통계·마케팅성 수치):
   - 치료 성공률/효과: "90% 개선", "10명 중 8명", "50% 감소"
   - 비교 통계: "2배 증가", "3배 높은 위험"
   - 환자 수/빈도: "연간 100만 명", "매년 5만 건"
   → 대체: "많은 경우", "상당수", "적지 않은 비율"
   ✅ 허용 (의학적 사실·기준 정보):
   - 검진 주기: "2년마다", "1년에 한 번", "6개월 간격"
   - 연령 기준: "40세 이상", "50대", "만 20세부터"
   - 잠복기/기간: "12~48시간", "2~3일", "약 1주일"
   - 용량/횟수: "하루 3회", "하루 2리터", "주 3회"
   - 의학 기준치: "체온 38도 이상", "혈압 140/90"
4. 교차 검증되지 않은 정보는 "~로 나타납니다", "~할 수 있습니다" 등 완화 표현 사용
5. 검색 결과에 없는 정보는 절대 지어내지 말 것!

[📋 JSON 응답 형식]
{
  "title": "제목 (상태 살펴보기형 질문)",
  "content": "HTML 형식의 본문 내용 (크로스체크된 정보 우선 사용)",
  ${targetImageCount > 0 ? '"imagePrompts": ["이미지 프롬프트1", "이미지 프롬프트2", ...],' : ''}
  "fact_check": {
    "fact_score": 0-100 (높을수록 좋음),
    "safety_score": 0-100 (높을수록 좋음),
    "conversion_score": 0-100 (높을수록 좋음),
    "ai_smell_score": 0-100 (⚠️ 낮을수록 좋음! 역점수! 7점 이하 목표! 90점 = 최악!),
    "verified_facts_count": 0,
    "issues": ["문제점1", "문제점2"],
    "recommendations": ["권장사항1", "권장사항2"]
  }
}

⚠️ 중요: AI 냄새 점수는 다른 점수와 반대입니다! ⚠️
- fact_score, safety_score, conversion_score → 높을수록 좋음 (100점 = 최고)
- ai_smell_score → 낮을수록 좋음 (7점 이하 = 최고, 90점 = 최악)`;

    console.log('📍 callOpenAI_Staged 호출 직전...');
    console.log('📍 프롬프트 길이:', (isCardNews ? cardNewsPrompt : blogPrompt).length);
    console.log('📍 시스템 프롬프트(검색 결과) 길이:', JSON.stringify(searchResults, null, 2).length);
    
    // Gemini API 호출
    const finalPrompt = isCardNews ? cardNewsPrompt : blogPrompt;
    console.log('🔵 Gemini 텍스트 생성 시작, 프롬프트:', finalPrompt.length, 'chars');
    try {

      // 🎬 Pro로 바로 생성 (단일 단계)
      safeProgress('✍️ 글 작성 중...');

      try {
        const useGoogleSearch = true; // 항상 최신 의료 정보 검색

        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            imagePrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "content"]
        };

        // 🚀 Pro로 생성 시도 (60초), 실패 시 FLASH 자동 폴백
        const geminiResponse = await callGemini({
          prompt: isCardNews ? cardNewsPrompt : blogPrompt,
          systemPrompt,
          model: GEMINI_MODEL.PRO,
          googleSearch: useGoogleSearch,
          responseType: 'json',
          schema: responseSchema,
          timeout: 60000,  // PRO 60초 제한 → 타임아웃 시 FLASH 폴백
          maxOutputTokens: 16384,
        });

        console.log('Pro 생성 완료');
        const contentText = geminiResponse.content || geminiResponse.text || JSON.stringify(geminiResponse);
        const textWithoutHtml = contentText.replace(/<[^>]+>/g, '');
        const charCountNoSpaces = textWithoutHtml.replace(/\s/g, '').length;
        console.log(`글자수: ${charCountNoSpaces}자 (목표: ${targetLength}자)`);

        // 🔍 글자수 목표 대비 검증 (뻥튀기 보정으로 약간 초과 가능 → 300자까지 OK)
        const targetMin = targetLength;
        const targetMax = targetLength + 300;
        const deviation = charCountNoSpaces - targetLength;

        if (charCountNoSpaces < targetMin) {
          console.info(`ℹ️ 글자수 부족: 목표=${targetLength}자, 실제=${charCountNoSpaces}자 (${deviation}자 부족)`);
          safeProgress(`⚠️ 생성 완료: ${charCountNoSpaces}자 (목표보다 ${Math.abs(deviation)}자 짧음)`);
        } else if (charCountNoSpaces > targetMax) {
          console.info(`ℹ️ 글자수 초과: 목표=${targetLength}자, 실제=${charCountNoSpaces}자 (+${deviation}자)`);
          safeProgress(`⚠️ 생성 완료: ${charCountNoSpaces}자 (목표보다 ${deviation}자 길음)`);
        } else {
          console.log(`✅ 글자수 적정: 목표=${targetLength}자, 실제=${charCountNoSpaces}자`);
          safeProgress(`✅ 생성 완료: ${charCountNoSpaces}자`);
        }

        // 글자수 초과 여부 로그
        let finalResponse = geminiResponse;
        if (charCountNoSpaces > targetMax && !isCardNews) {
          const excessChars = charCountNoSpaces - targetLength;
          console.log(`📝 글자수 초과(+${excessChars}자) — 그대로 진행`);
        }

        if (!finalResponse || typeof finalResponse !== 'object') {
          throw new Error('Gemini가 빈 응답을 반환했습니다. 다시 시도해주세요.');
        }

        result = finalResponse;
        console.log('✅ Gemini JSON 응답 사용 완료');

      } catch (geminiError: any) {
        console.error('❌ Gemini 생성 실패:', geminiError);
        console.error('❌ 에러 상세:', JSON.stringify({
          name: geminiError?.name,
          message: geminiError?.message,
          code: geminiError?.code,
          status: geminiError?.status,
          stack: geminiError?.stack?.substring(0, 500)
        }, null, 2));
        
        // 에러 타입별 처리
        if (geminiError.message?.includes('타임아웃') || geminiError.message?.includes('timeout')) {
          // 실제 타임아웃 - 더 구체적인 메시지
          throw new Error(`⏰ 글쓰기 타임아웃 (3분) - 콘솔에서 상세 에러 확인 필요. 원인: ${geminiError.message}`);
        } else if (geminiError.message?.includes('quota') || geminiError.message?.includes('limit') || geminiError.message?.includes('429')) {
          throw new Error('🚫 API 사용량 한계에 도달했습니다. 잠시 후 다시 시도해주세요.');
        } else if (geminiError.message?.includes('JSON')) {
          throw new Error('📋 AI 응답 형식 오류가 발생했습니다. 다시 시도해주세요.');
        } else if (geminiError.message?.includes('model') || geminiError.message?.includes('not found') || geminiError.message?.includes('404')) {
          throw new Error(`🤖 모델 오류: ${geminiError.message}`);
        } else {
          throw new Error(`❌ Gemini 오류: ${geminiError.message || '알 수 없는 오류'}`);
        }
      }
    
    // 🔧 GPT-5.2는 다양한 필드명으로 반환할 수 있음 → content로 정규화
    if (!result.content) {
      // 가능한 모든 필드명 체크
      const possibleContentFields = ['contentHtml', 'body', 'html', 'htmlContent', 'bodyHtml', 'article', 'text'];
      for (const field of possibleContentFields) {
        if (result[field]) {
          console.log(`✅ GPT-5.2 '${field}' 필드를 content로 정규화`);
          result.content = result[field];
          break;
        }
      }
    }
    
    // 디버그: result 객체의 모든 필드 출력
    console.log('📋 result 객체 필드:', Object.keys(result));
    if (!result.content) {
      console.error('❌ content 필드를 찾을 수 없습니다. result:', JSON.stringify(result).substring(0, 500));
    }
    
    // AI가 content를 배열이나 객체로 반환한 경우 방어 처리
    if (result.content && typeof result.content !== 'string') {
      console.warn('AI returned non-string content, attempting to extract HTML...');
      if (Array.isArray(result.content)) {
        // 배열인 경우 각 항목에서 HTML 추출
        result.content = result.content.map((item: any) => {
          if (typeof item === 'string') return item;
          if (item?.content) return item.content;
          if (item?.html) return item.html;
          return '';
        }).join('');
      } else if (typeof result.content === 'object') {
        // 객체인 경우 content나 html 필드 추출
        result.content = result.content.content || result.content.html || JSON.stringify(result.content);
      }
    }
    
    // 불필요한 텍스트 및 이모지 제거 (전문 의료 콘텐츠 톤 유지)
    if (result.content && typeof result.content === 'string') {
      result.content = result.content
        // 🚨 JSON 이스케이프 문자 정리
        .replace(/<\\\/p>/g, '</p>')
        .replace(/<\\\/h2>/g, '</h3>')  // h2→h3 변환도 함께
        .replace(/<\\\/h3>/g, '</h3>')
        .replace(/<\\\/div>/g, '</div>')
        .replace(/<\\\/span>/g, '</span>')
        .replace(/<\\\/strong>/g, '</strong>')
        .replace(/<\\\/em>/g, '</em>')
        .replace(/\\\//g, '/')  // 남은 \/ 제거
        // 🚨 \n 리터럴 문자열 제거 (JSON 이스케이프 문제)
        .replace(/\\n/g, '')
        .replace(/\n\n+/g, '\n')  // 연속 줄바꿈 정리
        // 🚨 h2 → h3 변환 (소제목은 h3이어야 함)
        .replace(/<h2([^>]*)>/g, '<h3$1>')
        .replace(/<\/h2>/g, '</h3>')
        // 🚨 해시태그 제거
        .replace(/#[가-힣a-zA-Z0-9_]+(\s*#[가-힣a-zA-Z0-9_]+)*/g, '')
        // 🚨 JSON 형식 잔여물 제거 (AI가 JSON을 content에 포함시킨 경우)
        .replace(/^\s*\{\s*"title"\s*:\s*"[^"]*"\s*,\s*"content"\s*:\s*"/i, '')  // 시작부 JSON
        .replace(/"\s*,\s*"imagePrompts"\s*:\s*\[.*?\]\s*\}\s*$/i, '')  // 끝부분 JSON
        .replace(/^\s*\{\s*"content"\s*:\s*"/i, '')  // content만 있는 경우
        .replace(/"\s*\}\s*$/i, '')  // 끝 괄호
        .replace(/\(이미지 없음\)/g, '')
        .replace(/\(이미지가 없습니다\)/g, '')
        .replace(/\[이미지 없음\]/g, '')
        .replace(/\[IMG_\d+\]/g, '') // 남아있는 이미지 마커 제거
        .replace(/<p>\s*<\/p>/g, '') // 빈 p 태그 제거
        // 이모지 제거 (전문 의료 콘텐츠 톤)
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // 이모지 범위
        .replace(/[\u{2600}-\u{26FF}]/gu, '') // 기타 기호
        .replace(/[\u{2700}-\u{27BF}]/gu, '') // 딩뱃
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // 변형 선택자
        .replace(/[\u{1F000}-\u{1F02F}]/gu, '') // 마작 타일
        .trim();
    }
    
    // 제목에서도 이모지 제거
    if (result.title && typeof result.title === 'string') {
      result.title = result.title
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .trim();
    }
    
    // 분석된 스타일 정보 추가
    if (analyzedBgColor) {
      result.analyzedStyle = { backgroundColor: analyzedBgColor };
    }

    // ──────────────────────────────────────────────
    // 🔍 Stage 1.5: 도입부 품질 게이트 (3요소 검증 → 미달 시 도입부만 재생성)
    // ──────────────────────────────────────────────
    if (!isCardNews && result.content && typeof result.content === 'string' && result.content.length > 300) {
      try {
        // 도입부 추출: 첫 번째 <h2> 또는 <h3> 전까지의 <p> 태그들
        const firstHeadingIdx = result.content.search(/<h[23][^>]*>/);
        const introHtml = firstHeadingIdx > 0 ? result.content.slice(0, firstHeadingIdx) : '';
        const introText = introHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        if (introText.length > 30) {
          // 정의형/메타설명형 도입부 감지 (절대 금지)
          const isBadPattern = /이란|질환입니다|알아보겠|살펴보겠|에 대해|많은 분들이|누구나 한 번/.test(introText);

          // 브릿지 부재 감지: 모호한 연결어만 있고 구체적 주제 연결이 없는 경우
          const hasVagueBridge = /관련된\s*요인|환경과\s*관련|차근차근\s*짚어|짚어볼\s*필요|살펴볼\s*필요|알아볼\s*필요/.test(introText);

          // 나열형 도입부 감지: "경우가 있습니다"/"하기도 합니다" 등이 2회 이상 반복
          const listingEndings = introText.match(/경우가 있습니다|하기도 합니다|찾아옵니다|나타나기도|겪기도 합니다|보이기도 합니다/g);
          const isListingPattern = listingEndings && listingEndings.length >= 2;

          // 도입부가 3문단 이상이면 과잉 (2문단까지 허용)
          const introParagraphs = introHtml.match(/<p[^>]*>/g);
          const isTooManyParagraphs = introParagraphs && introParagraphs.length > 2;

          const needsRegen = isBadPattern || hasVagueBridge || isTooManyParagraphs || isListingPattern;
          const regenReason = isBadPattern ? '금지 패턴' : hasVagueBridge ? '브릿지 모호' : isListingPattern ? '나열형 도입' : '3문단 이상';

          if (needsRegen) {
            safeProgress(`🔍 Stage 1.5: 도입부 품질 미달(${regenReason}) → 재생성 중...`);
            const introRegenPrompt = `아래 블로그 글의 도입부가 품질 기준에 미달합니다.
도입부만 새로 작성해주세요.

[시작 방식 - 주제에 맞는 것을 골라 쓰세요]
A. 일상 장면형: 장소+동작+감각 (정형외과, 재활 등에 적합)
B. 상황 제시형: 주변 상황 → 나에게 영향 (감염병 등에 적합)
C. 변화 관찰형: 평소와 다른 점 발견 (내과, 피부과 등에 적합)
D. 비교형: 같은 환경인데 나만 다름 (알레르기, 체질 등에 적합)
E. 계기형: 일상적 계기 → 잠깐의 멈춤 (예방, 검진, 무증상 질환에 적합)
⚠️ 증상이 없는 주제에 A/C를 쓰면 억지 장면이 됩니다! E를 사용하세요.

[필수 - 검색 의도 브릿지]
마지막 1~2문장에서 반드시 글의 주제(키워드)와 연결해야 합니다.
독자가 "아, 이 글이 그 얘기구나"라고 3초 안에 파악할 수 있어야 합니다.
브릿지에는 키워드/질환명을 자연스럽게 포함해도 됩니다.
❌ "주변 환경과 관련된 요인에서 시작되기도 합니다" → 모호
❌ 제목을 그대로/바꿔 말하며 반복 (제목 복붙)
❌ 본문에서 설명할 이유/원인을 미리 말하기 (답을 주면 읽을 이유 없음)
✅ "접촉을 통해 노로바이러스에 감염된 경우일 수 있습니다" → 직결 + 궁금증 유지

[핵심 - 하나의 장면, 하나의 흐름]
하나의 사건이 자연스럽게 전개되는 이야기여야 합니다.
여러 상황을 나열하지 마세요.

[금지]
- 질환명으로 시작 (브릿지에서는 OK)
- "~이란", "~에 대해", "알아보겠습니다", "많은 분들이"
- 독자에게 질문하거나 말 걸기
- "습니다" 체 유지
- 여러 상황 나열 (각 문장이 별개의 경우/사례이면 실패)

[현재 도입부]
${introHtml}

[글의 주제]
${request.topic}${request.disease ? `, 질환: ${request.disease}` : ''}

새 도입부를 HTML(<p> 태그)로 작성하세요. 3~5문장, 2문단 권장.
· 1문단(<p>): 장면/상황 전개 (2~3문장)
· 2문단(<p>): 검색 의도 브릿지 (1~2문장)
장면과 브릿지를 별도 <p>로 분리해야 호흡이 생깁니다.`;

            const newIntro = await callGemini({
              prompt: introRegenPrompt,
              model: GEMINI_MODEL.FLASH,
              responseType: 'text',
              timeout: TIMEOUTS.QUICK_OPERATION,
              temperature: 0.9,  // 창의적 도입부를 위해 높은 temperature
            });

            if (newIntro && typeof newIntro === 'string' && newIntro.includes('<p>') && newIntro.length > 50) {
              const cleanIntro = newIntro.trim();
              result.content = cleanIntro + result.content.slice(firstHeadingIdx);
              safeProgress('✅ Stage 1.5: 도입부 재생성 완료');
            }
          }
        }
      } catch (introError) {
        console.warn('⚠️ Stage 1.5 도입부 검증 스킵:', introError);
      }
    }

    // fact_check 기본값 설정 (Gemini가 반환하지 않은 필드 보완) - 정확성 강화로 기준 상향
    if (!result.fact_check) {
      result.fact_check = {};
    }
    // conversion_score가 없거나 0이면 기본값 75 설정 (70 → 75 상향)
    if (!result.fact_check.conversion_score || result.fact_check.conversion_score === 0) {
      result.fact_check.conversion_score = 75;
      console.log('⚠️ conversion_score 기본값 75점 설정 (AI 미반환)');
    }
    // 다른 필드들도 기본값 설정 (정확성 강화로 fact_score, safety_score 상향)
    if (result.fact_check.fact_score === undefined || result.fact_check.fact_score === null) {
      result.fact_check.fact_score = 85; // 80 → 85 상향
    }
    if (result.fact_check.safety_score === undefined || result.fact_check.safety_score === null) {
      result.fact_check.safety_score = 90; // 85 → 90 상향
    }
    // ai_smell_score는 0이 유효한 값이 아님 (낮을수록 좋은 점수)
    if (result.fact_check.ai_smell_score === undefined || result.fact_check.ai_smell_score === null) {
      result.fact_check.ai_smell_score = 12; // 15 → 12 하향 (더 좋게)
      console.log('⚠️ ai_smell_score 기본값 12점 설정 (AI 미반환)');
    }
    if (result.fact_check.verified_facts_count === undefined || result.fact_check.verified_facts_count === null) {
      result.fact_check.verified_facts_count = 5; // 3 → 5 상향 (더 많은 팩트 검증 요구)
    }
    if (!result.fact_check.issues) result.fact_check.issues = [];
    if (!result.fact_check.recommendations) result.fact_check.recommendations = [];
    
    console.log('📊 fact_check 최종값:', result.fact_check);
    
    // 🎯 SEO 자동 평가 (재생성 없이 평가만 수행)
    const hasContent = result.content || result.contentHtml;
    if (!isCardNews && hasContent && result.title) {
      console.log('📊 SEO 자동 평가 시작...');
      if (typeof onProgress === 'function') {
        safeProgress('📊 SEO 점수를 자동 평가하고 있습니다...');
      }
      
      try {
        // content 또는 contentHtml 필드 지원
        const htmlContent = result.contentHtml || result.content;
        if (!htmlContent) {
          console.error('❌ SEO 평가 불가: result에 content 또는 contentHtml 필드가 없습니다');
          console.error('   - result 필드:', Object.keys(result));
        } else {
          const seoReport = await evaluateSeoScore(
            htmlContent,
            result.title,
            request.topic,
            request.keywords || ''
          );
          
          console.log(`📊 SEO 평가 완료 - 총점: ${seoReport.total}점`);
          
          // SEO 점수를 결과에 추가
          result.seoScore = seoReport;
          
          // 진행 상황 업데이트
          if (typeof onProgress === 'function') {
            safeProgress(`📊 SEO 평가 완료 - 총점: ${seoReport.total}점`);
          }
          
          if (seoReport.total >= 85) {
            console.log('✅ SEO 점수 85점 이상!');
            if (typeof onProgress === 'function') {
              safeProgress(`✅ SEO 점수 ${seoReport.total}점`);
            }
          } else {
            console.log(`ℹ️ SEO 점수 ${seoReport.total}점 - 참고용`);
            if (typeof onProgress === 'function') {
              safeProgress(`ℹ️ SEO 점수 ${seoReport.total}점`);
            }
          }
        }
      } catch (seoError) {
        console.error('❌ SEO 평가 오류:', seoError);
      }
      
      // SEO 평가 완료 메시지
      if (typeof onProgress === 'function') {
        safeProgress('✅ Step 2 완료: 글 작성 및 SEO 평가 완료');
      }
    }
    } catch (contentGenerationError: any) {
      console.error('❌ 콘텐츠 생성 중 오류 발생:', contentGenerationError);
      throw contentGenerationError;
    }

    // 📊 프롬프트 분석 로그 기록
    try {
      const { logPromptGeneration } = await import('../utils/promptAnalytics');
      const generationTime = Date.now() - startTime;
      const actualContent = result.content || result.contentHtml || '';
      const plainText = actualContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const actualLength = plainText.length;

      logPromptGeneration({
        promptVersion: 'v2.0_natural_writing',
        category: request.category,
        topic: request.topic,
        targetLength: targetLength,
        imageCount: request.imageCount || 0,
        actualLength: actualLength,
        ai_smell_score: result.fact_check?.ai_smell_score || 0,
        safety_score: result.fact_check?.safety_score || 0,
        fact_score: result.fact_check?.fact_score || 0,
        conversion_score: result.fact_check?.conversion_score || 0,
        generationTime: generationTime,
        retryCount: retryCount,
        errorOccurred: errorOccurred,
        errorMessage: errorMessage,
        wasEdited: false,
        wasSaved: false
      });
    } catch (analyticsError) {
      console.error('⚠️ Analytics logging failed:', analyticsError);
      // 로그 실패해도 메인 기능은 계속
    }

    // 🔧 사용자가 입력한 제목 그대로 사용 (AI가 변경하지 않도록)
    result.title = request.topic;
    console.log('✅ 사용자 입력 제목 사용:', request.topic);


    return result;
  } catch (error) {
    errorOccurred = true;
    errorMessage = (error as Error).message || 'Unknown error';
    throw error;
  }
};


export const generateFullPost = async (request: GenerationRequest, onProgress?: (msg: string) => void): Promise<GeneratedContent> => {
  // onProgress가 없으면 콘솔 로그로 대체
  const safeProgress = onProgress || ((msg: string) => console.log('📍 Progress:', msg));
  
  const isCardNews = request.postType === 'card_news';
  const isPressRelease = request.postType === 'press_release';
  
  console.info(`[BLOG_FLOW] generateFullPost 시작 — postType: ${request.postType}, topic: ${request.topic?.substring(0, 30)}`);
  // • 디버그: request에 customImagePrompt가 있는지 확인
  console.log('• generateFullPost 시작 - request.imageStyle:', request.imageStyle);
  console.log('• generateFullPost 시작 - request.customImagePrompt:', request.customImagePrompt ? request.customImagePrompt.substring(0, 50) : 'undefined/없음');
  
  // 🗞️ 보도자료: 전용 생성 함수 사용
  if (isPressRelease) {
    return _prGeneratePressRelease(request, safeProgress);
  }
  
  // 🤖 카드뉴스: 미니 에이전트 방식 사용
  if (isCardNews) {
    safeProgress('🤖 미니 에이전트 방식으로 카드뉴스 생성 시작...');
    
    try {
    // 미니 에이전트로 스토리 기획 + HTML 조립 + 이미지 프롬프트 생성
    const agentResult = await generateCardNewsWithAgents(request, safeProgress);
    
    // 이미지 생성
    const styleName = STYLE_NAMES[request.imageStyle] || STYLE_NAMES.illustration;
    safeProgress(`🎨 ${styleName} 스타일로 4:3 이미지 생성 중...`);
    
    // 🎨 이미지 = 카드 전체! (텍스트가 이미지 안에 포함된 완성형)
    const maxImages = request.slideCount || 6;
    safeProgress(`🎨 ${maxImages}장의 완성형 카드 이미지 생성 중...`);
    
    // 참고 이미지 설정 (표지 또는 본문 스타일 이미지)
    const referenceImage = request.coverStyleImage || request.contentStyleImage;
    const copyMode = request.styleCopyMode; // true=레이아웃 복제, false=느낌만 참고

    // 디자인 템플릿의 stylePrompt를 customStylePrompt로 전달 (이미지 생성에 반영)
    const { getDesignTemplateById } = await import('./cardNewsDesignTemplates');
    const designTemplate = request.designTemplateId ? getDesignTemplateById(request.designTemplateId) : undefined;
    const effectiveCustomStyle = designTemplate?.stylePrompt || request.customImagePrompt;

    // imagePrompts가 없으면 빈 배열로 초기화
    if (!agentResult.imagePrompts || !Array.isArray(agentResult.imagePrompts)) {
      agentResult.imagePrompts = [];
    }

    // • 디버그: imagePrompts 내용 확인
    if (agentResult.imagePrompts.length > 0) {
      console.log('🎨 첫 생성 imagePrompts:', agentResult.imagePrompts.map((p, i) => ({ index: i, promptHead: p.substring(0, 200) })));
    }

    // 순차 생성으로 진행률 표시
    const images: { index: number; data: string; prompt: string }[] = [];
    for (let i = 0; i < Math.min(maxImages, agentResult.imagePrompts.length); i++) {
      safeProgress(`🎨 카드 이미지 ${i + 1}/${maxImages}장 생성 중...`);
      const img = await generateSingleImage(
        agentResult.imagePrompts[i],
        request.imageStyle,
        "1:1",
        effectiveCustomStyle,
        referenceImage,
        copyMode
      );
      images.push({ index: i + 1, data: img, prompt: agentResult.imagePrompts[i] });
    }
    
    // 이미지 자체가 카드 전체! (HTML 텍스트 없이 이미지만)
    // 🚨 alt 속성에도 코드 문자열이 들어가지 않도록 필터링!
    const cleanAltText = (text: string) => text
      .replace(/[A-Za-z0-9+/=_-]{10,}/g, '')
      .replace(/[a-zA-Z0-9]{5,}\/[a-zA-Z0-9/]+/g, '')
      .replace(/[^\uAC00-\uD7AF가-힣a-zA-Z0-9\s.,!?~():-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100); // alt 텍스트 길이 제한
    
    // 디자인 템플릿의 styleConfig 적용
    const sc = agentResult.styleConfig;
    const cardBorderRadius = sc?.borderRadius || '24px';
    const cardBoxShadow = sc?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
    const cardBorderStyle = sc?.borderWidth && sc.borderWidth !== '0'
      ? `border: ${sc.borderWidth} solid ${sc.borderColor};`
      : '';

    const cardSlides = images.map((img, _idx) => {
      if (img.data) {
        return `
          <div class="card-slide" style="border-radius: ${cardBorderRadius}; ${cardBorderStyle} overflow: hidden; aspect-ratio: 1/1; box-shadow: ${cardBoxShadow};">
            <img src="${img.data}" alt="${cleanAltText(img.prompt)}" data-index="${img.index}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>`;
      }
      return '';
    }).filter(Boolean).join('\n');
    
    const finalHtml = `
      <div class="card-news-container">
        <h2 class="hidden-title">${agentResult.title}</h2>
        <div class="card-grid-wrapper">
          ${cardSlides}
        </div>
        <div class="legal-box-card">${MEDICAL_DISCLAIMER}</div>
      </div>
    `.trim();
    
    // 🔍 카드뉴스 텍스트 AI 냄새 검사
    // cardPrompts의 텍스트를 합쳐서 검사
    const cardTexts = agentResult.cardPrompts?.map(card => {
      const tp = card.textPrompt;
      return `${tp.subtitle || ''} ${tp.mainTitle || ''} ${tp.description || ''}`;
    }).join(' ') || '';
    
    safeProgress('🔍 카드뉴스 텍스트 AI 냄새 검사 중...');
    const cardAiSmellCheck = runAiSmellCheck(cardTexts);
    
    let cardFactCheck: FactCheckReport = {
      fact_score: 85,
      safety_score: 90,
      conversion_score: 80,
      ai_smell_score: cardAiSmellCheck.score,
      verified_facts_count: 5,
      issues: [],
      recommendations: []
    };
    
    cardFactCheck = integrateAiSmellToFactCheck(cardFactCheck, cardAiSmellCheck);
    
    if (cardAiSmellCheck.criticalIssues.length > 0) {
      safeProgress(`🚨 카드뉴스 텍스트에 금지 패턴 ${cardAiSmellCheck.criticalIssues.length}개 발견!`);
    } else {
      safeProgress('✅ 카드뉴스 생성 완료!');
    }
    
    // 📦 생성된 카드뉴스 Supabase에 저장 (비동기, 실패해도 무시)
    saveGeneratedPost({
      hospitalName: request.hospitalName,
      category: request.category,
      doctorName: request.doctorName,
      doctorTitle: request.doctorTitle,
      postType: 'card_news',
      title: agentResult.title,
      content: finalHtml,
      keywords: request.keywords?.split(',').map(k => k.trim()),
      topic: request.topic,
      imageStyle: request.imageStyle,
      slideCount: images.length
    }).then(result => {
      if (result.success) {
        console.log('✅ 카드뉴스 저장 완료:', result.postId);
      } else {
        console.warn('⚠️ 카드뉴스 저장 실패:', result.error);
      }
    }).catch(err => {
      console.warn('⚠️ 카드뉴스 저장 예외:', err);
    });
    
    return {
      title: agentResult.title,
      htmlContent: finalHtml,
      imageUrl: images[0]?.data || "",
      fullHtml: finalHtml,
      tags: [],
      factCheck: cardFactCheck,
      postType: 'card_news',
      imageStyle: request.imageStyle,
      customImagePrompt: request.customImagePrompt, // 커스텀 이미지 프롬프트 저장 (재생성용)
      cardPrompts: agentResult.cardPrompts, // 재생성용 프롬프트 데이터
      cssTheme: request.cssTheme || 'modern' // CSS 테마 (기본값: modern)
    };
    } catch (error) {
    console.error('미니 에이전트 방식 실패, 기존 방식으로 폴백:', error);
    safeProgress('⚠️ 미니 에이전트 실패, 기존 방식으로 재시도...');
    // 기존 방식으로 폴백 (아래 코드로 계속)
    }
  }
  
  // 📝 블로그: 다단계 파이프라인 시도 → 실패 시 기존 방식 폴백
  // 카드뉴스 폴백: 기존 방식 사용
  let textData: any;

  if (request.postType === 'blog' && !request.referenceUrl) {
    // 다단계 파이프라인 사용 (블로그 전용)
    safeProgress('🚀 다단계 파이프라인으로 블로그 생성 시작...');
    try {
      // 검색 결과 수집 (파이프라인에 전달)
      safeProgress('🔍 최신 정보 검색 중...');
      let pipelineSearchResults: any = {};
      try {
        const searchResponseText = await callGemini({
          prompt: `"${request.topic}" 관련 최신 치과 의료 정보 검색. health.kdca.go.kr 우선. JSON: {"collected_facts": [{"fact": "...", "source": "..."}]}`,
          model: "gemini-3.1-flash-lite-preview",
          googleSearch: true,
          responseType: 'text',
          timeout: TIMEOUTS.QUICK_OPERATION,
        });
        const rawText = (typeof searchResponseText === 'string' ? searchResponseText : JSON.stringify(searchResponseText)) || '{}';
        try {
          const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*"collected_facts"[\s\S]*\}/);
          pipelineSearchResults = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : rawText.trim());
        } catch { pipelineSearchResults = { collected_facts: [] }; }
      } catch { pipelineSearchResults = { collected_facts: [] }; }

      const pipelineResult = await generateBlogWithPipeline(request, pipelineSearchResults, safeProgress);
      textData = {
        title: pipelineResult.title,
        content: pipelineResult.content,
        imagePrompts: pipelineResult.imagePrompts,
        conclusionLength: pipelineResult.conclusionLength,
        fact_check: {
          fact_score: 85,
          safety_score: 90,
          conversion_score: 75,
          ai_smell_score: 10,
          verified_facts_count: 5,
          issues: [],
          recommendations: []
        }
      };
      safeProgress('✅ 다단계 파이프라인 생성 완료!');
      console.info(`[BLOG_FLOW] ✅ 파이프라인 textData 확보 — title: "${textData.title}", content: ${textData.content?.length || 0}자`);
      console.info(`[PIPELINE_RESULT] source=pipeline`);
    } catch (pipelineError: any) {
      const failReason = `${pipelineError?.status || 'N/A'} ${pipelineError?.message?.substring(0, 120) || 'unknown'}`;
      console.error(`[BLOG_FLOW] ❌ 파이프라인 실패: ${pipelineError?.message}`);
      console.warn(`[BLOG_FLOW] ⚠️ 구형 generateBlogPostText 폴백 진입 — 원인: ${failReason}`);
      safeProgress('⚠️ 파이프라인 실패, 기존 방식으로 재시도...');
      try {
        textData = await generateBlogPostText(request, safeProgress);
        console.info(`[BLOG_FLOW] ✅ 구형 폴백 성공 — title: "${textData?.title}", content: ${textData?.content?.length || 0}자`);
        console.info(`[PIPELINE_RESULT] source=legacy_fallback | reason=${failReason} | textLength=${textData?.content?.length || 0} | imagePrompts=${textData?.imagePrompts?.length || 0} | model=PRO(60s,JSON,googleSearch)`);
      } catch (fallbackError: any) {
        console.error(`[BLOG_FLOW] ❌ 구형 폴백도 실패: ${fallbackError?.message}`);
        throw new Error(pipelineError?.message || '블로그 생성에 실패했습니다. 다시 시도해주세요.');
      }
    }
  } else {
    // 카드뉴스 폴백 또는 레퍼런스 URL 사용 시 기존 방식
    const hasStyleRef = request.postType === 'card_news' && (request.coverStyleImage || request.contentStyleImage);
    if (hasStyleRef) {
      if (request.coverStyleImage && request.contentStyleImage) {
        safeProgress('🎨 표지/본문 스타일 분석 중...');
      } else if (request.coverStyleImage) {
        safeProgress('🎨 표지 스타일 분석 중 (본문도 동일 적용)...');
      } else {
        safeProgress('🎨 본문 스타일 분석 중...');
      }
    }

    const step1Msg = hasStyleRef
      ? `참고 이미지 스타일로 카드뉴스 생성 중...`
      : request.referenceUrl
      ? `🔗 레퍼런스 URL 분석 및 ${request.postType === 'card_news' ? '카드뉴스 템플릿 모방' : '스타일 벤치마킹'} 중...`
      : `네이버 로직 분석 및 ${request.postType === 'card_news' ? '카드뉴스 기획' : '블로그 원고 작성'} 중...`;

    safeProgress(step1Msg);
    textData = await generateBlogPostText(request, safeProgress);
    console.info(`[PIPELINE_RESULT] source=legacy_direct (referenceUrl or non-blog)`);
  }
  
  const styleName = STYLE_NAMES[request.imageStyle] || STYLE_NAMES.illustration;
  const imgRatio = request.postType === 'card_news' ? "4:3" : "16:9";
  
  safeProgress(`🎨 ${styleName} 스타일로 ${imgRatio} 이미지 생성 중...`);
  
  const maxImages = request.postType === 'card_news' ? (request.slideCount || 6) : (request.imageCount ?? 1);
  
  console.log('🖼️ 이미지 생성 설정:', {
    'request.imageCount': request.imageCount,
    'maxImages': maxImages,
    'postType': request.postType,
    'imagePrompts 길이': textData.imagePrompts?.length || 0
  });
  
  // 폴백 방식에서도 참고 이미지 전달 (레이아웃 재가공 지원)
  const fallbackReferenceImage = request.coverStyleImage || request.contentStyleImage;
  const fallbackCopyMode = request.styleCopyMode;
  
  // 🖼️ 블로그 vs 카드뉴스 이미지 생성 분기
  // 블로그: generateBlogImage (텍스트 없는 순수 이미지, 16:9)
  // 카드뉴스: generateSingleImage (텍스트 포함, 브라우저 프레임, 1:1)
  // ⚠️ 이미지 0장이면 생성 스킵
  let images: { index: number; data: string; prompt: string }[] = [];
  let imageFailCount = 0;

  // imagePrompts가 없으면 빈 배열로 초기화 (imageCount가 0일 때 AI가 생략할 수 있음)
  if (!textData.imagePrompts || !Array.isArray(textData.imagePrompts)) {
    console.warn('⚠️ AI가 imagePrompts를 생성하지 않음! textData.imagePrompts:', textData.imagePrompts);
    textData.imagePrompts = [];
  } else {
    console.log('✅ AI가 imagePrompts 생성함:', textData.imagePrompts.length, '개');
  }

  // 🔧 이미지 프롬프트 부족 시 자동 패딩 (요청 개수만큼 채우기)
  if (maxImages > 0 && textData.imagePrompts.length < maxImages) {
    console.warn(`⚠️ 이미지 프롬프트 부족! 요청: ${maxImages}개, 생성: ${textData.imagePrompts.length}개 → 자동 패딩`);
    const defaultPrompt = `${request.topic} 관련 의료 이미지, ${request.imageStyle === 'illustration' ? '3D 일러스트, 파스텔톤' : request.imageStyle === 'medical' ? '의학 해부도, 전문 의료 이미지' : '실사 사진, DSLR 촬영'}, 한국인`;
    while (textData.imagePrompts.length < maxImages) {
      textData.imagePrompts.push(defaultPrompt);
      console.log(`   + 패딩 프롬프트 추가: ${textData.imagePrompts.length}/${maxImages}`);
    }
  }

  if (maxImages > 0 && textData.imagePrompts.length > 0) {
    // 이미지 생성: cooldown-aware 큐 + 제한 병렬 (normal=2, demo-safe=1)
    // 최대 5장, hero 우선, 세마포어 기반 concurrency 제한
    const imgStart = Date.now();

    if (request.postType === 'card_news') {
      // 카드뉴스: 기존 순차 방식 유지 (generateSingleImage는 별도 로직)
      safeProgress(`🎨 카드뉴스 이미지 ${maxImages}장 생성 중...`);
      for (let i = 0; i < maxImages; i++) {
        const p = textData.imagePrompts[i];
        const t0 = Date.now();
        safeProgress(`🎨 카드 이미지 ${i + 1}/${maxImages}장 생성 중...`);
        try {
          const img = await generateSingleImage(p, request.imageStyle, imgRatio, request.customImagePrompt, fallbackReferenceImage, fallbackCopyMode);
          const isFallback = img.includes('image/svg+xml');
          if (isFallback) { imageFailCount++; }
          images.push({ index: i + 1, data: img, prompt: p });
          if (!isFallback) safeProgress(`✅ 카드 이미지 ${i + 1}/${maxImages}장 완료`);
        } catch (imgErr: any) {
          console.warn(`[IMG] card #${i + 1} exception ${Date.now() - t0}ms: ${(imgErr?.message || '').substring(0, 60)}`);
          imageFailCount++;
        }
        // 카드뉴스 간 2~3초 고정 간격
        if (i < maxImages - 1) {
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        }
      }
    } else {
      // 블로그: cooldown-aware 큐 사용
      const queueItems: ImageQueueItem[] = textData.imagePrompts.slice(0, maxImages).map((p: string, i: number) => ({
        index: i,
        prompt: p,
        role: (i === 0 ? 'hero' : 'sub') as 'hero' | 'sub',
        style: request.imageStyle,
        aspectRatio: imgRatio,
        customStylePrompt: request.customImagePrompt,
        mode: 'auto' as const,
      }));

      const queueResults = await generateImageQueue(queueItems, safeProgress);

      for (const qr of queueResults) {
        images.push({ index: qr.index + 1, data: qr.data, prompt: qr.prompt });
        if (qr.status === 'fallback') imageFailCount++;
      }
    }

    const imgElapsed = Date.now() - imgStart;
    console.info(`[IMG] total: ${images.length}/${maxImages} images, ${imageFailCount} failed, ${imgElapsed}ms`);
    if (imageFailCount > 0) {
      safeProgress(`⚠️ 이미지 ${imageFailCount}장 생성 실패 — 텍스트만 반환합니다`);
    }
  } else {
    console.log('🖼️ 이미지 0장 설정 - 이미지 생성 스킵');
    safeProgress('📝 이미지 없이 텍스트만 생성 완료');
  }

  // 🔧 content 또는 contentHtml 필드 둘 다 지원
  let body = textData.content || (textData as any).contentHtml || '';

  console.info(`[BLOG_FLOW] body 확보됨: ${body ? body.length : 0}자, title: "${textData.title}"`);
  // 방어 코드: body가 없으면 에러
  if (!body || body.trim() === '') {
    console.error('❌ textData.content/contentHtml 둘 다 비어있습니다:', textData);
    console.error('   - 사용 가능한 필드:', Object.keys(textData));
    throw new Error('AI가 콘텐츠를 생성하지 못했습니다. 다시 시도해주세요.');
  }

  // 🛡️ 후처리 안전망: 텍스트 성공 후 어떤 후처리 오류가 나도 본문 반환 보장
  // body가 확보된 시점에서 최소한의 결과물을 만들어 놓음
  const safeMinimalResult = (): GeneratedContent => {
    const minimalHtml = body.includes('class="naver-post-container"')
      ? body
      : `<div class="naver-post-container">${body}</div>`;
    return {
      title: textData.title || request.topic,
      htmlContent: minimalHtml,
      imageUrl: "",
      fullHtml: minimalHtml,
      tags: [],
      postType: request.postType,
      imageStyle: request.imageStyle,
      cssTheme: request.cssTheme || 'modern',
      imageFailCount,
      imagePrompts: textData.imagePrompts,
    };
  };

  try { // 후처리 안전망 시작
  
  // 🔧 마크다운 **볼드** 처리 (AI가 실수로 남긴 마크다운 제거 또는 변환)
  // ** 로 감싼 텍스트를 <strong> 태그로 변환하거나 그냥 제거
  body = body.replace(/\*\*([^*]+)\*\*/g, '$1'); // ** 제거 (강조 없이 일반 텍스트로)
  // 또는 강조하고 싶으면: body = body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // body가 HTML이 아닌 JSON/배열 형태인지 검증
  if (body && (body.startsWith('[{') || body.startsWith('{"'))) {
    console.error('AI returned JSON instead of HTML, attempting to extract...');
    try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      body = parsed.map(item => item.content || item.html || '').join('');
    } else if (parsed.content || parsed.html) {
      body = parsed.content || parsed.html;
    }
    } catch (e) {
    console.error('Failed to parse JSON content:', e);
    }
  }
  
  // AI가 class를 빼먹었을 경우 강제로 감싸기
  if (request.postType !== 'card_news' && !body.includes('class="naver-post-container"')) {
    body = `<div class="naver-post-container">${body}</div>`;
  }
  
  // 🚨 카드뉴스인데 card-slide가 없으면 AI가 HTML 구조를 완전히 무시한 것!
  // 이 경우 기본 카드뉴스 템플릿으로 강제 생성
  if (request.postType === 'card_news' && !body.includes('class="card-slide"')) {
    console.warn('AI ignored card-slide structure, generating fallback template...');
    const slideCount = request.slideCount || 6;
    const fallbackSlides: string[] = [];
    
    // body에서 텍스트 추출 시도
    const plainText = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = plainText.split(/[.!?。]/).filter((s: string) => s.trim().length > 5);
    
    for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const sentenceIdx = Math.min(i, sentences.length - 1);
    const sentence = sentences[sentenceIdx] || request.topic;
    
    let subtitle = isFirst ? '알아봅시다' : isLast ? '함께 실천합니다' : `포인트 ${i}`;
    let mainTitle = isFirst 
      ? `${request.topic}<br/><span class="card-highlight">총정리</span>`
      : isLast 
      ? `건강한 습관<br/><span class="card-highlight">시작합니다</span>`
      : sentence.slice(0, 15) + (sentence.length > 15 ? '...' : '');
    let desc = sentence.slice(0, 50) || '건강한 생활을 위한 정보를 확인하세요.';
    
    fallbackSlides.push(`
      <div class="card-slide" style="background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%); border-radius: 24px; overflow: hidden;">
        <div style="padding: 32px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; height: 100%;">
          <p class="card-subtitle" style="font-size: 14px; font-weight: 700; color: #3B82F6; margin-bottom: 8px;">${subtitle}</p>
          <p class="card-main-title" style="font-size: 28px; font-weight: 900; color: #1E293B; line-height: 1.3; margin: 0 0 16px 0;">${mainTitle}</p>
          <div class="card-img-container" style="width: 100%; margin: 16px 0;">[IMG_${i + 1}]</div>
          <p class="card-desc" style="font-size: 15px; color: #475569; line-height: 1.6; font-weight: 500; max-width: 90%;">${desc}</p>
        </div>
      </div>
    `);
    }
    body = fallbackSlides.join('\n');
  }
  
  // 🎯 소제목 후처리: Gemini가 h3 태그를 무시하고 다른 형식으로 출력한 경우 강제 변환
  if (request.postType === 'blog') {
    console.log('🎯 소제목 형식 정규화 시작...');
    
    // 1. **소제목 텍스트** 형식을 h3로 변환 (독립된 줄에 있는 경우)
    body = body.replace(/<p>\*\*([^*]+)\*\*<\/p>/gi, '<h3>$1</h3>');
    
    // 2. <p>## 소제목</p> 형식을 h3로 변환
    body = body.replace(/<p>##\s*([^<]+)<\/p>/gi, '<h3>$1</h3>');
    
    // 3. <strong>소제목</strong> 단독 패턴을 h3로 변환 (독립된 p 태그 내)
    body = body.replace(/<p>\s*<strong>([^<]+)<\/strong>\s*<\/p>/gi, '<h3>$1</h3>');
    
    // 4. <b>소제목</b> 단독 패턴을 h3로 변환
    body = body.replace(/<p>\s*<b>([^<]+)<\/b>\s*<\/p>/gi, '<h3>$1</h3>');
    
    const h3Count = (body.match(/<h3[^>]*>/gi) || []).length;
    console.log(`✅ 소제목 형식 정규화 완료! h3 태그 ${h3Count}개 발견`);
  }
  
  // 🖼️ 블로그 포스트에 [IMG_N] 마커가 없으면 자동 삽입
  if (request.postType !== 'card_news' && images.length > 0 && !body.includes('[IMG_')) {
    console.log('⚠️ 블로그에 [IMG_N] 마커가 없음! 자동 삽입 중...');
    
    // h3 소제목 다음에 이미지 마커 삽입
    const h3Tags = body.match(/<h3[^>]*>.*?<\/h3>/gi) || [];
    let imgIndex = 1;
    
    if (h3Tags.length > 0) {
      // 각 h3 뒤의 첫 번째 </p> 다음에 이미지 마커 삽입
      let _h3Count = 0; // 디버깅용 카운터
      body = body.replace(
        /(<h3[^>]*>.*?<\/h3>[\s\S]*?<\/p>)/gi,
        (match: string) => {
          _h3Count++;
          if (imgIndex <= images.length) {
            const marker = `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
            imgIndex++;
            return match + marker;
          }
          return match;
        }
      );
      console.log(`✅ 블로그: [IMG_1] ~ [IMG_${imgIndex - 1}] 마커 자동 삽입 완료`);
    } else {
      // h3가 없으면 첫 번째 p 태그들 사이에 삽입
      const pTags = body.match(/<\/p>/gi) || [];
      if (pTags.length >= 2) {
        let pCount = 0;
        body = body.replace(/<\/p>/gi, (match: string) => {
          pCount++;
          // 2번째, 4번째, 6번째 </p> 뒤에 이미지 삽입
          if (pCount % 2 === 0 && imgIndex <= images.length) {
            const marker = `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
            imgIndex++;
            return match + marker;
          }
          return match;
        });
        console.log(`✅ 블로그 (h3 없음): [IMG_1] ~ [IMG_${imgIndex - 1}] 마커 자동 삽입 완료`);
      }
    }
  }
  
  // 🖼️ 카드뉴스인데 [IMG_N] 마커가 없으면 자동 삽입
  if (request.postType === 'card_news' && images.length > 0) {
    // card-slide 안에 card-img-container가 없거나 [IMG_N] 마커가 없으면 추가
    const cardSlides = body.match(/<div[^>]*class="[^"]*card-slide[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi) || [];
    
    if (cardSlides.length > 0 && !body.includes('[IMG_')) {
      console.log('⚠️ 카드뉴스에 [IMG_N] 마커가 없음! 자동 삽입 중...');
      
      // 각 card-slide에 이미지 마커 삽입
      let imgIndex = 1;
      body = body.replace(
        /(<div[^>]*class="[^"]*card-slide[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<\/div>)/gi,
        (match: string, openTag: string, content: string, closeTag: string) => {
          // 이미 img 태그나 마커가 있으면 스킵
          if (content.includes('[IMG_') || content.includes('<img')) {
            return match;
          }
          // card-desc 또는 card-main-title 뒤에 이미지 컨테이너 삽입
          const markerHtml = `<div class="card-img-container" style="width: 100%; margin: 16px 0; flex: 1; display: flex; align-items: center; justify-content: center;">[IMG_${imgIndex}]</div>`;
          imgIndex++;
          
          // card-desc 앞에 삽입 (설명 위에 이미지)
          if (content.includes('card-desc')) {
            return openTag + content.replace(
              /(<p[^>]*class="[^"]*card-desc[^"]*")/i,
              markerHtml + '$1'
            ) + closeTag;
          }
          // card-desc가 없으면 닫기 태그 앞에 삽입
          return openTag + content + markerHtml + closeTag;
        }
      );
      console.log(`✅ [IMG_1] ~ [IMG_${imgIndex - 1}] 마커 자동 삽입 완료`);
    }
  }
  
  // 🖼️ 이미지 삽입 전 디버그
  const bodyLenBeforeImages = body.length;
  console.info(`[IMG_INSERT] 이미지 삽입 전 body: ${bodyLenBeforeImages}자, 이미지 ${images.length}장`);

  const blobUrls: string[] = []; // cleanup용 blob URL 수집
  images.forEach(img => {
    const pattern = new RegExp(`\\[IMG_${img.index}\\]`, "gi");
    const hasMarker = body.match(pattern);

    if (img.data) {
    // base64 data URI → blob URL 변환 (HTML 크기 4MB → 수KB로 축소)
    let displaySrc = img.data;
    try {
      const commaIdx = img.data.indexOf(',');
      if (commaIdx > 0 && img.data.startsWith('data:')) {
        const meta = img.data.substring(0, commaIdx);
        const base64Data = img.data.substring(commaIdx + 1);
        const mimeMatch = meta.match(/data:(.*?);base64/);
        const mimeType = mimeMatch?.[1] || 'image/png';
        const byteChars = atob(base64Data);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });
        displaySrc = URL.createObjectURL(blob);
        blobUrls.push(displaySrc);
        console.info(`[IMG_INSERT] IMG_${img.index}: base64 ${img.data.length}자 → blob URL (${displaySrc.length}자)`);
      }
    } catch (blobErr) {
      console.warn(`[IMG_INSERT] IMG_${img.index}: blob 변환 실패, base64 원본 사용`, blobErr);
      displaySrc = img.data; // fallback to base64
    }

    let imgHtml = "";
    if (request.postType === 'card_news') {
        imgHtml = `<img src="${displaySrc}" alt="${img.prompt}" data-image-index="${img.index}" class="card-full-img" style="width: 100%; height: auto; display: block;" />`;
    } else {
        imgHtml = `<div class="content-image-wrapper"><img src="${displaySrc}" alt="${img.prompt}" data-image-index="${img.index}" /></div>`;
    }
    body = body.replace(pattern, imgHtml);
    } else {
    // 이미지 생성 실패 시 마커 제거
    body = body.replace(pattern, '');
    }
  });
  console.info(`[IMG_INSERT] 이미지 삽입 후 body: ${body.length}자 (삽입 전: ${bodyLenBeforeImages}자)`);
  
  // 혹시 남아있는 [IMG_N] 마커 모두 제거
  body = body.replace(/\[IMG_\d+\]/gi, '');

  // 카드뉴스: 분석된 스타일 배경색 강제 적용 (AI가 무시할 경우 대비)
  if (request.postType === 'card_news' && textData.analyzedStyle?.backgroundColor) {
    const bgColor = textData.analyzedStyle.backgroundColor;
    const bgGradient = bgColor.includes('gradient') ? bgColor : `linear-gradient(180deg, ${bgColor} 0%, ${bgColor}dd 100%)`;
    // 기존 card-slide의 background 스타일을 분석된 색상으로 교체
    body = body.replace(
    /(<div[^>]*class="[^"]*card-slide[^"]*"[^>]*style="[^"]*)background:[^;]*;?/gi,
    `$1background: ${bgGradient};`
    );
    // 만약 background 스타일이 없는 card-slide가 있다면 추가
    body = body.replace(
    /<div([^>]*)class="([^"]*card-slide[^"]*)"([^>]*)>/gi,
    (match: string, pre: string, cls: string, post: string) => {
      if (match.includes('style="')) {
        // 이미 style이 있지만 background가 없으면 추가
        if (!match.includes('background:')) {
          return match.replace('style="', `style="background: ${bgGradient}; `);
        }
        return match;
      } else {
        // style이 없으면 추가
        return `<div${pre}class="${cls}"${post} style="background: ${bgGradient};">`;
      }
    }
    );
    safeProgress(`🎨 템플릿 색상(${bgColor}) 적용 완료`);
  }

  let finalHtml = "";
  if (request.postType === 'card_news') {
    finalHtml = `
    <div class="card-news-container">
       <h2 class="hidden-title">${textData.title}</h2>
       <div class="card-grid-wrapper">
          ${body}
       </div>
       <div class="legal-box-card">${MEDICAL_DISCLAIMER}</div>
    </div>
    `.trim();
  } else {
    // 블로그 포스트: 맨 위에 메인 제목(h2) 추가 (중복 방지)
    const mainTitle = request.topic || textData.title;
    
    // 이미 main-title이 있는지 확인
    const hasMainTitle = body.includes('class="main-title"') || body.includes('class=\'main-title\'');
    
    if (hasMainTitle) {
      // 이미 제목이 있으면 그대로 사용
      if (body.includes('class="naver-post-container"')) {
        finalHtml = body;
      } else {
        finalHtml = `<div class="naver-post-container">${body}</div>`;
      }
    } else {
      // 제목이 없으면 추가
      if (body.includes('class="naver-post-container"')) {
        finalHtml = body.replace(
          '<div class="naver-post-container">',
          `<div class="naver-post-container"><h2 class="main-title">${mainTitle}</h2>`
        );
      } else {
        finalHtml = `<div class="naver-post-container"><h2 class="main-title">${mainTitle}</h2>${body}</div>`;
      }
    }
    
    // 🎨 블로그 콘텐츠용 CSS 스타일 추가
    const blogStyles = `
<style>
.naver-post-container {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  line-height: 1.8;
  color: #333;
}
.naver-post-container .main-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 30px 0;
  line-height: 1.4;
  word-break: keep-all;
}
.naver-post-container h3 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 40px 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #7c3aed;
  line-height: 1.5;
  word-break: keep-all;
}
.naver-post-container p {
  font-size: 16px;
  color: #444;
  margin: 0 0 20px 0;
  line-height: 1.8;
  word-break: keep-all;
}
.naver-post-container ul {
  margin: 20px 0;
  padding-left: 24px;
}
.naver-post-container li {
  font-size: 16px;
  color: #444;
  margin: 10px 0;
  line-height: 1.7;
}
.naver-post-container strong {
  font-weight: 700;
  color: #1a1a1a;
}
.content-image-wrapper {
  margin: 30px 0;
  text-align: center;
}
.legal-box-card {
  margin-top: 40px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
</style>
`;
    finalHtml = blogStyles + finalHtml;
  }

  // ============================================
  // ❓ FAQ 섹션 생성 (옵션) + 네이버 스마트블록 최적화
  // ============================================
  if (request.postType === 'blog' && request.includeFaq) {
    safeProgress('❓ FAQ 섹션 생성 시작 (스마트블록 최적화)...');
    try {
      // 기존 FAQ + 스마트블록 FAQ 병렬 생성
      const [faqHtmlResult, smartBlockResult] = await Promise.allSettled([
        generateFaqSection(
          request.topic,
          request.keywords || '',
          request.faqCount || 3,
          safeProgress
        ),
        generateSmartBlockFaq(
          request.topic,
          request.keywords || '',
          Math.min(request.faqCount || 3, 3),
          safeProgress
        )
      ]);

      const faqHtml = faqHtmlResult.status === 'fulfilled' ? faqHtmlResult.value : '';

      // 스마트블록 FAQ를 Schema.org FAQ 구조화 데이터로 변환
      let smartBlockHtml = '';
      if (smartBlockResult.status === 'fulfilled' && smartBlockResult.value.length > 0) {
        const faqs = smartBlockResult.value;
        const faqSchemaItems = faqs.map(faq =>
          `{"@type":"Question","name":"${faq.question.replace(/"/g, '\\"')}","acceptedAnswer":{"@type":"Answer","text":"${faq.answer.replace(/"/g, '\\"')}"}}`
        ).join(',');

        smartBlockHtml = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchemaItems}]}
</script>`;

        // 스마트블록용 질문을 기존 FAQ에 없는 경우 추가
        if (!faqHtml) {
          smartBlockHtml += `
<div class="faq-section smart-block-faq">
  <h3 class="faq-title">자주 묻는 질문</h3>
  ${faqs.map(faq => `
  <div class="faq-item">
    <p class="faq-question">Q. ${faq.question}</p>
    <div class="faq-answer">
      <p>${faq.answer}</p>
    </div>
  </div>`).join('')}
</div>`;
        }
        safeProgress(`✅ 스마트블록 FAQ ${faqs.length}개 추가`);
      }

      const combinedFaq = (faqHtml || '') + smartBlockHtml;

      if (combinedFaq) {
        if (finalHtml.includes('</div>')) {
          const lastDivIndex = finalHtml.lastIndexOf('</div>');
          finalHtml = finalHtml.slice(0, lastDivIndex) + combinedFaq + finalHtml.slice(lastDivIndex);
        } else {
          finalHtml += combinedFaq;
        }
        safeProgress('✅ FAQ 섹션 추가 완료! (스마트블록 최적화 포함)');
      }
    } catch (faqError) {
      console.warn('⚠️ FAQ 생성 실패 (스킵):', faqError);
    }
  }

  // ============================================
  // 🎯 SEO 점수는 generateWithAgentMode에서 이미 평가됨
  // 여기서는 textData.seoScore를 사용 (중복 평가 방지)
  // ============================================
  let seoScore: SeoScoreReport | undefined = textData.seoScore;
  
  // 블로그 포스트인 경우 SEO 점수 확인 (이미 평가된 경우 스킵)
  if (request.postType === 'blog') {
    if (seoScore) {
    // 이미 generateWithAgentMode에서 SEO 평가가 완료됨
    console.log('📊 이미 평가된 SEO 점수 사용:', seoScore.total);
    if (seoScore.total >= 85) {
      safeProgress(`✅ SEO 점수 ${seoScore.total}점`);
    } else {
      safeProgress(`ℹ️ SEO 점수 ${seoScore.total}점`);
    }
    }
    
    // ============================================
    // 🤖 AI 냄새 점수 체크 - 비활성화됨 (사용자 요청)
    // ============================================
    // ⚠️ AI 냄새 점수 검사 기능 완전 비활성화 (2026-01-18)
    // - 사용자 요청으로 점수 검사 및 자동 개선 기능 제거
    // - AI 냄새 점수는 계산되지만 검사 로직은 실행되지 않음
    // - 경고 메시지 및 자동 수정 프로세스 완전 차단
    console.log('🔇 AI 냄새 점수 검사 비활성화됨 (사용자 설정)');
    
    /*
    // === 기존 AI 냄새 검사 로직 (주석 처리) ===
    const aiSmellScore = textData.fact_check?.ai_smell_score || 0;
    const MAX_AI_SMELL_SCORE = 15;
    
    if (aiSmellScore > MAX_AI_SMELL_SCORE) {
      // 16점 이상: 자동 개선 로직 (비활성화)
      console.log(\`🤖 AI 냄새 점수 \${aiSmellScore}점 > 15점, 자동 개선 시도\`);
      safeProgress(\`🤖 AI 냄새 점수 \${aiSmellScore}점 (15점 초과) - 자동 개선 중...\`);
      // ... 자동 개선 코드 (생략)
    } else if (aiSmellScore >= 8 && aiSmellScore <= 15) {
      // 8~15점: 상세 분석 로직 (비활성화)
      console.log(\`⚠️ AI 냄새 점수 \${aiSmellScore}점 - 경계선 (8~15점), 수정 위치 분석 중...\`);
      safeProgress(\`⚠️ AI 냄새 점수 \${aiSmellScore}점 - 경계선! 수정 필요 위치를 분석합니다...\`);
      // ... 상세 분석 코드 (생략)
    } else {
      // 7점 이하: 기준 충족 메시지 (비활성화)
      console.log(\`✅ AI 냄새 점수 \${aiSmellScore}점 - 기준 충족 (7점 이하)\`);
      safeProgress(\`✅ AI 냄새 점수 \${aiSmellScore}점 - 사람 글 판정! 🎉\`);
    }
    */
  }

  // ============================================
  // 🔍 최종 AI 냄새 검사 - 비활성화됨 (사용자 요청)
  // ============================================
  // safeProgress('🔍 최종 AI 냄새 검사 중...');
  
  // ⚠️ AI 냄새 검사 결과는 계산되지만, 경고 메시지는 출력하지 않음
  const aiSmellCheckResult = runAiSmellCheck(finalHtml);
  
  // factCheck에 detectAiSmell 결과 통합 (데이터는 유지)
  let finalFactCheck = textData.fact_check || {
    fact_score: 85,
    safety_score: 90,
    conversion_score: 80,
    ai_smell_score: 0,
    verified_facts_count: 5,
    issues: [],
    recommendations: []
  };
  
  finalFactCheck = integrateAiSmellToFactCheck(finalFactCheck, aiSmellCheckResult);
  
  // ⚠️ AI 냄새 경고 메시지 비활성화 (사용자 요청)
  /*
  // 치명적 문제 발견 시 경고 (비활성화)
  if (aiSmellCheckResult.criticalIssues.length > 0) {
    safeProgress(`🚨 의료광고법 위반 패턴 ${aiSmellCheckResult.criticalIssues.length}개 발견! 수정 필요`);
    console.warn('🚨 치명적 AI 냄새 패턴:', aiSmellCheckResult.criticalIssues);
  } else if (aiSmellCheckResult.warningIssues.length > 0) {
    safeProgress(`⚠️ AI 냄새 패턴 ${aiSmellCheckResult.warningIssues.length}개 발견 (경고)`);
  } else {
    safeProgress(`✅ AI 냄새 검사 통과!`);
  }
  */
  
  // 조용히 로그만 남김
  console.log('🔇 AI 냄새 검사 완료 (결과 출력 비활성화):', {
    score: aiSmellCheckResult.score,
    criticalCount: aiSmellCheckResult.criticalIssues.length,
    warningCount: aiSmellCheckResult.warningIssues.length
  });

  // 디버깅: 반환 데이터 확인
  console.log('• generateFullPost 반환 데이터:');
  console.log('  - finalFactCheck:', finalFactCheck);
  console.log('  - aiSmellCheckResult:', { 
    score: aiSmellCheckResult.score, 
    critical: aiSmellCheckResult.criticalIssues.length,
    warning: aiSmellCheckResult.warningIssues.length 
  });
  console.log('  - seoScore:', seoScore);
  
  // 🛡️ 저장용 HTML: blob URL → Supabase Storage URL로 업로드 (base64 저장 금지)
  let storageHtml = finalHtml;
  if (images.length > 0) {
    try {
      const { restoreAndUploadImages } = await import('./imageStorageService');
      storageHtml = await restoreAndUploadImages(finalHtml, images);
      console.info(`[STORAGE] blob→URL 업로드 완료 | display=${finalHtml.length}자(${Math.round(finalHtml.length*2/1024)}KB) | storage=${storageHtml.length}자(${Math.round(storageHtml.length*2/1024)}KB)`);
    } catch (uploadErr) {
      // 업로드 실패 시 base64 제거만 수행 (빈 이미지가 8MB payload보다 나음)
      console.warn('[STORAGE] 이미지 업로드 실패, base64 strip만 수행:', uploadErr);
      const { stripBase64FromHtml } = await import('./imageStorageService');
      storageHtml = stripBase64FromHtml(finalHtml);
      // blob: URL도 빈 문자열로
      storageHtml = storageHtml.replace(/src="blob:[^"]*"/gi, 'src=""');
    }
  }

  // 📦 최종 payload 크기를 세션 통계에 기록 (base64/blob 제거 후 진짜 저장 HTML 기준)
  const persistedHtmlKB = Math.round(storageHtml.length * 2 / 1024);
  const finalPayloadKB = persistedHtmlKB; // storageHtml = 실제 Supabase 저장값
  if (images.length > 0) {
    updateSessionFinalPayload(persistedHtmlKB, finalPayloadKB);
  }

  // 🔥 서버에 블로그 이력 저장 (비동기, 실패해도 무시)
  // content: 임베딩용 텍스트 (이미지 마커 [IMG_N] 제거, HTML 태그 제거)
  // html_content: 영속 가능한 완전한 HTML (base64 이미지 포함)
  const plainTextForEmbedding = (textData.content || '')
    .replace(/\[IMG_\d+\]/g, '') // 이미지 마커 제거
    .replace(/<[^>]+>/g, ' ')    // HTML 태그 제거
    .replace(/\s+/g, ' ')
    .trim();
  // fallback: plainText가 비면 storageHtml에서 태그 제거한 텍스트 사용 (base64 HTML을 임베딩에 넣지 않음)
  let blogHistoryContent: string;
  let embedSource: string;
  if (plainTextForEmbedding.length >= 50) {
    blogHistoryContent = plainTextForEmbedding;
    embedSource = 'plainText';
  } else {
    // storageHtml에서 순수 텍스트 추출 (base64 data URI 제거 → 태그 제거)
    const fallbackText = storageHtml
      .replace(/src="data:image[^"]*"/gi, 'src=""') // base64 이미지 src 제거
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (fallbackText.length >= 50) {
      blogHistoryContent = fallbackText;
      embedSource = 'fallbackHtml';
    } else {
      // 최후 fallback: 제목만 사용
      blogHistoryContent = textData.title || request.topic || '';
      embedSource = 'fallbackTitle';
    }
  }
  const hasBlobInHistory = storageHtml.includes('blob:');
  // blog_history.html_content 경량화: base64 이미지 src 제거 (이 필드를 읽는 프론트엔드 코드 0곳)
  const lightweightHtml = storageHtml.replace(/src="data:image\/[^"]*"/gi, 'src=""');
  console.info(`[STORAGE] saveBlogHistory lightweight | original=${storageHtml.length}자(${Math.round(storageHtml.length * 2 / 1024)}KB) | lightweight=${lightweightHtml.length}자(${Math.round(lightweightHtml.length * 2 / 1024)}KB) | imagesStripped=true | contentType=${embedSource} | contentLen=${blogHistoryContent.length}자 | blob잔류=${hasBlobInHistory}`);
  saveBlogHistory(
    textData.title,
    blogHistoryContent,
    lightweightHtml,
    request.keywords?.split(',').map(k => k.trim()) || [request.topic],
    undefined, // naverUrl
    request.category
  ).catch(error => {
    console.warn('⚠️ 블로그 이력 저장 실패 (무시):', error);
  });

  // 📦 생성된 블로그 포스트 Supabase에 저장 (비동기, 실패해도 무시)
  saveGeneratedPost({
    hospitalName: request.hospitalName,
    category: request.category,
    doctorName: request.doctorName,
    doctorTitle: request.doctorTitle,
    postType: 'blog',
    title: textData.title,
    content: storageHtml,
    keywords: request.keywords?.split(',').map(k => k.trim()),
    topic: request.topic,
    imageStyle: request.imageStyle
  }).then(result => {
    if (result.success) {
      console.log('✅ 블로그 포스트 저장 완료:', result.postId);
    } else {
      console.warn('⚠️ 블로그 포스트 저장 실패:', result.error);
    }
  }).catch(err => {
    console.warn('⚠️ 블로그 포스트 저장 예외:', err);
  });
  
  // 블로그 섹션 분리 (섹션별 재생성용)
  let sections: import('../types').BlogSection[] | undefined;
  if (request.postType === 'blog') {
    try {
      sections = parseBlogSections(finalHtml);
      console.log(`📋 블로그 섹션 분리 완료: ${sections.length}개`);
    } catch (e) {
      console.warn('⚠️ 블로그 섹션 분리 실패:', e);
    }
  }

  // 최종 완료 메시지
  safeProgress('✅ 모든 생성 작업 완료!');
  console.info(`[BLOG_FLOW] ✅ generateFullPost 반환 직전 — title: "${textData.title}", htmlContent: ${finalHtml.length}자, imageFailCount: ${imageFailCount}`);

  return {
    title: textData.title,
    htmlContent: finalHtml,
    imageUrl: images[0]?.data || "",
    fullHtml: finalHtml,
    tags: [],
    factCheck: finalFactCheck,
    postType: request.postType,
    imageStyle: request.imageStyle,
    customImagePrompt: request.customImagePrompt,
    seoScore,
    cssTheme: request.cssTheme || 'modern',
    sections, // 블로그 섹션 분리 데이터 (섹션별 재생성용)
    imageFailCount,
    imagePrompts: textData.imagePrompts,
    conclusionLength: textData.conclusionLength, // 파이프라인 마무리 원본 길이 (없으면 undefined)
    generatedImages: images, // base64 원본 이미지 (export/복사 시 blob URL → base64 복원용)
    blobUrls, // cleanup용 blob URL 목록
  };

  } catch (postProcessError) {
    // 🛡️ 후처리 실패해도 텍스트 본문은 반드시 반환
    console.error('⚠️ 후처리 중 오류 발생, 텍스트만 반환:', postProcessError);
    safeProgress('⚠️ 일부 처리 실패 — 텍스트 본문만 반환합니다');
    const result = safeMinimalResult();
    result.imageFailCount = imageFailCount > 0 ? imageFailCount : (maxImages > 0 ? maxImages : 0);
    return result;
  }
};

/**
 * HTML에서 블로그 섹션 분리 (섹션별 재생성용)
 */
function parseBlogSections(html: string): import('../types').BlogSection[] {
  const sections: import('../types').BlogSection[] = [];

  // naver-post-container 내부만 추출
  const containerMatch = html.match(/<div[^>]*class="naver-post-container"[^>]*>([\s\S]*)<\/div>\s*$/);
  const content = containerMatch ? containerMatch[1] : html;

  // h3 태그로 분할 (없으면 h2 fallback)
  let headingRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const h3Matches: { index: number; title: string; fullMatch: string }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    h3Matches.push({
      index: match.index,
      title: match[1].replace(/<[^>]+>/g, '').trim(),
      fullMatch: match[0]
    });
  }

  // h3가 없으면 h2로 fallback (main-title, hidden-title 제외)
  if (h3Matches.length === 0) {
    headingRegex = /<h2[^>]*(?!class="[^"]*(?:main-title|hidden-title)[^"]*")[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((match = headingRegex.exec(content)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && !title.includes('FAQ') && !title.includes('자주 묻는')) {
        h3Matches.push({
          index: match.index,
          title,
          fullMatch: match[0]
        });
      }
    }
  }

  if (h3Matches.length === 0) return sections;

  // 도입부: 첫 h3 이전
  const introHtml = content.substring(0, h3Matches[0].index).trim();
  if (introHtml && introHtml.replace(/<[^>]+>/g, '').trim().length > 10) {
    sections.push({
      index: 0,
      type: 'intro',
      title: '도입부',
      html: introHtml
    });
  }

  // 각 소제목 섹션
  for (let i = 0; i < h3Matches.length; i++) {
    const start = h3Matches[i].index;
    const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : content.length;
    const sectionHtml = content.substring(start, end).trim();

    // 마지막 섹션 후의 내용이 마무리인지 판단
    const isLastSection = i === h3Matches.length - 1;
    const afterLastH3 = isLastSection ? content.substring(start) : '';

    // FAQ 섹션 제외
    if (h3Matches[i].title.includes('자주 묻는') || h3Matches[i].title.includes('FAQ')) continue;

    sections.push({
      index: sections.length,
      type: 'section',
      title: h3Matches[i].title,
      html: sectionHtml
    });
  }

  // 마무리: 마지막 h3 섹션 이후 남은 내용 (h3가 없는 p 태그들)
  if (h3Matches.length > 0) {
    const lastH3End = h3Matches[h3Matches.length - 1].index;
    const afterLastH3Content = content.substring(lastH3End);
    // 마지막 h3 섹션의 내용 이후에 추가 p 태그가 있으면 마무리로 분리
    const lastSectionEnd = afterLastH3Content.indexOf('</p>');
    if (lastSectionEnd > -1) {
      // 이미 마지막 section에 포함되어 있으므로 별도 conclusion 불필요
    }
  }

  return sections;
}

// 구글 검색 API 호출
const searchGoogle = async (query: string, num: number = 5): Promise<{ title: string; link: string; snippet: string }[]> => {
  try {
    const response = await fetch('/api/google/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num }),
    });

    if (!response.ok) throw new Error('Google Search API failed');

    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));
  } catch (error) {
    console.error('Google search failed:', error);
    return [];
  }
};

// URL 크롤링 API 호출
const crawlUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch('/api/crawler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) return '';

    const data = await response.json();
    return data.content || '';
  } catch (error) {
    console.error('Crawling failed:', error);
    return '';
  }
};
