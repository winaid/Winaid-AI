/**
 * 병원 말투 학습 서비스 — Supabase CRUD + 크롤러 + Gemini 분석
 *
 * old app writingStyleService.ts에서 핵심만 이식.
 * 채점(scoring) 관련은 다음 턴에서 추가.
 */
import { supabase } from './supabase';

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
  if (!supabase) return { deletedPosts: 0, profileDeleted: false, errors: ['Supabase 미설정'] };
  const errors: string[] = [];

  // 크롤링 글 삭제
  let deletedPosts = 0;
  const { error: postErr } = await supabase
    .from('hospital_crawled_posts')
    .delete()
    .eq('hospital_name', hospitalName);
  if (postErr) errors.push(`글 삭제: ${postErr.message}`);
  else deletedPosts = 1; // 삭제 성공 (정확한 수는 미반환)

  // 프로파일 삭제
  let profileDeleted = false;
  const { error: profErr } = await supabase
    .from('hospital_style_profiles')
    .delete()
    .eq('hospital_name', hospitalName);
  if (profErr) errors.push(`프로파일 삭제: ${profErr.message}`);
  else profileDeleted = true;

  return { deletedPosts, profileDeleted, errors };
}

// ── 크롤링 + 학습 ──

const CRAWLER_URL = process.env.NEXT_PUBLIC_CRAWLER_URL || '';

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

  for (let i = 0; i < blogUrls.length; i++) {
    const urlLabel = blogUrls.length > 1 ? ` (${i + 1}/${blogUrls.length})` : '';
    onProgress?.(`블로그 글 수집 중${urlLabel}... (최대 5개)`);

    try {
      const res = await fetch(`${CRAWLER_URL}/api/naver/crawl-hospital-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: blogUrls[i], maxPosts: 5 }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { posts?: CrawledPost[] };
      if (data.posts) allPosts.push(...data.posts);
    } catch {
      continue;
    }
  }

  if (allPosts.length === 0) {
    throw new Error('수집된 블로그 글이 없습니다. URL을 다시 확인해주세요.');
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
  const prompt = `너는 단순히 기존 글의 문장 끝맺음을 흉내 내는 사람이 아니라,
해당 병원 고유의 화자 캐릭터, 상담 방식, 설명 습관, 설득 구조를 추출해
그 문체를 재현하는 편집자 역할을 수행한다.

[분석할 텍스트]
${sampleText.substring(0, 5000)}

[중요 원칙]
- 표면적인 어미나 표현 몇 개만 모방하지 말 것
- 반드시 화자의 태도, 환자와의 거리감, 설명 흐름, 설득 구조까지 분석할 것
- 업종 공통 블로그 말투로 평준화하지 말 것
- 실제 상담실/진료실에서 나올 법한 문장인지 기준으로 판단할 것
- 근거가 약한 해석은 단정하지 말고 가능성으로 표시할 것
- 반복적으로 확인되는 특징만 "이 병원 고유 문체"로 정의할 것

[분석 항목 — 7가지]
1. 화자의 정체성 (speakerIdentity)
2. 독자와의 거리감 (readerDistance)
3. 문장 리듬 (sentenceRhythm)
4. 문단 전개 구조 (paragraphFlow)
5. 설득 방식 (persuasionStyle)
6. 고유 표현 습관 (uniqueExpressions)
7. 금지해야 할 범용 문체 (bannedGenericStyle)

[출력 형식]
반드시 아래 JSON으로만 답변. 설명 텍스트 없이 JSON만 출력.
{
  "tone": "전체적인 어조 설명 (2-3문장)",
  "sentenceEndings": ["자주 쓰는 문장 끝 패턴 5-8개"],
  "vocabulary": ["이 병원 고유의 특징적 단어/표현 5-10개"],
  "structure": "글 구조 설명",
  "emotionLevel": "low/medium/high",
  "formalityLevel": "casual/neutral/formal",
  "speakerIdentity": "화자 정체성 분석",
  "readerDistance": "독자와의 거리감 분석",
  "sentenceRhythm": "문장 리듬 분석",
  "paragraphFlow": "문단 전개 구조 분석",
  "persuasionStyle": "설득 방식 분석",
  "uniqueExpressions": ["고유 표현 5-10개"],
  "bannedGenericStyle": ["금지할 범용 표현 5-8개"],
  "oneLineSummary": "이 병원 문체를 한 줄로 정의",
  "goodExamples": ["이 병원다운 문장 예시 5개"],
  "badExamples": ["이 병원답지 않은 문장 예시 5개"],
  "description": "이 말투를 한 줄로 설명",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 사용할 핵심 지침 (100-200자)"
}`;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-2.5-flash-preview-05-20',
      temperature: 0.3,
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
