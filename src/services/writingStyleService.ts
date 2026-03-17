import { Type } from "@google/genai";
import { LearnedWritingStyle, CrawledPost, CrawledPostScore } from "../types";
import { supabase } from "../lib/supabase";
import { callGemini, callGeminiRaw, GEMINI_MODEL, TIMEOUTS } from "./geminiClient";

// ============================================================
// Gemini 응답에서 프로필 데이터 안전 추출 (3단계 fallback)
// ============================================================

/** HTML 엔티티 디코딩 (&#39; → ', &amp; → & 등) */
const decodeHtmlEntities = (text: string): string => {
  if (!text || !text.includes('&')) return text;
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&#x2F;': '/',
    '&nbsp;': ' ', '&#160;': ' ',
  };
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  // 숫자형 엔티티 (&#NNN;)
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  // 16진수 엔티티 (&#xHH;)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
};

/** 코드펜스(```json ... ```) 제거 */
const stripCodeFence = (text: string): string => {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
};

/** 프로필 필수 필드 목록 */
const PROFILE_REQUIRED_FIELDS = [
  'tone', 'sentenceEndings', 'vocabulary', 'structure',
  'emotionLevel', 'formalityLevel', 'description', 'stylePrompt',
] as const;

/** 심층 분석 선택 필드 */
const DEEP_ANALYSIS_FIELDS = [
  'speakerIdentity', 'readerDistance', 'sentenceRhythm', 'paragraphFlow',
  'persuasionStyle', 'uniqueExpressions', 'bannedGenericStyle',
  'oneLineSummary', 'goodExamples', 'badExamples',
] as const;

/**
 * callGemini 반환값에서 프로필 객체 추출 — 3단계 fallback
 *
 * callGemini({responseType:'json'})의 반환 형태:
 *   1) JSON.parse 성공 → 이미 파싱된 객체 (예: {tone:"...", ...})
 *   2) JSON.parse 실패 → {text: "raw string"}
 *   3) 프록시 미사용(callGeminiRaw) → {candidates:[{content:{parts:[{text:"..."}]}}]}
 */
const extractProfileFromGeminiResponse = (response: any): {
  tone: string;
  sentenceEndings: string[];
  vocabulary: string[];
  structure: string;
  emotionLevel: string;
  formalityLevel: string;
  description: string;
  stylePrompt: string;
  // 심층 분석 필드
  speakerIdentity: string;
  readerDistance: string;
  sentenceRhythm: string;
  paragraphFlow: string;
  persuasionStyle: string;
  uniqueExpressions: string[];
  bannedGenericStyle: string[];
  oneLineSummary: string;
  goodExamples: string[];
  badExamples: string[];
} => {
  console.log('[StyleProfile] 1/4 응답 타입:', typeof response, response ? Object.keys(response).slice(0, 8).join(',') : 'null');

  let parsed: any = null;

  // ── 1단계: 이미 파싱된 객체인지 확인 (callGemini responseType=json 정상 경로) ──
  if (response && typeof response === 'object' && !Array.isArray(response) && response.tone !== undefined) {
    parsed = response;
    console.log('[StyleProfile] 2/4 [경로A] 이미 파싱된 객체 사용');
  }

  // ── 2단계: {text: "..."} 형태 (JSON 파싱 실패 폴백 또는 다른 구조) ──
  if (!parsed && typeof response?.text === 'string' && response.text.trim().length > 0) {
    const cleanText = stripCodeFence(response.text);
    try {
      parsed = JSON.parse(cleanText);
      console.log('[StyleProfile] 2/4 [경로B] response.text에서 JSON 파싱 성공');
    } catch {
      console.warn('[StyleProfile] 2/4 [경로B] response.text JSON 파싱 실패, 앞 200자:', cleanText.substring(0, 200));
    }
  }

  // ── 3단계: raw API 응답 구조 (candidates[0].content.parts) ──
  if (!parsed) {
    const rawText = response?.candidates?.[0]?.content?.parts?.find(
      (part: any) => typeof part?.text === 'string'
    )?.text;
    if (rawText && rawText.trim().length > 0) {
      const cleanText = stripCodeFence(rawText);
      try {
        parsed = JSON.parse(cleanText);
        console.log('[StyleProfile] 2/4 [경로C] candidates.parts에서 JSON 파싱 성공');
      } catch {
        console.warn('[StyleProfile] 2/4 [경로C] candidates.parts JSON 파싱 실패, 앞 200자:', cleanText.substring(0, 200));
      }
    }
  }

  // ── 모든 경로 실패 ──
  if (!parsed) {
    // 디버깅용: 응답 샘플 로깅 (민감정보 마스킹)
    const debugSample = JSON.stringify(response)?.substring(0, 300) || 'null';
    console.error('[StyleProfile] 모든 파싱 경로 실패. 응답 샘플:', debugSample);
    throw new Error('말투 분석 응답을 파싱할 수 없습니다. 응답 형식이 예상과 다릅니다.');
  }

  // ── 대체 키 탐색 (snake_case / 공백 키 대응) ──
  const getField = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  };

  console.log('[StyleProfile] 3/4 파싱 키:', Object.keys(parsed).join(', '));

  // 필수 필드 검증
  const missing = PROFILE_REQUIRED_FIELDS.filter(f => {
    // camelCase 외에 snake_case도 체크
    const snakeKey = f.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    return parsed[f] === undefined && parsed[snakeKey] === undefined;
  });
  if (missing.length > 0) {
    console.warn('[StyleProfile] 3/4 누락 필드:', missing.join(', '), '(기본값으로 채움)');
  } else {
    console.log('[StyleProfile] 3/4 필수 필드 검증 성공');
  }

  const profile = {
    tone: getField(parsed, 'tone') ?? '',
    sentenceEndings: Array.isArray(getField(parsed, 'sentenceEndings', 'sentence_endings')) ? getField(parsed, 'sentenceEndings', 'sentence_endings') : [],
    vocabulary: Array.isArray(getField(parsed, 'vocabulary')) ? parsed.vocabulary : [],
    structure: getField(parsed, 'structure') ?? '',
    emotionLevel: getField(parsed, 'emotionLevel', 'emotion_level') ?? 'medium',
    formalityLevel: getField(parsed, 'formalityLevel', 'formality_level') ?? 'neutral',
    description: getField(parsed, 'description') ?? '',
    stylePrompt: getField(parsed, 'stylePrompt', 'style_prompt') ?? '',
    // ── 심층 분석 필드 (선택) ──
    speakerIdentity: getField(parsed, 'speakerIdentity', 'speaker_identity') ?? '',
    readerDistance: getField(parsed, 'readerDistance', 'reader_distance') ?? '',
    sentenceRhythm: getField(parsed, 'sentenceRhythm', 'sentence_rhythm') ?? '',
    paragraphFlow: getField(parsed, 'paragraphFlow', 'paragraph_flow') ?? '',
    persuasionStyle: getField(parsed, 'persuasionStyle', 'persuasion_style') ?? '',
    uniqueExpressions: Array.isArray(getField(parsed, 'uniqueExpressions', 'unique_expressions')) ? getField(parsed, 'uniqueExpressions', 'unique_expressions') : [],
    bannedGenericStyle: Array.isArray(getField(parsed, 'bannedGenericStyle', 'banned_generic_style')) ? getField(parsed, 'bannedGenericStyle', 'banned_generic_style') : [],
    oneLineSummary: getField(parsed, 'oneLineSummary', 'one_line_summary') ?? '',
    goodExamples: Array.isArray(getField(parsed, 'goodExamples', 'good_examples')) ? getField(parsed, 'goodExamples', 'good_examples') : [],
    badExamples: Array.isArray(getField(parsed, 'badExamples', 'bad_examples')) ? getField(parsed, 'badExamples', 'bad_examples') : [],
  };

  // 최소 유효성: tone + description이 없으면 분석 실패로 간주
  if (!profile.tone && !profile.description) {
    console.error('[StyleProfile] tone과 description 모두 비어있음. parsed 키:', Object.keys(parsed).join(','));
    throw new Error('프로필 분석 결과가 비어있습니다. 텍스트를 더 길게 입력해주세요.');
  }

  console.log('[StyleProfile] 4/4 프로필 추출 완료:', profile.tone, '/', profile.description?.substring(0, 30));
  return profile;
};

/**
 * 이미지에서 텍스트 추출 (OCR)
 */
export const extractTextFromImage = async (base64Image: string): Promise<string> => {
  try {
    const mimeType = base64Image.includes('png') ? 'image/png' : 'image/jpeg';
    const data = base64Image.split(',')[1];
    const prompt = `이 이미지에서 모든 텍스트를 추출해주세요.

[요구사항]
1. 이미지에 보이는 모든 한국어/영어 텍스트를 그대로 추출
2. 줄바꿈과 단락 구분 유지
3. 블로그 글, 카드뉴스, 게시물 등의 텍스트 추출
4. 메뉴, 버튼, UI 요소 텍스트는 제외하고 본문 내용만 추출
5. 텍스트만 출력하세요. 설명이나 부가 내용 없이!

추출된 텍스트:`;

    const result = await callGeminiRaw(GEMINI_MODEL.PRO, {
      contents: [{role: 'user', parts: [{inlineData: {mimeType, data}}, {text: prompt}]}],
      generationConfig: {responseMimeType: "text/plain"}
    }, TIMEOUTS.GENERATION);

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || '').join('');
    return text.trim();
  } catch (error) {
    console.error('OCR 실패:', error);
    throw new Error('이미지에서 텍스트를 추출할 수 없습니다.');
  }
};

/**
 * 문서에서 텍스트 추출 (Word, PDF, TXT)
 */
export const extractTextFromDocument = async (file: File): Promise<string> => {
  const fileName = file.name.toLowerCase();
  
  // TXT 파일
  if (fileName.endsWith('.txt')) {
    return await file.text();
  }
  
  // PDF/Word 파일은 Gemini로 처리
  try {
    // 파일을 base64로 변환
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const mimeType = fileName.endsWith('.pdf')
      ? 'application/pdf'
      : fileName.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword';

    const prompt = `이 문서에서 모든 텍스트를 추출해주세요.

[요구사항]
1. 문서에 있는 모든 한국어/영어 텍스트를 그대로 추출
2. 줄바꿈과 단락 구분 유지
3. 헤더, 푸터, 페이지 번호 등은 제외
4. 본문 내용만 추출
5. 텍스트만 출력하세요. 설명이나 부가 내용 없이!

추출된 텍스트:`;

    const result = await callGeminiRaw(GEMINI_MODEL.PRO, {
      contents: [{role: 'user', parts: [{inlineData: {mimeType, data: base64}}, {text: prompt}]}],
      generationConfig: {responseMimeType: "text/plain"}
    }, TIMEOUTS.GENERATION);

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || '').join('');
    return text.trim();
  } catch (error) {
    console.error('문서 텍스트 추출 실패:', error);
    throw new Error('문서에서 텍스트를 추출할 수 없습니다.');
  }
};

/**
 * 텍스트에서 말투/어조 분석
 */
export const analyzeWritingStyle = async (
  sampleText: string,
  styleName: string
): Promise<LearnedWritingStyle> => {
  const prompt = `너는 단순히 기존 글의 문장 끝맺음을 흉내 내는 사람이 아니라,
해당 병원 고유의 화자 캐릭터, 상담 방식, 설명 습관, 설득 구조를 추출해
그 문체를 재현하는 편집자 역할을 수행한다.

[분석할 텍스트]
${sampleText.substring(0, 5000)}

[중요 원칙]
- 표면적인 어미나 표현 몇 개만 모방하지 말 것
- 반드시 화자의 태도, 환자와의 거리감, 설명 흐름, 설득 구조까지 분석할 것
- 업종 공통 블로그 말투로 평준화하지 말 것
- 병원명만 바꿔도 다른 병원 글처럼 보이는 문장은 피할 것
- 실제 상담실/진료실에서 나올 법한 문장인지 기준으로 판단할 것
- 근거가 약한 해석은 단정하지 말고 가능성으로 표시할 것
- 반복적으로 확인되는 특징만 "이 병원 고유 문체"로 정의할 것

[분석 항목 — 7가지]

1. 화자의 정체성 (speakerIdentity)
   - 대표원장 직접 설명형인지
   - 객관적 정보 칼럼형인지
   - 환자 상담형인지
   - 보호자 안심형인지

2. 독자와의 거리감 (readerDistance)
   - 전문가가 설명하는 거리인지
   - 친절한 상담 대화형인지
   - 공감과 위로가 섞인 톤인지
   - 차분하고 객관적인 톤인지

3. 문장 리듬 (sentenceRhythm)
   - 평균 문장 길이
   - 짧게 끊는지, 길게 설명하는지
   - 같은 어미 반복 여부
   - 질문형 / 단정형 / 권유형 비중

4. 문단 전개 구조 (paragraphFlow)
   - 사례 도입 → 설명 → 정리
   - 문제 제기 → 원인 → 해결
   - 환자 질문 → 답변
   - 비교 설명 → 적합 대상 → 관리법

5. 설득 방식 (persuasionStyle)
   - 정보 전달 중심인지
   - 신뢰 형성 중심인지
   - 치료 필요성 설득형인지
   - 두려움 완화형인지

6. 고유 표현 습관 (uniqueExpressions)
   - 자주 쓰는 접속어
   - 자주 쓰는 명사 표현
   - 반복되는 문장 구조
   - 자주 등장하는 상담 문장 패턴

7. 금지해야 할 범용 문체 (bannedGenericStyle)
   - 다른 병원 블로그에도 그대로 들어갈 수 있는 진부한 표현
   - 과장된 광고 문구
   - AI가 쓴 듯한 균일한 설명체
   - 의미 없이 반복되는 '~입니다', '~필요합니다' 나열

[출력 형식]
반드시 아래 JSON으로만 답변. 설명 텍스트 없이 JSON만 출력.
{
  "tone": "전체적인 어조 설명 (2-3문장)",
  "sentenceEndings": ["자주 쓰는 문장 끝 패턴 5-8개"],
  "vocabulary": ["이 병원 고유의 특징적 단어/표현 5-10개"],
  "structure": "글 구조 설명 (TYPE A 에세이형 / TYPE B 정보전달형 명시 + 상세 흐름)",
  "emotionLevel": "low/medium/high",
  "formalityLevel": "casual/neutral/formal",
  "speakerIdentity": "화자 정체성 분석 (2-3문장, 어떤 위치에서 말하는지)",
  "readerDistance": "독자와의 거리감 분석 (2-3문장)",
  "sentenceRhythm": "문장 리듬 분석 (평균 길이, 끊김 패턴, 어미 반복 여부, 질문형/단정형/권유형 비중)",
  "paragraphFlow": "문단 전개 구조 분석 (2-3문장, 대표적 흐름 패턴)",
  "persuasionStyle": "설득 방식 분석 (2-3문장)",
  "uniqueExpressions": ["고유 접속어, 명사 표현, 반복 문장 구조, 상담 패턴 — 5-10개"],
  "bannedGenericStyle": ["이 병원 글에서 절대 나오면 안 되는 범용/진부 표현 5-8개"],
  "oneLineSummary": "이 병원 문체를 한 줄로 정의",
  "goodExamples": ["이 병원다운 문장 예시 5개 — 원문에서 추출하거나 원문 스타일로 새로 작성"],
  "badExamples": ["이 병원답지 않은 문장 예시 5개 — 이런 문장이 나오면 실패"],
  "description": "이 말투를 한 줄로 설명 (화자 캐릭터 + 독자 관계 + 설득 구조 포함)",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 사용할 핵심 지침 (100-200자, 화자 태도 + 설명 흐름 + 금지 패턴)"
}`;

  try {
    const response = await callGemini({
      prompt,
      model: GEMINI_MODEL.PRO,
      responseType: 'json',
      schema: {
        type: Type.OBJECT,
        properties: {
          tone: { type: Type.STRING },
          sentenceEndings: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          vocabulary: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          structure: { type: Type.STRING },
          emotionLevel: {
            type: Type.STRING,
            enum: ["low", "medium", "high"]
          },
          formalityLevel: {
            type: Type.STRING,
            enum: ["casual", "neutral", "formal"]
          },
          speakerIdentity: { type: Type.STRING },
          readerDistance: { type: Type.STRING },
          sentenceRhythm: { type: Type.STRING },
          paragraphFlow: { type: Type.STRING },
          persuasionStyle: { type: Type.STRING },
          uniqueExpressions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          bannedGenericStyle: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          oneLineSummary: { type: Type.STRING },
          goodExamples: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          badExamples: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          description: { type: Type.STRING },
          stylePrompt: { type: Type.STRING }
        },
        required: [
          "tone", "sentenceEndings", "vocabulary", "structure", "emotionLevel", "formalityLevel",
          "speakerIdentity", "readerDistance", "sentenceRhythm", "paragraphFlow", "persuasionStyle",
          "uniqueExpressions", "bannedGenericStyle", "oneLineSummary", "goodExamples", "badExamples",
          "description", "stylePrompt"
        ]
      },
    });

    // Gemini 응답에서 프로필 안전 추출 (candidates[0].content.parts[0].text)
    const result = extractProfileFromGeminiResponse(response);

    // LearnedWritingStyle 객체 생성 (기본 + 심층 분석 필드)
    const learnedStyle: LearnedWritingStyle = {
      id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: styleName,
      description: result.description,
      sampleText: sampleText.substring(0, 500),
      analyzedStyle: {
        tone: result.tone,
        sentenceEndings: result.sentenceEndings,
        vocabulary: result.vocabulary,
        structure: result.structure,
        emotionLevel: result.emotionLevel as 'low' | 'medium' | 'high',
        formalityLevel: result.formalityLevel as 'casual' | 'neutral' | 'formal',
        // 심층 분석 필드
        speakerIdentity: result.speakerIdentity,
        readerDistance: result.readerDistance,
        sentenceRhythm: result.sentenceRhythm,
        paragraphFlow: result.paragraphFlow,
        persuasionStyle: result.persuasionStyle,
        uniqueExpressions: result.uniqueExpressions,
        bannedGenericStyle: result.bannedGenericStyle,
        oneLineSummary: result.oneLineSummary,
        goodExamples: result.goodExamples,
        badExamples: result.badExamples,
      },
      stylePrompt: result.stylePrompt,
      createdAt: new Date().toISOString()
    };

    console.log('[StyleProfile] 저장 완료:', learnedStyle.name, learnedStyle.id);
    return learnedStyle;
  } catch (error: any) {
    console.error('말투 분석 실패:', error?.message || error);
    // 디버깅 가능한 실패 로그 — 사용자 텍스트는 앞 50자만 (개인정보 보호)
    console.error('[StyleProfile] 실패 컨텍스트: sampleText 길이=', sampleText?.length, '앞50자=', sampleText?.substring(0, 50)?.replace(/[가-힣]{3,}/g, '***'));
    throw new Error(error?.message || '말투 분석에 실패했습니다. 다시 시도해주세요.');
  }
};

// 의료광고법 금지 표현 필터링
const MEDICAL_AD_PROHIBITED_WORDS = [
  // 직접 권유
  '방문하세요', '내원하세요', '예약하세요', '문의하세요', '상담하세요',
  '오세요', '연락주세요', '전화주세요', '문의해주세요',
  // 과대광고
  '완치', '최고', '유일', '특효', '1등', '최고급', '최대', '최상',
  '획기적', '혁신적', '기적', '100%', '확실', '보장', '반드시',
  // 치료 효과 암시
  '완벽한 치료', '빠른 회복', '확실한 효과', '증명된',
  // 비교광고
  '업계 최초', '업계 유일', '타 병원보다', '다른 곳보다',
  // 공포 조장
  '늦으면 손 쓸 수 없', '큰일납니다', '위험합니다', '죽을 수',
];

// 금지 표현 필터링 함수
const filterProhibitedExpressions = (words: string[]): string[] => {
  return words.filter(word => 
    !MEDICAL_AD_PROHIBITED_WORDS.some(prohibited => 
      word.toLowerCase().includes(prohibited.toLowerCase())
    )
  );
};

/**
 * 학습된 스타일을 프롬프트로 변환
 * ⚠️ 의료광고법 준수 + AI 냄새 제거 원칙 적용
 */
export const getStylePromptForGeneration = (style: LearnedWritingStyle): string => {
  const { analyzedStyle } = style;

  // 학습된 표현 중 의료광고법 위반 가능성 있는 것 필터링
  const safeVocabulary = filterProhibitedExpressions(analyzedStyle.vocabulary);
  const safeSentenceEndings = filterProhibitedExpressions(analyzedStyle.sentenceEndings);
  const safeUniqueExpressions = filterProhibitedExpressions(analyzedStyle.uniqueExpressions || []);

  // ── 심층 분석 블록 (있을 때만 포함) ──
  const hasDeepAnalysis = analyzedStyle.speakerIdentity || analyzedStyle.readerDistance;

  const deepBlock = hasDeepAnalysis ? `
[화자 캐릭터]
- 정체성: ${analyzedStyle.speakerIdentity || '미분석'}
- 독자와의 거리감: ${analyzedStyle.readerDistance || '미분석'}
- 설득 방식: ${analyzedStyle.persuasionStyle || '미분석'}

[문장·문단 DNA]
- 리듬: ${analyzedStyle.sentenceRhythm || '미분석'}
- 전개 구조: ${analyzedStyle.paragraphFlow || '미분석'}
- 고유 표현: ${safeUniqueExpressions.length > 0 ? safeUniqueExpressions.join(', ') : '미분석'}

[한 줄 정의] ${analyzedStyle.oneLineSummary || style.description}

[이 병원다운 문장 — 참고]
${(analyzedStyle.goodExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}

[이 병원답지 않은 문장 — 절대 금지]
${(analyzedStyle.badExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}
` : '';

  const bannedBlock = (analyzedStyle.bannedGenericStyle || []).length > 0
    ? `\n[이 병원 글에서 금지할 범용 표현]\n${analyzedStyle.bannedGenericStyle!.map(b => `- ${b}`).join('\n')}\n`
    : '';

  return `[🏥 병원 고유 문체: ${style.name}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
너는 이 병원의 편집자다. 어미 몇 개를 흉내 내는 것이 아니라,
화자의 태도·상담 방식·설명 습관·설득 구조를 재현하라.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[기본 톤]
- 어조: ${analyzedStyle.tone}
- 격식: ${analyzedStyle.formalityLevel === 'formal' ? '격식체' : analyzedStyle.formalityLevel === 'casual' ? '편한 말투' : '중립적'}
- 감정 표현: ${analyzedStyle.emotionLevel === 'high' ? '풍부하게' : analyzedStyle.emotionLevel === 'medium' ? '적당히' : '절제하여'} (정보 전달의 보조 수단으로만)
- 문장 끝 패턴: ${safeSentenceEndings.join(', ')}
- 자주 쓰는 표현: ${safeVocabulary.join(', ')}
- 글 구조: ${analyzedStyle.structure}
${deepBlock}${bannedBlock}
[✍️ 글 작성 전 자가점검 — 매 문단마다 확인]
1. 이 문단의 화자가 실제 상담실/진료실에서 말하는 것처럼 읽히는가?
2. 병원명을 가려도 이 병원 톤으로 느껴지는가?
3. 다른 병원 블로그에 그대로 넣어도 어색하지 않은 범용 문장이 있지 않은가?
4. 같은 어미가 3회 이상 연속 반복되지 않았는가?
5. 각 문단에 이 병원 고유 문체 특징이 2개 이상 반영됐는가?

████████████████████████████████████████████████████████████████████████████████
[🎯 AI 냄새 제거 + 의료법 준수 - 최우선 적용]
████████████████████████████████████████████████████████████████████████████████

⛔ 피해야 할 AI 패턴:
- "~가 핵심입니다" / "기억하세요" / "중요한 것은" → 삭제
- "~수 있습니다" 2회 연속 → 1회는 "~경우도 있습니다", "~분들도 많습니다"로 변환
- 정보글 평균체로 평준화 → 이 병원의 고유 리듬 유지
- 모든 가능성 나열 → 대표적인 것만 언급, 여백 남기기

⛔ 의료광고법 금지 표현:
- '방문하세요', '예약하세요', '상담하세요' → "고려해 보실 수 있습니다"
- '완치', '최고', '보장', '확실' → 과대광고 금지
- 구체적 숫자/시간 (출처 없이) → 범주형 표현으로 대체

✅ 사람다운 글쓰기 원칙:
- 첫 문장: 정의/설명이 아닌 상황 묘사나 질문으로 시작
- 태도: "같이 생각해보자" (설득이 아닌 동행)
- 결론: 너무 깔끔하게 정리하지 않음, 여백 남기기
`;
};

/**
 * 저장된 스타일 불러오기
 */
export const getSavedStyles = (): LearnedWritingStyle[] => {
  try {
    const saved = localStorage.getItem('hospital_learned_writing_styles');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * ID로 스타일 찾기
 */
export const getStyleById = (id: string): LearnedWritingStyle | null => {
  const styles = getSavedStyles();
  return styles.find(s => s.id === id) || null;
};

// ============================================================
// 병원별 네이버 블로그 말투 학습 (Supabase 저장/조회)
// ============================================================

export interface HospitalStyleProfile {
  id?: string;
  hospital_name: string;
  team_id?: number;
  naver_blog_url?: string;
  crawled_posts_count?: number;
  style_profile?: LearnedWritingStyle | null;
  raw_sample_text?: string;
  last_crawled_at?: string;
  posts?: { url: string; content: string }[]; // 크롤링 결과 (메모리에만, DB 저장 안 함)
}

/**
 * 병원 블로그 크롤링 → 말투 분석 → Supabase 저장
 * blogUrl: 크롤링할 URL (단일 또는 배열)
 * allBlogUrls: 프로파일에 저장할 전체 URL 목록 (개별 크롤링 시 다른 URL도 보존)
 */
export const crawlAndLearnHospitalStyle = async (
  hospitalName: string,
  teamId: number,
  blogUrl: string | string[],
  onProgress?: (msg: string) => void,
  allBlogUrls?: string[]
): Promise<HospitalStyleProfile> => {
  const API_BASE_URL = (import.meta as any).env?.VITE_CRAWLER_URL || '';
  const blogUrls = Array.isArray(blogUrl) ? blogUrl : [blogUrl];

  // 1단계: 모든 URL에서 블로그 글 크롤링
  const allPosts: { url: string; content: string; title?: string; publishedAt?: string; summary?: string; thumbnail?: string }[] = [];

  for (let i = 0; i < blogUrls.length; i++) {
    const url = blogUrls[i];
    const urlLabel = blogUrls.length > 1 ? ` (${i + 1}/${blogUrls.length})` : '';
    onProgress?.(`블로그 글 수집 중${urlLabel}... (최대 5개)`);

    try {
      const crawlRes = await fetch(`${API_BASE_URL}/api/naver/crawl-hospital-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: url, maxPosts: 5 }),
      });

      if (!crawlRes.ok) {
        const err = await crawlRes.json().catch(() => ({}));
        console.warn(`[Crawl] URL ${i + 1} 크롤링 실패:`, url, err.message);
        continue; // 하나 실패해도 나머지 계속
      }

      const crawlData = await crawlRes.json();
      const posts = crawlData.posts || [];
      allPosts.push(...posts);
      console.log(`[Crawl] URL ${i + 1} (${url}) → ${posts.length}개 글 수집`);
    } catch (e: any) {
      console.warn(`[Crawl] URL ${i + 1} 네트워크 오류:`, url, e?.message);
      continue;
    }
  }

  if (allPosts.length === 0) {
    throw new Error('수집된 블로그 글이 없습니다. URL을 다시 확인해주세요.');
  }

  // 2단계: 수집된 글 합치기 (최대 8000자)
  onProgress?.(`총 ${allPosts.length}개 글 수집 완료. 말투 분석 중...`);
  const combinedText = allPosts.map(p => p.content).join('\n\n---\n\n').slice(0, 8000);

  // 3단계: Gemini로 말투 분석
  const analyzedStyle = await analyzeWritingStyle(combinedText, hospitalName);

  // 4단계: Supabase에 저장 (upsert)
  onProgress?.('말투 프로파일 저장 중...');

  // crawled_posts_count: DB에 실제 저장된 이 병원의 글 수를 직접 센다 (profile 조회 의존 X)
  let dbPostCount = allPosts.length;
  try {
    const { count } = await supabase
      .from('hospital_crawled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('hospital_name', hospitalName);
    if (count !== null && count > 0) {
      // DB에 이미 저장된 글 + 이번에 새로 추가될 글 (중복 upsert 감안, 최소한 현재 DB 수 이상)
      dbPostCount = Math.max(count, allPosts.length);
    }
  } catch { /* count 실패해도 allPosts.length 사용 */ }

  // 프로파일에 저장할 URL: allBlogUrls가 있으면 그것 사용 (전체 URL 보존), 없으면 크롤링 URL
  const profileUrls = allBlogUrls && allBlogUrls.length > 0 ? allBlogUrls : blogUrls;
  const profileData = {
    hospital_name: hospitalName,
    team_id: teamId,
    naver_blog_url: profileUrls.join(','),
    crawled_posts_count: dbPostCount,
    style_profile: analyzedStyle,
    raw_sample_text: combinedText.slice(0, 10000),
    last_crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const upsertPromise = supabase
    .from('hospital_style_profiles')
    .upsert(profileData, { onConflict: 'hospital_name' })
    .select();
  const upsertTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('프로파일 저장 시간 초과 (10초)')), 10000)
  );

  let data: any = null;
  try {
    const result = await Promise.race([upsertPromise, upsertTimeout]) as any;
    if (result.error) {
      console.error('Supabase 저장 오류:', result.error);
      // 저장 실패해도 분석 결과는 반환
      return { ...profileData, style_profile: analyzedStyle };
    }
    const rows = result.data ?? [];
    if (rows.length === 1) {
      data = rows[0];
    } else if (rows.length === 0) {
      console.warn('[StyleProfile] upsert 후 반환된 행이 0개 — 저장은 됐으나 select 실패 가능');
      data = profileData;
    } else {
      // 2행 이상: upsert가 중복 행을 반환 — DB unique constraint 점검 필요
      console.error(
        `[StyleProfile] upsert 후 ${rows.length}개 행 반환 — ` +
        `"${hospitalName}" 중복 행 존재. DB unique constraint 점검 필요. ` +
        `row IDs: ${rows.map((r: any) => r.id).join(', ')}`
      );
      data = rows[0]; // 최신 1행 사용하되, 중복 경고는 명시적으로 노출
    }
  } catch (timeoutErr) {
    console.error('Supabase 저장 타임아웃:', timeoutErr);
    // 타임아웃이어도 분석 결과는 반환
    return { ...profileData, style_profile: analyzedStyle };
  }

  // 5단계: 개별 글을 hospital_crawled_posts에 저장 (글 목록 보기용)
  onProgress?.('수집된 글 저장 중...');
  const savePostsPromise = Promise.allSettled(
    allPosts.map(p => saveCrawledPost(hospitalName, p.url, p.content, undefined, {
      title: p.title,
      publishedAt: p.publishedAt,
      summary: p.summary,
      thumbnail: p.thumbnail,
    }))
  );
  // 글 저장이 15초 내 안 끝나면 스킵 (분석 결과는 이미 저장됨)
  await Promise.race([
    savePostsPromise,
    new Promise(resolve => setTimeout(resolve, 15000))
  ]);

  onProgress?.('완료!');
  return { ...(data as HospitalStyleProfile), posts: allPosts };
};

/**
 * Supabase에서 병원 말투 프로파일 조회
 *
 * 배열 조회 후 행 수로 분기:
 *   0행 → 미학습 상태 (정상) → null 반환
 *   1행 → 정상 사용 → 프로파일 반환
 *   2행+ → 데이터 무결성 오류 → 에러 로그 + null 반환 (중복 데이터 숨기지 않음)
 */
export const getHospitalStyleProfile = async (
  hospitalName: string
): Promise<HospitalStyleProfile | null> => {
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('*')
    .eq('hospital_name', hospitalName);

  if (error) {
    console.error(`[StyleProfile] 조회 실패 (hospital: ${hospitalName}):`, error.message);
    return null;
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    // 미학습 병원 — 정상 상태
    return null;
  }

  if (rows.length === 1) {
    return rows[0] as HospitalStyleProfile;
  }

  // 2행 이상: 데이터 무결성 오류 — unique constraint가 누락되었거나 이중 삽입 발생
  console.error(
    `[StyleProfile] 데이터 무결성 오류: "${hospitalName}" 에 ${rows.length}개 중복 행 존재. ` +
    `DB에서 hospital_style_profiles.hospital_name UNIQUE 제약을 확인하세요. ` +
    `중복 row IDs: ${rows.map((r: any) => r.id).join(', ')}`
  );
  return null;
};

/**
 * 팀 전체 병원 말투 프로파일 조회
 */
export const getTeamStyleProfiles = async (
  teamId: number
): Promise<HospitalStyleProfile[]> => {
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('*')
    .eq('team_id', teamId)
    .order('hospital_name');

  if (error || !data) return [];
  return data as HospitalStyleProfile[];
};

/**
 * 모든 병원 말투 프로파일 조회
 */
export const getAllStyleProfiles = async (): Promise<HospitalStyleProfile[]> => {
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('id, hospital_name, team_id, naver_blog_url, crawled_posts_count, last_crawled_at, style_profile')
    .order('team_id', { ascending: true });

  if (error || !data) return [];
  return data as HospitalStyleProfile[];
};

/**
 * 병원 블로그 URL만 저장/수정 (크롤링 없이)
 */
export const saveHospitalBlogUrl = async (
  hospitalName: string,
  teamId: number,
  blogUrl: string
): Promise<void> => {
  const upsertPromise = supabase
    .from('hospital_style_profiles')
    .upsert(
      { hospital_name: hospitalName, team_id: teamId, naver_blog_url: blogUrl, updated_at: new Date().toISOString() },
      { onConflict: 'hospital_name' }
    );
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('URL 저장 시간 초과 (10초). Supabase 테이블/RLS 설정을 확인하세요.')), 10000)
  );

  const { error } = await Promise.race([upsertPromise, timeoutPromise]) as any;
  if (error) {
    console.error('[WritingStyle] URL 저장 실패:', error);
    throw new Error(`URL 저장 실패: ${error.message}`);
  }
};

/**
 * 콘텐츠 생성 시 병원 말투 프롬프트 반환 (캐시 포함)
 */
const styleProfileCache: Record<string, HospitalStyleProfile | null> = {};

export const getHospitalStylePromptForGeneration = async (
  hospitalName: string
): Promise<string | null> => {
  if (!(hospitalName in styleProfileCache)) {
    styleProfileCache[hospitalName] = await getHospitalStyleProfile(hospitalName);
  }
  const profile = styleProfileCache[hospitalName];
  if (!profile?.style_profile) return null;
  return getStylePromptForGeneration(profile.style_profile);
};

// ============================================================
// 크롤링 글 채점 + DB 저장/조회
// ============================================================

/**
 * Gemini FLASH로 블로그 글 오타/맞춤법 + 의료광고법 채점
 */
// ── 의료광고 위험표현 룰셋 (후처리용) ──
// axis: 같은 축 이슈는 감점 1회만 적용 (이슈 표시는 최대 2건)
type RiskRule = { pattern: string; severity: 'high' | 'medium'; penalty: number; law_article: string; reason: string; replacements: string[]; axis: string };
const MEDICAL_LAW_RISK_RULES: RiskRule[] = [
  // high (-8점)
  { pattern: '완치', severity: 'high', penalty: 8, law_article: '의료법 제56조 제1항', reason: '치료 효과 보장 표현', replacements: ['호전', '개선'], axis: '효과보장' },
  { pattern: '100%', severity: 'high', penalty: 8, law_article: '의료법 제56조 제1항', reason: '치료 효과 보장 수치', replacements: ['높은 만족도'], axis: '효과보장' },
  { pattern: '반드시', severity: 'high', penalty: 8, law_article: '의료법 제56조 제1항', reason: '치료 결과 보장 표현', replacements: ['기대할 수 있는'], axis: '효과보장' },
  { pattern: '무조건', severity: 'high', penalty: 8, law_article: '의료법 제56조 제1항', reason: '치료 결과 단정 표현', replacements: ['대부분의 경우'], axis: '효과보장' },
  { pattern: '부작용 없', severity: 'high', penalty: 8, law_article: '의료법 제56조 제2항 제5호', reason: '부작용 부정 표현', replacements: ['부작용이 적은', '부작용 최소화'], axis: '안전성단정' },
  { pattern: '통증 없', severity: 'high', penalty: 8, law_article: '의료법 제56조 제2항 제5호', reason: '통증 부정 표현', replacements: ['통증이 적은', '통증 최소화'], axis: '안전성단정' },
  // medium (-4점)
  { pattern: '안전하게', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제5호', reason: '안전성 단정 표현', replacements: ['안전성을 고려하여'], axis: '안전성단정' },
  { pattern: '확실한 효과', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제5호', reason: '효과 단정 표현', replacements: ['기대되는 효과'], axis: '효과보장' },
  { pattern: '검증된 결과', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제5호', reason: '미검증 효과 주장', replacements: ['임상 경험'], axis: '효과보장' },
  { pattern: '최고', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제1호', reason: '최상급 표현', replacements: ['우수한', '전문적인'], axis: '최상급비교' },
  { pattern: '1위', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제1호', reason: '순위 주장 표현', replacements: ['많은 경험'], axis: '최상급비교' },
  { pattern: '유일', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제1호', reason: '독점적 표현', replacements: ['전문적인'], axis: '최상급비교' },
  { pattern: '가장 잘하는', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제1호', reason: '최상급 비교 표현', replacements: ['풍부한 경험의'], axis: '최상급비교' },
  { pattern: '환자 후기', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제3호', reason: '환자 치료경험담', replacements: ['진료 안내'], axis: '후기경험담' },
  { pattern: '리얼 후기', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제3호', reason: '환자 치료경험담', replacements: ['진료 안내'], axis: '후기경험담' },
  { pattern: '전후 사진', severity: 'medium', penalty: 4, law_article: '의료법 제56조 제2항 제3호', reason: '치료 전후 비교 광고', replacements: ['진료 과정 안내'], axis: '후기경험담' },
];

// 수치형 치료효과 표현 감지 (예: "40~50% 줄이는", "2배 개선")
const NUMERIC_EFFECT_REGEX = /\d+[\d~\-–.,%배]*\s*(?:%|배)\s*(?:이상\s*)?(?:줄|감소|개선|회복|완화|예방|향상|증가|효과|치료|제거|해소|해결)/g;
const NUMERIC_EFFECT_AXIS = '수치형효과';
const NUMERIC_EFFECT_RULE: Omit<RiskRule, 'pattern'> = {
  severity: 'medium', penalty: 6, axis: NUMERIC_EFFECT_AXIS,
  law_article: '의료법 제56조 제2항 제5호',
  reason: '수치를 이용한 치료 효과 과장',
  replacements: ['개인에 따라 결과가 다를 수 있습니다'],
};

function applyMedicalLawRiskRules(
  content: string,
  currentScore: number,
  currentIssues: CrawledPostScore['law_issues'],
): { score: number; issues: CrawledPostScore['law_issues'] } {
  // 기존 Gemini 이슈의 word 목록 (중복 방지용)
  const existingWords = new Set(currentIssues.map(i => i.word));
  const newIssues: CrawledPostScore['law_issues'] = [];
  // 축별 감점 1회 추적: 이미 감점된 축은 이슈만 추가하고 점수는 안 깎음
  const penalizedAxes = new Set<string>();
  let penalty = 0;

  // 1) 고정 룰셋
  for (const rule of MEDICAL_LAW_RISK_RULES) {
    if (existingWords.has(rule.pattern)) {
      penalizedAxes.add(rule.axis); // Gemini가 잡은 것도 축 마킹
      continue;
    }
    if (!content.includes(rule.pattern)) continue;

    // 긴 표현에 포함된 짧은 표현 중복 방지 (예: "부작용 없는" 이미 잡혔으면 "부작용 없" skip)
    const alreadyCovered = [...existingWords, ...newIssues.map(i => i.word)].some(
      w => w.includes(rule.pattern) || rule.pattern.includes(w)
    );
    if (alreadyCovered) continue;

    newIssues.push({
      word: rule.pattern,
      severity: rule.severity,
      replacement: rule.replacements,
      context: rule.reason + ' (' + rule.law_article + ')',
    });

    // 같은 축 첫 건만 감점
    if (!penalizedAxes.has(rule.axis)) {
      penalty += rule.penalty;
      penalizedAxes.add(rule.axis);
    }
  }

  // 2) 수치형 치료효과 표현 (regex)
  const numericMatches = content.match(NUMERIC_EFFECT_REGEX) || [];
  let numericIssueCount = 0;
  for (const match of numericMatches) {
    const trimmed = match.trim();
    if (existingWords.has(trimmed)) continue;
    if (newIssues.some(i => i.word === trimmed)) continue;
    if (numericIssueCount >= 2) break; // 이슈 표시 최대 2건
    newIssues.push({
      word: trimmed,
      severity: NUMERIC_EFFECT_RULE.severity,
      replacement: NUMERIC_EFFECT_RULE.replacements,
      context: NUMERIC_EFFECT_RULE.reason + ' (' + NUMERIC_EFFECT_RULE.law_article + ')',
    });
    numericIssueCount++;
  }
  // 수치형 축도 감점 1회만
  if (numericMatches.length > 0 && !penalizedAxes.has(NUMERIC_EFFECT_AXIS)) {
    penalty += NUMERIC_EFFECT_RULE.penalty;
    penalizedAxes.add(NUMERIC_EFFECT_AXIS);
  }

  return {
    score: Math.max(0, currentScore - penalty),
    issues: [...currentIssues, ...newIssues],
  };
}

export const scoreCrawledPost = async (content: string): Promise<CrawledPostScore> => {
  console.log('[Score] scoreCrawledPost 함수 진입, content길이:', content?.length);

  const prompt = `당신은 한국어 맞춤법 전문가이자 의료광고법 전문가입니다.
아래 블로그 글을 분석하여 정확히 JSON 형식으로만 응답하세요.

[분석 항목 - 3가지 독립 채점]

1. 오타 (score_typo): 실제 타이핑 실수, 잘못 입력한 단어만 (최대 10건)
   - 포함: "왠지" → "웬지", "설레임" → "설렘", 자음/모음 오기입
   - 제외: 맞춤법 규칙, 띄어쓰기, 문체 변경
   - type: "typo"

2. 맞춤법 (score_spelling): 맞춤법·띄어쓰기·문법 오류 (최대 10건)
   - 포함: "되요" → "돼요", "않됩니다" → "안 됩니다", "할게요" → "할게요", 띄어쓰기
   - 제외: 단어 선택, 문체 변경 (예: "누워있는" → "누워있다면" 같은 어투 변경은 오류 아님)
   - type: "spelling"

3. 의료광고법 (score_medical_law): 아래 조항 기준으로 판단, 반드시 법 조항과 이유 명시 (최대 10건)
   - 제56조 제1항: 치료 효과 보장, 완치 암시 ("완치", "100% 치료", "반드시 낫는다")
   - 제56조 제2항 제1호: 최고/유일 ("최고", "최상", "국내 유일", "가장 좋은")
   - 제56조 제2항 제2호: 타 병원 비교·비하
   - 제56조 제2항 제3호: 환자 치료 경험담 ("OO환자 OO일만에 완치")
   - 제56조 제2항 제4호: 신문·방송 인용 ("TV에서 소개된")
   - 제56조 제2항 제5호: 검증 안 된 표현 ("안전하게", "부작용 없이", "효과 입증")
   - 제56조 제2항 제6호: 과대·과장 ("탁월한", "획기적인", "혁신적인")

[점수 기준]
- score_typo: 오류 없으면 100점, 오류 1건당 -10점
- score_spelling: 오류 없으면 100점, 오류 1건당 -5점
- score_medical_law: 위반 없으면 100점, critical -20점, high -10점, medium -5점
- score_total: (score_typo + score_spelling + score_medical_law) / 3 (소수점 반올림)

[응답 JSON]
{
  "score_typo": 숫자,
  "score_spelling": 숫자,
  "score_medical_law": 숫자,
  "score_total": 숫자,
  "typo_issues": [{"original": "틀린 표현", "correction": "올바른 표현", "context": "앞뒤 문장", "type": "typo|spelling"}],
  "law_issues": [{"word": "위반 표현", "severity": "critical|high|medium|low", "law_article": "의료법 제56조 제2항 제5호", "reason": "위반 이유", "replacement": ["대체 표현1"], "context": "앞뒤 문장"}]
}

[분석할 글]
${content.slice(0, 3000)}`;

  // SaaS 프록시 경유 — 클라이언트 API 키 불필요
  let raw = '';
  console.log('[Score] 프록시 모드로 채점 시작');
  const response = await callGemini({
    prompt,
    model: GEMINI_MODEL.FLASH,
    responseType: 'json',
    temperature: 0.1,
  });
  // callGemini responseType='json'은 이미 파싱된 객체 반환
  if (response && typeof response === 'object' && typeof response.score_typo === 'number') {
    console.log('[Score] 프록시 응답 — 이미 파싱된 JSON 객체');
    raw = JSON.stringify(response);
  } else if (typeof response === 'string') {
    raw = response;
  } else if (response?.text) {
    raw = typeof response.text === 'string' ? response.text : JSON.stringify(response);
  } else {
    raw = JSON.stringify(response);
  }

  if (!raw.trim()) {
    console.error('[Score] Gemini 응답 비어 있음');
    return { score_typo: 50, score_spelling: 50, score_medical_law: 50, score_total: 50, typo_issues: [], law_issues: [] };
  }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Score] JSON 추출 실패, 원본:', raw.slice(0, 200));
      return { score_typo: 50, score_spelling: 50, score_medical_law: 50, score_total: 50, typo_issues: [], law_issues: [] };
    }
    const parsed = JSON.parse(jsonMatch[0]);

    // 점수가 실제로 존재하는지 검증 — 없으면 50점 (100점 아님)
    const hasScores = typeof parsed.score_typo === 'number'
      || typeof parsed.score_spelling === 'number'
      || typeof parsed.score_medical_law === 'number';

    if (!hasScores) {
      console.warn('[Score] 점수 필드 없음, parsed keys:', Object.keys(parsed));
      return { score_typo: 50, score_spelling: 50, score_medical_law: 50, score_total: 50, typo_issues: parsed.typo_issues || [], law_issues: parsed.law_issues || [] };
    }

    const scoreTypo = Math.max(0, Math.min(100, typeof parsed.score_typo === 'number' ? parsed.score_typo : 50));
    const scoreSpelling = Math.max(0, Math.min(100, typeof parsed.score_spelling === 'number' ? parsed.score_spelling : 50));
    const scoreLaw = Math.max(0, Math.min(100, typeof parsed.score_medical_law === 'number' ? parsed.score_medical_law : 50));
    const scoreTotal = Math.round((scoreTypo + scoreSpelling + scoreLaw) / 3);

    // 의료광고법 후처리: 룰셋 기반 보수적 감점
    const lawPost = applyMedicalLawRiskRules(content, scoreLaw, parsed.law_issues || []);
    const finalLaw = lawPost.score;
    const finalTotal = Math.round((scoreTypo + scoreSpelling + finalLaw) / 3);

    console.log(`[Score] 채점 완료: 오타=${scoreTypo}, 맞춤법=${scoreSpelling}, 의료법=${scoreLaw}→${finalLaw}, 총점=${finalTotal}`);
    return {
      score_typo: scoreTypo,
      score_spelling: scoreSpelling,
      score_medical_law: finalLaw,
      score_total: finalTotal,
      typo_issues: parsed.typo_issues || [],
      law_issues: lawPost.issues,
    };
  } catch (e) {
    console.error('[Score] JSON 파싱 실패:', e, '원본:', raw.slice(0, 200));
    return { score_typo: 50, score_spelling: 50, score_medical_law: 50, score_total: 50, typo_issues: [], law_issues: [] };
  }
};

// localStorage 키
const LS_KEY = 'winaid_crawled_posts';

const lsGetAll = (): CrawledPost[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const lsSave = (posts: CrawledPost[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(posts)); } catch {}
};

/** url에서 네이버 블로그 ID 추출 (blog.naver.com/{blogId}/... → blogId) */
const extractBlogId = (url: string): string =>
  url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || 'unknown';

/**
 * 크롤링 글을 Supabase에 저장 (upsert). 실패 시 localStorage 폴백.
 */
export const saveCrawledPost = async (
  hospitalName: string,
  url: string,
  content: string,
  score?: CrawledPostScore,
  meta?: { title?: string; publishedAt?: string; summary?: string; thumbnail?: string }
): Promise<CrawledPost | null> => {
  const record: Record<string, any> = {
    hospital_name: hospitalName,
    url,
    content,
    source_blog_id: extractBlogId(url),
    crawled_at: new Date().toISOString(),
  };
  if (meta?.title) record.title = decodeHtmlEntities(meta.title);
  if (meta?.publishedAt) record.published_at = meta.publishedAt;
  if (meta?.summary) record.summary = decodeHtmlEntities(meta.summary);
  if (meta?.thumbnail) record.thumbnail = meta.thumbnail;
  if (score) {
    record.score_typo = score.score_typo;
    record.score_medical_law = score.score_medical_law;
    record.score_total = score.score_total;
    record.typo_issues = score.typo_issues;
    record.law_issues = score.law_issues;
    record.scored_at = new Date().toISOString();
  }

  // 1차 시도: source_blog_id 포함
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .upsert(record, { onConflict: 'hospital_name,url' })
    .select()
    .single();
  if (!error && data) return data as CrawledPost;

  // 2차 시도: source_blog_id 컬럼이 DB에 없을 수 있으므로 제외 후 재시도
  if (error && (error.message?.includes('source_blog_id') || error.code === '42703' || error.code === 'PGRST204')) {
    const { source_blog_id: _removed, ...recordWithout } = record;
    const { data: d2, error: e2 } = await supabase
      .from('hospital_crawled_posts')
      .upsert(recordWithout, { onConflict: 'hospital_name,url' })
      .select()
      .single();
    if (!e2 && d2) return d2 as CrawledPost;
  }

  // Supabase 실패(401 등) → localStorage 폴백
  const all = lsGetAll();
  const existing = all.findIndex(p => p.hospital_name === hospitalName && p.url === url);
  const post: CrawledPost = { id: `ls_${Date.now()}_${Math.random()}`, ...record } as CrawledPost;
  if (existing >= 0) all[existing] = { ...all[existing], ...post };
  else all.unshift(post);
  // 병원별 최대 50개 (다중 URL × 10개씩 대응, localStorage 용량 보호)
  const byHospital = all.filter(p => p.hospital_name === hospitalName);
  const others = all.filter(p => p.hospital_name !== hospitalName);
  lsSave([...byHospital.slice(0, 50), ...others]);
  return post;
};

/**
 * 채점 결과만 업데이트
 */
export const updateCrawledPostScore = async (id: string, score: CrawledPostScore): Promise<void> => {
  const updatePayload: Record<string, unknown> = {
    score_typo: score.score_typo,
    score_medical_law: score.score_medical_law,
    score_total: score.score_total,
    typo_issues: score.typo_issues,
    law_issues: score.law_issues,
    scored_at: new Date().toISOString(),
  };
  // score_spelling은 DB 컬럼이 있을 때만 포함 (없으면 400 방지)
  if (score.score_spelling !== undefined) {
    updatePayload.score_spelling = score.score_spelling;
  }

  const { error } = await supabase
    .from('hospital_crawled_posts')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.warn('Supabase 채점 업데이트 실패, localStorage 폴백:', error.message);
    // score_spelling 없이 재시도
    const { error: error2 } = await supabase
      .from('hospital_crawled_posts')
      .update({
        score_typo: score.score_typo,
        score_medical_law: score.score_medical_law,
        score_total: score.score_total,
        typo_issues: score.typo_issues,
        law_issues: score.law_issues,
        scored_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error2) {
      const all = lsGetAll();
      const idx = all.findIndex(p => p.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...score, scored_at: new Date().toISOString() };
        lsSave(all);
      }
    }
  }
};

/**
 * 수정된 본문 저장
 */
export const updateCrawledPostContent = async (id: string, correctedContent: string): Promise<void> => {
  const { error } = await supabase
    .from('hospital_crawled_posts')
    .update({ corrected_content: correctedContent })
    .eq('id', id);
  if (error) {
    const all = lsGetAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], corrected_content: correctedContent }; lsSave(all); }
  }
};

/**
 * 병원별 크롤링 글 조회 (전체 반환, 최신순). Supabase 실패 시 localStorage 폴백.
 * UI에서 URL별 10개 그룹핑을 하므로 서비스 레이어에서는 상한 없이 반환.
 */
export const getCrawledPosts = async (hospitalName: string): Promise<CrawledPost[]> => {
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .eq('hospital_name', hospitalName)
    .order('published_at', { ascending: false, nullsFirst: false });
  if (!error && data && data.length > 0) return data as CrawledPost[];
  // Supabase 실패 또는 빈 결과 → localStorage
  const lsPosts = lsGetAll().filter(p => p.hospital_name === hospitalName);
  lsPosts.sort((a, b) => {
    if (a.published_at && b.published_at) return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    if (a.published_at) return -1;
    if (b.published_at) return 1;
    return 0;
  });
  return lsPosts;
};

/**
 * 전체 병원 크롤링 글 조회 → { 병원명: [글...] } 형태
 */
export const getAllCrawledPostsSummary = async (): Promise<Record<string, CrawledPost[]>> => {
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false });
  let posts = (!error && data && data.length > 0) ? data as CrawledPost[] : lsGetAll();
  // localStorage 폴백 시 정렬
  if (error || !data || data.length === 0) {
    posts = [...posts].sort((a, b) => {
      if (a.published_at && b.published_at) return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (a.published_at) return -1;
      if (b.published_at) return 1;
      return 0;
    });
  }
  const result: Record<string, CrawledPost[]> = {};
  for (const post of posts) {
    if (!result[post.hospital_name]) result[post.hospital_name] = [];
    result[post.hospital_name].push(post); // UI에서 URL별 그룹핑하므로 서비스에서 상한 제거
  }
  return result;
};

/**
 * 특정 병원의 크롤링 글 전체 삭제 (Supabase + localStorage)
 */
export const deleteAllCrawledPosts = async (hospitalName: string): Promise<{ deleted: number; error?: string }> => {
  let deletedCount = 0;

  // Supabase 삭제
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .delete()
    .eq('hospital_name', hospitalName)
    .select('id');

  if (!error && data) {
    deletedCount = data.length;
  } else if (error) {
    console.warn('Supabase 크롤링 삭제 실패:', error.message);
  }

  // localStorage에서도 삭제
  const all = lsGetAll();
  const remaining = all.filter(p => p.hospital_name !== hospitalName);
  const lsDeleted = all.length - remaining.length;
  if (lsDeleted > 0) {
    lsSave(remaining);
    deletedCount += lsDeleted;
  }

  console.log(`[Delete] ${hospitalName} 크롤링 글 ${deletedCount}개 삭제 완료`);
  return { deleted: deletedCount, error: error?.message };
};

/**
 * 특정 병원의 말투 프로파일 삭제 (Supabase)
 */
export const deleteHospitalStyleProfile = async (hospitalName: string): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('hospital_style_profiles')
    .delete()
    .eq('hospital_name', hospitalName);

  if (error) {
    console.warn('말투 프로파일 삭제 실패:', error.message);
    return { success: false, error: error.message };
  }

  // 캐시 무효화
  delete styleProfileCache[hospitalName];

  console.log(`[Delete] ${hospitalName} 말투 프로파일 삭제 완료`);
  return { success: true };
};

/**
 * 특정 병원의 크롤링 데이터 전체 초기화 (크롤링 글 + 말투 프로파일)
 */
export const resetHospitalCrawlData = async (hospitalName: string): Promise<{ deletedPosts: number; profileDeleted: boolean; errors: string[] }> => {
  const errors: string[] = [];

  // 1. 크롤링 글 삭제
  const postResult = await deleteAllCrawledPosts(hospitalName);
  if (postResult.error) errors.push(`글 삭제: ${postResult.error}`);

  // 2. 말투 프로파일 삭제
  const profileResult = await deleteHospitalStyleProfile(hospitalName);
  if (profileResult.error) errors.push(`프로파일 삭제: ${profileResult.error}`);

  console.log(`[Reset] ${hospitalName} 전체 초기화: 글 ${postResult.deleted}개 삭제, 프로파일 ${profileResult.success ? '삭제' : '실패'}`);
  return {
    deletedPosts: postResult.deleted,
    profileDeleted: profileResult.success,
    errors,
  };
};

/**
 * 전체 병원 자동 크롤링 + 채점
 * URL이 등록된 병원 전체를 순차 처리
 */
export const crawlAndScoreAllHospitals = async (
  onProgress?: (msg: string, done: number, total: number) => void
): Promise<void> => {
  const API_BASE_URL = (import.meta as any).env?.VITE_CRAWLER_URL || '';
  const profiles = await getAllStyleProfiles();
  const targets = profiles.filter(p => p.naver_blog_url);
  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    onProgress?.(`[${i + 1}/${total}] ${p.hospital_name} 크롤링 중...`, i, total);

    // DB에 쉼표로 결합된 다중 URL 대응
    const blogUrls = (p.naver_blog_url || '').split(',').map(u => u.trim()).filter(Boolean);

    try {
      const allPosts: { url: string; content: string; title?: string; publishedAt?: string; summary?: string; thumbnail?: string }[] = [];

      for (const blogUrl of blogUrls) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/naver/crawl-hospital-blog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogUrl, maxPosts: 5 }),
          });
          if (!res.ok) continue;
          const crawlData = await res.json() as any;
          allPosts.push(...(crawlData.posts || []));
        } catch (urlErr) {
          console.warn(`[CrawlAll] ${p.hospital_name} URL 실패:`, blogUrl, urlErr);
        }
      }

      for (const post of allPosts) {
        onProgress?.(`[${i + 1}/${total}] ${p.hospital_name} 채점 중...`, i, total);
        const meta = { title: post.title, publishedAt: post.publishedAt, summary: post.summary, thumbnail: post.thumbnail };
        try {
          const score = await scoreCrawledPost(post.content);
          await saveCrawledPost(p.hospital_name, post.url, post.content, score, meta);
        } catch {
          await saveCrawledPost(p.hospital_name, post.url, post.content, undefined, meta);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.warn(`${p.hospital_name} 크롤링 실패:`, e);
    }
  }
  onProgress?.('전체 완료!', total, total);
};
