/**
 * postProcessingService.ts - 콘텐츠 후처리 서비스
 *
 * 카드 슬라이드 재생성, 콘텐츠 수정, AI 품질 분석, 의료법 보정
 * geminiService.ts에서 분리된 모듈
 */
import { Type } from "@google/genai";
import { ImageStyle, FactCheckReport } from "../types";
import { GEMINI_MODEL, TIMEOUTS, callGemini } from "./geminiClient";
import { SYSTEM_PROMPT, getStage2_AiRemovalAndCompliance, getDynamicSystemPrompt } from "../lib/gpt52-prompts-staged";
import { detectAiSmell, FEW_SHOT_EXAMPLES, CATEGORY_SPECIFIC_PROMPTS, PARAGRAPH_STRUCTURE_GUIDE } from "../utils/humanWritingPrompts";

// STYLE_KEYWORDS (geminiService.ts에서 순환참조 방지를 위해 직접 정의)
const STYLE_KEYWORDS: Record<ImageStyle, string> = {
  photo: '사실적인 사진 스타일, 고해상도, 선명한 디테일',
  illustration: '일러스트 스타일, 깔끔한 벡터, 밝은 색상',
  '3d': '3D 렌더링, 부드러운 조명, 파스텔 색상, Pixar 스타일',
  medical_3d: '의료 3D 일러스트, 해부학적 정확성, 전문적 스타일',
  custom: '사용자 지정 스타일'
};

// AI 냄새 헬퍼 (geminiService.ts에서 이동)
const runAiSmellCheck = (htmlContent: string): {
  detected: boolean;
  patterns: string[];
  score: number;
  criticalIssues: string[];
  warningIssues: string[];
} => {
  const textContent = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const result = detectAiSmell(textContent);

  const criticalIssues: string[] = [];
  const warningIssues: string[] = [];

  for (const pattern of result.patterns) {
    if (pattern.includes('허용: 0회') ||
        pattern.includes('절대 금지') ||
        pattern.includes('의료광고법') ||
        pattern.includes('금지!')) {
      criticalIssues.push(pattern);
    } else {
      warningIssues.push(pattern);
    }
  }

  return { ...result, criticalIssues, warningIssues };
};

const integrateAiSmellToFactCheck = (
  factCheck: FactCheckReport,
  aiSmellResult: ReturnType<typeof runAiSmellCheck>
): FactCheckReport => {
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
    recommendations: newRecommendations
  };
};

// 카드뉴스 개별 슬라이드 재생성 함수
export const regenerateCardSlide = async (
  cardIndex: number,
  currentCardHtml: string,
  userInstruction: string,
  context: {
    topic: string;
    category: string;
    totalSlides: number;
    prevCardContent?: string;
    nextCardContent?: string;
    imageStyle?: ImageStyle;
  }
): Promise<{ newCardHtml: string; newImagePrompt: string; message: string }> => {
  const slidePosition = cardIndex === 0 
    ? '표지 (1장)' 
    : cardIndex === context.totalSlides - 1 
    ? '마무리 (마지막 장)' 
    : `본문 (${cardIndex + 1}장)`;
  
  const imageStyleGuide = STYLE_KEYWORDS[context.imageStyle || 'illustration'] || STYLE_KEYWORDS.illustration;
  
  // 현재 HTML에서 이미지를 마커로 교체 (기존 이미지 제거)
  const cleanedHtml = currentCardHtml
    .replace(/<img[^>]*class="card-inner-img"[^>]*>/gi, `[IMG_${cardIndex + 1}]`)
    .replace(/<img[^>]*>/gi, `[IMG_${cardIndex + 1}]`);
  
  const prompt = `
당신은 카드뉴스 슬라이드를 재생성하는 전문가입니다.

[현재 슬라이드 정보]
- 위치: ${slidePosition} (총 ${context.totalSlides}장 중 ${cardIndex + 1}번째)
- 주제: ${context.topic}
- 진료과: ${context.category}

[현재 슬라이드 HTML - 텍스트만 참고]
${cleanedHtml}

${context.prevCardContent ? `[이전 슬라이드 내용]\n${context.prevCardContent}` : ''}
${context.nextCardContent ? `[다음 슬라이드 내용]\n${context.nextCardContent}` : ''}

[사용자 요청]
${userInstruction}

[중요]
[🚨 필수 작성 규칙] 
[중요]
1. card-slide 구조를 유지하세요
2. card-main-title은 12자 이내, card-subtitle은 8자 이내
3. ⚠️ 이미지 영역은 반드시 [IMG_${cardIndex + 1}] 텍스트 마커만 사용! (img 태그 금지!)
4. 이전/다음 슬라이드와 내용이 자연스럽게 연결되어야 합니다
5. ${slidePosition === '표지 (1장)' ? '주제 소개 + 흥미 유발 문구' : slidePosition === '마무리 (마지막 장)' ? '행동 유도 + 감성적 마무리' : '구체적인 정보/방법 제시'}

⚠️ 중요: newCardHtml에 <img> 태그 넣지 마세요! [IMG_${cardIndex + 1}] 마커만!
예시: <div class="card-img-container">[IMG_${cardIndex + 1}]</div>

[이미지 프롬프트 규칙]
- 반드시 한국어로 작성
- 스타일: ${imageStyleGuide}
- 1:1 정사각형 카드뉴스 형식
- 로고/워터마크/해시태그 금지

JSON 형식으로 답변:
{
  "newCardHtml": "<div class='card-slide'>...[IMG_${cardIndex + 1}]...</div>",
  "newImagePrompt": "1:1 정사각형 카드뉴스, 한국어 이미지 프롬프트...",
  "message": "수정 완료 메시지"
}
`;

  try {
    const result = await callGemini({
      prompt,
      model: 'gemini-3.1-pro-preview',  // 카드뉴스 슬라이드 수정은 3.1 PRO
      responseType: 'json',
      schema: {
        type: Type.OBJECT,
        properties: {
          newCardHtml: { type: Type.STRING },
          newImagePrompt: { type: Type.STRING },
          message: { type: Type.STRING }
        },
        required: ["newCardHtml", "newImagePrompt", "message"]
      },
      timeout: TIMEOUTS.GENERATION,
    });

    return result;
  } catch (error) {
    console.error('카드 재생성 실패:', error);
    throw error;
  }
};

// AI 재생성 모드 타입
export type SlideRegenMode = 
  | 'rewrite'      // 🔄 완전 새로 쓰기
  | 'strengthen'   // 💪 전환력 강화
  | 'simplify'     // ✂️ 더 간결하게
  | 'empathy'      // 💕 공감 강화
  | 'professional'; // 전문성 강화

// 원고 단계에서 개별 슬라이드 내용 AI 재생성
export const regenerateSlideContent = async (params: {
  slideIndex: number;
  slideType: string;
  topic: string;
  category: string;
  totalSlides: number;
  currentContent: {
    subtitle: string;
    mainTitle: string;
    description: string;
    imageKeyword: string;
  };
  prevSlide?: { mainTitle: string; description: string };
  nextSlide?: { mainTitle: string; description: string };
  mode?: SlideRegenMode;  // 재생성 모드 추가
}): Promise<{
  subtitle: string;
  mainTitle: string;
  description: string;
  speakingNote: string;
  imageKeyword: string;
}> => {
  const slidePosition = params.slideIndex === 0 
    ? '표지 (첫 번째)' 
    : params.slideIndex === params.totalSlides - 1 
    ? '마무리 (마지막)' 
    : `본문 (${params.slideIndex + 1}번째)`;
  
  const slideTypeGuide = params.slideType === 'cover' 
    ? '표지: 멈추게 하는 역할! 설명 최소화, 질문형으로 흥미 유발'
    : params.slideType === 'closing'
    ? 'CTA: ❌명령형 금지! "~시점입니다" 형태로 간접 유도'
    : params.slideType === 'concept'
    ? '오해 깨기: 착각을 바로잡는 질문형 메시지'
    : '본문: 판단 1줄만! 설명 금지!';
  
  // 모드별 추가 지침
  const mode = params.mode || 'rewrite';
  const modeInstruction = {
    rewrite: `
[🔄 완전 새로 쓰기 모드]
- 현재 내용을 참고하되, 완전히 새로운 관점으로 다시 작성
- 같은 주제를 다른 방식으로 접근
- 신선한 표현과 구성으로 재탄생`,
    strengthen: `
[💪 전환력 강화 모드]
- 현재 내용의 핵심은 유지하되 전환력(행동 유도력) 극대화
- "~시점입니다", "~단계입니다" 형태로 시점 고정
- 배제형 표현 강화: "~만으로는 부족합니다", "~가 아니라 ~가 먼저입니다"
- 설명 ❌ → 판단 ✅ 변환
- CTA 핵심: "오세요"가 아니라 "다른 선택지가 아니다"를 만드는 것`,
    simplify: `
[✂️ 더 간결하게 모드]
- 현재 내용을 최대한 압축
- subtitle: 4~6자로 더 짧게
- mainTitle: 10~12자로 더 짧게
- description: 15~20자 판단 1줄로 압축
- 불필요한 수식어, 설명 모두 제거
- 핵심 메시지만 남기기`,
    empathy: `
[💕 공감 강화 모드]
- 현재 내용에 독자 공감 요소 추가
- 일상 상황 묘사 추가 (예: "겨울 아침", "출근길")
- 독자의 감정/고민을 담은 표현 사용
- "혹시 나도?", "이런 적 있으시죠?" 같은 공감 유도
- 의학 정보를 친근하게 전달`,
    professional: `
[전문성 강화 모드]
- 현재 내용에 의학적 신뢰감 추가
- 가이드라인/권장사항 언급 (예: "대한OO학회에서 권장")
- 객관적이고 권위있는 톤
- 전문 용어 + 쉬운 설명 병기
- "~인 것으로 알려져 있습니다" 형태의 완충 표현`
  }[mode];
  
  const prompt = `
당신은 **전환형 카드뉴스** 원고 작성 전문가입니다.

🚨 핵심 원칙:
❌ 블로그 = "읽고 이해"
✅ 카드뉴스 = "보고 판단" (3초 안에!)

[슬라이드 정보]
- 위치: ${slidePosition} (총 ${params.totalSlides}장)
- 타입: ${params.slideType} → ${slideTypeGuide}
- 주제: ${params.topic}
- 진료과: ${params.category}

[현재 내용 - 더 간결하게 수정!]
부제: ${params.currentContent.subtitle}
메인제목: ${params.currentContent.mainTitle}
설명: ${params.currentContent.description}
이미지키워드: ${params.currentContent.imageKeyword}

${params.prevSlide ? `[이전 슬라이드]\n제목: ${params.prevSlide.mainTitle}` : ''}
${params.nextSlide ? `[다음 슬라이드]\n제목: ${params.nextSlide.mainTitle}` : ''}

${modeInstruction}

[📝 카드뉴스 텍스트 규칙]
- subtitle: 4~8자만! (예: "겨울철에 유독?", "혹시 나도?", "놓치기 쉬운 신호들")
- mainTitle: 10~18자, 질문형 또는 판단형, <highlight>강조</highlight>
  ✅ "따뜻하게 입어도\\n<highlight>해결 안 되는</highlight> 신호"
  ❌ "생활 관리만으로 충분할까요?" (너무 일반적)
- description: 판단 1줄만! (15~25자)
  ✅ "피로나 스트레스와 구분이 필요할 수 있습니다"
  ❌ 2~3문장 설명 금지!
- imageKeyword: 한국어 키워드 (예: "겨울철 빙판길, 넘어지는 사람, 얼음")

${localStorage.getItem('medicalLawMode') === 'relaxed' ? `[🔥 의료광고법 자유 모드 + 카드뉴스]
✅ "~해보세요", "확인해보세요" 부드러운 권유 허용
✅ "효과적인", "도움이 되는" 허용
❌ "완치", "최고", "1위" 여전히 금지
❌ 긴 설명 문장 금지!` : `[🚨 의료광고법 + 카드뉴스 규칙]
❌ "~하세요" 명령형 금지!
❌ "체크", "검사 받으세요" 금지!
❌ 긴 설명 문장 금지!
✅ "~시점입니다", "~필요할 수 있습니다"`}

JSON 형식:
{
  "subtitle": "4~8자",
  "mainTitle": "10~18자 <highlight>강조</highlight>",
  "description": "판단 1줄 (15~25자)",
  "speakingNote": "이 슬라이드의 심리적 역할",
  "imageKeyword": "한국어 키워드 3~4개"
}
`;

  try {
    const result = await callGemini({
      prompt,
      model: 'gemini-3.1-pro-preview',  // 카드뉴스 표지 재생성은 3.1 PRO
      responseType: 'json',
      schema: {
        type: Type.OBJECT,
        properties: {
          subtitle: { type: Type.STRING },
          mainTitle: { type: Type.STRING },
          description: { type: Type.STRING },
          speakingNote: { type: Type.STRING },
          imageKeyword: { type: Type.STRING }
        },
        required: ["subtitle", "mainTitle", "description", "speakingNote", "imageKeyword"]
      },
      timeout: TIMEOUTS.GENERATION,
    });

    return result;
  } catch (error) {
    console.error('슬라이드 원고 재생성 실패:', error);
    throw error;
  }
};

export const modifyPostWithAI = async (currentHtml: string, userInstruction: string): Promise<{ 
  newHtml: string, 
  message: string, 
  regenerateImageIndices?: number[],
  newImagePrompts?: string[]
}> => {
    // 이미지 URL을 플레이스홀더로 대체 (토큰 초과 방지)
    // base64 이미지나 긴 URL을 짧은 플레이스홀더로 변환
    const imageMap: Map<string, string> = new Map();
    let imgCounter = 0;
    
    const sanitizedHtml = currentHtml.replace(
      /<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi,
      (match, before, src, after) => {
        // 이미 플레이스홀더인 경우 스킵
        if (src.startsWith('__IMG_PLACEHOLDER_')) {
          return match;
        }
        const placeholder = `__IMG_PLACEHOLDER_${imgCounter}__`;
        imageMap.set(placeholder, src);
        imgCounter++;
        return `<img${before}src="${placeholder}"${after}>`;
      }
    );
    
    try {
      const modifyPrompt = `
${SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 작업: 사용자 요청만 반영
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[요청] "${userInstruction}"
[현재 콘텐츠] ${sanitizedHtml}

🚨 [탈락 기준]
❌ 요청 외 부분 수정 → 탈락!
❌ 길이 ±20% 초과 → 탈락!
❌ 소제목/도입부/마무리 추가 → 탈락!

체크: 요청 부분만 수정? 길이 ±20%?
${localStorage.getItem('medicalLawMode') === 'relaxed' ? '⚠️ 의료광고법 자유 모드: critical 위반(완치, 100%, 최고, 1위)만 금지. 나머지 표현은 자유롭게 사용 가능.' : '의료광고법 엄격 준수?'}

🚫🚫🚫 추가 체크 (AI 냄새 방지!) 🚫🚫🚫
□ "이런 경우" 최대 2회만! (3회 이상 = AI 냄새!)
  → 대체어: "이런 상황", "이런 경험", "이런 변화", "비슷한 느낌"
□ 어색한 문장 금지! ("이런 경우으로 나타나는 경우" 같은 중복 패턴)
□ 마지막 문단 급마무리 금지! (최소 3~4문장, "개인차가 있을 수 있습니다" 단독 사용 금지)

🗣️ 사람 말맛 살리기 (필수!)
□ 입에서 나오는 말처럼 자연스럽게!
□ "~합니다" 연속 3회 금지 → 다양한 종결어미 사용
□ 감각 표현 활용: "뻐근한", "욱신거리는", "뻣뻣한"
□ 짧은 문장 + 중간 문장 리듬감 있게!

🚨 조사(은/는/이/가) 문법 - 신중하게!
⚠️ 받침 없는 단어만 수정! 받침 있으면 절대 건드리지 마!
□ 받침 없는 단어: 변화은→변화는, 허리이→허리가, 상태을→상태를
□ ⚠️ 받침 있는 단어는 그대로! (장을, 밥을, 집을, 책을 → 바꾸지 마!)

🚨 맞춤법 정확하게!
□ 굽히다 ✅ (굽기다 ❌) → "무릎을 굽히고", "허리를 굽히면"
□ 접히다 ✅ (접기다 ❌) → "종이가 접히고"
□ 꺾이다 ✅ (꺾기다 ❌) → "관절이 꺾이면"
□ 되다/돼다: "안 돼요" ✅, "안되요" ❌

📝 글쓰기 핵심 (간단!)
✅ 자연스럽게 말하듯 쓰기
✅ "합니다/있습니다" 체 사용
✅ 공포 조장 대신 → "신경 써야 합니다", "주의가 필요합니다"
✅ 감각 표현 활용 → "뻐근한", "욱신거리는", "뻣뻣한"

🚨 도입부 나열형 금지 (하나의 장면, 하나의 흐름!)
□ "경우가 있습니다" + "하기도 합니다" 연속 = 나열형 → 하나의 이야기로 이어지게 수정
□ 각 문장이 앞 문장의 연장선이어야 함. 별개 사례 나열 금지!

${localStorage.getItem('medicalLawMode') === 'relaxed' ? `🏥 병원 소개 (자유 모드)
□ "풍부한 경험", "체계적인 진료", "전문 의료진" → 허용
□ "15년 경력", "수천 건" → 수치 주의하되 허용
□ "최신 장비", "첨단 시설" → 허용
□ 여전히 금지: "최고", "1위", "타 병원보다"` : `🏥 병원 소개 의료광고법
□ "대학병원급", "만 건 이상", "15년 경력", "수천 건" → 삭제
□ "최신 장비", "첨단 시설" → 장비명만 남기기
□ "실력파", "베테랑", "명의", "풍부한 경험" → 삭제`}
□ 허용: 학력, 학회명, 장비명(수식어 없이)

⚖️ "것이 좋습니다" 맥락 구분
□ 병원 유도(치료/상담/진료/방문/진찰/처방/투약 + 것이 좋습니다) → 완화
□ 일반 건강(검진/운동/금연/수면/섭취 + 것이 좋습니다) → 그대로 허용

🎯 모호한 뭉뚱그리기 금지
□ "불편함/특징/영향/문제"로 퉁친 문장 → "뭐가 어떻게"를 구체화 (어미는 ~수 있습니다 유지)

[참고 예시]
${FEW_SHOT_EXAMPLES}

[HTML 형식] styled HTML (<div class="naver-post-container">)
🔴 일반 소제목: 문단 2~3개 / 마지막: 1~2개 (절대 3개 쓰지 말 것!)

[이미지 재생성] 이미지 관련 요청 시 regenerateImageIndices, newImagePrompts 반환
`;

      const result = await callGemini({
        prompt: modifyPrompt,
        model: "gemini-3.1-pro-preview",  // 고품질 글쓰기용 3.1 PRO 모델
        responseType: 'json',
        schema: {
          type: Type.OBJECT,
          properties: {
            newHtml: { type: Type.STRING },
            message: { type: Type.STRING },
            regenerateImageIndices: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            newImagePrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["newHtml", "message"]
        },
        timeout: TIMEOUTS.GENERATION,
      });

      console.log('🔄 AI 정밀보정 응답:', JSON.stringify(result).substring(0, 500));
      
      // 🚨 방어 코드: newHtml이 없으면 에러 발생
      if (!result.newHtml) {
        console.error('❌ 수정된 콘텐츠를 찾을 수 없음:', result);
        console.error('   - 응답 필드들:', Object.keys(result));
        
        // content 또는 html 필드가 있으면 대체 시도
        const alternativeHtml = result.content || result.html || result.modifiedHtml;
        if (alternativeHtml) {
          console.log('✅ 대체 필드에서 콘텐츠 발견:', Object.keys(result).find(k => result[k] === alternativeHtml));
          result.newHtml = alternativeHtml;
        } else {
          throw new Error('수정된 콘텐츠가 반환되지 않았습니다.');
        }
      }
      
      // 플레이스홀더를 원래 이미지 URL로 복원
      let restoredHtml = result.newHtml;
      imageMap.forEach((originalSrc, placeholder) => {
        restoredHtml = restoredHtml.replace(new RegExp(placeholder, 'g'), originalSrc);
      });
      
      
      // 🔍 수정된 글 AI 냄새 검사
      const aiSmellCheck = runAiSmellCheck(restoredHtml);
      
      // 치명적 문제가 있으면 메시지에 경고 추가
      let finalMessage = result.message || '수정 완료';
      if (aiSmellCheck.criticalIssues.length > 0) {
        finalMessage += `\n\n🚨 경고: 금지 패턴 ${aiSmellCheck.criticalIssues.length}개 발견!\n- ${aiSmellCheck.criticalIssues.slice(0, 3).join('\n- ')}`;
        console.warn('🚨 modifyPostWithAI 후 치명적 AI 냄새:', aiSmellCheck.criticalIssues);
      } else if (aiSmellCheck.warningIssues.length > 0) {
        finalMessage += `\n\n⚠️ AI 냄새 패턴 ${aiSmellCheck.warningIssues.length}개 발견 (권장 수정)`;
      }
      
      console.log('🔍 modifyPostWithAI AI 냄새 검사:', {
        score: aiSmellCheck.score,
        critical: aiSmellCheck.criticalIssues.length,
        warning: aiSmellCheck.warningIssues.length
      });
      
      return {
        ...result,
        newHtml: restoredHtml,
        message: finalMessage,
        aiSmellCheck // AI 냄새 검사 결과도 반환
      };
    } catch (error) { 
      console.error('❌ AI 정밀보정 실패:', error);
      throw error; 
    }
};

// evaluateSeoScore → seoService.ts로 분리됨

// ============================================
// 🤖 AI 냄새 상세 분석 함수 (8~15점 구간 수정 가이드)
// ============================================

/**
 * AI 냄새 상세 분석 함수
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
  const ai = getAiClient();
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
    // 🚀 타임아웃 늘림 (60초) - AI 냄새 분석에 충분한 시간 확보
    const ANALYSIS_TIMEOUT = 60000;
    
    // 📊 스키마 단순화
    const analysisPromise = ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',  // AI 냄새 분석은 FLASH
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            total_score: { type: Type.INTEGER },
            issues: { type: Type.ARRAY, items: { type: Type.STRING } },
            priority_fixes: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["total_score", "issues", "priority_fixes"]
        }
      }
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI 냄새 분석 타임아웃 (60초)')), ANALYSIS_TIMEOUT);  // 60초
    });
    
    const response = await Promise.race([analysisPromise, timeoutPromise]);
    
    const result = JSON.parse(response.text || "{}");
    
    // 단순화된 스키마에서 결과 변환 (호환성 유지)
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

// AI 냄새 재검사 함수 (수동 재생성 후 사용)
export const recheckAiSmell = async (htmlContent: string): Promise<FactCheckReport> => {
  console.log('🔄 AI 냄새 재검사 시작...');
  const ai = getAiClient();
  
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
    // 🚀 타임아웃 설정 (60초)
    const RECHECK_TIMEOUT = 60000;
    
    const analysisPromise = ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',  // 재검증 분석은 FLASH
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI 재검사 타임아웃 (60초)')), RECHECK_TIMEOUT);  // 60초
    });
    
    const response = await Promise.race([analysisPromise, timeoutPromise]);
    
    const result = JSON.parse(response.text || "{}");
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
      // 상세 분석 실패해도 기본 결과는 반환
    }
    
    // 빠른 패턴 검사에서 발견한 치명적 문제는 이미 factCheck.issues에 포함됨
    // (patternCheckIssues 필드는 FactCheckReport 타입에 없으므로 제거)
    
    return factCheck;
  } catch (error) {
    console.error('❌ AI 냄새 재검사 실패:', error);
    throw new Error('AI 냄새 재검사 중 오류가 발생했습니다.');
  }
};

// ========================================
// ✨ AI 정밀보정 - 의료광고법 기준 자동 수정
// ========================================

/**
 * 외부 블로그 콘텐츠를 의료광고법 기준에 맞게 자동 수정
 */
export const refineContentByMedicalLaw = async (
  originalContent: string,
  onProgress?: (msg: string) => void
): Promise<{
  refinedContent: string;
  fact_check: FactCheckReport;
}> => {
  console.log('✨ AI 정밀보정 시작...');
  const ai = getAiClient();
  
  const safeProgress = onProgress || ((msg: string) => console.log('📍 Progress:', msg));
  
  // HTML 태그 제거
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = originalContent;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  safeProgress('📝 원본 콘텐츠 분석 중...');
  
  // 동적 시스템 프롬프트 + 보정용 프롬프트 (v6.7 업데이트 - 최신 의료광고법 자동 반영)
  // 참고: 보정 시에는 원본 글자 수를 유지하면서 품질만 개선
  safeProgress('🔄 최신 의료광고법 규칙 로딩 중...');
  const dynamicSystemPrompt = await getDynamicSystemPrompt();
  const stage2Prompt = getStage2_AiRemovalAndCompliance();
  safeProgress('✅ 동적 프롬프트 준비 완료 (금지어 테이블 + 실전 예시 + 감정 가이드)');
  
  // 원본 글자 수 계산
  const originalLength = textContent.length;
  
  const prompt = `당신은 **의료 블로그 보정 전문가**입니다.
외부에서 가져온 글을 의료광고법에 맞게 다듬으면서, 사람이 쓴 것처럼 자연스럽게 만드세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 시스템 규칙 (최신 의료광고법 반영)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dynamicSystemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 AI 냄새 제거 + 의료광고법 준수 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${stage2Prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 미션: 문제 문장만 "최소한"으로 수정하기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
원본 글자 수: ${originalLength}자
목표: 원본의 90~110% 유지 (${Math.floor(originalLength * 0.9)}~${Math.floor(originalLength * 1.1)}자)

🚨🚨🚨 가장 중요한 규칙 🚨🚨🚨
1. 원본 문장을 **최대한 그대로 유지**하세요!
2. 문제가 있는 **단어/표현만 교체**하세요!
3. **문장 구조를 바꾸지 마세요!**
4. **새로운 문장을 추가하지 마세요!**
5. **문장을 삭제하지 마세요!**
6. **전체를 다시 쓰지 마세요!**
7. **🚫 소제목(h2, h3)을 새로 만들지 마세요!** 원본에 없으면 추가 금지!
8. **🚫 문단을 나누지 마세요!** 원본 문단 구조 그대로!

예시:
• 원본: "병원 문을 두드리는 것 자체가 큰 결심이 필요한 일이기도 합니다."
• ❌ 잘못된 수정: "용기를 내어 첫 발을 내딛는 것이 쉽지 않은 일입니다." (전체 다시 씀)
• ✅ 올바른 수정: "병원 문을 두드리는 것 자체가 큰 결심이 필요한 일이기도 합니다." (문제 없으면 그대로!)

• 원본에 소제목이 없으면:
• ❌ 잘못된 수정: "평소와 다른 느낌이 반복될 때\n아침에 일어났을 때..." (소제목 추가함)
• ✅ 올바른 수정: "아침에 일어났을 때..." (소제목 없이 그대로!)

[원본 콘텐츠 - 이 문장들을 최대한 유지하세요!]
${textContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 P0 - 절대 금지 (발견 시 즉시 수정!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ "~요/~죠" 종결어미 → "~습니다/~ㅂ니다"
   ❌ "아프시죠", "힘드시죠", "그렇죠", "좋아요", "있거든요"
   ✅ "아픕니다", "힘듭니다", "그렇습니다", "좋습니다", "있습니다"

2️⃣ 의료광고법 위반
   ❌ "치료", "완치", "효과", "개선" (단정형)
   ❌ 숫자/통계: "90%", "2주", "3일"
   ✅ "도움이 될 수 있습니다", "나아질 수 있습니다"

3️⃣ 의사 흉내 금지
   ❌ "~때문에 발생합니다", "~로 인해", "원인은 ~입니다"
   ❌ 의학용어 나열, 병태생리 설명

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 P1 - AI 냄새 제거 (자연스럽게 변환)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥🔥🔥 자연스러운 글쓰기 핵심 원칙 🔥🔥🔥
⚡ 핵심: "이 문장을 사람이 블로그에 쓸까?" 자문하기!

🎯 자연스러운 글쓰기 = 말하듯이 쓰기
• 강의/설명문처럼 정돈된 문장 ❌ → 대화하듯 편안한 문장 ✅
• 매 문장이 완벽하면 AI 냄새 → 약간 느슨하게!
• 모든 것을 "설명"하려 하지 마라 → "느끼게" 하는 문장도 필요!
• 딱딱한 정보 나열 ❌ → 상황/경험 중심 ✅

❌ AI 냄새 나는 문장 (너무 정돈됨):
"테니스엘보는 팔꿈치 외측 상과에 발생하는 질환으로, 반복적인 손목 신전 운동이 원인입니다."
"이 증상은 주로 과도한 사용으로 인해 발생하며, 적절한 관리가 필요합니다."

✅ 자연스러운 문장 (사람이 쓸 법한):
"팔꿈치 바깥쪽이 자꾸 쑤시는 느낌이 들 때가 있습니다."
"마우스를 쓰다가도 팔꿈치 쪽이 뻐근해지는 경우가 생기기도 합니다."

🎯 자연스러운 연결 표현:
✅ "~기도 합니다", "~경우가 있습니다", "~편입니다"
✅ "~날이 있습니다", "~때가 있습니다", "~적이 있습니다"
✅ "특히 ~할 때", "주로 ~하면", "보통 ~하다 보면"

❌ 피해야 할 연결:
"또한", "더불어", "아울러", "게다가" (AI 냄새!)
"이러한", "해당", "적절한", "효과적인" (번역체!)

🔥 도입부 - 다양한 시점/상황 활용!
❌ "바쁜 일상 속에서~", "현대인들은~" (AI 냄새)
✅ 다양한 시점: "아침에 일어나니", "퇴근길에 문득", "계단을 오르다", "자려고 누웠는데"

🏥 **병원 톤의 전문적이면서 공감되는 묘사 (10문장 중 2~3문장만!)**
✅ 좋은 묘사: "쑤시는 느낌", "욱신거리는", "뻐근한", "가래가 걸린 듯한 기침", "숨이 차는 느낌"
❌ 피할 묘사: "개가 짖는 듯한", "항아리가 울리는 듯한" (동물/사물 비유는 전문성↓)
💡 환자가 "이런 느낌이에요"라고 말할 법한 표현 사용!

❌ 딱딱한 표현 → ✅ 자연스러운 표현:
• "해당 증상" → "이런 느낌"
• "적절한 관리가 필요합니다" → "살펴볼 수 있는 부분입니다"
• "불편감이 발생합니다" → "뻐근해집니다"
• "증상이 나타날 수 있습니다" → "이런 느낌이 생깁니다"
• "권장드립니다" → "도움이 될 수 있습니다"
• "유의해야 합니다" → "살펴볼 수 있는 부분입니다"
• "~하시는 것이 좋습니다" → "~할 수 있습니다"
• "다양한", "효과적인", "중요한" → 구체적 표현으로
• "~에 대해 알아보겠습니다" → 삭제

❌ 번역투 → ✅ 자연스러운 한국어:
• "요인/요소" → "이유"
• "발생하다" → "생기다"  
• "~측면에서" → "~쪽에서 보면"
• "영향을 미치다" → "~하면 ~해집니다"

✅ 감각 표현 (부위별 가이드):
• 통증: 쑤시는, 욱신거리는, 뻐근한, 찌릿한, 시큰한
• 기침: 가래가 걸린 듯한, 마른기침, 숨을 들이쉴 때 걸리는
• 호흡: 숨이 차는, 가슴이 답답한, 깊은 숨이 안 쉬어지는
• 관절: 뻣뻣한, 삐걱거리는, 걸을 때 뻑뻑한
• 근육: 당기는, 뭉친, 힘이 안 들어가는

✅ 상황 묘사 (구체적으로!):
• ❌ "아침에 증상이 심합니다"
• ✅ "아침에 눈 뜨자마자 손가락이 뻣뻣합니다"

🔥 내용 중복 금지 - 병명 정의에서 증상/원인 미리 쓰지 말 것!
• ❌ "테니스엘보는 팔꿈치에 통증이 생기는 상태로, 반복 동작으로 나타납니다"
  → 정의에서 증상+원인 다 씀! 뒤에서 쓸 내용 없어짐!
• ✅ 정의는 2문단 정도로! (너무 짧아도 안 됨!)
  "테니스엘보는 팔꿈치 바깥쪽 부위를 말합니다. 운동을 즐기는 분들 사이에서 자주 들리는 이름이기도 합니다."
• 도입/정의 (2문단): 이게 뭔지 + 가벼운 배경/공감
• 증상/원인: 뒤 문단에서 자세히!

🚫🚫🚫 "이런 경우" 반복 금지! (AI 냄새!) 🚫🚫🚫
• "이런 경우" 전체 글에서 **최대 2회**만! 3회 이상 = AI 냄새 폭발!
• "이런 경우가 있습니다", "이런 경우에는", "이런 경우으로" 합쳐서 2회!
• ✅ 대체어 활용: "이런 상황", "이런 경험", "이런 변화", "비슷한 느낌", "이런 순간"

🚫 어색한 문장 패턴 금지!
• ❌ "이런 경우으로 나타나는 경우가 있습니다" (경우 중복 + 문법 오류)
• ❌ "이런 변화가 이런 경우으로" (의미 불명확)
• ❌ 같은 단어가 한 문장에 2번 이상 등장하면 수정!

🚫 조사(은/는/이/가) 문법 - 신중하게!
⚠️ 받침 없는 단어만 수정! 받침 있으면 절대 건드리지 마!
• 받침 없는 단어 (예: 허리, 변화, 자세, 피로, 상태):
  - 변화은 ❌ → 변화는 ✅
  - 허리이 ❌ → 허리가 ✅
  - 상태을 ❌ → 상태를 ✅
• ⚠️⚠️⚠️ 받침 있는 단어는 그대로! (절대 바꾸지 마!) ⚠️⚠️⚠️
  - "장을 보다" → 그대로! (장에 받침 ㅇ 있음)
  - "밥을 먹다" → 그대로! (밥에 받침 ㅂ 있음)
  - "집을 나서다" → 그대로! (집에 받침 ㅂ 있음)
  - "책을 읽다" → 그대로! (책에 받침 ㄱ 있음)

🚫 맞춤법 정확하게!
• 굽히다 ✅ (굽기다 ❌) → "무릎을 굽히고", "허리를 굽히면"
• 접히다 ✅ (접기다 ❌) → "종이가 접히고"
• 꺾이다 ✅ (꺾기다 ❌) → "관절이 꺾이면"
• 되다/돼다: "안 돼요" ✅, "안되요" ❌, "돼서" ✅, "되서" ❌

📝 글쓰기 핵심 (간단!)
• 자연스럽게 말하듯 쓰기 - 원본이 좋으면 그대로!
• "합니다/있습니다" 체 사용
• 공포 조장 대신 → "살펴볼 수 있는 부분입니다", "~일 수 있습니다"
• 마지막 문단은 3~4문장으로 자연스럽게 마무리

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢🟢🟢 반드시 유지! (건드리면 안 됨!) 🟢🟢🟢
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 소제목 (<h2>, <h3>) - 원본에 있으면 그대로, **없으면 추가 금지!**
• 문단 구조 - 원본 그대로! 문단 나누기 금지!
• 문장 구조 - 최대한 그대로!
• 좋은 표현 - 이미 자연스러운 문장은 절대 수정 금지!
• 핵심 정보 - 내용 왜곡 금지!

⚠️ 자연스러운 문장까지 고치면 오히려 AI 냄새가 나요!
⚠️ "아침에 일어났을 때 아랫배가 묵직하거나" 같은 표현은 이미 좋아요!
⚠️ 문제가 없는 문장은 한 글자도 바꾸지 마세요!
⚠️ 원본에 소제목이 없으면 절대 소제목을 만들지 마세요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 응답 형식 (JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "content": "<수정된 전체 HTML - <p>, <h2>, <h3> 태그 포함>",
  "fact_check": {
    "fact_score": 85,
    "safety_score": 90,
    "ai_smell_score": 15,
    "issues": ["수정한 문장 1", "수정한 문장 2"],
    "recommendations": ["추가로 확인할 사항"]
  }
}

⚠️ 반드시 "content" 키에 전체 HTML!
⚠️ "t", "c" 같은 다른 키 사용 금지!`;

  try {
    safeProgress('⚖️ 의료광고법 준수 여부 검증 중...');
    
    // 🔧 자동 보정도 PRO 사용 (글쓰기 품질 우선)
    const result = await callGemini({
      prompt,
      model: GEMINI_MODEL.PRO,  // 자동 보정: PRO (글쓰기 품질)
      responseType: 'json',
      timeout: TIMEOUTS.GENERATION,
      tools: [{ googleSearch: {} }] // Google Search 활성화
    });
    
    console.log('✅ 수정 완료:', result);
    console.log('📦 result 타입:', typeof result);
    console.log('📦 result 키:', Object.keys(result || {}));
    
    // 다양한 응답 형식 처리 (Gemini가 예상치 못한 키를 사용할 수 있음)
    let refinedContent = '';
    let factCheck = null;
    
    if (typeof result === 'string') {
      // 문자열로 반환된 경우 (HTML 직접 반환)
      refinedContent = result;
    } else if (result?.content) {
      // { content: "..." } 형식 (정상)
      refinedContent = result.content;
      factCheck = result.fact_check;
    } else if (result?.c) {
      // { c: "..." } 형식 (Gemini가 키를 줄인 경우)
      console.warn('⚠️ Gemini가 "c" 키를 사용함 (예상: "content")');
      refinedContent = result.c;
      factCheck = result.fact_check || result.f;
    } else if (result?.t && result?.c) {
      // { t: "제목", c: "내용" } 형식 (Gemini가 잘못 응답)
      console.warn('⚠️ Gemini가 t/c 형식으로 응답 - 변환 시도');
      refinedContent = `<h1>${result.t}</h1>\n${result.c}`;
      factCheck = result.fact_check;
    } else if (result?.refinedContent) {
      // { refinedContent: "..." } 형식
      refinedContent = result.refinedContent;
      factCheck = result.fact_check;
    } else if (result?.html) {
      // { html: "..." } 형식
      refinedContent = result.html;
      factCheck = result.fact_check;
    } else if (result?.text) {
      // { text: "..." } 형식
      refinedContent = result.text;
    } else {
      // 마지막 시도: 객체에서 가장 긴 문자열 값을 찾기
      console.warn('⚠️ 예상치 못한 응답 형식, 가장 긴 값 추출 시도:', Object.keys(result || {}));
      const values = Object.values(result || {}).filter(v => typeof v === 'string') as string[];
      if (values.length > 0) {
        refinedContent = values.reduce((a, b) => a.length > b.length ? a : b);
        console.log('📝 추출된 콘텐츠 길이:', refinedContent.length);
      }
    }
    
    if (!refinedContent) {
      console.error('❌ 수정된 콘텐츠를 찾을 수 없음:', result);
      throw new Error('수정된 콘텐츠가 반환되지 않았습니다.');
    }
    
    
    safeProgress('✅ AI 정밀보정 완료!');
    
    return {
      refinedContent,
      fact_check: factCheck || {
        fact_score: 0,
        safety_score: 0,
        ai_smell_score: 0,
        conversion_score: 0,
        verified_facts_count: 0,
        issues: [],
        recommendations: []
      }
    };
  } catch (error) {
    console.error('❌ AI 정밀보정 실패:', error);
    throw error;
  }
};
