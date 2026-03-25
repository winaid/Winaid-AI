/**
 * 병원 말투 학습 서비스 — Supabase CRUD + 크롤러 + Gemini 분석 + 채점
 *
 * old app writingStyleService.ts에서 이식.
 */
import { supabase } from './supabase';
import type { CrawledPostScore, DBCrawledPost } from './types';

// ── 타입 ──

export interface AnalyzedStyle {
  tone: string;
  sentenceEndings: string[];
  vocabulary: string[];
  structure: string;
  emotionLevel: 'low' | 'medium' | 'high';
  formalityLevel: 'casual' | 'neutral' | 'formal';
  speakerIdentity?: string;
  readerDistance?: string;
  sentenceRhythm?: string;
  paragraphFlow?: string;
  persuasionStyle?: string;
  uniqueExpressions?: string[];
  bannedGenericStyle?: string[];
  oneLineSummary?: string;
  goodExamples?: string[];
  badExamples?: string[];
}

export interface LearnedWritingStyle {
  id: string;
  name: string;
  description: string;
  sampleText: string;
  analyzedStyle: AnalyzedStyle;
  stylePrompt: string;
  createdAt: string;
}

export interface HospitalStyleProfile {
  id?: string;
  hospital_name: string;
  team_id?: number;
  naver_blog_url?: string;
  crawled_posts_count?: number;
  style_profile?: LearnedWritingStyle | null;
  raw_sample_text?: string;
  last_crawled_at?: string;
}

// ── Supabase CRUD ──

export async function getAllStyleProfiles(): Promise<HospitalStyleProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('hospital_style_profiles')
    .select('id, hospital_name, team_id, naver_blog_url, crawled_posts_count, last_crawled_at, style_profile')
    .order('team_id', { ascending: true });
  if (error || !data) return [];
  return data as HospitalStyleProfile[];
}

// ── 콘텐츠 생성 시 말투 프롬프트 조회 (old getHospitalStylePromptForGeneration 이식) ──

const styleProfileCache: Record<string, HospitalStyleProfile | null> = {};

export async function getHospitalStylePrompt(hospitalName: string): Promise<string | null> {
  if (!supabase || !hospitalName) return null;

  if (!(hospitalName in styleProfileCache)) {
    const { data, error } = await supabase
      .from('hospital_style_profiles')
      .select('style_profile')
      .eq('hospital_name', hospitalName)
      .limit(1);
    if (error || !data || data.length === 0) {
      styleProfileCache[hospitalName] = null;
    } else {
      styleProfileCache[hospitalName] = data[0] as HospitalStyleProfile;
    }
  }

  const profile = styleProfileCache[hospitalName];
  if (!profile?.style_profile) return null;

  const style = profile.style_profile as LearnedWritingStyle;
  const as_ = style.analyzedStyle;
  if (!as_) return null;

  // 의료광고법 금지 표현 필터
  const PROHIBITED = [
    '방문하세요', '내원하세요', '예약하세요', '문의하세요', '상담하세요',
    '오세요', '완치', '최고', '유일', '특효', '1등', '최고급', '100%', '확실', '보장', '반드시',
  ];
  const filterProhibited = (words: string[]) =>
    words.filter(w => !PROHIBITED.some(p => w.toLowerCase().includes(p.toLowerCase())));

  const safeVocabulary = filterProhibited(as_.vocabulary || []);
  const safeSentenceEndings = filterProhibited(as_.sentenceEndings || []);
  const safeUniqueExpressions = filterProhibited(as_.uniqueExpressions || []);

  const deepBlock = as_.speakerIdentity ? `
[화자 캐릭터]
- 정체성: ${as_.speakerIdentity || '미분석'}
- 독자와의 거리감: ${as_.readerDistance || '미분석'}
- 설득 방식: ${as_.persuasionStyle || '미분석'}

[문장·문단 DNA]
- 리듬: ${as_.sentenceRhythm || '미분석'}
- 전개 구조: ${as_.paragraphFlow || '미분석'}
- 고유 표현: ${safeUniqueExpressions.length > 0 ? safeUniqueExpressions.join(', ') : '미분석'}

[한 줄 정의] ${as_.oneLineSummary || style.description}

[이 병원다운 문장 — 참고]
${(as_.goodExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}

[이 병원답지 않은 문장 — 절대 금지]
${(as_.badExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}
` : '';

  const bannedBlock = (as_.bannedGenericStyle || []).length > 0
    ? `\n[이 병원 글에서 금지할 범용 표현]\n${as_.bannedGenericStyle!.map(b => `- ${b}`).join('\n')}\n`
    : '';

  return `[병원 고유 문체: ${style.name}]
너는 이 병원의 편집자다. 어미 몇 개를 흉내 내는 것이 아니라,
화자의 태도·상담 방식·설명 습관·설득 구조를 재현하라.

[기본 톤]
- 어조: ${as_.tone}
- 격식: ${as_.formalityLevel === 'formal' ? '격식체' : as_.formalityLevel === 'casual' ? '편한 말투' : '중립적'}
- 감정 표현: ${as_.emotionLevel === 'high' ? '풍부하게' : as_.emotionLevel === 'medium' ? '적당히' : '절제하여'}
- 문장 끝 패턴: ${safeSentenceEndings.join(', ')}
- 자주 쓰는 표현: ${safeVocabulary.join(', ')}
- 글 구조: ${as_.structure}
${deepBlock}${bannedBlock}
[글 작성 전 자가점검]
1. 이 문단의 화자가 실제 상담실/진료실에서 말하는 것처럼 읽히는가?
2. 병원명을 가려도 이 병원 톤으로 느껴지는가?
3. 같은 어미가 3회 이상 연속 반복되지 않았는가?

[AI 냄새 제거 + 의료법 준수]
- "~가 핵심입니다" / "기억하세요" / "중요한 것은" → 삭제
- '방문하세요', '예약하세요', '상담하세요' → "고려해 보실 수 있습니다"
- '완치', '최고', '보장', '확실' → 과대광고 금지`;
}

export async function saveHospitalBlogUrl(
  hospitalName: string,
  teamId: number,
  blogUrl: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase 미설정');
  const { error } = await (supabase.from('hospital_style_profiles') as any).upsert(
    {
      hospital_name: hospitalName,
      team_id: teamId,
      naver_blog_url: blogUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'hospital_name' },
  );
  if (error) throw new Error(`URL 저장 실패: ${error.message}`);
}

export async function resetHospitalCrawlData(
  hospitalName: string,
): Promise<{ deletedPosts: number; profileDeleted: boolean; errors: string[] }> {
  const errors: string[] = [];

  // 1. 크롤링 글 삭제
  const postResult = await deleteAllCrawledPosts(hospitalName);
  if (postResult.error) errors.push(`글 삭제: ${postResult.error}`);

  // 2. 말투 프로파일 삭제
  const profileResult = await deleteHospitalStyleProfile(hospitalName);
  if (profileResult.error) errors.push(`프로파일 삭제: ${profileResult.error}`);

  return {
    deletedPosts: postResult.deleted,
    profileDeleted: profileResult.success,
    errors,
  };
}

// ── 크롤링 + 학습 ──

const CRAWLER_URL = process.env.NEXT_PUBLIC_CRAWLER_URL || '';

/**
 * 크롤러 엔드포인트 URL 결정.
 * 네이버 블로그는 서버사이드 fetch를 차단(403)하므로
 * 반드시 Puppeteer 기반 외부 크롤러(crawler-server/)가 필요하다.
 * NEXT_PUBLIC_CRAWLER_URL이 미설정이면 에러를 던진다.
 */
function getCrawlerBaseUrl(): string {
  if (CRAWLER_URL) return CRAWLER_URL;
  throw new Error(
    '크롤러 서버 URL이 설정되지 않았습니다.\n' +
    '네이버 블로그는 서버사이드 fetch를 차단하므로 Puppeteer 기반 크롤러가 필요합니다.\n\n' +
    '1. crawler-server/를 Railway에 배포하세요 (DEPLOY_GUIDE.md 참조)\n' +
    '2. Vercel Dashboard → Settings → Environment Variables에서\n' +
    '   NEXT_PUBLIC_CRAWLER_URL = https://your-crawler.railway.app\n' +
    '   을 추가하세요.',
  );
}

/** 서버사이드(cron 등)에서도 /api/* 상대경로를 절대 URL로 resolve */
function resolveApiUrl(path: string): string {
  if (typeof window !== 'undefined') return path; // 브라우저: 상대경로 OK
  const base = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${base}${path}`;
}

interface CrawledPost {
  url: string;
  content: string;
  title?: string;
  publishedAt?: string;
  summary?: string;
  thumbnail?: string;
}

export async function crawlAndLearnHospitalStyle(
  hospitalName: string,
  teamId: number,
  blogUrls: string[],
  onProgress?: (msg: string) => void,
): Promise<{ posts: CrawledPost[] }> {
  // 1단계: 모든 URL에서 글 크롤링
  const allPosts: CrawledPost[] = [];
  const errors: string[] = [];
  const crawlerBase = getCrawlerBaseUrl();

  for (let i = 0; i < blogUrls.length; i++) {
    const urlLabel = blogUrls.length > 1 ? ` (${i + 1}/${blogUrls.length})` : '';
    onProgress?.(`블로그 글 수집 중${urlLabel}... (최대 5개)`);

    try {
      const res = await fetch(`${crawlerBase}/api/naver/crawl-hospital-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: blogUrls[i], maxPosts: 5 }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const detail = `URL ${i + 1} 크롤링 HTTP ${res.status}${errBody ? ': ' + errBody.slice(0, 100) : ''}`;
        console.error(`[styleService] ${detail}`);
        errors.push(detail);
        continue;
      }
      const data = (await res.json()) as { posts?: CrawledPost[]; message?: string; diagnostics?: string[] };
      if (data.posts && data.posts.length > 0) {
        allPosts.push(...data.posts);
        onProgress?.(`${data.posts.length}개 글 수집됨${urlLabel}`);
      } else {
        const diag = data.diagnostics?.join(', ') || '';
        errors.push(`URL ${i + 1}: 글 0건${data.message ? ' — ' + data.message : ''}${diag ? ' [' + diag + ']' : ''}`);
      }
    } catch (err) {
      const msg = (err as Error).message || '알 수 없는 오류';
      console.error(`[styleService] URL ${i + 1} 크롤링 오류:`, msg);
      errors.push(`URL ${i + 1} 네트워크 오류: ${msg.slice(0, 80)}`);
      continue;
    }
  }

  if (allPosts.length === 0) {
    const detail = errors.length > 0 ? '\n' + errors.join('\n') : '';
    throw new Error(`수집된 블로그 글이 없습니다.${detail}`);
  }

  // 2단계: 합치기 + Gemini 분석
  onProgress?.(`총 ${allPosts.length}개 글 수집 완료. 말투 분석 중...`);
  const combinedText = allPosts.map(p => p.content).join('\n\n---\n\n').slice(0, 8000);
  const analyzedStyle = await analyzeWritingStyleViaApi(combinedText, hospitalName);

  // 3단계: Supabase 저장
  onProgress?.('말투 프로파일 저장 중...');

  let dbPostCount = allPosts.length;
  try {
    if (supabase) {
      const { count } = await supabase
        .from('hospital_crawled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('hospital_name', hospitalName);
      if (count !== null) dbPostCount = count + allPosts.length;
    }
  } catch { /* ignore */ }

  if (supabase) {
    await (supabase.from('hospital_style_profiles') as any).upsert(
      {
        hospital_name: hospitalName,
        team_id: teamId,
        naver_blog_url: blogUrls.join(','),
        crawled_posts_count: dbPostCount,
        style_profile: analyzedStyle,
        raw_sample_text: combinedText.slice(0, 10000),
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hospital_name' },
    );

    // 개별 글 저장
    for (const post of allPosts) {
      const blogId = post.url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';
      await (supabase.from('hospital_crawled_posts') as any).upsert(
        {
          hospital_name: hospitalName,
          url: post.url,
          content: post.content,
          source_blog_id: blogId,
          title: post.title || '',
          published_at: post.publishedAt || null,
          summary: post.summary || post.content.slice(0, 200),
          thumbnail: post.thumbnail || null,
          crawled_at: new Date().toISOString(),
        },
        { onConflict: 'hospital_name,url' },
      );
    }
  }

  return { posts: allPosts };
}

// ── Gemini 분석 (next-app /api/gemini 경유) ──

async function analyzeWritingStyleViaApi(
  sampleText: string,
  styleName: string,
): Promise<LearnedWritingStyle> {
  // root writingStyleService.ts analyzeWritingStyle와 동일한 프롬프트
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

  // root와 동일: PRO 모델 사용 (flash-lite → 3.1-pro-preview)
  const res = await fetch(resolveApiUrl('/api/gemini'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-pro-preview',
      responseType: 'json',
    }),
  });

  if (!res.ok) {
    throw new Error('말투 분석 API 호출 실패');
  }

  const responseData = (await res.json()) as { text?: string };
  let result: Record<string, unknown>;

  try {
    // API 응답에서 JSON 추출
    let text = responseData.text || '';
    // ```json ... ``` 패턴 제거
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1];
    result = JSON.parse(text.trim());
  } catch {
    throw new Error('말투 분석 결과 파싱 실패');
  }

  return {
    id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: styleName,
    description: (result.description as string) || '',
    sampleText: sampleText.substring(0, 500),
    analyzedStyle: {
      tone: (result.tone as string) || '',
      sentenceEndings: (result.sentenceEndings as string[]) || [],
      vocabulary: (result.vocabulary as string[]) || [],
      structure: (result.structure as string) || '',
      emotionLevel: (result.emotionLevel as 'low' | 'medium' | 'high') || 'medium',
      formalityLevel: (result.formalityLevel as 'casual' | 'neutral' | 'formal') || 'neutral',
      speakerIdentity: result.speakerIdentity as string,
      readerDistance: result.readerDistance as string,
      sentenceRhythm: result.sentenceRhythm as string,
      paragraphFlow: result.paragraphFlow as string,
      persuasionStyle: result.persuasionStyle as string,
      uniqueExpressions: result.uniqueExpressions as string[],
      bannedGenericStyle: result.bannedGenericStyle as string[],
      oneLineSummary: result.oneLineSummary as string,
      goodExamples: result.goodExamples as string[],
      badExamples: result.badExamples as string[],
    },
    stylePrompt: (result.stylePrompt as string) || '',
    createdAt: new Date().toISOString(),
  };
}

// ── 채점 (scoring) — root writingStyleService.scoreCrawledPost 이식 ──

export async function scoreCrawledPost(content: string): Promise<CrawledPostScore> {
  const sliced = content.slice(0, 3000);
  const prompt = `너는 병원 블로그 글의 품질·SEO를 검수하는 전문가다.

[검수 대상 텍스트]
${sliced}

[채점 항목 4가지 — 각 100점 만점, 감점 방식]

1) score_typo (오타 점수, 100점)
- 실제 오타만 해당 (예: "임프란트"→"임플란트", "치요"→"치료")
- 건당 -10점, 최대 10건까지 보고
- ⚠️ 오타가 아닌 것: 문장 스타일/표현 차이, 문장이 짧은 것, 구어체 표현

2) score_spelling (맞춤법·띄어쓰기·문법 점수, 100점)
- 실제 맞춤법/띄어쓰기 오류만 해당 (예: "됬다"→"됐다", "해야될"→"해야 될")
- 건당 -5점, 최대 10건까지 보고
- ⚠️ 맞춤법 오류가 아닌 것:
  - 문장을 더 길게/짧게 쓰는 건 스타일 차이지 오류가 아님
  - "잇몸에 염증" → "잇몸에 염증이 생길 수 있습니다"는 문장 확장 제안이지 맞춤법 오류 아님
  - "영향" → "영향을 미칠 수 있습니다"는 스타일 제안이지 맞춤법 오류 아님
  - 완결된 문장이 아닌 것(제목, 소제목, 리스트 항목)은 오류로 잡지 않는다
  - correction이 original보다 훨씬 길면 (2배 이상) 스타일 제안일 가능성 높음 → 제외

3) score_medical_law (의료광고법 준수 점수, 100점)
- 의료법 제56조 기준
  - 제56조1항: 치료 효과 단정 ("완치", "100% 치료") → critical, -20
  - 제56조2항1호: 최고/유일 ("최고", "국내 유일") → critical, -20
  - 제56조2항2호: 타 의료기관 비교/비방 → high, -10
  - 제56조2항3호: 환자 체험기 ("OO환자 OO일만에") → high, -10
  - 제56조2항4호: 뉴스/방송 인용 ("TV에서 소개된") → medium, -5
  - 제56조2항5호: 미입증 안전 주장 ("부작용 없이") → high, -10
  - 제56조2항6호: 과장/허위 ("탁월한", "획기적인") → medium, -5

⚠️ 오탐 방지 — 반드시 문맥(context)을 확인하세요. 단어만 보고 판단 금지!
- "완치"가 들어있어도 "완치가 어렵다", "완치를 보장할 수 없다" 등 부정/주의 문맥이면 위반 아님
- "최고"가 들어있어도 "최고의 결과를 위해 노력합니다" 등 일반적 표현은 위반 아님
- 지역명+병원/치과 조합은 위반 아님 (예: "강서구인근치과", "광화문 치과", "OO역 치과")
- SEO 키워드 (지역+시술 조합)는 위반 아님 (예: "강남 임플란트")
- 병원 상호명, 진료과목 나열, 진료시간/위치/주차 등 사실 정보는 위반 아님
- "~에 도움이 됩니다", "~할 수 있습니다" 같은 완화된 표현은 위반 아님
- 위반 여부는 해당 문장 전체 맥락에서 판단. 단어 단독 매칭 절대 금지

⚠️ 대체어(replacement) 작성 규칙:
- 원문의 말투와 분위기를 최대한 유지하세요
- AI스러운 딱딱한 표현 금지 (예: "증상 개선에 도움을 드릴 수 있습니다" ← 이런 거 금지)
- 블로그 글이니까 자연스럽고 읽기 편한 표현으로 제안
- 예시: "획기적인 치료" → "효과적인 치료", "완치됩니다" → "나을 수 있어요", "최고의 기술" → "검증된 기술"

4) score_naver_seo (네이버 블로그 SEO 점수, 100점)
네이버 C-Rank + D.I.A 알고리즘 기준 (2025~2026):
- 글자 수: 1500자 미만 -15 (네이버 최적 1500~2000자)
- 키워드 배치: 제목+본문에 핵심 키워드 4~6회 자연 반복이 적정. 2회 미만 -10, 10회 이상(키워드 스터핑) -15
- 소제목 구조: 소제목(h2/h3) 없음 -15, 3개 미만 -10 (구조화된 글 우대)
- 문단 가독성: 300자 이상 연속 문단 -10 (모바일 가독성)
- 경험/전문성: 구체적 경험·사례·수치 없이 일반론만 -15 (D.I.A는 경험 기반 콘텐츠 우대)
- 이미지: 이미지 없는 글 -10, 상위노출 글 평균 이미지 3~5장
- CTA/행동유도: 상담 안내, 예약, 연락처 등 없으면 -5
- 주제 일관성: 글의 주제가 제목과 불일치하면 -10 (C-Rank 주제 전문성)

[출력 형식] JSON만 출력. 설명 없이.
{
  "score_typo": 숫자,
  "score_spelling": 숫자,
  "score_medical_law": 숫자,
  "score_naver_seo": 숫자,
  "score_total": (네 점수 평균, 반올림),
  "typo_issues": [{"original":"틀린표현","correction":"올바른표현","context":"문맥","type":"typo 또는 spelling"}],
  "law_issues": [{"word":"위반표현","severity":"critical/high/medium/low","replacement":["대체표현"],"context":"문맥","law_article":"제56조N항"}],
  "seo_issues": [{"item":"항목명","score":감점점수,"reason":"감점 사유"}]
}`;

  const res = await fetch(resolveApiUrl('/api/gemini'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      temperature: 0.1,
      responseType: 'json',
      timeout: 60000,
    }),
  });

  if (!res.ok) throw new Error('채점 API 호출 실패');

  const data = (await res.json()) as { text?: string };
  let parsed: Record<string, unknown>;
  try {
    let text = data.text || '';
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1];
    parsed = JSON.parse(text.trim());
  } catch {
    throw new Error('채점 결과 파싱 실패');
  }

  let typo_issues = (parsed.typo_issues as CrawledPostScore['typo_issues']) || [];
  let law_issues = (parsed.law_issues as CrawledPostScore['law_issues']) || [];
  const seo_issues = (parsed.seo_issues as CrawledPostScore['seo_issues']) || [];

  // ── 후처리 필터: 오탐 제거 ──

  // 맞춤법/오타: correction이 original보다 2배 이상 길면 스타일 제안 → 제거
  typo_issues = typo_issues.filter(issue => {
    const origLen = (issue.original || '').length;
    const corrLen = (issue.correction || '').length;
    if (origLen > 0 && corrLen > origLen * 2) return false;
    // original과 correction이 거의 같으면 제거 (띄어쓰기만 다른 경우 제외)
    if (issue.original.replace(/\s/g, '') === issue.correction.replace(/\s/g, '')) return false;
    return true;
  });

  // 의료법: 오탐 제거
  const safeLawWordPatterns = [/인근/, /근처/, /주변/, /역\s*치과/, /구\s*치과/, /동\s*치과/];
  const negativeContextPatterns = [/어렵/, /불가/, /없습니다/, /않습니다/, /아닙니다/, /주의/, /위험/, /수 있/];
  // 기술/시스템/방식 설명에 쓰이는 단어는 치료 효과 단정이 아님
  const techDescPatterns = [/시스템/, /방식/, /기술/, /장비/, /장치/, /프로그램/, /설계/, /소재/];
  law_issues = law_issues.filter(issue => {
    const ctx = (issue.context || '');
    const word = (issue.word || '');
    // 지역명+치과 패턴은 무조건 제거
    if (safeLawWordPatterns.some(p => p.test(word))) return false;
    // 부정/완화 문맥이면 제거 (예: "완치가 어렵다", "~할 수 있습니다")
    if (negativeContextPatterns.some(p => p.test(ctx))) return false;
    // "혁신적인/획기적인" + 시스템/방식/기술 문맥이면 제거
    if (/혁신|획기/.test(word) && techDescPatterns.some(p => p.test(ctx))) return false;
    // severity가 medium이고 context에 구체적 기술/방법론 설명이 있으면 제거
    if (issue.severity === 'medium' && techDescPatterns.some(p => p.test(ctx))) return false;
    return true;
  });

  // 필터 후 점수 재계산
  const typoCount = typo_issues.filter(i => i.type === 'typo' || !i.type).length;
  const spellingCount = typo_issues.filter(i => i.type === 'spelling').length;
  const recalcTypo = Math.max(0, 100 - typoCount * 10);
  const recalcSpelling = Math.max(0, 100 - spellingCount * 5);
  // 필터 후 이슈가 0건이면 100점, 아니면 이슈 수 기반으로 재계산
  const rawLawIssueCount = (parsed.law_issues as CrawledPostScore['law_issues'])?.length ?? 0;
  const recalcLaw = law_issues.length === 0
    ? 100
    : rawLawIssueCount > law_issues.length
      ? Math.min(100, Math.max(0, Math.min(100, Number(parsed.score_medical_law) || 100) + (rawLawIssueCount - law_issues.length) * 10))
      : Math.max(0, Math.min(100, Number(parsed.score_medical_law) || 100));

  const scores = {
    score_typo: recalcTypo,
    score_spelling: recalcSpelling,
    score_medical_law: recalcLaw,
    score_naver_seo: Math.max(0, Math.min(100, Number(parsed.score_naver_seo) || 100)),
    score_total: 0,
    typo_issues,
    law_issues,
    seo_issues,
  };
  scores.score_total = Math.round((scores.score_typo + scores.score_spelling + scores.score_medical_law + scores.score_naver_seo) / 4);
  return scores;
}

// ── DB 크롤링 글 CRUD ──

export async function getCrawledPosts(hospitalName: string): Promise<DBCrawledPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .eq('hospital_name', hospitalName)
    .order('published_at', { ascending: false });
  if (error || !data) return [];
  return data as DBCrawledPost[];
}

export async function getAllCrawledPostsSummary(): Promise<Record<string, DBCrawledPost[]>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .select('*')
    .order('published_at', { ascending: false });
  if (error || !data) return {};
  const grouped: Record<string, DBCrawledPost[]> = {};
  for (const row of data as DBCrawledPost[]) {
    if (!grouped[row.hospital_name]) grouped[row.hospital_name] = [];
    grouped[row.hospital_name].push(row);
  }
  return grouped;
}

export async function updateCrawledPostScore(id: string, score: CrawledPostScore): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('hospital_crawled_posts')
    .update({
      score_typo: score.score_typo,
      score_spelling: score.score_spelling,
      score_medical_law: score.score_medical_law,
      score_naver_seo: score.score_naver_seo,
      score_total: score.score_total,
      typo_issues: score.typo_issues,
      law_issues: score.law_issues,
      seo_issues: score.seo_issues,
      scored_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function updateCrawledPostContent(id: string, correctedContent: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('hospital_crawled_posts')
    .update({ corrected_content: correctedContent })
    .eq('id', id);
}

/** 크롤링 글 단건 저장/upsert (root saveCrawledPost 이식) */
export async function saveCrawledPost(
  hospitalName: string,
  url: string,
  content: string,
  score?: CrawledPostScore,
  meta?: { title?: string; publishedAt?: string; summary?: string; thumbnail?: string },
): Promise<DBCrawledPost | null> {
  if (!supabase) return null;

  const blogId = url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';
  const record: Record<string, unknown> = {
    hospital_name: hospitalName,
    url,
    content,
    source_blog_id: blogId,
    crawled_at: new Date().toISOString(),
  };
  if (meta?.title) record.title = meta.title;
  if (meta?.publishedAt) record.published_at = meta.publishedAt;
  if (meta?.summary) record.summary = meta.summary;
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
  const { data, error } = await (supabase
    .from('hospital_crawled_posts') as any)
    .upsert(record, { onConflict: 'hospital_name,url' })
    .select()
    .single();
  if (!error && data) return data as DBCrawledPost;

  // 2차 시도: source_blog_id 컬럼이 없을 수 있으므로 제외
  if (error) {
    const { source_blog_id: _removed, ...recordWithout } = record;
    void _removed;
    const { data: d2, error: e2 } = await (supabase
      .from('hospital_crawled_posts') as any)
      .upsert(recordWithout, { onConflict: 'hospital_name,url' })
      .select()
      .single();
    if (!e2 && d2) return d2 as DBCrawledPost;
  }

  return null;
}

/** 특정 병원의 크롤링 글 전체 삭제 (root deleteAllCrawledPosts 이식) */
export async function deleteAllCrawledPosts(
  hospitalName: string,
): Promise<{ deleted: number; error?: string }> {
  if (!supabase) return { deleted: 0, error: 'Supabase 미설정' };

  const { data, error } = await supabase
    .from('hospital_crawled_posts')
    .delete()
    .eq('hospital_name', hospitalName)
    .select('id');

  if (error) {
    console.warn('크롤링 글 삭제 실패:', error.message);
    return { deleted: 0, error: error.message };
  }
  const count = Array.isArray(data) ? data.length : 0;
  return { deleted: count };
}

/** 특정 병원의 말투 프로파일만 삭제 (root deleteHospitalStyleProfile 이식) */
export async function deleteHospitalStyleProfile(
  hospitalName: string,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 미설정' };

  const { error } = await supabase
    .from('hospital_style_profiles')
    .delete()
    .eq('hospital_name', hospitalName);

  if (error) {
    console.warn('말투 프로파일 삭제 실패:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function crawlAndScoreAllHospitals(
  onProgress?: (msg: string, done: number, total: number) => void,
  options?: { includeStyleAnalysis?: boolean },
): Promise<void> {
  const includeStyle = options?.includeStyleAnalysis ?? false;
  const crawlerBase = getCrawlerBaseUrl();

  // DB 프로필 + teamData 병합하여 URL이 있는 병원 목록 구성
  const profiles = await getAllStyleProfiles();
  const profileMap = new Map(profiles.map(p => [p.hospital_name, p]));

  // DB에서 팀/병원 로드 (fallback: teamData.ts)
  const { getTeamDataFromDB } = await import('./hospitalService');
  const TEAM_DATA = await getTeamDataFromDB();
  const hospitalUrls: { name: string; teamId: number; urls: string[] }[] = [];
  const seen = new Set<string>();

  for (const team of TEAM_DATA) {
    for (const h of team.hospitals) {
      const baseName = h.name.replace(/ \(.*\)$/, '');
      const profile = profileMap.get(baseName);
      const dbUrls = profile?.naver_blog_url?.split(',').map(u => u.trim()).filter(Boolean);
      const teamUrls = h.naverBlogUrls?.filter(Boolean);
      const newUrls = (dbUrls && dbUrls.length > 0) ? dbUrls : (teamUrls || []);

      if (seen.has(baseName)) {
        // 중복 병원 — URL 합침 (이미 hospitalUrls에 있으면 추가, 없으면 새로 생성)
        const existing = hospitalUrls.find(x => x.name === baseName);
        if (existing) {
          for (const u of newUrls) {
            if (!existing.urls.includes(u)) existing.urls.push(u);
          }
        } else if (newUrls.length > 0) {
          hospitalUrls.push({ name: baseName, teamId: team.id, urls: [...newUrls] });
        }
        continue;
      }
      seen.add(baseName);

      if (newUrls.length > 0) {
        hospitalUrls.push({ name: baseName, teamId: team.id, urls: [...newUrls] });
      }
    }
  }

  const total = hospitalUrls.length;
  if (total === 0) {
    throw new Error('크롤링할 병원이 없습니다. 블로그 URL을 먼저 설정하세요.');
  }

  // ── 한 병원 처리 함수 ──
  async function processHospital(
    hospital: { name: string; teamId: number; urls: string[] },
    index: number,
  ) {
    const { name, teamId, urls } = hospital;
    const allContents: string[] = [];
    let totalPostsForHospital = 0;

    // 1) 각 URL별 최대 5개씩 크롤링 + 채점
    for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
      const urlLabel = urls.length > 1 ? ` URL ${urlIdx + 1}/${urls.length}` : '';
      onProgress?.(`${name}${urlLabel} 크롤링 중...`, index, total);

      let posts: { url: string; content: string; title?: string; publishedAt?: string; summary?: string; thumbnail?: string }[] = [];
      try {
        const res = await fetch(`${crawlerBase}/api/naver/crawl-hospital-blog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogUrl: urls[urlIdx], maxPosts: 5 }),
        });
        if (!res.ok) {
          onProgress?.(`${name}${urlLabel} 크롤링 실패 (${res.status})`, index, total);
          continue;
        }
        const data = (await res.json()) as { posts?: typeof posts };
        posts = data.posts || [];
      } catch (err) {
        onProgress?.(`${name}${urlLabel} 크롤링 오류: ${(err as Error).message?.slice(0, 50)}`, index, total);
        continue;
      }

      if (posts.length === 0) continue;
      totalPostsForHospital += posts.length;

      // 채점 + DB 저장
      for (let pi = 0; pi < posts.length; pi++) {
        const post = posts[pi];
        allContents.push(post.content);
        onProgress?.(`${name}${urlLabel} 채점 ${pi + 1}/${posts.length}`, index, total);
        try {
          const score = await scoreCrawledPost(post.content);
          const blogId = post.url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || '';
          if (supabase) {
            await (supabase.from('hospital_crawled_posts') as any).upsert(
              {
                hospital_name: name,
                url: post.url,
                content: post.content,
                source_blog_id: blogId,
                title: post.title || '',
                published_at: post.publishedAt || null,
                summary: post.summary || post.content.slice(0, 200),
                thumbnail: post.thumbnail || null,
                crawled_at: new Date().toISOString(),
                score_typo: score.score_typo,
                score_spelling: score.score_spelling,
                score_medical_law: score.score_medical_law,
                score_naver_seo: score.score_naver_seo,
                score_total: score.score_total,
                typo_issues: score.typo_issues,
                law_issues: score.law_issues,
                seo_issues: score.seo_issues,
                scored_at: new Date().toISOString(),
              },
              { onConflict: 'hospital_name,url' },
            );
          }
        } catch {
          // 개별 글 채점 실패 → 건너뜀
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // 2) 말투 분석 (옵션 ON + 수집된 글이 있을 때만)
    let analyzedStyle: LearnedWritingStyle | null = null;
    if (includeStyle && allContents.length > 0) {
      onProgress?.(`${name} 말투 분석 중...`, index, total);
      try {
        const combinedText = allContents.join('\n\n---\n\n').slice(0, 8000);
        analyzedStyle = await analyzeWritingStyleViaApi(combinedText, name);
      } catch {
        onProgress?.(`${name} 말투 분석 실패 (채점은 완료)`, index, total);
      }
    }

    // 3) 병원 프로필 업데이트
    if (totalPostsForHospital > 0 && supabase) {
      const profileData: Record<string, unknown> = {
        hospital_name: name,
        team_id: teamId,
        naver_blog_url: urls.join(','),
        crawled_posts_count: totalPostsForHospital,
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (analyzedStyle) {
        profileData.style_profile = analyzedStyle;
        profileData.raw_sample_text = allContents.join('\n\n---\n\n').slice(0, 10000);
      }
      await (supabase.from('hospital_style_profiles') as any).upsert(
        profileData,
        { onConflict: 'hospital_name' },
      );
    }

    onProgress?.(`${name} 완료 (${totalPostsForHospital}개 글${analyzedStyle ? ' + 말투 분석' : ''})`, index, total);
  }

  // ── 3개씩 배치 병렬 처리 ──
  const BATCH_SIZE = 3;
  let doneCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = hospitalUrls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((h, j) => processHospital(h, i + j))
    );

    for (let j = 0; j < results.length; j++) {
      doneCount++;
      if (results[j].status === 'rejected') {
        const err = (results[j] as PromiseRejectedResult).reason;
        onProgress?.(`${batch[j].name} 실패: ${(err as Error).message?.slice(0, 60)}`, doneCount - 1, total);
      }
    }
  }

  onProgress?.('전체 완료!', total, total);
}
