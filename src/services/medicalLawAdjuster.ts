/**
 * medicalLawAdjuster.ts — 의료광고법 기준 콘텐츠 자동 보정
 *
 * 외부 블로그 콘텐츠를 의료광고법에 맞게 다듬으면서
 * AI 냄새를 제거하는 정밀 보정 서비스.
 *
 * SOT 정책:
 * - 의료법 규칙 본문은 medicalLawService.ts가 SOT
 * - 동적 프롬프트는 gpt52-prompts-staged.ts에서 가져옴
 * - 이 파일은 "조합/호출"만 수행
 *
 * 소비자: ContentRefiner.tsx
 */
import { FactCheckReport } from "../types";
import { GEMINI_MODEL, TIMEOUTS, callGemini } from "./geminiClient";
import { getStage2_AiRemovalAndCompliance, getDynamicSystemPrompt } from "../lib/gpt52-prompts-staged";

export const refineContentByMedicalLaw = async (
  originalContent: string,
  onProgress?: (msg: string) => void
): Promise<{
  refinedContent: string;
  fact_check: FactCheckReport;
}> => {
  console.log('✨ AI 정밀보정 시작...');

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
      googleSearch: true
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
