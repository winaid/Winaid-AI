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
      model: 'gemini-3.1-flash-lite-preview',
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

// ── 채점 (scoring) — root writingStyleService.scoreCrawledPost 이식 ──

export async function scoreCrawledPost(content: string): Promise<CrawledPostScore> {
  const sliced = content.slice(0, 3000);
  const prompt = `너는 병원 블로그 글의 오타·맞춤법·의료광고법 위반을 검수하는 검수 전문가다.

[검수 대상 텍스트]
${sliced}

[채점 항목 3가지 — 각 100점 만점, 감점 방식]

1) score_typo (오타 점수, 100점)
- 실제 오타만 해당 (의도적 표현은 오타 아님)
- 건당 -10점, 최대 10건까지 보고

2) score_spelling (맞춤법·띄어쓰기·문법 점수, 100점)
- 건당 -5점, 최대 10건까지 보고

3) score_medical_law (의료광고법 준수 점수, 100점)
- 의료법 제56조 기준
  - 제56조1항: 치료 효과 단정 ("완치", "100% 치료") → critical, -20
  - 제56조2항1호: 최고/유일 ("최고", "국내 유일") → critical, -20
  - 제56조2항2호: 타 의료기관 비교/비방 → high, -10
  - 제56조2항3호: 환자 체험기 ("OO환자 OO일만에") → high, -10
  - 제56조2항4호: 뉴스/방송 인용 ("TV에서 소개된") → medium, -5
  - 제56조2항5호: 미입증 안전 주장 ("부작용 없이") → high, -10
  - 제56조2항6호: 과장/허위 ("탁월한", "획기적인") → medium, -5

[출력 형식] JSON만 출력. 설명 없이.
{
  "score_typo": 숫자,
  "score_spelling": 숫자,
  "score_medical_law": 숫자,
  "score_total": (세 점수 평균, 반올림),
  "typo_issues": [{"original":"틀린표현","correction":"올바른표현","context":"문맥","type":"typo 또는 spelling"}],
  "law_issues": [{"word":"위반표현","severity":"critical/high/medium/low","replacement":["대체표현"],"context":"문맥","law_article":"제56조N항"}]
}`;

  const res = await fetch('/api/gemini', {
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

  return {
    score_typo: Math.max(0, Math.min(100, Number(parsed.score_typo) || 100)),
    score_spelling: Math.max(0, Math.min(100, Number(parsed.score_spelling) || 100)),
    score_medical_law: Math.max(0, Math.min(100, Number(parsed.score_medical_law) || 100)),
    score_total: Math.max(0, Math.min(100, Number(parsed.score_total) || 100)),
    typo_issues: (parsed.typo_issues as CrawledPostScore['typo_issues']) || [],
    law_issues: (parsed.law_issues as CrawledPostScore['law_issues']) || [],
  };
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
      score_total: score.score_total,
      typo_issues: score.typo_issues,
      law_issues: score.law_issues,
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

export async function crawlAndScoreAllHospitals(
  onProgress?: (msg: string, done: number, total: number) => void,
): Promise<void> {
  if (!CRAWLER_URL) {
    throw new Error('크롤러 서버 URL이 설정되지 않았습니다 (NEXT_PUBLIC_CRAWLER_URL)');
  }

  // DB 프로필 + teamData 병합하여 URL이 있는 병원 목록 구성
  const profiles = await getAllStyleProfiles();
  const profileMap = new Map(profiles.map(p => [p.hospital_name, p]));

  // teamData에서도 URL 수집 (DB에 없는 병원 포함)
  const { TEAM_DATA } = await import('./teamData');
  const hospitalUrls: { name: string; teamId: number; urls: string[] }[] = [];
  const seen = new Set<string>();

  for (const team of TEAM_DATA) {
    for (const h of team.hospitals) {
      const baseName = h.name.replace(/ \(.*\)$/, '');
      if (seen.has(baseName)) continue;
      seen.add(baseName);

      const profile = profileMap.get(baseName);
      // DB URL 우선, 없으면 teamData URL
      const dbUrls = profile?.naver_blog_url?.split(',').map(u => u.trim()).filter(Boolean);
      const teamUrls = h.naverBlogUrls?.filter(Boolean);
      const urls = (dbUrls && dbUrls.length > 0) ? dbUrls : (teamUrls || []);
      if (urls.length > 0) {
        hospitalUrls.push({ name: baseName, teamId: team.id, urls });
      }
    }
  }

  const total = hospitalUrls.length;
  if (total === 0) {
    throw new Error('크롤링할 병원이 없습니다. 블로그 URL을 먼저 설정하세요.');
  }

  for (let i = 0; i < total; i++) {
    const { name, teamId, urls } = hospitalUrls[i];
    const allContents: string[] = []; // 말투 분석용 본문 수집
    let totalPostsForHospital = 0;

    try {
      // 1) 각 URL별 최대 5개씩 크롤링 + 채점
      for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
        const urlLabel = urls.length > 1 ? ` URL ${urlIdx + 1}/${urls.length}` : '';
        onProgress?.(`${name}${urlLabel} 크롤링 중...`, i, total);

        let posts: { url: string; content: string; title?: string; publishedAt?: string; summary?: string; thumbnail?: string }[] = [];
        try {
          const res = await fetch(`${CRAWLER_URL}/api/naver/crawl-hospital-blog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogUrl: urls[urlIdx], maxPosts: 5 }),
          });
          if (!res.ok) {
            onProgress?.(`${name}${urlLabel} 크롤링 실패 (${res.status})`, i, total);
            continue;
          }
          const data = (await res.json()) as { posts?: typeof posts };
          posts = data.posts || [];
        } catch (err) {
          onProgress?.(`${name}${urlLabel} 크롤링 오류: ${(err as Error).message?.slice(0, 50)}`, i, total);
          continue;
        }

        if (posts.length === 0) continue;
        totalPostsForHospital += posts.length;

        // 채점 + DB 저장
        for (let pi = 0; pi < posts.length; pi++) {
          const post = posts[pi];
          allContents.push(post.content);
          onProgress?.(`${name}${urlLabel} 채점 ${pi + 1}/${posts.length}`, i, total);
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
                  score_total: score.score_total,
                  typo_issues: score.typo_issues,
                  law_issues: score.law_issues,
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

      // 2) 말투 분석 (수집된 글이 있을 때만)
      let analyzedStyle: LearnedWritingStyle | null = null;
      if (allContents.length > 0) {
        onProgress?.(`${name} 말투 분석 중...`, i, total);
        try {
          const combinedText = allContents.join('\n\n---\n\n').slice(0, 8000);
          analyzedStyle = await analyzeWritingStyleViaApi(combinedText, name);
        } catch {
          onProgress?.(`${name} 말투 분석 실패 (채점은 완료)`, i, total);
          // 말투 분석 실패해도 크롤링+채점 결과는 유지
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

      onProgress?.(`${name} 완료 (${totalPostsForHospital}개 글${analyzedStyle ? ' + 말투 분석' : ''})`, i, total);
    } catch (err) {
      onProgress?.(`${name} 실패: ${(err as Error).message?.slice(0, 60)}`, i, total);
      // 병원 실패 → 다음 병원으로 계속
    }
  }

  onProgress?.('전체 완료!', total, total);
}
