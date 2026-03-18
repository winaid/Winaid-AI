/**
 * contentEditorService.ts — 콘텐츠 편집/수정 서비스
 *
 * 카드 슬라이드 재생성, AI 콘텐츠 수정 기능.
 * 구 postProcessingService.ts에서 분리됨 (현재 독립 모듈).
 *
 * 소비자:
 * - ScriptPreview.tsx → regenerateSlideContent, SlideRegenMode
 * - useAiRefine.ts → modifyPostWithAI
 */
import { Type } from "@google/genai";
import { TIMEOUTS, callGemini } from "./geminiClient";
import { SYSTEM_PROMPT } from "../lib/gpt52-prompts-staged";
import { FEW_SHOT_EXAMPLES } from "../utils/humanWritingPrompts";
import { runAiSmellCheck } from "./contentQualityService";

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
