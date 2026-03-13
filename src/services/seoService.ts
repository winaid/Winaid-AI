/**
 * seoService.ts - SEO/트렌딩 관련 서비스
 *
 * 키워드 추출, 트렌딩 토픽, SEO 제목 추천, SEO 점수 평가
 * geminiService.ts에서 분리된 모듈
 */
import { Type } from "@google/genai";
import { TrendingItem, SeoTitleItem, SeoScoreReport } from "../types";
import { GEMINI_MODEL, TIMEOUTS, callGemini } from "./geminiClient";

const getCurrentYear = () => new Date().getFullYear();

/**
 * 사용자 글에서 검색 키워드 자동 추출
 */
export const extractSearchKeywords = async (text: string): Promise<string> => {
  const result = await callGemini({
    prompt: `다음 블로그 글에서 이 글을 검색했을 때 찾을 수 있는 가장 효과적인 키워드를 추출해주세요.

<블로그 글>
${text}
</블로그 글>

다음 규칙을 따라주세요:
1. 글의 제목이나 핵심 문장에서 가장 특징적인 단어 추출
2. 병명, 증상, 치료법 등 구체적인 의학 용어 포함
3. 병원명, 클리닉명, 의사명이 있다면 반드시 포함
4. 2-4개의 핵심 키워드만 선택 (너무 많으면 검색 정확도 떨어짐)
5. 키워드는 공백으로 구분 (예: "갑상선암 수술 경험담")
6. 따옴표 없이 순수 키워드만 출력

⚠️ 중요: 이 글을 네이버 블로그에서 검색할 때 사용할 키워드를 생각하면서 추출하세요.

키워드만 출력하세요 (설명 없이):`,
    model: GEMINI_MODEL.FLASH,
    responseType: 'text',
    timeout: TIMEOUTS.QUICK_OPERATION
  });

  return result?.trim() || '';
};

// 네이버 뉴스 검색 API 호출 함수 (서버 프록시 사용 - CORS 해결)
const searchNaverNews = async (query: string, display: number = 10): Promise<{ title: string; description: string; pubDate: string; link: string }[]> => {
  try {
    console.log(`[네이버 뉴스] 검색 시작: ${query}`);

    // 서버 프록시를 통해 네이버 API 호출 (CORS 해결)
    const response = await fetch(`/api/naver-news?query=${encodeURIComponent(query)}&display=${display}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`네이버 API 오류: ${response.status}`);
    }

    const data = await response.json() as { items?: any[] };
    console.log(`[네이버 뉴스] ${data.items?.length || 0}개 결과 수신`);

    return (data.items || []).map((item: any) => ({
      title: item.title.replace(/<[^>]*>/g, ''), // HTML 태그 제거
      description: item.description.replace(/<[^>]*>/g, ''),
      pubDate: item.pubDate,
      link: item.link
    }));
  } catch (error) {
    console.error('[네이버 뉴스] 검색 실패:', error);
    throw error;
  }
};

// 뉴스 검색 전용 함수 - 네이버 우선, Gemini 폴백
// 허용 도메인: 연합뉴스, 중앙일보, 조선일보, 동아일보, 한겨레, 경향신문, KBS, MBC, SBS 등 신뢰할 수 있는 언론사
const searchNewsForTrends = async (category: string, _month: number): Promise<string> => {
  // 진료과별 뉴스 검색 키워드
  const categoryNewsKeywords: Record<string, string> = {
    '정형외과': '관절 통증 OR 허리디스크 OR 어깨 통증',
    '피부과': '피부 건조 OR 아토피 OR 습진',
    '내과': '독감 OR 감기 OR 당뇨 OR 고혈압',
    '치과': '치아 건강 OR 잇몸 질환',
    '안과': '안구건조 OR 눈 건강 OR 시력',
    '이비인후과': '비염 OR 코막힘 OR 목감기',
    '산부인과': '여성 건강 OR 갱년기',
    '비뇨의학과': '전립선 OR 방광염',
    '신변화': '두통 OR 어지럼증 OR 불면증',
    '정신건강의학과': '우울증 OR 스트레스 OR 번아웃',
    '마취통증의학과': '통증 치료 OR 만성통증 OR 신경차단'
  };

  const searchKeyword = categoryNewsKeywords[category] || '건강 의료';

  // 1차: 네이버 뉴스 검색 시도
  try {
    console.log(`[뉴스 트렌드] 네이버 뉴스 검색 시작: ${category} (${searchKeyword})`);

    const newsItems = await searchNaverNews(searchKeyword, 10);

    if (newsItems.length > 0) {
      // 뉴스 결과를 텍스트로 포맷팅
      const newsContext = newsItems.slice(0, 5).map((item, idx) => {
        return `${idx + 1}. ${item.title}\n   - ${item.description.substring(0, 100)}...`;
      }).join('\n\n');

      console.log(`[뉴스 트렌드] 네이버 뉴스 검색 완료: ${newsItems.length}개 기사`);

      // Gemini 3 Flash로 뉴스 분석하여 최적화된 인사이트 추출
      try {
        const analysisResult = await callGemini({
          prompt: `아래는 "${category}" 관련 네이버 뉴스 검색 결과입니다. 이를 분석하여 블로그 작성에 활용할 수 있는 최적의 인사이트를 추출해주세요.

[네이버 뉴스 검색 결과]
${newsContext}

[분석 요청]
1. 핵심 트렌드 (3가지): 현재 가장 주목받는 건강/의료 이슈
2. 블로그 키워드 추천 (5개): SEO에 효과적인 롱테일 키워드
3. 콘텐츠 각도 제안: 이 트렌드를 활용한 블로그 글감 아이디어 2가지
4. 주의사항: 의료법 위반 가능성이 있는 표현이나 주제

[출력 형식]
📌 핵심 트렌드
1. (트렌드1)
2. (트렌드2)
3. (트렌드3)

🔑 추천 키워드
- (키워드1), (키워드2), ...

💡 콘텐츠 아이디어
1. (아이디어1)
2. (아이디어2)

⚠️ 주의사항
- (주의할 점)`,
          model: GEMINI_MODEL.FLASH,
          responseType: 'text',
          temperature: 0.4,
          thinkingLevel: 'low',
          timeout: 30000
        }) || '';
        console.log(`[뉴스 트렌드] Gemini Flash 분석 완료`);

        return `[최신 뉴스 트렌드 - 네이버 뉴스 + Gemini 분석]\n\n${analysisResult}\n\n[원본 뉴스]\n${newsContext}`;

      } catch (analysisError) {
        console.warn('[뉴스 트렌드] Gemini 분석 실패, 원본 뉴스만 반환:', analysisError);
        return `[최신 뉴스 트렌드 - 네이버 뉴스 검색 결과]\n\n${newsContext}`;
      }
    }

    throw new Error('네이버 뉴스 결과 없음');

  } catch (naverError) {
    console.warn('[뉴스 트렌드] 네이버 검색 실패, Gemini로 폴백:', naverError);

    // 2차: Gemini 검색으로 폴백
    try {
      const ai = getAiClient();

      const response: any = await Promise.race([ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: `최근 한국 뉴스에서 "${searchKeyword}" 관련 기사를 검색하고,
가장 많이 다뤄지는 건강/의료 이슈 3가지를 요약해주세요.

연도 불일치 설명 없이 바로 이슈만 요약하세요.

[출력 형식]
각 이슈마다:
- 이슈: (한 줄 요약)
- 관련 키워드: (블로그 작성에 활용할 키워드)`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "text/plain",
          temperature: 0.3
        }
      }), new Promise((_, reject) => setTimeout(() => reject(new Error('뉴스 검색 타임아웃')), 30000))]);

      const newsContext = response.text || '';
      console.log(`[뉴스 트렌드] Gemini 검색 완료`);
      return newsContext;

    } catch (geminiError) {
      console.warn('[뉴스 트렌드] Gemini 검색도 실패:', geminiError);
      return '';
    }
  }
};

export const getTrendingTopics = async (category: string): Promise<TrendingItem[]> => {
  const ai = getAiClient();
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const year = koreaTime.getFullYear();
  const month = koreaTime.getMonth() + 1;
  const day = koreaTime.getDate();
  const hour = koreaTime.getHours();
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][koreaTime.getDay()];
  const dateStr = `${year}년 ${month}월 ${day}일 (${dayOfWeek}) ${hour}시`;

  // 랜덤 시드로 다양성 확보
  const randomSeed = Math.floor(Math.random() * 1000);

  // 계절별 특성
  const seasonalContext: Record<number, string> = {
    1: '신년 건강검진 시즌, 겨울철 독감/감기, 난방으로 인한 건조, 동상/저체온증',
    2: '설 연휴 후 피로, 환절기 시작, 미세먼지 증가, 꽃샘추위',
    3: '본격 환절기, 꽃가루 알레르기, 황사/미세먼지, 춘곤증',
    4: '봄철 야외활동 증가, 알레르기 비염 최고조, 자외선 증가',
    5: '초여름, 식중독 주의 시작, 냉방병 예고, 가정의달 건강검진',
    6: '장마철 습도, 무좀/피부질환, 식중독 급증, 냉방병',
    7: '폭염, 열사병/일사병, 냉방병 본격화, 여름휴가 전 건강관리',
    8: '극심한 폭염, 온열질환 피크, 휴가 후 피로, 수인성 질환',
    9: '환절기 시작, 가을 알레르기, 일교차 큰 시기, 추석 연휴',
    10: '환절기 감기, 건조해지는 날씨, 독감 예방접종 시즌, 건강검진 시즌',
    11: '본격 독감 시즌, 난방 시작, 건조한 피부, 연말 건강검진',
    12: '독감 절정기, 연말 피로, 동상/저체온증, 송년회 후 건강'
  };

  // 진료과별 세부 키워드 힌트
  const categoryHints: Record<string, string> = {
    '정형외과': '관절통, 허리디스크, 어깨통증, 무릎연골, 손목터널증후군, 오십견, 척추관협착증, 골다공증',
    '피부과': '여드름, 아토피, 건선, 탈모, 피부건조, 두드러기, 대상포진, 사마귀, 점제거',
    '내과': '당뇨, 고혈압, 갑상선, 위장질환, 간기능, 콜레스테롤, 빈혈, 건강검진',
    '치과': '충치, 잇몸질환, 임플란트, 치아미백, 교정, 사랑니, 구취, 치주염',
    '안과': '안구건조증, 노안, 백내장, 녹내장, 시력교정, 눈피로, 결막염, 다래끼',
    '이비인후과': '비염, 축농증, 어지럼증, 이명, 인후통, 편도염, 코막힘, 수면무호흡',
    '산부인과': '생리통, 자궁근종, 난소낭종, 갱년기, 임신준비, 질염, 유방검사',
    '비뇨의학과': '전립선, 방광염, 요로결석, 혈뇨, 빈뇨, 남성갱년기, 발기부전',
    '신변화': '두통, 어지럼증, 손발저림, 불면증, 치매예방, 뇌졸중예방, 편두통',
    '정신건강의학과': '우울증, 불안장애, 공황장애, 수면장애, 번아웃, 스트레스, ADHD'
  };

  const categoryKeywords = categoryHints[category] || '일반적인 건강 증상, 예방, 관리';
  const currentSeasonContext = seasonalContext[month] || '';

  // 뉴스 검색으로 현재 트렌드 파악 (키워드 추천 전용!)
  const newsContext = await searchNewsForTrends(category, month);

  // Gemini AI 기반 트렌드 분석 (구글 검색 + 뉴스 컨텍스트 기반)
  const response: any = await Promise.race([
    ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',  // FLASH로 빠른 응답
    contents: `[🕐 정확한 현재 시각: ${dateStr} 기준 (한국 표준시)]
[🎲 다양성 시드: ${randomSeed}]

당신은 네이버/구글 검색 트렌드 분석 전문가입니다.
'${category}' 진료과와 관련하여 **지금 이 시점**에 검색량이 급상승하거나 관심이 높은 건강/의료 주제 5가지를 추천해주세요.

[📅 ${month}월 시즌 특성]
${currentSeasonContext}

[🏥 ${category} 관련 키워드 풀]
${categoryKeywords}

${newsContext ? `[📰 최신 뉴스 트렌드 - 현재 이슈! 🔥]
${newsContext}

⚠️ 위 뉴스 트렌드를 반드시 반영하여 현재 상황에 맞는 주제를 추천하세요!
뉴스에서 언급된 이슈와 연관된 블로그 키워드를 제안해주세요.` : ''}

[⚠️ 중요 규칙]
1. **매번 다른 결과 필수**: 이전 응답과 다른 새로운 주제를 선정하세요 (시드: ${randomSeed})
2. **구체적인 주제**: "어깨통증" 대신 "겨울철 난방 후 어깨 뻣뻣함" 처럼 구체적으로
3. **현재 시점 반영**: ${month}월 ${day}일 기준 계절/시기 특성 반드시 반영
4. **롱테일 키워드**: 블로그 작성에 바로 쓸 수 있는 구체적인 키워드 조합 제시
5. **다양한 난이도**: 경쟁 높은 주제 2개 + 틈새 주제 3개 섞어서
${newsContext ? '6. **뉴스 트렌드 반영 필수**: 위 뉴스에서 언급된 이슈 중 1~2개는 반드시 포함!' : ''}

[📊 점수 산정]
- SEO 점수(0~100): 검색량 높고 + 블로그 경쟁도 낮을수록 고점수
- 점수 높은 순 정렬

[🎯 출력 형식]
- topic: 구체적인 주제명 (예: "겨울철 어깨 뻣뻣함 원인")
- keywords: 블로그 제목에 쓸 롱테일 키워드 (예: "겨울 어깨통증, 난방 어깨 뻣뻣, 아침 어깨 굳음")
- score: SEO 점수 (70~95 사이)
- seasonal_factor: 왜 지금 이 주제가 뜨는지 한 줄 설명 ${newsContext ? '(뉴스 기반이면 "📰 뉴스 트렌드" 표시)' : ''}`,
    config: {
      tools: [{ googleSearch: {} }], // 구글 검색 도구 활성화
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            keywords: { type: Type.STRING },
            score: { type: Type.NUMBER },
            seasonal_factor: { type: Type.STRING }
          },
          required: ["topic", "keywords", "score", "seasonal_factor"]
        }
      },
      temperature: 0.9 // 다양성을 위해 temperature 높임
    }
  }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('인기 키워드 조회 타임아웃 (60초)')), 60000)
    )
  ]);
  return JSON.parse(response.text || "[]");
};

export const recommendSeoTitles = async (topic: string, keywords: string, postType: 'blog' | 'card_news' = 'blog'): Promise<SeoTitleItem[]> => {
  const ai = getAiClient();

  // 현재 날짜/계절 정보 추가 (트렌드와 동일하게)
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const currentMonth = koreaTime.getMonth() + 1;
  const seasons = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];
  const currentSeason = seasons[currentMonth - 1];

  const lengthGuide = postType === 'card_news'
    ? '15~25자 이내 (카드뉴스 표지 최적화)'
    : '28~38자 이내 (모바일 최적화)';

  const prompt = postType === 'card_news'
    ? `[입력 정보]
주제: ${topic}
키워드: ${keywords}
글자수 기준: ${lengthGuide}
시즌: ${currentSeason}

────────────────────
[역할]

너는 인스타그램·카카오톡에서 공유되는 병원 카드뉴스의
표지 제목을 만드는 AI 카피라이터다.

너의 페르소나:
- 대형 치과/병원 SNS 마케팅 5년차 담당자
- 인스타그램 릴스·카드뉴스 평균 저장률 8% 이상 달성
- 환자가 "이거 나한테 해당되나?" 싶어서 멈추게 만드는 제목 전문가
- 의료광고법을 완벽히 숙지하고 있어 절대 위반하지 않음

카드뉴스 제목은
- 스크롤을 멈추게 하는 '훅(hook)'이 있어야 하고
- 짧고 임팩트 있으며
- 환자의 일상 언어로 작성해야 한다.

────────────────────
[1. 사고 기준]

- 출발점은 'SNS를 보다가 멈추는 환자의 시선'이다
- 결과물은 '카드뉴스 표지에 큰 글씨로 들어갈 한 줄'이다
- 호기심을 자극하되 과장하지 않는다
- 15~25자 이내로 짧고 강렬하게

즉,
▶ 말투는 친근한 반말 또는 짧은 존댓말
▶ 구조는 SNS 카드뉴스 표지 헤드라인

────────────────────
[2. 표현 톤 규칙]

- 반말 또는 짧은 존댓말 혼용 가능 (예: "~인 사람?", "~해보세요")
- 일상적이고 가벼운 톤
- 숫자를 적극 활용 (예: "3가지", "5분 만에")
- 이모지는 사용하지 않음 (디자인에서 별도 처리)
- 한 줄로 끝나야 함 (부제 없음)

────────────────────
[3. 절대 금지 표현]

- 전문가, 전문의, 전문적인
- 의료인, 의사, 한의사
- 진료, 치료, 처방, 상담
- 효과, 개선, 해결
- 정상, 비정상, 위험
- 병명 확정 표현
- "지금 바로", "꼭 봐야 할" 같은 낚시성 표현
- 병원 방문을 직접적으로 유도하는 표현

────────────────────
[4. 제목 구조 가이드]

카드뉴스 표지 제목 패턴:

▶ 훅(Hook) 패턴
- [숫자] + 핵심 내용 (예: "임플란트 전 꼭 알아야 할 3가지")
- [타겟] + 공감 질문 (예: "잇몸에서 피 나는 사람?")
- [상황] + 결과 궁금증 (예: "양치할 때 피가 나는 이유")
- [비교/선택] + 궁금증 (예: "레진 vs 세라믹, 뭐가 다를까")
- [오해 깨기] (예: "스케일링 자주 하면 이가 약해진다?")

▶ 키워드 배치 규칙 (필수)
- SEO 키워드(입력된 키워드)는 반드시 제목의 맨 앞에 위치해야 한다
- 예: 키워드가 "임플란트"이면 → "임플란트 전 꼭 알아야 할 3가지"
- 예: 키워드가 "잇몸출혈"이면 → "잇몸출혈, 이런 사람 주목!"
- 키워드를 자연스럽게 녹이되, 반드시 제목 시작 부분에 배치

▶ 구조 예시
① [키워드] + [숫자] + ~할 때 알아둘 점
② [키워드] + [타겟 상황] + ~인 사람?
③ [키워드] + [일상 궁금증] + ~일까?
④ [키워드 A vs B] + 차이점
⑤ [키워드] + [흔한 오해] + ~라고요?

※ 제목은 15~25자 이내
※ 한 가지 메시지만 담을 것
※ 스크롤 멈춤 효과(thumb-stopping)를 최우선으로

────────────────────
[5. SNS 적합성 규칙]

- 인스타그램 피드에서 자연스러운 수준
- 너무 블로그스럽거나 기사체면 ❌
- 너무 자극적이거나 낚시성이면 ❌
- '병원 공식 계정에 올려도 괜찮은 친근한 톤'이 기준

────────────────────
[6. 의료광고 안전 장치]

- 판단, 결론, 예측 금지
- 원인 암시 최소화
- 상태 + 질문까지만 허용
- 중립적 표현 유지

────────────────────
[7. 출력 조건]

- 제목만 출력
- 설명, 부제, 해설 금지
- 5개 생성

────────────────────
[PART 2. 점수 평가]

각 제목에 대해 아래 기준으로
0~100점 사이의 점수를 계산한다.

▶ 점수 = A + B + C + D + E

[A] 멈춤 효과 (0~25점)
- 스크롤하다 멈출 만큼 호기심을 자극하는가
- "이거 나 얘기인데?" 싶은 공감 요소가 있는가

[B] 간결성 (0~25점)
- 15~25자 이내인가
- 한눈에 읽히는가, 표지 디자인에 적합한가

[C] 키워드 포함 (0~20점)
- 핵심 키워드가 자연스럽게 포함되어 있는가
- 검색 가능한 표현인가

[D] 의료광고 안전성 (0~20점)
- 단정, 예측, 결과 암시가 없는가
- 과장·낚시가 없는가

[E] SNS 채널 적합도 (0~10점)
- 병원 공식 SNS에 올려도 자연스러운가
- 타겟 환자가 공유하고 싶어할 만한가

────────────────────
[PART 3. 출력 형식]

JSON 배열로 출력한다. 각 항목은 다음 구조를 따른다:
{
  "title": "생성된 제목",
  "score": 총점(숫자),
  "type": "증상질환형" | "변화원인형" | "확인형" | "정상범위형"
}`
    : `[입력 정보]
주제: ${topic}
키워드: ${keywords}
글자수 기준: ${lengthGuide}
시즌: ${currentSeason}

────────────────────
[역할]

너는 네이버에서 실제 몸이 불편한 사람이 검색할 법한 문장을
병원 블로그에 올릴 수 있을 정도로
차분하고 정돈된 제목으로 다듬는 AI다.

이 제목은
광고도 아니고,
날것의 검색어도 아닌,
'검색자 언어를 한 번 정리한 질문형 문장'이어야 한다.

────────────────────
[1. 사고 기준]

- 출발점은 '아픈 사람의 검색 문장'이다
- 결과물은 '병원 블로그 제목'이다
- 너무 캐주얼하지도, 너무 전문적이지도 않게 조율한다

즉,
▶ 말투는 일반인
▶ 구조는 정리된 글 제목

────────────────────
[2. 표현 톤 규칙]

- 존댓말 사용
- 감정 표현은 최소화
- 불안은 암시만 하고 강조하지 않는다
- "걱정됨", "무서움" 같은 직접 감정어는 쓰지 않는다
- 물어보는 형식은 유지하되 과하지 않게 정리한다

────────────────────
[3. 절대 금지 표현]

다음 단어 및 의미 유사 표현은
제목에서 절대 사용하지 않는다.

- 전문가, 전문의, 전문적인
- 의료인, 의사, 한의사
- 진료, 치료, 처방, 상담
- 효과, 개선, 해결
- 정상, 비정상, 위험
- 병명 확정 표현
- 병원 방문을 연상시키는 표현

────────────────────
[4. 제목 구조 가이드]
(AEO + SEO + 의료광고 안전)

제목은 아래 끝맺음 중 하나로 마무리한다.

▶ 끝맺음 패턴 (필수)
- ~볼 점
- ~이유
- ~한다면
- ~일 때
- ~있을까요

▶ 키워드 배치 규칙 (필수)
- SEO 키워드(입력된 키워드)는 반드시 제목의 맨 앞에 위치해야 한다
- 예: 키워드가 "강남역 임플란트"이면 → "강남역 임플란트, ~할 때 살펴볼 점"
- 예: 키워드가 "잇몸출혈"이면 → "잇몸출혈이 반복된다면 확인할 부분"
- 키워드를 자연스럽게 문장에 녹이되, 반드시 제목 시작 부분에 배치

▶ 구조 예시
① [증상/상황] + ~할 때 살펴볼 점
② [증상/상황] + ~는 이유
③ [증상/상황] + ~한다면
④ [증상/상황] + ~일 때 확인할 부분

※ '왜냐하면', '~때문에' 같은 원인 단정 연결 금지
※ 질문은 하나만 남길 것
※ 제목이 자연스럽게 끊기도록 작성

────────────────────
[5. 네이버 적합성 조율 규칙]

- 검색어 느낌은 유지하되
  문장은 한 번 다듬는다
- 너무 구어체면 ❌
- 너무 보고서 같아도 ❌
- '블로그 제목으로 자연스러운 수준'이 기준

────────────────────
[6. GEO · 의료광고 안전 장치]

- 판단, 결론, 예측 금지
- 원인 암시 최소화
- 상태 + 질문까지만 허용
- 중립적 표현 유지

────────────────────
[7. 출력 조건]

- 제목만 출력
- 설명, 부제, 해설 금지
- 5개 생성

────────────────────
[PART 2. SEO 점수 평가]

각 제목에 대해 아래 기준으로
0~100점 사이의 SEO 점수를 계산한다.

▶ SEO 점수 = A + B + C + D + E

[A] 검색자 자연도 (0~25점)
- 실제 사람이 검색창에 입력할 법한 문장인가
- 과도하게 정제되거나 마케팅 문장처럼 느껴지지 않는가

[B] 질문 적합도 (AEO) (0~25점)
- '~일 때', '~할 때', '~인 경우' 등 질문 구조가 있는가
- 하나의 질문만 명확하게 담고 있는가

[C] 키워드 구조 안정성 (SEO) (0~20점)
- 핵심 키워드가 자연스럽게 포함되어 있는가
- 나열형 키워드가 아닌 문장형 구조인가

[D] 의료광고·AI 요약 안전성 (GEO) (0~20점)
- 단정, 예측, 결과 암시가 없는가
- 불안·위험을 과장하지 않는가

[E] 병원 블로그 적합도 (CCO) (0~10점)
- 너무 개인 일기 같지 않은가
- 병원 채널에 올려도 이질감이 없는가

────────────────────
[PART 3. 출력 형식]

JSON 배열로 출력한다. 각 항목은 다음 구조를 따른다:
{
  "title": "생성된 제목",
  "score": 총점(숫자),
  "type": "증상질환형" | "변화원인형" | "확인형" | "정상범위형"
}`;

  const response: any = await Promise.race([ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            score: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ['증상질환형', '변화원인형', '확인형', '정상범위형'] }
          },
          required: ["title", "score", "type"]
        }
      }
    }
  }), new Promise((_, reject) => setTimeout(() => reject(new Error('SEO 제목 추천 타임아웃')), 60000))]);
  return JSON.parse(response.text || "[]");
};

/**
 * 추천된 제목들 중 가장 적합한 제목 선택 (순위 매기기)
 */
export const rankSeoTitles = async (
  titles: SeoTitleItem[],
  topic: string,
  keywords: string,
  postContent?: string
): Promise<SeoTitleItem[]> => {
  const ai = getAiClient();

  // 현재 날짜 정보
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const currentMonth = koreaTime.getMonth() + 1;
  const seasons = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];
  const currentSeason = seasons[currentMonth - 1];

  const titlesJson = JSON.stringify(titles.map((t, idx) => ({
    index: idx + 1,
    title: t.title,
    originalScore: t.score,
    type: t.type
  })), null, 2);

  const prompt = `[입력 정보]
제목 목록:
${titlesJson}

주제: ${topic}
키워드: ${keywords}
시즌: ${currentSeason}

────────────────────
[역할]

너는 병원 블로그 제목의 품질을 평가하는 AI다.
각 제목을 아래 기준에 따라 점수를 매기고 순위를 정한다.

────────────────────
[평가 기준]

1. 의료광고법 안전성 (legalSafety: 0~25)
   - 금지 표현 사용 여부: 전문가, 전문의, 치료, 진료, 효과, 개선, 해결
   - 병명 확정, 결과 암시, 예측 표현 여부
   - 불안 조장 표현 여부

2. 자연스러움 (naturalness: 0~25)
   - 실제 검색어처럼 느껴지는가
   - 마케팅 문구처럼 과장되지 않았는가
   - 존댓말, 적절한 톤 유지

3. 키워드 적합도 (relevance: 0~25)
   - 주제와 키워드가 자연스럽게 포함되었는가
   - 문장형 구조인가 (나열형 X)

4. 클릭 유도력 (ctr: 0~25)
   - 궁금증을 유발하는가
   - 질문형 구조가 적절한가
   - 블로그 제목으로 적합한가

────────────────────
[점수 계산]

finalScore = legalSafety + naturalness + relevance + ctr

────────────────────
[출력 규칙]

- 모든 제목을 평가
- finalScore 기준 내림차순 정렬
- rank는 1부터 시작
- reason: 한 줄로 평가 이유 요약
- recommendation: "추천" | "보통" | "비추천"`;

  const response: any = await Promise.race([ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            finalScore: { type: Type.NUMBER },
            rank: { type: Type.NUMBER },
            legalSafety: { type: Type.NUMBER },
            naturalness: { type: Type.NUMBER },
            relevance: { type: Type.NUMBER },
            ctr: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            recommendation: { type: Type.STRING }
          },
          required: ["title", "finalScore", "rank", "legalSafety", "naturalness", "relevance", "ctr", "reason"]
        }
      }
    }
  }), new Promise((_, reject) => setTimeout(() => reject(new Error('SEO 제목 랭킹 타임아웃')), 60000))]);

  const rankedTitles = JSON.parse(response.text || "[]");

  // 원래 type 정보 병합
  return rankedTitles.map((ranked: any) => {
    const original = titles.find(t => t.title === ranked.title);
    return {
      ...ranked,
      type: original?.type || '정보제공',
      score: ranked.finalScore // score 필드를 finalScore로 업데이트
    };
  });
};

/**
 * SEO 점수 평가 (100점 만점 체계)
 *
 * ① 제목 최적화 (25점)
 * ② 본문 키워드 구조 (25점)
 * ③ 사용자 체류 구조 (20점)
 * ④ 의료법 안전성 + 신뢰 신호 (20점)
 * ⑤ 전환 연결성 (10점)
 *
 * 85점 미만: 재설계/재작성 권장
 */
export const evaluateSeoScore = async (
  htmlContent: string,
  title: string,
  topic: string,
  keywords: string
): Promise<SeoScoreReport> => {
  const ai = getAiClient();
  const currentYear = getCurrentYear();

  // 방어 코드: 필수 파라미터 검증
  if (!htmlContent || typeof htmlContent !== 'string') {
    console.error('❌ evaluateSeoScore: content(HTML)가 없거나 유효하지 않습니다');
    console.error('   - 전달된 타입:', typeof htmlContent);
    console.error('   - 전달된 값 길이:', htmlContent?.length || 0);
    console.error('   - 전달된 값 미리보기:', String(htmlContent).substring(0, 100));
    console.error('   - title:', title?.substring(0, 50));
    console.error('   - topic:', topic?.substring(0, 50));
    throw new Error('SEO 평가에 필요한 HTML 콘텐츠가 없습니다. content 또는 contentHtml 필드를 확인하세요.');
  }

  const safeHtmlContent = htmlContent || '';
  const safeTitle = title || '제목 없음';
  const safeTopic = topic || '주제 없음';
  const safeKeywords = keywords || '키워드 없음';

  const prompt = `당신은 네이버 블로그 SEO 전문가이자 병원 마케팅 콘텐츠 분석가입니다.

아래 블로그 콘텐츠의 SEO 점수를 100점 만점으로 평가해주세요.

[중요]
📊 SEO 점수 평가 기준 (100점 만점)
[중요]

[※ 평가 대상 콘텐츠]
- 제목: "${safeTitle}"
- 주제: "${safeTopic}"
- 핵심 키워드: "${safeKeywords}"
- 본문:
${safeHtmlContent.substring(0, 8000)}

---
① 제목 최적화 (25점 만점)
---
※ keyword_natural (10점): 핵심 키워드 자연 포함
   - 10점: 키워드가 제목 앞 50%에 자연스럽게 배치
   - 5점: 키워드 있으나 어색하거나 뒤쪽에 위치
   - 0점: 키워드 없음 또는 강제 삽입 느낌

※ seasonality (5점): 시기성/상황성 포함
   - 5점: "겨울철", "요즘", "환절기" 등 시기 표현 포함
   - 2점: 시간적 맥락 암시만 있음
   - 0점: 시기성 없는 일반적인 제목

※ judgment_inducing (5점): 판단 유도형 구조
   - 5점: "~일까요?", "~확인 포인트" 등 독자 참여 유도
   - 2점: 질문형이지만 일반적
   - 0점: 단순 정보 나열형

※ medical_law_safe (5점): 의료광고 리스크 없음
   - 5점: 완전 안전 (치료, 완치, 최고 등 금지어 없음)
   - 2점: 경미한 리스크 (애매한 표현 포함)
   - 0점: 명백한 의료광고법 위반 표현

---
② 본문 키워드 구조 (25점 만점)
---
※ main_keyword_exposure (10점): 메인 키워드 3~5회 자연 노출
   - 10점: 1000자당 15~25회 수준 (1.5~2.5% 밀도), 자연스러움
   - 5점: 키워드 있으나 빈도 부족 또는 과다
   - 0점: 키워드 스터핑 또는 전혀 없음

※ related_keyword_spread (5점): 연관 키워드(LSI) 분산 배치
   - 5점: 동의어/유사어 3개 이상 자연스럽게 분산
   - 2점: 1~2개만 있거나 편중됨
   - 0점: 연관 키워드 전무

※ subheading_variation (5점): 소제목에 키워드 변주 포함
   - 5점: 모든 소제목(H3)에 키워드 또는 관련어 포함
   - 2점: 일부 소제목에만 포함
   - 0점: 소제목에 키워드 없음

※ no_meaningless_repeat (5점): 의미 없는 반복 없음
   - 5점: 동일 표현이 맥락 다양하게 사용됨
   - 2점: 일부 기계적 반복 존재
   - 0점: 같은 문장/표현 과다 반복

---
③ 사용자 체류 구조 (20점 만점)
---
※ intro_problem_recognition (5점): 도입부 5줄 이내 문제 인식
   - 5점: 첫 3줄 내 공감/질문으로 시작, 문제 제기 명확
   - 2점: 도입부가 있으나 늘어짐
   - 0점: "오늘은 ~에 대해 알아보겠습니다" 등 AI 도입부

※ relatable_examples (5점): '나 얘기 같다' 생활 예시
   - 5점: 구체적 상황/시간대/장소 묘사 3개 이상
   - 2점: 1~2개 있으나 일반적
   - 0점: 생활 예시 전무, 설명만

※ mid_engagement_points (5점): 중간 이탈 방지 포인트
   - 5점: 체크리스트, 질문형 소제목, "더 알아보면" 등 존재
   - 2점: 약간의 참여 유도
   - 0점: 단조로운 나열만

※ no_info_overload (5점): 정보 과부하 없음
   - 5점: 1,500~3,000자, 핵심 정보 밀도 높음
   - 2점: 너무 길거나 산만함
   - 0점: 정보 과다로 이탈 유발

---
④ 의료법 안전성 + 신뢰 신호 (20점 만점)
---
※ no_definitive_guarantee (5점): 단정·보장 표현 없음
   - 5점: "~일 수 있습니다", "~경우도 있습니다" 등 완화 표현
   - 2점: 일부 단정 표현 존재
   - 0점: "반드시", "확실히", "100%" 등 보장 표현

※ individual_difference (5점): 개인차/상황별 차이 자연 언급
   - 5점: 개인차 언급 2회 이상, 자연스러움
   - 2점: 1회 형식적 언급
   - 0점: 개인차 언급 없음

※ self_diagnosis_limit (5점): 자가진단 한계 명확화
   - 5점: "증상만으로 단정 불가" 등 한계 명확
   - 2점: 암시만 있음
   - 0점: 자가진단 유도하는 느낌

※ minimal_direct_promo (5점): 병원 직접 홍보 최소화
   - 5점: 병원명/연락처 없음, 일반적 안내만
   - 2점: 간접적 홍보 느낌
   - 0점: 직접적 병원 홍보

---
⑤ 전환 연결성 (10점 만점)
---
※ cta_flow_natural (5점): CTA가 정보 흐름을 끊지 않음
   - 5점: 글 맥락에서 자연스럽게 확인 필요성 도출
   - 2점: CTA 있으나 갑작스러움
   - 0점: "방문하세요", "예약하세요" 직접 권유

※ time_fixed_sentence (5점): 시점 고정형 문장 존재
   - 5점: "이 시점부터는~", "반복된다면~" 등 시점 고정
   - 2점: 약한 시점 암시
   - 0점: "언젠가", "나중에" 등 미루기 허용

[중요]
⚠️ 평가 시 주의사항
[중요]

1. SEO 점수는 "완성도"가 아니라 "비교 지표"로 활용됩니다
2. 85점 미만은 재설계/재작성이 필요한 수준입니다
3. 각 항목별로 구체적인 개선 피드백을 반드시 작성하세요
4. 의료법 안전성은 다른 항목보다 엄격하게 평가하세요
5. 현재 시점(${currentYear}년) 기준 네이버 SEO 트렌드 반영

각 항목의 feedback에는:
- 잘된 점 1개 이상
- 개선이 필요한 점 1개 이상
- 구체적인 개선 방법 제안

🎯 **improvement_suggestions 필수 작성!**
85점 이상 달성을 위한 구체적이고 실행 가능한 개선 제안 3~5개를 배열로 제공해주세요.
예시:
- "제목 앞부분에 '겨울철' 시기 키워드 추가"
- "첫 문단에 구체적인 상황 묘사 추가 (예: '아침에 일어났는데...')"
- "소제목 3개에 메인 키워드 '감기' 포함시키기"

JSON 형식으로 응답해주세요.`;

  try {
    const response: any = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',  // FLASH로 빠른 평가
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              total: { type: Type.INTEGER },
              title: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                keyword_natural: { type: Type.INTEGER },
                seasonality: { type: Type.INTEGER },
                judgment_inducing: { type: Type.INTEGER },
                medical_law_safe: { type: Type.INTEGER },
                feedback: { type: Type.STRING }
              },
              required: ["score", "keyword_natural", "seasonality", "judgment_inducing", "medical_law_safe", "feedback"]
            },
            keyword_structure: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                main_keyword_exposure: { type: Type.INTEGER },
                related_keyword_spread: { type: Type.INTEGER },
                subheading_variation: { type: Type.INTEGER },
                no_meaningless_repeat: { type: Type.INTEGER },
                feedback: { type: Type.STRING }
              },
              required: ["score", "main_keyword_exposure", "related_keyword_spread", "subheading_variation", "no_meaningless_repeat", "feedback"]
            },
            user_retention: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                intro_problem_recognition: { type: Type.INTEGER },
                relatable_examples: { type: Type.INTEGER },
                mid_engagement_points: { type: Type.INTEGER },
                no_info_overload: { type: Type.INTEGER },
                feedback: { type: Type.STRING }
              },
              required: ["score", "intro_problem_recognition", "relatable_examples", "mid_engagement_points", "no_info_overload", "feedback"]
            },
            medical_safety: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                no_definitive_guarantee: { type: Type.INTEGER },
                individual_difference: { type: Type.INTEGER },
                self_diagnosis_limit: { type: Type.INTEGER },
                minimal_direct_promo: { type: Type.INTEGER },
                feedback: { type: Type.STRING }
              },
              required: ["score", "no_definitive_guarantee", "individual_difference", "self_diagnosis_limit", "minimal_direct_promo", "feedback"]
            },
            conversion: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                cta_flow_natural: { type: Type.INTEGER },
                time_fixed_sentence: { type: Type.INTEGER },
                feedback: { type: Type.STRING }
              },
              required: ["score", "cta_flow_natural", "time_fixed_sentence", "feedback"]
            },
            improvement_suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "85점 이상 달성을 위한 구체적인 개선 제안 3~5개"
            }
          },
          required: ["total", "title", "keyword_structure", "user_retention", "medical_safety", "conversion", "improvement_suggestions"]
        }
      }
    }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SEO 평가 타임아웃 (60초)')), 60000)
      )
    ]);

    const result = JSON.parse(response.text || "{}");

    // 총점 검증 및 재계산
    const calculatedTotal =
      (result.title?.score || 0) +
      (result.keyword_structure?.score || 0) +
      (result.user_retention?.score || 0) +
      (result.medical_safety?.score || 0) +
      (result.conversion?.score || 0);

    result.total = calculatedTotal;

    console.log('📊 SEO 점수 평가 완료:', result.total, '점');
    return result;
  } catch (error) {
    console.error('SEO 점수 평가 실패:', error);
    // 실패 시 기본값 반환
    return {
      total: 0,
      title: {
        score: 0,
        keyword_natural: 0,
        seasonality: 0,
        judgment_inducing: 0,
        medical_law_safe: 0,
        feedback: 'SEO 평가 중 오류가 발생했습니다.'
      },
      keyword_structure: {
        score: 0,
        main_keyword_exposure: 0,
        related_keyword_spread: 0,
        subheading_variation: 0,
        no_meaningless_repeat: 0,
        feedback: 'SEO 평가 중 오류가 발생했습니다.'
      },
      user_retention: {
        score: 0,
        intro_problem_recognition: 0,
        relatable_examples: 0,
        mid_engagement_points: 0,
        no_info_overload: 0,
        feedback: 'SEO 평가 중 오류가 발생했습니다.'
      },
      medical_safety: {
        score: 0,
        no_definitive_guarantee: 0,
        individual_difference: 0,
        self_diagnosis_limit: 0,
        minimal_direct_promo: 0,
        feedback: 'SEO 평가 중 오류가 발생했습니다.'
      },
      conversion: {
        score: 0,
        cta_flow_natural: 0,
        time_fixed_sentence: 0,
        feedback: 'SEO 평가 중 오류가 발생했습니다.'
      }
    };
  }
};
