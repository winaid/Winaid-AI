/**
 * faqService — FAQ + 스마트블록 + 섹션 재생성
 *
 * 구 geminiService.ts에서 추출됨 (현재 독립 모듈).
 * 독립 품질 기능으로 PRO 모델 사용이 허용됨.
 */

import { callGemini, GEMINI_MODEL } from './geminiClient';
import { searchKDCA } from './searchService';
import { getSectionRegeneratePrompt, getSmartBlockFaqPrompt } from '../lib/gpt52-prompts-staged';
import { SECTION_REGEN_TIMEOUT_MS, SMART_BLOCK_FAQ_TIMEOUT_MS } from '../core/generation/contracts';

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

// callGeminiWithSearch → searchService.ts로 이동됨


// MEDICAL_DISCLAIMER → resultAssembler.ts로 이동

// =============================================
// 🔍 AI 냄새 검사 헬퍼 함수 (detectAiSmell 연결)
// =============================================

/**
 * HTML에서 텍스트만 추출하여 AI 냄새 검사
 * - 블로그/카드뉴스 생성 후 자동 검사
 * - modifyPostWithAI() 수정 후 검증
 * - recheckAiSmell()에서 활용
 *
 * runAiSmellCheck, integrateAiSmellToFactCheck → contentQualityService.ts로 이동됨.
 */


// ── 섹션 재생성 ──

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
    timeout: SECTION_REGEN_TIMEOUT_MS,
    temperature: 0.85,
  });

  const newSection = typeof result === 'string' ? result.trim() : '';
  if (!newSection || !newSection.includes('<')) {
    throw new Error('섹션 재생성 실패');
  }

  safeProgress(`✅ "${sectionTitle}" 재생성 완료`);
  return newSection;
};

// ── 스마트블록 FAQ ──

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
    timeout: SMART_BLOCK_FAQ_TIMEOUT_MS,
    temperature: 0.6,
  });

  const faqs = faqResponse?.faqs || [];
  safeProgress(`✅ 스마트블록 FAQ ${faqs.length}개 생성 완료`);
  return faqs;
};
