import { GoogleGenAI, Type } from "@google/genai";
import { LearnedWritingStyle, CrawledPost, CrawledPostScore } from "../types";
import { supabase } from "../lib/supabase";
import { getApiKey } from "./apiKeyManager";

const GEMINI_MODEL = {
  PRO: 'gemini-3.1-pro-preview',
  FLASH: 'gemini-3.1-flash-lite-preview',
} as const;

const getAiClient = () => {
  const apiKey = localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error("API Key가 설정되지 않았습니다.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * 이미지에서 텍스트 추출 (OCR)
 */
export const extractTextFromImage = async (base64Image: string): Promise<string> => {
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL.PRO,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: base64Image.includes('png') ? 'image/png' : 'image/jpeg',
                data: base64Image.split(',')[1]
              }
            },
            {
              text: `이 이미지에서 모든 텍스트를 추출해주세요.

[요구사항]
1. 이미지에 보이는 모든 한국어/영어 텍스트를 그대로 추출
2. 줄바꿈과 단락 구분 유지
3. 블로그 글, 카드뉴스, 게시물 등의 텍스트 추출
4. 메뉴, 버튼, UI 요소 텍스트는 제외하고 본문 내용만 추출
5. 텍스트만 출력하세요. 설명이나 부가 내용 없이!

추출된 텍스트:`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "text/plain"
      }
    });
    
    return response.text?.trim() || '';
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
  const ai = getAiClient();
  
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
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL.PRO,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64
              }
            },
            {
              text: `이 문서에서 모든 텍스트를 추출해주세요.

[요구사항]
1. 문서에 있는 모든 한국어/영어 텍스트를 그대로 추출
2. 줄바꿈과 단락 구분 유지
3. 헤더, 푸터, 페이지 번호 등은 제외
4. 본문 내용만 추출
5. 텍스트만 출력하세요. 설명이나 부가 내용 없이!

추출된 텍스트:`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "text/plain"
      }
    });
    
    return response.text?.trim() || '';
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
  const ai = getAiClient();
  
  const prompt = `당신은 블로그 글의 말투와 어조를 분석하는 전문가입니다.

[분석할 텍스트]
${sampleText.substring(0, 3000)}

[미션]
위 텍스트의 말투, 어조, 문체 특징을 상세히 분석해주세요.
특히 글의 시선 방향과 독자와의 관계 설정 방식에 주목합니다.

[분석 항목]
1. tone: 전체적인 어조 (예: "친근하고 따뜻한", "전문적이면서 편안한", "관찰자적", "대화하듯")
2. sentenceEndings: 자주 사용하는 문장 끝 패턴 (예: ["~요", "~죠?", "~거든요", "~더라고요", "~합니다"])
3. vocabulary: 특징적인 단어나 표현 5-10개 (예: ["사실", "근데", "진짜", "그렇죠?", "~인 편이에요"])
4. structure: 글 구조 특징
   - TYPE A (에세이형): "관찰 → 해석 → 정리" 흐름, 여백 있음, 열린 마무리
   - TYPE B (정보 전달형): "핵심 → 근거 → 적용" 흐름, 명확한 정보 전달
5. emotionLevel: 감정 표현 정도 ("low"=절제된, "medium"=적당한, "high"=풍부한)
   - 감정이 정보 전달의 도구로만 사용되는지, 자연스러운 공감인지 구분
6. formalityLevel: 격식 수준 ("casual"=편한, "neutral"=중립, "formal"=격식)
7. styleType: 글 유형 ("essay"=에세이형/관찰→해석→정리, "informative"=정보전달형/전문칼럼)
8. readerRelation: 독자와의 관계 ("companion"=함께 생각하는 동료, "guide"=안내자, "expert"=전문가)

[출력 형식]
JSON으로 답변해주세요:
{
  "tone": "어조 설명",
  "sentenceEndings": ["끝말 1", "끝말 2", ...],
  "vocabulary": ["단어1", "단어2", ...],
  "structure": "구조 설명 (TYPE A/B 중 어느 쪽에 가까운지 명시)",
  "emotionLevel": "low/medium/high",
  "formalityLevel": "casual/neutral/formal",
  "styleType": "essay/informative",
  "readerRelation": "companion/guide/expert",
  "description": "이 말투를 한 줄로 설명 (시선 방향과 독자 관계 포함)",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 사용할 프롬프트 (50-100자, 핵심 특징 + AI 냄새 제거 포인트)"
}`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL.PRO,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
            description: { type: Type.STRING },
            stylePrompt: { type: Type.STRING }
          },
          required: ["tone", "sentenceEndings", "vocabulary", "structure", "emotionLevel", "formalityLevel", "description", "stylePrompt"]
        }
      }
    });
    
    const result = JSON.parse(response.text || "{}");
    
    // LearnedWritingStyle 객체 생성
    const learnedStyle: LearnedWritingStyle = {
      id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: styleName,
      description: result.description,
      sampleText: sampleText.substring(0, 500), // 원본 샘플 일부 저장
      analyzedStyle: {
        tone: result.tone,
        sentenceEndings: result.sentenceEndings,
        vocabulary: result.vocabulary,
        structure: result.structure,
        emotionLevel: result.emotionLevel,
        formalityLevel: result.formalityLevel
      },
      stylePrompt: result.stylePrompt,
      createdAt: new Date().toISOString()
    };
    
    return learnedStyle;
  } catch (error) {
    console.error('말투 분석 실패:', error);
    throw new Error('말투 분석에 실패했습니다. 다시 시도해주세요.');
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
  
  return `[학습된 말투 스타일: ${style.name}]
- 어조: ${analyzedStyle.tone}
- 문장 끝 패턴: ${safeSentenceEndings.join(', ')}
- 자주 사용하는 표현: ${safeVocabulary.join(', ')}
- 글 구조: ${analyzedStyle.structure}
- 감정 표현: ${analyzedStyle.emotionLevel === 'high' ? '풍부하게' : analyzedStyle.emotionLevel === 'medium' ? '적당히' : '절제하여'} (정보 전달의 보조 수단으로만)
- 격식: ${analyzedStyle.formalityLevel === 'formal' ? '격식체' : analyzedStyle.formalityLevel === 'casual' ? '편한 말투' : '중립적'}

████████████████████████████████████████████████████████████████████████████████
[🎯 AI 냄새 제거 + 의료법 준수 - 최우선 적용]
████████████████████████████████████████████████████████████████████████████████

**⛔ 피해야 할 AI 패턴:**
- "~가 핵심입니다" / "기억하세요" / "중요한 것은" → 삭제
- "~수 있습니다" 2회 연속 → 1회는 "~경우도 있습니다", "~분들도 많습니다"로 변환
- 문단마다 기능이 너무 명확한 구조 → 관찰→해석→정리 흐름으로
- 모든 가능성 나열 → 대표적인 것만 언급, 여백 남기기

**⛔ 의료광고법 금지 표현:**
- '방문하세요', '예약하세요', '상담하세요' → "고려해 보실 수 있습니다"
- '완치', '최고', '보장', '확실' → 과대광고 금지
- 구체적 숫자/시간 (출처 없이) → 범주형 표현으로 대체

**✅ 사람다운 글쓰기 원칙:**
- 첫 문장: 정의/설명이 아닌 상황 묘사나 질문으로 시작
- 감정 표현: 정보 전달의 도구로만 사용, 과도한 감정 표현 자제
- 결론: 너무 깔끔하게 정리하지 않음, 독자가 끼워 넣을 여백 남기기
- 태도: "같이 생각해보자" (설득이 아닌 동행)

📌 핵심: 말투(어조)는 유지 + 구조(관찰→해석→정리) + 의료법 준수 + AI 패턴 제거
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
 */
export const crawlAndLearnHospitalStyle = async (
  hospitalName: string,
  teamId: number,
  blogUrl: string,
  onProgress?: (msg: string) => void
): Promise<HospitalStyleProfile> => {
  const API_BASE_URL = (import.meta as any).env?.VITE_CRAWLER_URL || '';

  // 1단계: 블로그 글 크롤링
  onProgress?.('블로그 글 수집 중... (최대 10개)');
  const crawlRes = await fetch(`${API_BASE_URL}/api/naver/crawl-hospital-blog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogUrl, maxPosts: 10 }),
  });

  if (!crawlRes.ok) {
    const err = await crawlRes.json().catch(() => ({}));
    throw new Error(err.message || '블로그 크롤링에 실패했습니다.');
  }

  const crawlData = await crawlRes.json();
  const posts: { url: string; content: string }[] = crawlData.posts || [];

  if (posts.length === 0) {
    throw new Error('수집된 블로그 글이 없습니다. URL을 다시 확인해주세요.');
  }

  // 2단계: 수집된 글 합치기 (최대 8000자)
  onProgress?.(`${posts.length}개 글 수집 완료. 말투 분석 중...`);
  const combinedText = posts.map(p => p.content).join('\n\n---\n\n').slice(0, 8000);

  // 3단계: Gemini로 말투 분석
  const analyzedStyle = await analyzeWritingStyle(combinedText, hospitalName);

  // 4단계: Supabase에 저장 (upsert)
  onProgress?.('말투 프로파일 저장 중...');
  const profileData = {
    hospital_name: hospitalName,
    team_id: teamId,
    naver_blog_url: blogUrl,
    crawled_posts_count: posts.length,
    style_profile: analyzedStyle,
    raw_sample_text: combinedText.slice(0, 10000),
    last_crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .upsert(profileData, { onConflict: 'hospital_name' })
    .select()
    .single();

  if (error) {
    console.error('Supabase 저장 오류:', error);
    // 저장 실패해도 분석 결과는 반환
    return { ...profileData, style_profile: analyzedStyle };
  }

  // 5단계: 개별 글을 hospital_crawled_posts에 저장 (글 목록 보기용)
  onProgress?.('수집된 글 저장 중...');
  await Promise.allSettled(
    posts.map(p => saveCrawledPost(hospitalName, p.url, p.content))
  );

  onProgress?.('완료!');
  return { ...(data as HospitalStyleProfile), posts };
};

/**
 * Supabase에서 병원 말투 프로파일 조회
 */
export const getHospitalStyleProfile = async (
  hospitalName: string
): Promise<HospitalStyleProfile | null> => {
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('*')
    .eq('hospital_name', hospitalName)
    .single();

  if (error || !data) return null;
  return data as HospitalStyleProfile;
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
  await supabase
    .from('hospital_style_profiles')
    .upsert(
      { hospital_name: hospitalName, team_id: teamId, naver_blog_url: blogUrl, updated_at: new Date().toISOString() },
      { onConflict: 'hospital_name' }
    );
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
export const scoreCrawledPost = async (content: string): Promise<CrawledPostScore> => {
  const apiKey = getApiKey() || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY_2;
  if (!apiKey) throw new Error('GEMINI_API_KEY 없음');
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `당신은 한국어 맞춤법 전문가이자 의료광고법 전문가입니다.
아래 블로그 글을 분석하여 정확히 JSON 형식으로만 응답하세요.

[분석 항목]
1. 오타/맞춤법: 띄어쓰기, 맞춤법, 오타 오류 (최대 10건)
2. 의료광고법: 완치/보장/최고/유일/호전/개선/탁월/효과적/검증된 등 금지 표현 (최대 10건)

[점수 기준]
- score_typo: 오타/맞춤법이 전혀 없으면 100점, 오류 1건당 -5점
- score_medical_law: 위반 없으면 100점, critical -20점, high -10점, medium -5점
- score_total: (score_typo + score_medical_law) / 2

[응답 JSON]
{
  "score_typo": 숫자,
  "score_medical_law": 숫자,
  "score_total": 숫자,
  "typo_issues": [{"original": "틀린 표현", "correction": "올바른 표현", "context": "앞뒤 문장"}],
  "law_issues": [{"word": "위반 표현", "severity": "critical|high|medium|low", "replacement": ["대체 표현1"], "context": "앞뒤 문장"}]
}

[분석할 글]
${content.slice(0, 3000)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL.FLASH,
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  const raw = response.text || '{}';
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    return {
      score_typo: Math.max(0, Math.min(100, parsed.score_typo ?? 100)),
      score_medical_law: Math.max(0, Math.min(100, parsed.score_medical_law ?? 100)),
      score_total: Math.max(0, Math.min(100, parsed.score_total ?? 100)),
      typo_issues: parsed.typo_issues || [],
      law_issues: parsed.law_issues || [],
    };
  } catch {
    return { score_typo: 100, score_medical_law: 100, score_total: 100, typo_issues: [], law_issues: [] };
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

/**
 * 크롤링 글을 Supabase에 저장 (upsert). 실패 시 localStorage 폴백.
 */
export const saveCrawledPost = async (
  hospitalName: string,
  url: string,
  content: string,
  score?: CrawledPostScore
): Promise<CrawledPost | null> => {
  const record: Record<string, any> = {
    hospital_name: hospitalName,
    url,
    content,
    crawled_at: new Date().toISOString(),
  };
  if (score) {
    record.score_typo = score.score_typo;
    record.score_medical_law = score.score_medical_law;
    record.score_total = score.score_total;
    record.typo_issues = score.typo_issues;
    record.law_issues = score.law_issues;
    record.scored_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .upsert(record, { onConflict: 'hospital_name,url' })
    .select()
    .single();
  if (!error && data) return data as CrawledPost;

  // Supabase 실패(401 등) → localStorage 폴백
  const all = lsGetAll();
  const existing = all.findIndex(p => p.hospital_name === hospitalName && p.url === url);
  const post: CrawledPost = { id: `ls_${Date.now()}_${Math.random()}`, ...record } as CrawledPost;
  if (existing >= 0) all[existing] = { ...all[existing], ...post };
  else all.unshift(post);
  // 병원별 최대 10개
  const byHospital = all.filter(p => p.hospital_name === hospitalName);
  const others = all.filter(p => p.hospital_name !== hospitalName);
  lsSave([...byHospital.slice(0, 10), ...others]);
  return post;
};

/**
 * 채점 결과만 업데이트
 */
export const updateCrawledPostScore = async (id: string, score: CrawledPostScore): Promise<void> => {
  const { error } = await supabase
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
  if (error) {
    // localStorage 폴백
    const all = lsGetAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...score, scored_at: new Date().toISOString() };
      lsSave(all);
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
 * 병원별 크롤링 글 조회 (최대 10개, 최신순). Supabase 실패 시 localStorage 폴백.
 */
export const getCrawledPosts = async (hospitalName: string): Promise<CrawledPost[]> => {
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .eq('hospital_name', hospitalName)
    .order('crawled_at', { ascending: false })
    .limit(10);
  if (!error && data && data.length > 0) return data as CrawledPost[];
  // Supabase 실패 또는 빈 결과 → localStorage
  return lsGetAll().filter(p => p.hospital_name === hospitalName).slice(0, 10);
};

/**
 * 전체 병원 크롤링 글 조회 → { 병원명: [글...] } 형태
 */
export const getAllCrawledPostsSummary = async (): Promise<Record<string, CrawledPost[]>> => {
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .order('crawled_at', { ascending: false });
  const posts = (!error && data && data.length > 0) ? data as CrawledPost[] : lsGetAll();
  const result: Record<string, CrawledPost[]> = {};
  for (const post of posts) {
    if (!result[post.hospital_name]) result[post.hospital_name] = [];
    if (result[post.hospital_name].length < 10) result[post.hospital_name].push(post);
  }
  return result;
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
    try {
      const res = await fetch(`${API_BASE_URL}/api/naver/crawl-hospital-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: p.naver_blog_url, maxPosts: 10 }),
      });
      if (!res.ok) continue;
      const crawlData = await res.json();
      const posts: { url: string; content: string }[] = crawlData.posts || [];

      for (const post of posts) {
        onProgress?.(`[${i + 1}/${total}] ${p.hospital_name} 채점 중...`, i, total);
        try {
          const score = await scoreCrawledPost(post.content);
          await saveCrawledPost(p.hospital_name, post.url, post.content, score);
        } catch {
          await saveCrawledPost(p.hospital_name, post.url, post.content);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.warn(`${p.hospital_name} 크롤링 실패:`, e);
    }
  }
  onProgress?.('전체 완료!', total, total);
};
