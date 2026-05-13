/**
 * 블로그 주제 추천 프롬프트 빌더 (블로그 8).
 *
 * 양 앱(public-app / next-app) 의 inline prompt 사본을 blog-core 로 통합. drift 0.
 * - count 통일 (이전: public 8 / next 5)
 * - CATEGORY_TONE (PR #194) tone/vocabulary/avoid 결합
 * - 다양성 가드: 5 intent (info/compare/guide/caution/aftercare) 균등 분산
 * - specificity 가드: 흔한 키워드 회피, long-tail 우선
 * - 의료광고법 가드 핵심 인용
 *
 * Gemini structured output (responseSchema) 호환.
 */

import { CATEGORY_TONE } from './blogPrompt';

export type TopicIntent = 'info' | 'compare' | 'guide' | 'caution' | 'aftercare';

export const TOPIC_INTENTS: readonly TopicIntent[] = [
  'info', 'compare', 'guide', 'caution', 'aftercare',
] as const;

export interface BlogTopicRecommendInput {
  /** 7 카테고리 enum (치과/피부과/성형외과/내과/정형외과/한의원/안과). 미등록 → fallback. */
  category?: string;
  /** 사용자 입력 키워드. 있으면 세부 주제, 없으면 진료과 트렌드. */
  keyword?: string;
  /** 추천 개수. default 8 (양 앱 통일). */
  count?: number;
}

export interface BlogTopicRecommendPrompt {
  prompt: string;
  systemInstruction: string;
  responseSchema: object;
}

const DEFAULT_COUNT = 8;

const COMMON_LAW_GUARD = `⚠️ 의료광고법 준수 필수:
- "최고", "최초", "유일", "100%" 등 과대광고 표현 금지
- "보장", "확실", "완치" 등 치료 효과 보장 표현 금지
- 전후 비교, 시술 후기, 특정 의료기관 추천 표현 금지
- "무통", "무절개" 등 부작용 가능성 축소 표현 주의
- 비급여 가격을 특정 금액으로 명시하지 않기
- 환자가 정보를 얻을 수 있는 교육형·정보형 주제로 작성`;

const DIVERSITY_GUARD = `[다양성 가드 — intent 균등 분산]
${DEFAULT_COUNT}개 추천 시 다음 5 intent 에 균등 분산:
- info: 정보형 (예: "임플란트란 무엇인가요")
- compare: 비교형 (예: "지르코니아 vs PFM 보철 비교")
- guide: 가이드형 (예: "임플란트 시술 단계별 안내")
- caution: 주의사항형 (예: "발치 후 피해야 할 음식")
- aftercare: 사후관리형 (예: "임플란트 평생 쓰는 관리법")
각 intent 가 최소 1개 이상 포함되도록.`;

const SPECIFICITY_GUARD = `[specificity 가드 — long-tail 우선]
흔한 단일 키워드 회피, 구체 long-tail 우선:
- ❌ "임플란트 가격" (너무 흔함, 의료법 risk)
- ✅ "임플란트 보철 종류별 차이" (long-tail, 정보형)
- ❌ "치아교정" (광범위)
- ✅ "투명교정 vs 클리피씨 선택 기준" (구체)
네이버 블로그 SEO 에 유리한 3-5 어절 long-tail 키워드 포함.`;

function buildCategoryToneSection(category?: string): string {
  if (!category || !CATEGORY_TONE[category]) return '';
  const t = CATEGORY_TONE[category];
  return `[${category} 카테고리 톤]
어조: ${t.tone}
권장 어휘: ${t.vocabulary.join(', ')}
금기 표현: ${t.avoid.join(', ')}
`;
}

export function buildBlogTopicRecommendPrompt(
  input: BlogTopicRecommendInput,
): BlogTopicRecommendPrompt {
  const count = input.count ?? DEFAULT_COUNT;
  const keyword = input.keyword?.trim();
  const category = input.category;

  const toneSection = buildCategoryToneSection(category);

  let prompt: string;
  if (keyword) {
    prompt = `"${keyword}" 키워드와 관련된 병원 마케팅용 블로그 주제를 ${count}개 추천해줘.

${toneSection}
규칙:
1. 환자가 실제로 네이버에서 검색할만한 구체적인 주제
2. 각 주제(topic)는 **20자 이내**로 짧고 핵심적으로 (예: "임플란트 오래 쓰는 법", "잇몸 출혈 원인")
3. 다양한 각도 (비용, 과정, 비교, 주의사항, 사후관리, 기간, 대상 등)
4. condition 에는 핵심 질환명 또는 시술명만 (예: "임플란트", "치주염", "라미네이트")
5. intent 필드는 ${TOPIC_INTENTS.join(' / ')} 중 하나 — ${count}개에 5종이 균등 분산
6. 웹 검색으로 최신 트렌드 반영
7. 네이버 블로그 SEO 에 유리한 롱테일 키워드 포함

${COMMON_LAW_GUARD}

${DIVERSITY_GUARD}

${SPECIFICITY_GUARD}`;
  } else {
    prompt = `${category || '의료'} 분야에서 요즘 환자들이 가장 많이 검색하는 핫한 블로그 주제 ${count}개를 추천해줘.

${toneSection}
규칙:
1. 최신 검색 트렌드 반영 (웹 검색으로 확인)
2. 각 주제(topic)는 **20자 이내**로 짧고 핵심적으로 (예: "사랑니 발치 후 식사", "치아미백 주의사항")
3. 환자 입장에서 관심 가질 구체적 주제
4. 시즌/계절 트렌드 포함 (지금 시기에 맞는)
5. condition 에는 핵심 질환명 또는 시술명만 (한 단어~두 단어)
6. intent 필드는 ${TOPIC_INTENTS.join(' / ')} 중 하나 — ${count}개에 5종이 균등 분산
7. 네이버 블로그 SEO 에 유리한 롱테일 키워드 포함

${COMMON_LAW_GUARD}

${DIVERSITY_GUARD}

${SPECIFICITY_GUARD}`;
  }

  return {
    prompt,
    systemInstruction:
      '병원 마케팅 트렌드 분석 전문가. JSON 만 출력. 마크다운/코드블록 금지. 의료광고법 엄격 준수.',
    responseSchema: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          condition: { type: 'STRING' },
          keywords: { type: 'STRING' },
          score: { type: 'NUMBER' },
          seasonal_factor: { type: 'STRING' },
          intent: { type: 'STRING', enum: [...TOPIC_INTENTS] },
        },
        required: ['topic', 'condition', 'keywords', 'score', 'seasonal_factor'],
      },
    },
  };
}
