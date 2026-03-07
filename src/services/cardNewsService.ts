/**
 * cardNewsService.ts - 카드뉴스 생성 시스템
 *
 * 미니 에이전트 방식 카드뉴스 생성:
 * - storyPlannerAgent: 스토리 기획
 * - assembleCardNewsHtml: HTML 조립
 * - fullImageCardPromptAgent: 카드 프롬프트 생성
 * - generateCardNewsScript: 2단계 워크플로우 원고 생성
 * - convertScriptToCardNews: 원고 → 카드뉴스 변환
 * - generateCardNewsWithAgents: 통합 오케스트레이터
 */
import { Type } from "@google/genai";
import { getAiClient } from "./geminiClient";
import { STYLE_KEYWORDS, cleanImagePromptText, translateStylePromptToKorean, getCurrentYear, analyzeStyleReferenceImage } from "./imageGenerationService";
import { DESIGNER_PERSONA, SERIES_DESIGN_RULES } from "./calendarTemplateService";
import type { GenerationRequest, ImageStyle, WritingStyle, CardPromptData, CardNewsScript } from "../types";
import {
  FEW_SHOT_EXAMPLES as _FEW_SHOT_EXAMPLES,
  CATEGORY_SPECIFIC_PROMPTS,
  PARAGRAPH_STRUCTURE_GUIDE
} from "../utils/humanWritingPrompts";

// =============================================
// 📝 공통 텍스트 상수
// =============================================

// 콘텐츠 설명 (카드뉴스 공통)
const CONTENT_DESCRIPTION = `이 콘텐츠는 의료정보 안내용 카드뉴스이며,
네이버 병원 블로그 및 SNS에 사용됩니다.
의료광고법을 준수하며, 직접적인 방문·예약 유도는 금지합니다.`;

// =============================================
// 글 스타일별 프롬프트 (의료법 100% 준수)
// =============================================
const getWritingStylePrompts = (): Record<WritingStyle, string> => {
  const _year = new Date().getFullYear();
  return {
  expert: `
[글쓰기 스타일: 전문가형 📚]
- 목표: 신뢰할 수 있는 정보를 알기 쉽게 전달
- 톤: 전문적이면서도 친근한 설명

[의료광고법 안전성 규칙 - 전문가형 강화]
🚨 절대 금지 표현 (P1 - 즉시 탈락):
  • 의심/판단/가능성/진단/체크/차이/여부 → 모두 0회
  • 자가체크 트리거 표현 절대 금지 (0회)
  • 환자/내원 → 0회
  • 기관명(연도) 형식 절대 금지

🚨 권유형 문장 - 본문 전체 금지! (마지막 문단 1회만 허용):
  • ~하세요/~해보세요/~받으세요 (명령형 - 절대 금지)
  • ~하는 것이 좋습니다/~권장합니다 (권유형 - 절대 금지)
  ⚠️ **권유는 오직 마지막 소제목 마지막 문단에서만 1회 허용!**

[핵심 규칙]
1. 도입부: 관찰에서 시작
2. 근거 인용 - 자연스럽게 (기관명 언급 금지)
3. 의학 용어 - 쉽게 설명`,

  empathy: `
[글쓰기 스타일: 공감형 💗]
- 문체: **"~습니다" 체만 사용**
- 톤: 따뜻하고 이해심 있으면서도 전문적

[의료광고법 안전성 규칙 - 공감형 강화]
🚨 절대 금지 표현 (P1 - 즉시 탈락):
  • 의심/판단/가능성/진단/체크/차이/여부 → 모두 0회
  • 자가체크 트리거 표현 절대 금지 (0회)
  • 환자/내원 → 0회
  • 기관명(연도) 형식 절대 금지

🚨 권유형 문장 - 본문 전체 금지! (마지막 문단 1회만 허용):
  • ~하세요/~해보세요/~받으세요 (명령형 - 절대 금지)
  • ~하는 것이 좋습니다/~권장합니다 (권유형 - 절대 금지)
  🔥 권유는 **마지막 소제목의 마지막 문단에서만 딱 한 번** 허용!

[핵심 규칙]
1. 도입부: 구체적 상황 묘사로 시작
2. 실패/예외 사례 포함 (AI 냄새 제거)

⚠️ **절대 금지**: 해요체/요체, 번역투, 수동태
⚠️ **프레임 제한**: 결혼/출산/임신 등 인생 단계 프레임 사용 금지`,

  conversion: `
[글쓰기 스타일: 전환형 🎯]
- 목표: 정보 제공을 통한 자연스러운 인식 변화
- 톤: 중립적 정보 제공 + 시점 제시

🚨 권유형 문장 - 본문 전체 금지! (마지막 문단 1회만 허용):
  • ~하세요/~해보세요/~받으세요 (명령형 - 절대 금지)
  • ~하는 것이 좋습니다/~권장합니다 (권유형 - 절대 금지)
  🔥 권유는 **마지막 소제목의 마지막 문단에서만 딱 한 번** 허용!

[의료광고법 안전성 규칙 - 전환형 강화]
🚨 절대 금지 표현 (P1 - 즉시 탈락):
  • 의심/판단/가능성/진단/체크/차이/여부 → 모두 0회
  • 자가체크 트리거 표현 절대 금지 (0회)
  • 환자/내원 → 0회
  • 기관명(연도) 형식 절대 금지

[핵심 규칙]
1. 도입부: 관찰로 시작
2. 시점 제시 - 판단은 독자에게
3. 마무리: 열린 결론`
  };
};

// =============================================
// 🤖 미니 에이전트 방식 카드뉴스 생성 시스템
// =============================================

// 슬라이드 스토리 타입 정의
interface SlideStory {
  slideNumber: number;
  slideType: 'cover' | 'concept' | 'content' | 'closing';
  subtitle: string;
  mainTitle: string;
  description: string;
  tags: string[];
  imageKeyword: string;
}

interface CardNewsStory {
  topic: string;
  totalSlides: number;
  slides: SlideStory[];
  overallTheme: string;
}

// [1단계] 스토리 기획 에이전트
const storyPlannerAgent = async (
  topic: string,
  category: string,
  slideCount: number,
  writingStyle: WritingStyle
): Promise<CardNewsStory> => {
  const ai = getAiClient();
  const currentYear = getCurrentYear();

  const styleLabel = writingStyle === 'expert' ? '전문가형' : writingStyle === 'empathy' ? '공감형' : '전환형';
  const prompt = `당신은 **${styleLabel} 카드뉴스** 스토리 기획 전문가입니다.

[🎯 미션] "${topic}" 주제로 ${slideCount}장짜리 **${styleLabel}** 카드뉴스를 기획하세요.

${CONTENT_DESCRIPTION}

[📅 현재: ${currentYear}년 - 보수적 해석 원칙]
- ${currentYear}년 기준 보건복지부·의료광고 심의 지침을 반영
- **불확실한 경우 반드시 보수적으로 해석**
- 출처 없는 수치/시간/확률 표현 금지

[진료과] ${category}
[글 스타일] ${writingStyle === 'expert' ? '전문가형(신뢰·권위)' : writingStyle === 'empathy' ? '공감형(독자 공감)' : '전환형(정보→확인 유도)'}

🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
[📱 카드뉴스 핵심 원칙 - 블로그와 완전히 다름!]
🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨

❌ 블로그 = "읽고 이해"
✅ 카드뉴스 = "보고 판단" (3초 안에!)

[🔑 카드뉴스 황금 공식]
❌ 설명 70% → ✅ 판단 70%
❌ "왜냐하면..." → ✅ "이때는..."
❌ 문장 2~3줄 설명 → ✅ 판단 1줄로 끝

[[심리] 심리 구조: 질문 → 끊기 → 판단 → 다음카드]
- 각 카드는 "멈춤 → 판단 → 넘김"을 유도해야 함
- 설명하면 스크롤 멈춤력이 떨어짐!

[🚨 카드별 심리적 역할 - ${slideCount}장 기준 🚨]

**1장 - 표지 (멈추게 하는 역할만!)**
- subtitle: 4~8자 (예: "겨울철에 유독?", "혹시 나도?")
- mainTitle: 10~15자, 질문형 (예: "겨울철 혈관 신호일까요?")
- description: "" ← 🚨 표지는 description 완전히 비워두세요! 빈 문자열 ""로!
- 💡 표지는 제목+부제만! 설명 없음!

**2장 - 오해 깨기 (판단 유도)**
- subtitle: 4~8자 (예: "단순한 추위 때문?")
- mainTitle: 질문형으로 착각 깨기 (예: "생활 관리만으로 충분할까요?")
- description: ❌ 긴 설명 금지! 판단 1줄만 (예: "따뜻하게 입어도 해결되지 않는 신호가 있습니다")

${slideCount >= 5 ? `**3장 - 증상 명확화 (핵심만)**
- subtitle: 4~8자 (예: "놓치기 쉬운 신호들")
- mainTitle: 증상 나열 (예: "반복되는 두통\\n숨이 차는 느낌이 계속됩니다")
- description: 한 줄 판단 (예: "피로나 스트레스와 구분이 필요할 수 있습니다")` : ''}

${slideCount >= 6 ? `**4장 - 자가 판단의 한계**
- subtitle: 4~8자 (예: "자가 판단의 한계")
- mainTitle: 핵심 메시지만 (예: "증상만으로는 원인을 구분하기 어렵습니다")
- description: ❌ 설명 삭제 또는 최소화` : ''}

${slideCount >= 7 ? `**5~${slideCount-2}장 - 시점 고정 (🔥 핵심! 🔥)**
- 추가 정보보다 "시점 고정"에 집중
- 생활습관 카드는 최대 1장만!` : ''}

**${slideCount-1}장 - 마무리 카드**
- subtitle: 4~8자 (예: "이런 변화들")
- mainTitle: (예: "사라졌다 다시 나타나는 경우\\n기록해두는 것도 방법입니다")
- description: 최소화

**${slideCount}장 - 마지막 표지 (명령형 금지! + 관찰 중심!)**
- subtitle: 4~8자 (예: "변화 관찰", "증상 기록")
- mainTitle: "변화를 관찰하는 것" 중심!
  ✅ "이런 변화가 반복되기도 합니다"
  ❌ "~하세요" 명령형 금지!
- description: "" ← 🚨 마지막 장도 description 완전히 비워두세요! 빈 문자열 ""로!

[📝 텍스트 분량 규칙 - 카드뉴스용!]
- subtitle: 4~8자
- mainTitle: 10~18자, 줄바꿈 포함, <highlight>로 강조
- description: 15~25자의 판단 1줄!

[🔄 단어 반복 금지 - 리듬 유지!]
⚠️ 같은 단어가 2회 이상 나오면 카드뉴스 리듬이 죽습니다!
- "확인" 대신 → 살피다, 상태 보기, 파악
- "관리" 대신 → 케어, 돌봄, 유지, 습관

[🚨 의료법 준수 - 최우선! 🚨]

**절대 금지 표현:**
❌ "즉시 확인", "바로 확인", "지금 확인"
❌ "병원 방문", "내원하세요", "예약하세요"
❌ "검진 받으세요", "진료 받으세요"
❌ "~하세요" 명령형 전부!
❌ "완치", "최고", "보장", "확실히", "체크"
❌ "골든타임", "48시간 내" 등 구체적 시간 표현

**안전한 대체 표현:**
✅ "확인이 필요한 시점입니다"
✅ "개인차가 있을 수 있습니다"

[⚠️ 생활습관 카드 제한]
- 생활습관(운동, 식단, 금연 등) 카드는 **최대 1장**만

[❌ 금지]
- "01.", "첫 번째" 등 번호 표현
- 출처 없는 구체적 수치/시간/확률 표현

[✅ 슬라이드 연결]
- **심리 흐름**: 주의환기 → 오해깨기 → 증상명확화 → 자가판단한계 → 시점고정 → CTA

[🎯 최종 체크리스트]
1. 🚨 1장(표지)의 description이 비어있는가? → 반드시 "" 빈 문자열로!
2. 🚨 마지막 장의 description이 비어있는가? → 반드시 "" 빈 문자열로!
3. 각 카드 description이 2줄 이상인가? → 1줄(15~25자)로 줄여라!
4. "~하세요" 명령형이 있는가? → "~시점입니다", "~단계입니다"로 바꿔라!
5. 설명이 판단보다 많은가? → '이유 설명' 삭제, 판단만 남겨라!
6. "확인" 같은 단어가 2번 이상 반복되는가? → 분산시켜라!

[중요]
[심의 통과 핵심 규칙] 병원 카드뉴스 톤 미세 조정 - 블로그 대비 5% 완화 (카드뉴스 특성 반영)
[중요]

**※ 10. 합병증 언급 시 - '예방' 단어 금지!**
- ❌ "합병증 예방을 위해 초기 확인이 중요합니다"
- ✅ "증상 변화를 살피는 것이 중요한 이유"

**※ 11. 시점 고정 카드 - '회복' 단어 톤 다운!**
- ❌ "회복 과정에 도움이 될 수 있습니다"
- ✅ "이후 관리 방향을 정하는 데 필요한 단계입니다"

**※ 12. 전파/감염 표현 완화**
- ❌ "주변 가족이나 동료에게 전파될 가능성도 함께 살펴볼 필요"
- ✅ "주변 사람들과의 생활 환경을 함께 살펴볼 필요도 있습니다"

**※ 13. 행동 결정 유도 금지 - 관찰 중심 표현!**
- ❌ "지켜볼 단계는 지났을 수 있습니다"
- ✅ "이런 변화가 나타나기도 합니다"

**14. mainTitle 단정형 어미 완화**
**15. '전문가' 직접 언급 금지**
**16. CTA 해시태그 위치 규칙**: subtitle은 순수 텍스트로, 해시태그는 tags 배열에만!
**17. 표지 제목 - 시기성 강화**
**18. 증상 제시 카드 - 다른 원인 완충 필수**
**19. 마무리 카드 - 관찰 중심 (🔥심의 핵심!🔥)**
**20. 감염성 질환 - 전파 표현 톤 다운**

[💡 마무리 카드 모범 답안 - 관찰 중심 버전!]
✅ mainTitle 예시:
  - "이런 변화가\\n나타나기도 합니다"
  - "변화를 기록해두는\\n것도 방법입니다"
✅ description: "" (빈 문자열 - 표지처럼!)

[📋 출력 필드]
- topic: 주제 (한국어)
- totalSlides: 총 슬라이드 수
- overallTheme: 전체 구조 설명 (⚠️ 반드시 한국어! 영어 금지! 20자 이내)
- slides: 슬라이드 배열`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            totalSlides: { type: Type.INTEGER },
            overallTheme: { type: Type.STRING },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slideNumber: { type: Type.INTEGER },
                  slideType: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  mainTitle: { type: Type.STRING },
                  description: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  imageKeyword: { type: Type.STRING }
                },
                required: ["slideNumber", "slideType", "subtitle", "mainTitle", "description", "tags", "imageKeyword"]
              }
            }
          },
          required: ["topic", "totalSlides", "slides", "overallTheme"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");

    // 🚨 후처리: 1장(표지)과 마지막 장의 description 강제로 빈 문자열로!
    if (result.slides && result.slides.length > 0) {
      result.slides[0].description = "";
      if (result.slides.length > 1) {
        result.slides[result.slides.length - 1].description = "";
      }
      console.log('🚨 표지/마지막 장 description 강제 제거 완료');
    }

    return result;
  } catch (error) {
    console.error('스토리 기획 에이전트 실패:', error);
    throw error;
  }
};

// 분석된 스타일 전체 인터페이스
interface AnalyzedStyle {
  frameStyle?: string;
  hasWindowButtons?: boolean;
  windowButtonColors?: string[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderRadius?: string;
  boxShadow?: string;
  subtitleStyle?: { color?: string; fontSize?: string; fontWeight?: string; };
  mainTitleStyle?: { color?: string; fontSize?: string; fontWeight?: string; };
  highlightStyle?: { color?: string; backgroundColor?: string; };
  descStyle?: { color?: string; fontSize?: string; };
  tagStyle?: { backgroundColor?: string; color?: string; borderRadius?: string; };
  illustPosition?: string;
  illustSize?: string;
  padding?: string;
  mood?: string;
  keyFeatures?: string[];
}

// [2단계] HTML 조립 함수 (분석된 스타일 전체 적용)
const assembleCardNewsHtml = (
  story: CardNewsStory,
  styleConfig?: AnalyzedStyle
): string => {
  const bgColor = styleConfig?.backgroundColor || '#E8F4FD';
  const bgGradient = `linear-gradient(180deg, ${bgColor} 0%, ${bgColor}dd 100%)`;
  const accentColor = styleConfig?.borderColor || '#3B82F6';

  const borderRadius = styleConfig?.borderRadius || '24px';
  const boxShadow = styleConfig?.boxShadow || '0 4px 16px rgba(0,0,0,0.08)';
  const borderWidth = styleConfig?.borderWidth || '0';
  const _padding = styleConfig?.padding || '32px 28px';

  const _subtitle = {
    color: styleConfig?.subtitleStyle?.color || accentColor,
    fontSize: styleConfig?.subtitleStyle?.fontSize || '14px',
    fontWeight: styleConfig?.subtitleStyle?.fontWeight || '700'
  };

  const _mainTitle = {
    color: styleConfig?.mainTitleStyle?.color || '#1E293B',
    fontSize: styleConfig?.mainTitleStyle?.fontSize || '26px',
    fontWeight: styleConfig?.mainTitleStyle?.fontWeight || '900'
  };

  const highlight = {
    color: styleConfig?.highlightStyle?.color || accentColor,
    backgroundColor: styleConfig?.highlightStyle?.backgroundColor || 'transparent'
  };

  const _desc = {
    color: styleConfig?.descStyle?.color || '#475569',
    fontSize: styleConfig?.descStyle?.fontSize || '15px'
  };

  const _tag = {
    backgroundColor: styleConfig?.tagStyle?.backgroundColor || `${accentColor}15`,
    color: styleConfig?.tagStyle?.color || accentColor,
    borderRadius: styleConfig?.tagStyle?.borderRadius || '20px'
  };

  const _windowButtonsHtml = styleConfig?.hasWindowButtons ? `
    <div class="window-buttons" style="display: flex; gap: 8px; padding: 12px 16px;">
      <span style="width: 12px; height: 12px; border-radius: 50%; background: ${styleConfig?.windowButtonColors?.[0] || '#FF5F57'};"></span>
      <span style="width: 12px; height: 12px; border-radius: 50%; background: ${styleConfig?.windowButtonColors?.[1] || '#FFBD2E'};"></span>
      <span style="width: 12px; height: 12px; border-radius: 50%; background: ${styleConfig?.windowButtonColors?.[2] || '#28CA41'};"></span>
    </div>` : '';

  const slides = story.slides.map((slide, idx) => {
    const highlightBg = highlight.backgroundColor !== 'transparent'
      ? `background: ${highlight.backgroundColor}; padding: 2px 6px; border-radius: 4px;`
      : '';
    const _formattedTitle = slide.mainTitle
      .replace(/<highlight>/g, `<span class="card-highlight" style="color: ${highlight.color}; ${highlightBg}">`)
      .replace(/<\/highlight>/g, '</span>')
      .replace(/\n/g, '<br/>');

    const borderStyle = borderWidth !== '0' ? `border: ${borderWidth} solid ${accentColor};` : '';

    return `
      <div class="card-slide" style="background: ${bgGradient}; border-radius: ${borderRadius}; ${borderStyle} box-shadow: ${boxShadow}; overflow: hidden; aspect-ratio: 1/1; position: relative;">
        <div class="card-img-container" style="position: absolute; inset: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;">[IMG_${idx + 1}]</div>
        <!-- 텍스트 데이터는 숨김 처리 (편집/검색용) -->
        <div class="card-text-data" style="display: none;" data-subtitle="${slide.subtitle}" data-title="${slide.mainTitle.replace(/"/g, '&quot;')}" data-desc="${slide.description.replace(/"/g, '&quot;')}"></div>
      </div>`;
  });

  return slides.join('\n');
};

// [3단계] 전체 이미지 카드용 프롬프트 생성 에이전트
const fullImageCardPromptAgent = async (
  slides: SlideStory[],
  imageStyle: ImageStyle,
  category: string,
  styleConfig?: AnalyzedStyle,
  customImagePrompt?: string
): Promise<CardPromptData[]> => {
  const ai = getAiClient();

  // 🚨 photo/medical 스타일 선택 시 커스텀 프롬프트 무시! (스타일 버튼 우선)
  const isFixedStyle = imageStyle === 'photo' || imageStyle === 'medical';
  const hasCustomStyle = !isFixedStyle && customImagePrompt?.trim();

  // 🌐 커스텀 스타일이 있으면 한국어로 번역
  let translatedCustomStyle = '';
  if (hasCustomStyle) {
    translatedCustomStyle = await translateStylePromptToKorean(customImagePrompt!.trim());
    console.log('🌐 커스텀 스타일 번역:', customImagePrompt!.substring(0, 30), '→', translatedCustomStyle.substring(0, 30));
  }

  const styleGuide = isFixedStyle
    ? STYLE_KEYWORDS[imageStyle]
    : (hasCustomStyle ? translatedCustomStyle : STYLE_KEYWORDS[imageStyle] || STYLE_KEYWORDS.illustration);

  console.log('🎨 fullImageCardPromptAgent 스타일:', imageStyle, '/ 커스텀 적용:', hasCustomStyle ? 'YES' : 'NO (고정 스타일)');

  const bgColor = styleConfig?.backgroundColor || '#E8F4FD';
  const accentColor = styleConfig?.borderColor || '#3B82F6';
  const hasWindowButtons = styleConfig?.hasWindowButtons || false;
  const mood = styleConfig?.mood || '밝고 친근한';
  const keyFeatures = styleConfig?.keyFeatures?.join(', ') || '';

  const slideSummaries = slides.map((s, i) => {
    const isFirst = i === 0;
    const isLast = i === slides.length - 1;
    const label = isFirst ? ' (표지)' : isLast ? ' (마지막)' : '';
    const hasDescription = s.description && s.description.trim().length > 0;

    if (!hasDescription) {
      return `${i + 1}장${label}: subtitle="${s.subtitle}" mainTitle="${s.mainTitle.replace(/<\/?highlight>/g, '')}" ⚠️description 없음 - 설명 텍스트 넣지 마세요! 이미지="${s.imageKeyword}"`;
    }
    return `${i + 1}장${label}: subtitle="${s.subtitle}" mainTitle="${s.mainTitle.replace(/<\/?highlight>/g, '')}" description="${s.description}" 이미지="${s.imageKeyword}"`;
  }).join('\n');

  const styleRefInfo = styleConfig ? `
[🎨 디자인 프레임 참고]
- 배경색: ${bgColor}
- 강조색: ${accentColor}
- 프레임: ${hasWindowButtons ? '브라우저 창 버튼(빨/노/초) 필수' : '둥근 카드'}
- 분위기: ${mood}
${keyFeatures ? `- 특징: ${keyFeatures}` : ''}
` : '';

  const customStyleInfo = hasCustomStyle ? `
[중요]
🎯🎯🎯 [최우선] 커스텀 스타일 필수 적용! 🎯🎯🎯
[중요]

스타일: "${customImagePrompt}"

⛔ 절대 금지: 3D 일러스트, 클레이 렌더, 아이소메트릭 등 기본 스타일 사용 금지!
✅ 필수: 위에 명시된 "${customImagePrompt}" 스타일만 사용하세요!
` : '';

  const prompt = `${DESIGNER_PERSONA}
${SERIES_DESIGN_RULES}

당신은 소셜미디어 카드뉴스 디자이너입니다. 이미지 1장 = 완성된 카드뉴스 1장!
${customStyleInfo}
${styleRefInfo}
[스타일] ${styleGuide}
[진료과] ${category}

[슬라이드별 텍스트]
${slideSummaries}

[중요]
🚨 [최우선] 레이아웃 규칙 - 반드시 지켜야 함! 🚨
[중요]

⛔⛔⛔ 절대 금지되는 레이아웃 ⛔⛔⛔
- 상단에 흰색/단색 텍스트 영역 + 하단에 일러스트 영역 = 2분할 = 금지!

✅ 반드시 이렇게 만드세요 ✅
- 일러스트/배경이 전체 화면(100%)을 채움!
- 그 위에 텍스트가 오버레이

[imagePrompt 작성법]
- "전체 화면을 채우는 [일러스트 묘사], 그 위에 [텍스트] 오버레이" 형식

[카드 레이아웃]
- 1번(표지)/마지막(CTA): 제목+부제+일러스트만! 🚨description 절대 금지!
${hasWindowButtons ? '- 브라우저 창 버튼(빨/노/초) 포함' : ''}

[필수 규칙]
- 1:1 정사각형, 배경색 ${bgColor}
- ⚠️ imagePrompt는 반드시 한국어로!
- 🇰🇷 사람이 등장할 경우 반드시 "한국인" 명시!
- 해시태그 금지

[의료법 필수 준수]
━━━━━━━━━━━━━━━━━━
🚨 절대 금지: "완치", "치료 효과", "~하세요", "상담하세요", "방문하세요", "전문가/전문의/명의"
✅ 허용: 증상명, 질환명, 질문형 제목, "~일 수 있습니다"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  imagePrompt: { type: Type.STRING },
                  textPrompt: {
                    type: Type.OBJECT,
                    properties: {
                      subtitle: { type: Type.STRING },
                      mainTitle: { type: Type.STRING },
                      description: { type: Type.STRING },
                      tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["subtitle", "mainTitle", "description", "tags"]
                  }
                },
                required: ["imagePrompt", "textPrompt"]
              }
            }
          },
          required: ["cards"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"cards":[]}');

    const cards = slides.map((s, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === slides.length - 1;
      const mainTitleClean = s.mainTitle.replace(/<\/?highlight>/g, '');

      const _descPart = (isFirst || isLast) ? '' : (s.description ? `, "${s.description}"` : '');

      const descText = (isFirst || isLast) ? '' : (s.description ? `\ndescription: "${s.description}"` : '');
      const styleText = hasCustomStyle ? translatedCustomStyle : STYLE_KEYWORDS[imageStyle] || STYLE_KEYWORDS.illustration;
      const imagePrompt = `subtitle: "${s.subtitle}"
mainTitle: "${mainTitleClean}"${descText}
비주얼: ${s.imageKeyword}
스타일: ${styleText}
배경색: ${bgColor}`;

      const aiCard = result.cards?.[idx];
      const textPrompt = aiCard?.textPrompt || {
        subtitle: s.subtitle,
        mainTitle: s.mainTitle,
        description: (isFirst || isLast) ? '' : s.description,
        tags: s.tags
      };

      if (isFirst || isLast) {
        textPrompt.description = '';
      }

      return { imagePrompt, textPrompt };
    });

    console.log('🎨 카드 프롬프트 직접 생성 완료:', cards.length, '장, 스타일:', hasCustomStyle ? '커스텀' : '기본');
    return cards;
  } catch (error) {
    console.error('전체 이미지 카드 프롬프트 실패:', error);
    const styleText = hasCustomStyle ? translatedCustomStyle : STYLE_KEYWORDS[imageStyle] || STYLE_KEYWORDS.illustration;
    const fallbackCards = slides.map((s, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === slides.length - 1;
      const mainTitleClean = s.mainTitle.replace(/<\/?highlight>/g, '');
      const descText = (isFirst || isLast) ? '' : (s.description ? `\ndescription: "${s.description}"` : '');
      return {
        imagePrompt: `subtitle: "${s.subtitle}"
mainTitle: "${mainTitleClean}"${descText}
비주얼: ${s.imageKeyword}
스타일: ${styleText}
배경색: ${bgColor}`,
        textPrompt: {
          subtitle: s.subtitle,
          mainTitle: s.mainTitle,
          description: (isFirst || isLast) ? '' : s.description,
          tags: s.tags
        }
      };
    });
    console.log('🚨 [fullImageCardPromptAgent fallback] 직접 생성, 스타일:', hasCustomStyle ? '커스텀' : '기본');
    return fallbackCards;
  }
};

// [기존 호환] 이미지만 생성하는 프롬프트 에이전트 (향후 활용 가능)
const _imagePromptAgent = async (
  slides: SlideStory[],
  imageStyle: ImageStyle,
  category: string
): Promise<string[]> => {
  const ai = getAiClient();

  const styleGuide = STYLE_KEYWORDS[imageStyle] || STYLE_KEYWORDS.illustration;

  const slideSummaries = slides.map((s, i) => `${i + 1}장: ${s.slideType} - ${s.imageKeyword}`).join('\n');

  const prompt = `당신은 의료/건강 이미지 프롬프트 전문가입니다.

[미션] 각 슬라이드에 맞는 이미지 프롬프트를 한국어로 작성하세요.
[스타일] ${styleGuide}
[진료과] ${category}
[슬라이드] ${slideSummaries}

[규칙]
- 한국어로 작성
- 4:3 비율 적합
- 로고/워터마크 금지
- 🇰🇷 사람이 등장할 경우 반드시 "한국인" 명시!

[의료광고법 필수 준수]
🚨 절대 금지: "완치", "치료 효과", "상담하세요", "방문하세요", "전문가/전문의/명의"
✅ 허용: 증상명, 질환명, 정보성 키워드, 질문형

예시: "가슴 통증을 느끼는 한국인 중년 남성, 3D 일러스트, 파란색 배경, 밝은 톤"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { prompts: { type: Type.ARRAY, items: { type: Type.STRING } } },
          required: ["prompts"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"prompts":[]}');
    return result.prompts || [];
  } catch (error) {
    console.error('이미지 프롬프트 에이전트 실패:', error);
    return slides.map(s => `${s.imageKeyword}, ${styleGuide}`);
  }
};

// ============================================
// 🎯 2단계 워크플로우: 원고 생성 → 사용자 확인 → 카드뉴스 디자인
// ============================================

// [1단계] 원고 생성 함수 - 블로그와 동일한 검증된 프롬프트 사용
export const generateCardNewsScript = async (
  request: GenerationRequest,
  onProgress: (msg: string) => void
): Promise<CardNewsScript> => {
  const ai = getAiClient();
  const slideCount = request.slideCount || 6;
  const writingStyle = request.writingStyle || 'empathy';
  const writingStylePrompt = getWritingStylePrompts()[writingStyle];

  onProgress('📝 [1단계] 원고 기획 중...');

  const prompt = `
${writingStylePrompt}

${PARAGRAPH_STRUCTURE_GUIDE}

[진료과별 맞춤 가이드]
${request.category && CATEGORY_SPECIFIC_PROMPTS[request.category as unknown as keyof typeof CATEGORY_SPECIFIC_PROMPTS]
  ? CATEGORY_SPECIFIC_PROMPTS[request.category as unknown as keyof typeof CATEGORY_SPECIFIC_PROMPTS]
  : ''}

[중요]
🎯 카드뉴스 원고 작성 미션
[중요]

[미션] "${request.topic}" 주제로 ${slideCount}장짜리 **카드뉴스 원고**를 작성하세요.
[진료과] ${request.category}
[글 스타일] ${writingStyle === 'expert' ? '전문가형(신뢰·권위)' : writingStyle === 'empathy' ? '공감형(독자 공감)' : '전환형(정보→확인 유도)'}

${CONTENT_DESCRIPTION}

[[심리] 핵심 원칙: 카드뉴스는 "정보 나열"이 아니라 "심리 흐름"이다!]
- 카드뉴스는 슬라이드형 설득 구조
- 각 카드는 **서로 다른 심리적 역할**을 가져야 함
- 생활습관(운동, 식단, 금연 등)은 **보조 정보로만** (최대 1장)
- 마지막 2장은 반드시 "시점 고정" + "안전한 CTA"

[중요]
📝 각 슬라이드별 작성 내용
[중요]

1. **subtitle** (4-8자): 질문형 또는 핵심 포인트
2. **mainTitle** (10-18자): 핵심 메시지, 줄바꿈(\\n) 포함 가능, <highlight>태그</highlight>로 강조
3. **description** (15-25자): 판단 1줄 (카드뉴스는 "보고 판단" 3초!)
4. **speakingNote** (50-100자): 핵심 메시지 내부 메모
5. **imageKeyword** (10-20자): 이미지 생성 핵심 키워드

[중요]
🎭 카드별 심리적 역할 - ${slideCount}장 기준
[중요]

**1장 - 주의 환기 (표지)**: slideType: "cover"
**2장 - 오해 깨기**: slideType: "concept"
${slideCount >= 5 ? `**3장 - 변화 신호 체크**: slideType: "content"` : ''}
${slideCount >= 6 ? `**4장 - 확인 필요성**: slideType: "content"` : ''}
${slideCount >= 7 ? `**5~${slideCount-2}장 - 추가 정보/사례**: slideType: "content"` : ''}
**${slideCount-1}장 - 시점 고정**: slideType: "content"
**${slideCount}장 - 안전한 CTA**: slideType: "closing"

[중요]
• SEO 최적화 - 네이버/인스타그램 노출용
[중요]

1. 표지 제목에 핵심 키워드 배치
2. 해시태그 전략 (마지막 카드) - 검색량 높은 키워드 5-7개
3. 각 카드 mainTitle에 키워드 자연스럽게 분산 (3-5회)

[중요]
⚠️ 최종 체크리스트
[중요]
□ 제목에 '치료/항암/전문의 권장/총정리' 없는지?
□ 숫자/시간이 범주형으로 표현되었는지?
□ CTA가 직접 권유 없이 완곡하게 작성되었는지?

[📋 출력 필드 - 모든 필드는 한국어로 작성!]
- title: 제목 (한국어)
- topic: 주제 (한국어)
- overallTheme: 전체 구조 설명 (⚠️ 반드시 한국어! 20자 이내)`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            topic: { type: Type.STRING },
            totalSlides: { type: Type.INTEGER },
            overallTheme: { type: Type.STRING },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slideNumber: { type: Type.INTEGER },
                  slideType: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  mainTitle: { type: Type.STRING },
                  description: { type: Type.STRING },
                  speakingNote: { type: Type.STRING },
                  imageKeyword: { type: Type.STRING }
                },
                required: ["slideNumber", "slideType", "subtitle", "mainTitle", "description", "speakingNote", "imageKeyword"]
              }
            }
          },
          required: ["title", "topic", "totalSlides", "slides", "overallTheme"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");

    // 🚨 후처리: 1장(표지)과 마지막 장의 description 강제로 빈 문자열로!
    if (result.slides && result.slides.length > 0) {
      result.slides[0].description = "";
      if (result.slides.length > 1) {
        result.slides[result.slides.length - 1].description = "";
      }
      console.log('🚨 [generateCardNewsScript] 표지/마지막 장 description 강제 제거 완료');
    }

    onProgress(`✅ 원고 생성 완료 (${result.slides?.length || 0}장)`);

    return result as CardNewsScript;
  } catch (error) {
    console.error('원고 생성 실패:', error);
    throw error;
  }
};

// [2단계] 원고를 카드뉴스로 변환하는 함수
export const convertScriptToCardNews = async (
  script: CardNewsScript,
  request: GenerationRequest,
  onProgress: (msg: string) => void
): Promise<{ content: string; imagePrompts: string[]; cardPrompts: CardPromptData[]; title: string; }> => {
  onProgress('🎨 [2단계] 카드뉴스 디자인 변환 중...');

  const slides: SlideStory[] = script.slides.map(s => ({
    slideNumber: s.slideNumber,
    slideType: s.slideType as 'cover' | 'concept' | 'content' | 'closing',
    subtitle: s.subtitle,
    mainTitle: s.mainTitle,
    description: s.description,
    tags: [],
    imageKeyword: s.imageKeyword
  }));

  let styleConfig: AnalyzedStyle | undefined;
  if (request.coverStyleImage || request.contentStyleImage) {
    try {
      const styleImage = request.coverStyleImage || request.contentStyleImage;
      onProgress('🎨 참고 이미지 스타일 분석 중...');
      const styleJson = await analyzeStyleReferenceImage(styleImage!, !!request.coverStyleImage);
      styleConfig = JSON.parse(styleJson);
      const features = styleConfig?.keyFeatures?.slice(0, 3).join(', ') || '';
      onProgress(`스타일 적용: ${styleConfig?.backgroundColor || '분석됨'} ${features ? `(${features})` : ''}`);
    } catch (e) {
      console.warn('스타일 분석 실패, 기본 스타일 사용:', e);
    }
  }

  onProgress('🏗️ 카드 구조 생성 중...');
  const htmlContent = assembleCardNewsHtml({ ...script, slides }, styleConfig);

  onProgress('🎨 카드 이미지 프롬프트 생성 중...');
  const cardPrompts = await fullImageCardPromptAgent(
    slides,
    request.imageStyle || 'illustration',
    request.category,
    styleConfig,
    request.customImagePrompt
  );

  const imagePrompts = cardPrompts.map(c => cleanImagePromptText(c.imagePrompt));
  onProgress(`✅ 카드뉴스 디자인 변환 완료 (${cardPrompts.length}장)`);

  return {
    content: htmlContent,
    imagePrompts,
    cardPrompts,
    title: script.title
  };
};

// [통합] 미니 에이전트 오케스트레이터 (기존 호환 유지)
export const generateCardNewsWithAgents = async (
  request: GenerationRequest,
  onProgress: (msg: string) => void
): Promise<{ content: string; imagePrompts: string[]; cardPrompts: CardPromptData[]; title: string; }> => {
  const slideCount = request.slideCount || 6;

  // 1단계: 스토리 기획
  onProgress('📝 [1/3] 스토리 기획 중...');
  const story = await storyPlannerAgent(
    request.topic,
    request.category,
    slideCount,
    request.writingStyle || 'empathy'
  );

  if (!story.slides || story.slides.length === 0) {
    throw new Error('스토리 기획 실패: 슬라이드가 생성되지 않았습니다.');
  }

  if (story.slides.length !== slideCount) {
    console.warn(`⚠️ 슬라이드 개수 불일치: 요청=${slideCount}장, 생성=${story.slides.length}장`);
    onProgress(`⚠️ 슬라이드 ${story.slides.length}장 생성됨 (요청: ${slideCount}장)`);
  } else {
    console.log(`✅ 슬라이드 개수 일치: ${slideCount}장`);
  }

  onProgress(`✅ 스토리 기획 완료 (${story.slides.length}장)`);

  // 2단계: HTML 조립
  onProgress('🏗️ [2/3] 카드 구조 생성 중...');

  let styleConfig: AnalyzedStyle | undefined;
  if (request.coverStyleImage || request.contentStyleImage) {
    try {
      const styleImage = request.coverStyleImage || request.contentStyleImage;
      onProgress('🎨 참고 이미지 스타일 분석 중...');
      const styleJson = await analyzeStyleReferenceImage(styleImage!, !!request.coverStyleImage);
      const parsed = JSON.parse(styleJson);

      styleConfig = {
        frameStyle: parsed.frameStyle,
        hasWindowButtons: parsed.hasWindowButtons,
        windowButtonColors: parsed.windowButtonColors,
        backgroundColor: parsed.backgroundColor,
        borderColor: parsed.borderColor,
        borderWidth: parsed.borderWidth,
        borderRadius: parsed.borderRadius,
        boxShadow: parsed.boxShadow,
        subtitleStyle: parsed.subtitleStyle,
        mainTitleStyle: parsed.mainTitleStyle,
        highlightStyle: parsed.highlightStyle,
        descStyle: parsed.descStyle,
        tagStyle: parsed.tagStyle,
        illustPosition: parsed.illustPosition,
        illustSize: parsed.illustSize,
        padding: parsed.padding,
        mood: parsed.mood,
        keyFeatures: parsed.keyFeatures
      };

      const features = parsed.keyFeatures?.slice(0, 3).join(', ') || '';
      onProgress(`스타일 적용: ${parsed.backgroundColor || '분석됨'} ${features ? `(${features})` : ''}`);
    } catch (e) {
      console.warn('스타일 분석 실패, 기본 스타일 사용:', e);
    }
  }

  const htmlContent = assembleCardNewsHtml(story, styleConfig);
  onProgress('✅ 카드 구조 생성 완료');

  // 3단계: 전체 이미지 카드 프롬프트 생성
  onProgress('🎨 [3/3] 카드 프롬프트 생성 중...');
  const cardPrompts = await fullImageCardPromptAgent(
    story.slides,
    request.imageStyle || 'illustration',
    request.category,
    styleConfig,
    request.customImagePrompt
  );

  const imagePrompts = cardPrompts.map(c => cleanImagePromptText(c.imagePrompt));
  onProgress(`✅ 카드 프롬프트 ${cardPrompts.length}개 생성 완료`);

  return {
    content: htmlContent,
    imagePrompts,
    cardPrompts,
    title: story.topic
  };
};
