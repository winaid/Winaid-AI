/**
 * competitorVocabService.ts - 경쟁사 어휘 분석 서비스 (하이브리드)
 *
 * 방법 A: 하드코딩된 기본 금지 단어 (AI 특유 표현 vs 실제 블로거 어휘 차이)
 * 방법 B: 동적 경쟁사 크롤링 → Gemini 분석 → 금지 단어 실시간 추출
 *
 * 두 방법을 결합하여 "사람이 안 쓰는 표현"을 글 생성 시 자동 차단
 */
import { callGemini, GEMINI_MODEL, TIMEOUTS } from './geminiClient';
import { searchNaverBlogsByCrawling } from './naverSearchService';

// ─────────────────────────────────────
// 방법 A: 하드코딩된 기본 금지 단어 목록
// ─────────────────────────────────────

/**
 * AI가 자주 쓰지만 실제 병의원 블로거가 거의 안 쓰는 표현 모음.
 * gpt52-prompts-staged.ts의 "딱딱한 단어"와 별도로,
 * 크롤링 분석을 통해 확인된 패턴들.
 */
export const BASE_FORBIDDEN_PATTERNS = {
  // 논문/교과서 어투 (블로그에서 절대 안 씀)
  academic: [
    '전반적으로', '종합적으로', '일반적으로',
    '근본적으로', '본질적으로', '궁극적으로',
    '불가피하게', '필연적으로', '불가결한',
    '수립하다', '도모하다', '모색하다',
    '지양하다', '지향하다', '수행하다',
    '나타내다', '드러내다', '시사하다',
    '상기하다', '감안하다', '유념하다',
  ],

  // AI 특유의 연결/전환 표현
  aiTransitions: [
    '한편', '더불어', '아울러', '나아가',
    '이처럼', '이러한', '이와 같이', '이를 통해',
    '무엇보다', '특히나', '주목할 점은',
    '다시 말해', '바꿔 말하면', '즉',
    '결론적으로', '요약하자면', '정리하면',
  ],

  // AI가 좋아하는 과장/강조 표현
  aiEmphasis: [
    '매우 중요한', '핵심적인', '필수적인',
    '결정적인', '획기적인', '혁신적인',
    '다양한', '폭넓은', '광범위한',
    '깊이 있는', '심도 있는', '면밀한',
  ],

  // AI 특유의 마무리 패턴
  aiClosings: [
    '도움이 되길 바랍니다',
    '도움이 되셨으면 합니다',
    '참고가 되셨으면',
    '건강한 삶을 위해',
    '건강한 생활',
    '일상 속에서',
    '소중한 건강',
    '더 나은 삶',
    '삶의 질',
  ],

  // 의료 블로그에서 AI가 남용하는 표현
  medicalAI: [
    '꾸준한 관리가 필요합니다',
    '조기 발견이 중요합니다',
    '정기적인 검진을 통해',
    '전문가와 상담을 통해',
    '적극적인 치료가',
    '체계적인 관리',
    '올바른 생활 습관',
    '균형 잡힌 식단',
    '규칙적인 운동',
  ],
} as const;

/**
 * 방법 A의 금지 단어를 프롬프트용 텍스트로 변환
 */
export function getBaseForbiddenWordsPrompt(): string {
  const lines: string[] = [];

  lines.push('[크롤링 기반 금지 표현 - 실제 병의원 블로거가 안 쓰는 말]');
  lines.push('아래 표현들은 실제 상위 노출 병의원 블로그에서 거의 사용하지 않는 AI 특유 표현입니다.');
  lines.push('');

  lines.push('금지 (논문/교과서 어투):');
  lines.push(`  ${BASE_FORBIDDEN_PATTERNS.academic.join(', ')}`);
  lines.push('');

  lines.push('금지 (AI 특유 연결어):');
  lines.push(`  ${BASE_FORBIDDEN_PATTERNS.aiTransitions.join(', ')}`);
  lines.push('');

  lines.push('금지 (AI 과장/강조):');
  lines.push(`  ${BASE_FORBIDDEN_PATTERNS.aiEmphasis.join(', ')}`);
  lines.push('');

  lines.push('금지 (AI 마무리 패턴):');
  for (const pattern of BASE_FORBIDDEN_PATTERNS.aiClosings) {
    lines.push(`  - "${pattern}"`);
  }
  lines.push('');

  lines.push('금지 (의료 AI 남용 표현):');
  for (const pattern of BASE_FORBIDDEN_PATTERNS.medicalAI) {
    lines.push(`  - "${pattern}"`);
  }

  return lines.join('\n');
}


// ─────────────────────────────────────
// 방법 B: 동적 경쟁사 어휘 분석
// ─────────────────────────────────────

export interface VocabAnalysisResult {
  keyword: string;
  analyzedBlogCount: number;
  /** 경쟁사가 자주 쓰는 자연스러운 표현 (참고용) */
  naturalExpressions: string[];
  /** 경쟁사가 안 쓰는 = AI가 쓰면 티나는 표현 (금지 대상) */
  unnaturalExpressions: string[];
  /** 분석 요약 */
  summary: string;
  /** 분석 시각 */
  timestamp: number;
}

// 캐시: 같은 키워드로 반복 크롤링 방지 (30분 TTL)
const vocabCache = new Map<string, VocabAnalysisResult>();
const CACHE_TTL = 30 * 60 * 1000; // 30분

/**
 * 경쟁사 블로그 크롤링 → 어휘 패턴 분석
 *
 * 1. 키워드로 네이버 상위 블로그 3~5개 크롤링
 * 2. 본문 텍스트를 Gemini에 보내서 어휘 분석
 * 3. "실제 블로거가 안 쓰는 표현" 목록 반환
 */
export async function analyzeCompetitorVocabulary(
  keyword: string,
  onProgress?: (msg: string) => void
): Promise<VocabAnalysisResult | null> {
  // 캐시 확인
  const cached = vocabCache.get(keyword);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    onProgress?.('📦 캐시된 경쟁사 어휘 분석 사용');
    return cached;
  }

  try {
    // Step 1: 상위 블로그 URL 검색
    onProgress?.('🔍 경쟁사 블로그 검색 중...');
    const blogs = await searchNaverBlogsByCrawling(keyword, 10);

    if (!blogs || blogs.length === 0) {
      console.warn('[어휘분석] 경쟁 블로그 검색 결과 없음');
      return null;
    }

    // Step 2: 상위 3~5개 블로그 본문 크롤링
    const API_BASE_URL = import.meta.env.VITE_API_URL || '';
    const blogContents: string[] = [];
    const maxBlogs = Math.min(blogs.length, 5);

    onProgress?.(`📖 상위 ${maxBlogs}개 블로그 본문 크롤링 중...`);

    for (let i = 0; i < maxBlogs; i++) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/crawler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: blogs[i].link }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.content && data.content.length > 200) {
            // 최대 2000자까지만 (API 비용 절약)
            blogContents.push(data.content.substring(0, 2000));
          }
        }

        // Rate limiting
        if (i < maxBlogs - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err) {
        console.warn(`[어휘분석] 블로그 ${i + 1} 크롤링 실패:`, err);
      }
    }

    if (blogContents.length === 0) {
      console.warn('[어휘분석] 크롤링된 본문 없음');
      return null;
    }

    // Step 3: Gemini로 어휘 분석
    onProgress?.(`🤖 ${blogContents.length}개 블로그 어휘 패턴 분석 중...`);

    const combinedContent = blogContents
      .map((c, i) => `[블로그 ${i + 1}]\n${c}`)
      .join('\n\n---\n\n');

    const analysisPrompt = `당신은 한국어 블로그 어휘 분석 전문가입니다.

아래는 "${keyword}" 키워드로 네이버 상위에 노출된 실제 병의원 블로그 ${blogContents.length}개의 본문입니다.
이 블로그들은 실제 마케터가 작성한 글이며, 네이버에서 상위 노출되고 있습니다.

[분석 대상 블로그 본문]
${combinedContent}

[분석 요청]
위 블로그들의 어휘 패턴을 분석해서 다음을 JSON으로 반환하세요:

1. naturalExpressions: 위 블로그들이 공통적으로 자주 쓰는 자연스러운 표현 (10~15개)
   - 실제 사람이 쓰는 자연스러운 단어/표현만
   - 예: "많이 나타납니다", "도움이 됩니다" 등

2. unnaturalExpressions: AI가 자주 쓰지만 위 블로그들에서는 거의 안 나타나는 표현 (15~20개)
   - 논문/교과서 투의 딱딱한 표현
   - AI 특유의 전환어나 연결 표현
   - 과장되거나 추상적인 형용사/부사
   - 실제 블로거가 안 쓰는 마무리 패턴
   - 예: "전반적으로", "나아가", "핵심적인", "도모하다"

3. summary: 이 키워드 분야의 블로그 글쓰기 특징 요약 (2~3줄)

중요: 실제 위 블로그 텍스트에 등장하지 않는 AI 특유 표현을 찾아내는 것이 핵심입니다.`;

    const result = await callGemini({
      prompt: analysisPrompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'json',
      timeout: TIMEOUTS.QUICK_OPERATION,
      temperature: 0.3,
      schema: {
        type: 'object',
        properties: {
          naturalExpressions: { type: 'array', items: { type: 'string' } },
          unnaturalExpressions: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['naturalExpressions', 'unnaturalExpressions', 'summary'],
      },
    });

    const analysis: VocabAnalysisResult = {
      keyword,
      analyzedBlogCount: blogContents.length,
      naturalExpressions: result.naturalExpressions || [],
      unnaturalExpressions: result.unnaturalExpressions || [],
      summary: result.summary || '',
      timestamp: Date.now(),
    };

    // 캐시 저장
    vocabCache.set(keyword, analysis);

    onProgress?.(`✅ 어휘 분석 완료: 금지 ${analysis.unnaturalExpressions.length}개, 참고 ${analysis.naturalExpressions.length}개`);

    return analysis;
  } catch (error) {
    console.error('[어휘분석] 에러:', error);
    onProgress?.('⚠️ 어휘 분석 실패 - 기본 금지 목록 사용');
    return null;
  }
}


// ─────────────────────────────────────
// 하이브리드 통합 (A + B)
// ─────────────────────────────────────

/**
 * 하이브리드 금지 단어 프롬프트 생성
 *
 * 방법 A (하드코딩) + 방법 B (동적 분석)를 결합하여
 * 블로그 생성 프롬프트에 주입할 금지 표현 블록을 반환
 */
export function buildForbiddenWordsPrompt(
  dynamicAnalysis: VocabAnalysisResult | null
): string {
  const sections: string[] = [];

  // 방법 A: 항상 포함
  sections.push(getBaseForbiddenWordsPrompt());

  // 방법 B: 동적 분석 결과가 있으면 추가
  if (dynamicAnalysis && dynamicAnalysis.unnaturalExpressions.length > 0) {
    sections.push('');
    sections.push(`[실시간 경쟁사 분석 기반 추가 금지 - "${dynamicAnalysis.keyword}" 키워드]`);
    sections.push(`네이버 상위 ${dynamicAnalysis.analyzedBlogCount}개 블로그를 분석한 결과,`);
    sections.push('실제 상위 블로거들이 사용하지 않는 표현:');

    for (const expr of dynamicAnalysis.unnaturalExpressions) {
      sections.push(`  금지: "${expr}"`);
    }

    if (dynamicAnalysis.naturalExpressions.length > 0) {
      sections.push('');
      sections.push('대신, 상위 블로거들이 실제 사용하는 표현 (참고):');
      for (const expr of dynamicAnalysis.naturalExpressions) {
        sections.push(`  참고: "${expr}"`);
      }
    }

    if (dynamicAnalysis.summary) {
      sections.push('');
      sections.push(`분석 요약: ${dynamicAnalysis.summary}`);
    }
  }

  return sections.join('\n');
}
