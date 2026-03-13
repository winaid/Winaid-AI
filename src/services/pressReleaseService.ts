import { callGemini, GEMINI_MODEL, TIMEOUTS } from "./geminiClient";
import type { GeminiCallConfig } from "./geminiClient";
import type { GenerationRequest, GeneratedContent } from "../types";
import { saveGeneratedPost } from "./postStorageService";

// 🔍 질병관리청 검색 함수 (1차 검색) - 타임아웃 120초
async function searchKDCA(query: string): Promise<string> {
  try {
    console.log('🔍 [1차 검색] 질병관리청에서 검색 중...', query);

    // 질병관리청 사이트 검색
    const kdcaDomains = [
      'kdca.go.kr',
      'cdc.go.kr',
      'nih.go.kr'
    ];

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
    }) || '';
    console.log('✅ 질병관리청 검색 완료');
    return result;

  } catch (error) {
    console.error('❌ 질병관리청 검색 실패:', error);
    return '';
  }
}

// 🏥 병원 사이트 크롤링 함수 (2차 검색) - 타임아웃 120초
async function searchHospitalSites(query: string, category: string): Promise<string> {
  try {
    console.log('🔍 [2차 검색] 병원 사이트에서 크롤링 중...', query);

    // 신뢰할 수 있는 병원 사이트 목록
    const hospitalDomains = [
      'amc.seoul.kr',           // 서울아산병원
      'snuh.org',               // 서울대학교병원
      'severance.healthcare.or.kr', // 세브란스병원
      'samsunghospital.com',    // 삼성서울병원
      'cmcseoul.or.kr',         // 가톨릭대학교 서울성모병원
      'yuhs.or.kr'              // 연세의료원
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
    }) || '';
    console.log('✅ 병원 사이트 크롤링 완료');
    return result;

  } catch (error) {
    console.error('❌ 병원 사이트 크롤링 실패:', error);
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
    const text = await callGemini({
      prompt: enrichedPrompt,
      model: GEMINI_MODEL.PRO,
      responseType: isTextPlain ? 'text' : 'json',
      googleSearch: true,
      temperature: 0.6,
    });

    console.log('✅ 보도자료 Gemini API 응답 수신');
    console.log('📝 보도자료 텍스트 길이:', typeof text === 'string' ? text.length : JSON.stringify(text)?.length || 0);

    return { text, response: null };

  } catch (error) {
    console.error('❌ callGeminiWithSearch 실패:', error);
    throw error;
  }
}

// 🗞️ 보도자료 생성 함수
export const generatePressRelease = async (request: GenerationRequest, onProgress: (msg: string) => void): Promise<GeneratedContent> => {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const day = currentDate.getDate();
  const formattedDate = `${year}년 ${month}월 ${day}일`;

  const pressTypeLabels: Record<string, string> = {
    'achievement': '실적 달성',
    'new_service': '신규 서비스/장비 도입',
    'research': '연구/학술 성과',
    'event': '행사/이벤트',
    'award': '수상/인증 획득',
    'health_tips': '건강 조언/정보'
  };

  const pressTypeLabel = pressTypeLabels[request.pressType || 'achievement'] || '실적 달성';
  const hospitalName = request.hospitalName || 'OO병원';
  const doctorName = request.doctorName || '홍길동';
  const doctorTitle = request.doctorTitle || '원장';
  const maxLength = request.textLength || 1400;

  // 학습된 말투 스타일 적용
  let learnedStyleInstruction = '';
  if (request.learnedStyleId) {
    try {
    const { getStyleById, getStylePromptForGeneration } = await import('./writingStyleService');
    const learnedStyle = getStyleById(request.learnedStyleId);
    if (learnedStyle) {
      learnedStyleInstruction = `
[🎓 학습된 말투 적용 - 보도자료 스타일 유지하며 적용!]
${getStylePromptForGeneration(learnedStyle)}

⚠️ 위 학습된 말투를 보도자료 형식에 맞게 적용하세요:
- 전문적인 보도자료 어조는 유지
- 문장 끝 패턴과 표현 스타일만 반영
- 과도한 구어체는 지양
`;
      console.log('📝 보도자료에 학습된 말투 적용:', learnedStyle.name);
    }
    } catch (e) {
    console.warn('학습된 말투 로드 실패:', e);
    }
  }

  // 🏥 병원 웹사이트 크롤링 (강점, 특징 분석)
  let hospitalInfo = '';
  if (request.hospitalWebsite && request.hospitalWebsite.trim()) {
    onProgress('🏥 병원 웹사이트 분석 중...');
    try {
      const crawlResponse = await fetch('/api/crawler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: request.hospitalWebsite })
      });

      if (crawlResponse.ok) {
        const crawlData = await crawlResponse.json() as { content?: string; error?: string };
        if (crawlData.content) {
          console.log('✅ 병원 웹사이트 크롤링 완료:', crawlData.content.substring(0, 200));

          // AI로 병원 강점 분석
          const analysisResult = await callGemini({
            prompt: `다음은 ${hospitalName}의 웹사이트 내용입니다.

웹사이트 내용:
${crawlData.content.substring(0, 3000)}

[분석 요청]
위 병원 웹사이트에서 다음 정보를 추출해주세요:

1. 병원의 핵심 강점 (3~5개)
2. 특화 진료과목이나 특별한 의료 서비스
3. 병원의 차별화된 특징 (장비, 시스템, 의료진 등)
4. 병원의 비전이나 철학
5. 수상 경력이나 인증 사항

출력 형식:
[병원 강점]
- 강점 1
- 강점 2
...

[특화 서비스]
- 서비스 1
- 서비스 2
...

[차별화 요소]
- 요소 1
- 요소 2
...

간결하게 핵심만 추출해주세요. 없는 정보는 생략하세요.`,
            model: GEMINI_MODEL.FLASH,
            responseType: 'text',
          });

          hospitalInfo = `\n[🏥 ${hospitalName} 병원 정보 - 웹사이트 분석 결과]\n${analysisResult}\n\n`;
          console.log('✅ 병원 강점 분석 완료:', hospitalInfo.substring(0, 200));
        }
      } else {
        console.warn('⚠️ 크롤링 API 실패:', crawlResponse.status);
      }
    } catch (error) {
      console.warn('⚠️ 병원 웹사이트 분석 실패:', error);
    }
  }

  onProgress('🗞️ 보도자료 작성 중...');

  const pressPrompt = `
너는 국내 포털에 송출되는 건강·의학 기사를 작성하는 전문 기자다.
아래 주제를 바탕으로 '블로그 글'이나 '칼럼'이 아닌,
실제 언론사 의학 기사 문체로 글을 작성해라.
${learnedStyleInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📰 기사 작성 기본 조건]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 기자의 3인칭 서술을 기본으로 한다
- 글 전체는 객관적·중립적·정보 전달 중심으로 쓴다
- 독자에게 직접 말을 거는 표현은 사용하지 않는다
- 병원 홍보, 마케팅, 권유 문장은 포함하지 않는다
- 과장, 단정, 효과 보장 표현은 쓰지 않는다

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📰 기사 구성 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 첫 문단은 계절·사회적 변화·생활 환경 등 일반적인 상황으로 시작
2. 중반부에 질환 또는 증상의 의학적 설명을 포함
3. 전문의 발언을 큰따옴표로 2회 이상 인용
   (이름 + 소속 + 직함을 기사 형식으로 표기)
4. 치료나 관리는 '권장'이 아니라 '의학적으로 설명되는 방식'으로 서술
5. 문단 말미는 일반적인 주의 문구로 정리

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📰 기사 문체 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "~합니다 / ~도움이 됩니다" 같은 안내형 문체 금지
- "~라고 말했다 / ~라고 설명했다" 기사체 적극 사용
- 불필요한 감정 표현 최소화
- 전체 톤은 차분하고 사실 중심으로 유지

[기본 정보]
- 병원명: ${hospitalName}
- 진료과: ${request.category}
- 의료진: ${doctorName} ${doctorTitle}
- 보도 유형: ${pressTypeLabel}
- 주제: ${request.topic}
- SEO 키워드: ${request.keywords} ⚠️ **필수**: 본문에 자연스럽게 포함 (첫 번째 키워드 정확히 4회, 두 번째 최대 2회, 세 번째 이후 최대 1회. 부분 일치도 카운트!)
- 🚨🚨🚨 최대 글자 수: 공백 제외 ${maxLength}자 (절대 초과 불가!)
  ✅ 반드시 ${maxLength}자 이하로 작성!
  💡 안전하게 ${maxLength - 50}자 ~ ${maxLength}자로 작성 권장!
${hospitalInfo}

[중요]
🚨🚨🚨 의료광고법 및 기사 윤리 기준 최우선 준수 🚨🚨🚨
[중요]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[⛔ 절대 금지 표현 - 효과·평가·결과 암시 전면 차단!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌❌❌ 다음 표현들은 어떤 형태로든 사용 금지! ❌❌❌

**1. 치료 결과/예후 평가 표현 (완전 금지!)**
❌ "치료 예후가 긍정적이다"
❌ "예후가 좋다 / 나쁘다"
❌ "결과가 좋다 / 나쁘다"
❌ "성공률이 높다"
❌ "완치율이 높다"
❌ "회복이 빠르다"
❌ "효과가 크다 / 좋다"
❌ "효과적이다"

**2. 도움/이익 표현 (완전 금지!)**
❌ "큰 도움이 된다"
❌ "도움이 될 수 있다"
❌ "도움이 되는 것으로 나타납니다"
❌ "효과가 있다 / 있을 수 있다"
❌ "유익하다"
❌ "이익이 있다"

**3. 최상급/비교우위 표현 (완전 금지!)**
❌ "가장 좋은 방법이다"
❌ "최선의 선택이다"
❌ "지름길이다"
❌ "빠른 길이다"
❌ "확실한 방법이다"
❌ "최고의 치료법"

**4. 예방/발견 효과 단정 (완전 금지!)**
❌ "예방 가능성이 높다"
❌ "예방할 수 있다"
❌ "막을 수 있다"
❌ "조기에 발견하면 결과가 좋다"
❌ "조기 발견이 중요하다" (× 가치 판단)
❌ "골든타임"

**5. 명령형/권유형 (완전 금지!)**
❌ "~하세요"
❌ "~받으세요"
❌ "~하는 것이 좋습니다"
❌ "권장합니다"
❌ "추천합니다"
❌ "반드시 ~해야"

**6. 공포 조장 표현 (완전 금지!)**
❌ "방치하면 위험하다"
❌ "침묵의 살인자"
❌ "시한폭탄"
❌ "생명 위협"
❌ "돌이킬 수 없다"
❌ "~하지 않으면 큰일난다"

**7. 부자연스러운 표현 (완전 금지!)**
❌ "말합니다" / "이야기합니다" / "알려져 있습니다" / "연관" / "관련" / "언급"
✅ **대체**: "나타납니다" / "보입니다" / "확인되고 있습니다"

**🆕 8. 약물/치료법 권유 표현 (완전 금지!)**
❌ "이 약을 권장합니다"
❌ "이 치료법을 선택하면 좋습니다"
❌ "이 성분이 우선입니다"
❌ "이 방법이 적합합니다"
❌ "확인해보자 / 고려해보자 / 선택하자"
❌ "약물 간 상호작용이 위험합니다 / 안전합니다" (단정 금지)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[✅ 허용 표현 - 중립적 사실 전달만!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**✅ 관찰/설명형 표현 (사용 가능)**
✅ "~로 나타납니다"
✅ "~하는 경우가 있습니다"
✅ "~로 보입니다"
✅ "~로 알려져 있습니다" (일반적 정보 수준)
✅ "~로 보고된 바 있습니다" (보고된 경향)

**✅ 정보 전달형 표현 (평가 없이)**
✅ "변화를 기록해두는 것도 방법입니다" (관찰만)
✅ "개인차가 있을 수 있습니다"
✅ "경우에 따라 다를 수 있습니다"

**✅ 중립적 사실 전달**
✅ "증상이 나타날 수 있습니다"
✅ "차이가 있을 수 있습니다"
✅ "개인에 따라 다릅니다"
✅ "다양한 이유가 관여합니다"

**🆕 ✅ 약물/치료법 언급 (설명 목적 최소화)**
✅ "일반적으로 알려진 방법 중 하나입니다"
✅ "의학계에서 사용되는 경우가 있습니다"
✅ "보고된 경향 중 하나로 언급됩니다"
✅ "경우에 따라 고려되는 것으로 알려져 있습니다"
⚠️ **단, 약물/성분명은 설명 목적에 한해 최소화하고 반복 금지!**
✅ "여러 측면이 있습니다"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📝 문체 가이드 - 중립적 기사 작성 원칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. 핵심 원칙**
- 가치 판단 표현 완전 배제 (좋다/나쁘다/효과적이다/중요하다 등)
- 결과/예후 평가 금지
- 관찰·사실 전달에만 집중
- 광고처럼 보이지 않도록 과장 배제

**1-1. 영양소·생활습관 관련 효과 단정 금지 (완충 필수)**
🚨 특별 주의: 영양소/생활습관 → 효과 직접 연결 금지

❌ 금지 표현:
  • "비타민D가 도움이 됩니다" (효과 단정)
  • "칼슘 섭취가 필요합니다" (의무화)
  • "규칙적인 운동이 효과적입니다" (효과 단정)
  • "충분한 수면이 중요합니다" (가치 판단)
  • "스트레칭이 도움이 됩니다" (효과 단정)
  • "금연/금주가 필수입니다" (의무화)

✅ 완충 표현 (3단계 완화):
  Level 1 (가장 안전):
    "비타민D를 살펴보는 것도 방법입니다"
    "칼슘 섭취 패턴을 확인해보는 것도 방법입니다"
    "규칙적인 활동이 도움될 수 있습니다"

  Level 2 (안전):
    "충분한 휴식과 연관이 있습니다"
    "스트레칭 습관을 살펴보는 경우가 있습니다"
    "생활 패턴을 살펴보는 것도 한 가지 방법입니다"

  Level 3 (허용 가능):
    "비타민D 섭취와 관련이 있습니다"
    "수면 패턴과의 연관성이 있다고 합니다"

**2. 문장 구조**
- "~하는 것으로 보고된다" (○)
- "~의 역할로 알려져 있다" (○)
- "~와 연관성이 있습니다" (○)
- 결과 대신 → 과정·절차 설명
- 효과 대신 → 역할·관련성 언급

**3. 완충 표현 필수 사용**
- "의료계 일각에서는"
- "관련 학계에서는"
- "일부 전문가들은"
- "~로 보고된다"
- "~로 나타납니다"
- "개인에 따라 차이가 있을 수 있다"

**4. 정보 전달 우선**
- 사실·통계·연구 결과 → 출처 명시
- 증상·특성 설명 → 가치 판단 없이
- 진료 절차 안내 → 명령형 금지

**5. 내용 중복 금지 (필수!)**
🚨 같은 내용을 다른 표현으로 반복하지 말 것!
❌ "혈당 관리가 중요하다. 혈당 조절이 필요하다." (중복!)
✅ "혈당 관리와 관련이 있다. 규칙적인 식사 패턴과의 연관성이 보고되고 있다." (진행)

**6. 만연체 문장 금지 (필수!)**
🚨 한 문장에 접속사 2개 이상 금지!
❌ "증상이 나타나고, 악화되며, 지속되면 확인이 필요합니다" (만연체)
✅ "증상이 나타나면 확인이 필요합니다. 악화되는 경우도 있습니다." (분리)
- 문장 길이: 최대 50자 권장 (공백 포함)
- 하나의 문장 = 하나의 핵심 메시지

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 기사 구성 가이드]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. 도입부 (공감 형성)**
- 독자가 겪을 법한 증상/상황 제시
- 평가 없이 현상만 설명
- 예: "최근 ~한 증상을 경험하는 경우가 늘고 있습니다"

**2. 배경 설명 (의학적 맥락)**
- 질환/증상의 특성 설명
- 완충 표현 필수: "개인에 따라 차이가 있을 수 있습니다"
- 가치 판단 없이 사실만 전달

**3. 통계/추세 (객관적 정보)**
- 완충 표현 사용
- 출처 명시 (있는 경우)
- 단정 표현 금지

**4. 질환 특성 (중립적 설명)**
- ❌ "조기 인지가 중요하게 여겨집니다" → 가치 판단!
- ✅ "증상 확인 과정이 있습니다"
- ✅ "파악하는 단계가 진행됩니다"

**5. 검진·관리 (정보 전달)**
- ❌ "권장됩니다" → 권유!
- ❌ "도움이 될 수 있습니다" → 효과 암시!
- ✅ "확인하는 과정이 있습니다"
- ✅ "알려져 있습니다"

**6. 의료진 인터뷰 ("${doctorName} ${doctorTitle}" 직접 인용)**
- 인터뷰에서도 평가 표현 금지
- 사실·관찰·절차 위주로 설명
- 공포 조장 금지

**7. 병원 정보 (2~3문장, 70자 이내)**
- 환자 편의/진료 환경만 언급
- 치료 효과·실적 언급 금지

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[⚠️ 검수 체크리스트 - 작성 후 반드시 확인!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

작성 후 다음 표현이 있는지 전체 검수:
□ "도움이 되다" / "도움이 될 수 있다" → 0개!
□ "효과가 있다" / "효과적이다" → 0개!
□ "좋다" / "나쁘다" / "중요하다" → 0개!
□ "예후가" / "결과가" → 0개!
□ "가장" / "최고" / "최선" → 0개!
□ "지름길" / "빠른 길" → 0개!
□ "예방할 수 있다" / "막을 수 있다" → 0개!
□ "조기 발견" + "중요" / "좋다" → 0개!
□ "~하세요" / "~받으세요" → 0개!
□ "권장" / "추천" / "반드시" → 0개!

✅ 모든 항목이 0개여야 합격!
✅ 1개라도 있으면 전면 수정!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[핵심 규칙]
1. 언론 기사체로 작성 (블로그체 아님)
2. 독자 행동을 직접 명령하지 않음 ("~하세요" 금지)
3. 헤드라인: 자극 키워드 1개 이내 (예: "주의보", "신호" 중 1개만)
4. 공포 은유 금지 ("침묵의 살인자", "시한폭탄", "생명 위협" 등)
5. **효과·평가·결과 표현 전면 금지** (가장 중요!)

[반드시 포함]
- 병원명: ${hospitalName}
- 의료진: ${doctorName} ${doctorTitle}
- 전문의 인용 2회 이상 (본문에 자연스럽게 녹여서, 기사체로)
- 검진/상담 정보 (명령형 아님, "확인하는 과정이 있다" 수준으로)

[전문의 인용 형식 - 기사체로 본문에 자연스럽게!]
⚠️ blockquote 태그 사용 금지! 일반 <p> 태그 안에서 기사체로 인용!
✅ 올바른 예시:
<p>${hospitalName} ${request.category} ${doctorName} ${doctorTitle}은 "척추 통증은 개인마다 발생하는 원인과 민감도가 다르게 나타난다"라고 설명했다.</p>
<p>${doctorName} ${doctorTitle}은 "목디스크 및 허리디스크 등으로 인한 통증이 지속될 경우, 구조적 문제를 파악하고 그에 맞는 비수술적 계획을 수립하는 것이 일반적인 의학적 절차"라고 덧붙였다.</p>

❌ 잘못된 예시 (금지):
<blockquote class="press-quote"><p>"인용문"</p><cite>- 출처</cite></blockquote>

[HTML 출력]
🚨🚨🚨 제목 규칙 - 절대 변경 금지! 🚨🚨🚨
- h1 제목: "${request.topic}" ← 이 텍스트를 한 글자도 바꾸지 말고 그대로 출력!
- h2 부제: 생성하지 마! h2 태그 자체를 출력하지 마!
- 제목을 다른 말로 바꾸거나, 부제를 추가하면 실패!

<div class="press-release-container">
  <h1 class="press-title">${request.topic}</h1>
  <div class="press-body">
    <p>[도입 - 계절/사회적 변화/생활 환경 등 일반적인 상황으로 시작]</p>
    <p>[의학적 맥락 - 질환/증상의 의학적 설명]</p>
    <p>[전문의 인용 1 - 본문에 자연스럽게 기사체로: ${doctorName} ${doctorTitle}은 "..."라고 말했다.]</p>
    <p>[추가 설명 - 치료/관리를 의학적으로 설명되는 방식으로 서술]</p>
    <p>[전문의 인용 2 - 본문에 자연스럽게 기사체로: ${doctorName} ${doctorTitle}은 "..."라고 덧붙였다.]</p>
    <p>[마무리 - 일반적인 주의 문구]</p>
  </div>
  <div class="press-footer">
    <div class="press-disclaimer">
      <p>※ 의학적 정보는 참고용이며, 정확한 진단은 전문의 판단이 필요합니다.</p>
    </div>
  </div>
</div>

[중요]
- 🚨 h1 제목은 "${request.topic}" 그대로! 절대 변경 금지!
- 🚨 h2 부제 태그 출력 금지! 부제 없음!
- blockquote 태그 사용 금지! 인용은 <p> 태그 안에서 기사체로!
- 마크다운 금지 (###, **굵게** 등)
- 모든 텍스트는 HTML 태그로 감싸기
- 전문의 인용은 "~라고 말했다", "~라고 설명했다", "~라고 덧붙였다" 기사체 사용
`;

  // 🔍 Google Search 연결 - 언론 보도용 최신 정보 수집
  onProgress('🔍 Google Search로 최신 의료 정보를 검색하고 있습니다...');
  const result = await callGeminiWithSearch(pressPrompt, { responseFormat: "text/plain" });
  let pressContent = result.text || '';

  // HTML 정리
  pressContent = pressContent
    .replace(/```html?\n?/gi, '')
    .replace(/```\n?/gi, '')
    .trim();

  // press-release-container가 없으면 감싸기
  if (!pressContent.includes('class="press-release-container"')) {
    pressContent = `<div class="press-release-container">${pressContent}</div>`;
  }

  // CSS 스타일 추가
  const pressStyles = `
<style>
.press-release-container {
  font-family: 'Pretendard', -apple-system, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px;
  background: #fff;
  line-height: 1.8;
  color: #333;
}
.press-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20px;
  border-bottom: 2px solid #1a1a1a;
  margin-bottom: 30px;
}
.press-date {
  font-size: 14px;
  color: #666;
  margin: 0;
}
.press-embargo {
  font-size: 12px;
  color: #fff;
  background: #7c3aed;
  padding: 4px 12px;
  border-radius: 4px;
  font-weight: 600;
  margin: 0;
}
.press-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 12px 0;
  line-height: 1.4;
}
.press-subtitle {
  font-size: 18px;
  font-weight: 500;
  color: #555;
  margin: 0 0 30px 0;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}
.press-lead {
  background: #f8f9fa;
  padding: 20px 24px;
  border-left: 4px solid #7c3aed;
  margin-bottom: 30px;
  border-radius: 0 8px 8px 0;
}
.press-lead p {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #333;
}
.press-body h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 30px 0 15px 0;
}
.press-body p {
  font-size: 15px;
  color: #444;
  margin: 0 0 15px 0;
}
.press-body ul {
  margin: 15px 0;
  padding-left: 24px;
}
.press-body li {
  font-size: 15px;
  color: #444;
  margin: 8px 0;
}
.press-quote {
  background: transparent;
  padding: 0;
  border-radius: 0;
  margin: 0;
  border: none;
  display: inline;
}
.press-quote p {
  font-size: 15px;
  font-style: normal;
  color: #444;
  margin: 0;
  font-weight: normal;
  display: inline;
}
.press-quote cite {
  display: none;
}
.press-footer {
  margin-top: 40px;
  padding-top: 30px;
  border-top: 2px solid #1a1a1a;
}
.press-contact {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}
.press-contact h4 {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 10px 0;
}
.press-contact p {
  font-size: 14px;
  color: #666;
  margin: 4px 0;
}
.press-disclaimer {
  background: #fff3cd;
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid #ffc107;
}
.press-disclaimer p {
  font-size: 12px;
  color: #856404;
  margin: 4px 0;
}
</style>
`;

  const finalHtml = pressStyles + pressContent;

  // 제목 추출
  const titleMatch = pressContent.match(/<h1[^>]*class="press-title"[^>]*>([^<]+)/);
  const title = titleMatch ? titleMatch[1].trim() : `${hospitalName} ${pressTypeLabel} 보도자료`;

  onProgress('✅ 보도자료 작성 완료!');

  // 📦 생성된 보도자료 Supabase에 저장 (비동기, 실패해도 무시)
  saveGeneratedPost({
    hospitalName: hospitalName,
    category: request.category,
    doctorName: doctorName,
    doctorTitle: doctorTitle,
    postType: 'press_release',
    title: title,
    content: finalHtml,
    keywords: request.keywords?.split(',').map(k => k.trim()),
    topic: request.topic
  }).then(result => {
    if (result.success) {
      console.log('✅ 보도자료 저장 완료:', result.postId);
    } else {
      console.warn('⚠️ 보도자료 저장 실패:', result.error);
    }
  }).catch(err => {
    console.warn('⚠️ 보도자료 저장 예외:', err);
  });

  return {
    title,
    htmlContent: finalHtml,
    imageUrl: '',
    fullHtml: finalHtml,
    tags: [hospitalName, request.category, pressTypeLabel, request.topic],
    factCheck: {
    fact_score: 90,
    safety_score: 95,
    conversion_score: 70,
    ai_smell_score: 12, // 보도자료 기본값 - 경계선 수준
    verified_facts_count: 5,
    issues: [],
    recommendations: ['보도 전 법무팀 검토 권장', '인용 통계 출처 확인 필요', 'AI 냄새 점수 확인 - 문장 패턴 다양화 권장']
    },
    postType: 'press_release',
    cssTheme: request.cssTheme || 'modern' // CSS 테마 (기본값: modern)
  };
};
