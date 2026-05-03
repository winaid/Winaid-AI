/**
 * POST /api/influencer/search — 인플루언서 검색 (하이브리드)
 *
 * 1차: RapidAPI Instagram Scraper Stable API (실제 게시물 데이터)
 *      → 해시태그 검색 → 게시물 수집 → owner_id별 그룹화 → 활동 분석
 *      → Gemini로 프로필 정보 보충 (username, 팔로워 등)
 * 2차: Gemini Google Search (RapidAPI 실패 시 fallback)
 */
import { NextRequest, NextResponse } from 'next/server';
import { callGeminiDirect } from '../../../../lib/geminiDirect';
import { generateInfluencerHashtags, LOCATION_HASHTAGS } from '../../../../lib/influencerHashtags';
import { checkAuth } from '../../../../lib/apiAuth';
import { sanitizePromptInput } from '@winaid/blog-core';

// Instagram username 정규식 — IG 공식 스펙 (1~30자, 영문/숫자/_/.).
// LLM (Gemini) 결과의 hallucinated username (한국어 phrase, 공백 포함, "user_xxxx"
// 같은 placeholder 등) 을 1차 차단. 통과한 username 만 DB 저장 + DM 발송 후보.
// 더 엄격한 검증 (실 IG 프로필 존재 확인) 은 RAPIDAPI_KEY 필요한 별도 PR.
const IG_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// 지역 키워드는 influencerHashtags.ts의 LOCATION_HASHTAGS 사용

interface SearchRequest {
  location: string;
  hashtags: string[];
  follower_min: number;
  follower_max: number;
  categories: string[];
  min_engagement_rate: number;
}

interface InfluencerResult {
  username: string;
  full_name: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  engagement_rate: number;
  estimated_location: string;
  location_confidence: 'high' | 'medium' | 'low';
  primary_category: string;
  recent_posts: { text: string; likes: number; comments: number; hashtags: string[]; timestamp: string }[];
}

// ── RapidAPI 해시태그 검색 → 게시물 수집 ──

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

interface RawPost {
  owner_id: string;
  shortcode: string;
  caption: string;
  hashtags: string[];
  likes: number;
  comments: number;
  timestamp: string;
  display_url: string;
}

async function fetchHashtagPosts(hashtag: string): Promise<RawPost[]> {
  if (!RAPIDAPI_KEY) return [];
  const clean = hashtag.replace(/^#/, '').trim();
  if (!clean) return [];

  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/search_hashtag.php?hashtag=${encodeURIComponent(clean)}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST } },
    );
    if (!res.ok) { console.warn(`[INFLUENCER] RapidAPI ${clean}: ${res.status}`); return []; }

    const data = await res.json();
    const posts: RawPost[] = [];

    // top_posts + posts 양쪽에서 수집
    for (const section of ['top_posts', 'posts']) {
      const edges = data?.[section]?.edges || [];
      for (const edge of edges) {
        const node = edge?.node;
        if (!node) continue;
        const ownerId = node?.owner?.id;
        if (!ownerId) continue;

        const capEdges = node?.edge_media_to_caption?.edges || [];
        const captionText = capEdges[0]?.node?.text || '';
        const hashtagMatches = captionText.match(/#[가-힣a-zA-Z0-9_]+/g) || [];

        posts.push({
          owner_id: String(ownerId),
          shortcode: node.shortcode || '',
          caption: captionText.substring(0, 300),
          hashtags: hashtagMatches.map((h: string) => h.replace('#', '')),
          likes: node?.edge_liked_by?.count || 0,
          comments: node?.edge_media_to_comment?.count || 0,
          timestamp: node?.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : new Date().toISOString(),
          display_url: node?.display_url || node?.thumbnail_src || '',
        });
      }
    }
    return posts;
  } catch (err) {
    console.error(`[INFLUENCER] RapidAPI ${clean} 오류:`, err);
    return [];
  }
}

// ── owner_id별 그룹화 + 활동 분석 ──

interface OwnerActivity {
  owner_id: string;
  post_count: number;
  total_likes: number;
  total_comments: number;
  avg_engagement: number;
  hashtags: string[];
  captions: string[];
  shortcodes: string[];
  best_post: RawPost;
}

function groupByOwner(posts: RawPost[]): OwnerActivity[] {
  const map = new Map<string, RawPost[]>();
  for (const p of posts) {
    if (!map.has(p.owner_id)) map.set(p.owner_id, []);
    map.get(p.owner_id)!.push(p);
  }

  const results: OwnerActivity[] = [];
  for (const [ownerId, ownerPosts] of map) {
    // 스팸 계정 필터: 좋아요 매우 높은데 댓글 0 → 봇 가능성
    const totalLikes = ownerPosts.reduce((s, p) => s + p.likes, 0);
    const totalComments = ownerPosts.reduce((s, p) => s + p.comments, 0);
    if (totalLikes > 1000 && totalComments === 0) continue;

    // 스팸 해시태그 필터
    const allCaptions = ownerPosts.map(p => p.caption).join(' ');
    if (/팔로워\s*판매|좋아요\s*판매|최저가\s*팔로워|광고\s*대행/.test(allCaptions)) continue;

    const allHashtags = [...new Set(ownerPosts.flatMap(p => p.hashtags))];
    const bestPost = ownerPosts.reduce((best, p) => (p.likes + p.comments > best.likes + best.comments) ? p : best, ownerPosts[0]);

    results.push({
      owner_id: ownerId,
      post_count: ownerPosts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      avg_engagement: ownerPosts.length > 0 ? (totalLikes + totalComments) / ownerPosts.length : 0,
      hashtags: allHashtags.slice(0, 20),
      captions: ownerPosts.map(p => p.caption.substring(0, 100)),
      shortcodes: ownerPosts.map(p => p.shortcode),
      best_post: bestPost,
    });
  }

  // 활동량 순 정렬
  return results.sort((a, b) => b.avg_engagement - a.avg_engagement);
}

// enrichWithGemini 제거됨 — Gemini 직접 검색으로 통합 (속도 개선)


function estimateLocation(hashtags: string[], searchLocation: string): { location: string; confidence: 'high' | 'medium' | 'low' } {
  const allText = hashtags.join(' ').toLowerCase();
  for (const [region, keywords] of Object.entries(LOCATION_HASHTAGS)) {
    if (keywords.some(kw => allText.includes(kw))) return { location: region, confidence: 'medium' };
  }
  return { location: searchLocation, confidence: 'low' };
}

function guessCategory(hashtags: string[], text: string): string {
  const all = `${hashtags.join(' ')} ${text}`.toLowerCase();
  if (/맛집|카페|음식|레스토랑|브런치|디저트|파스타/.test(all)) return '맛집/카페';
  if (/뷰티|메이크업|화장|스킨케어|피부|네일|헤어/.test(all)) return '뷰티/미용';
  if (/육아|아이|아기|맘|엄마|가족/.test(all)) return '육아/가족';
  if (/운동|헬스|피트니스|요가|필라테스|다이어트/.test(all)) return '건강/운동';
  if (/패션|옷|코디|스타일|ootd/.test(all)) return '패션';
  if (/동네|지역|소식|핫플/.test(all)) return '지역소식';
  return '일상/라이프스타일';
}

// ── Gemini-only fallback ──

async function searchViaGeminiOnly(hashtags: string[], body: SearchRequest, postHints?: string): Promise<InfluencerResult[]> {
  // 사용자 입력 sanitize — prompt injection 차단 (`ignore previous`, role
  // impersonation 등 INJECTION_KEYWORDS 제거 + 길이 cap + 구조 문자 정규화).
  const safeLocation = sanitizePromptInput(body.location, 80);
  const safeHashtag = sanitizePromptInput(hashtags[0] || '맛집', 40);
  // 숫자 필드는 Number + 범위 cap (음수/문자열/Infinity 차단).
  const followerMin = Math.max(0, Math.min(10_000_000, Number(body.follower_min) || 0));
  const followerMax = Math.max(followerMin, Math.min(10_000_000, Number(body.follower_max) || followerMin));

  // postHints 는 RapidAPI 응답에서 온 외부 텍스트 — 이미 substring + sanitize 가능
  const safeHints = postHints ? sanitizePromptInput(postHints, 1500) : '';
  const hintsBlock = safeHints ? `\n\n[참고: 실제 인스타그램에서 수집된 게시물 데이터]\n${safeHints}\n→ 위 게시물을 올린 계정의 username을 찾아주세요.\n` : '';

  const prompt = `너는 인스타그램 마이크로 인플루언서 리서치 전문가다.

<user_location>${safeLocation}</user_location> 지역에서 활동하는 인스타그램 마이크로 인플루언서를 찾아줘.

Google Search로 다음을 검색해:
1. "instagram ${safeLocation} ${safeHashtag} influencer"
2. "인스타그램 ${safeLocation} 인플루언서 추천"
3. "${safeLocation} 로컬 크리에이터 인스타"
${hintsBlock}
[조건]
- 팔로워 ${followerMin.toLocaleString()}~${followerMax.toLocaleString()}명 범위
- ${safeLocation} 지역에서 주로 활동하는 개인 크리에이터
- 기업/브랜드 계정 제외
- 팔로워 수는 추정치도 OK (정확하지 않아도 됨)

[중요]
- 최소 5명 이상 찾아줘. 10명이면 더 좋아.
- 팔로워 수를 정확히 모르면 게시물 좋아요 수로 추정해. (좋아요 평균 100개 ≈ 팔로워 3000~5000)
- 실제 존재할 가능성이 높은 계정만 포함. 하지만 확실하지 않아도 포함하되 location_confidence를 "low"로.
- username 은 인스타그램 실 계정 형식 (영문/숫자/_/. 만, 1~30자) 만 출력.

JSON 배열:
[{"username":"실제아이디", "full_name":"표시이름", "follower_count":5000, "engagement_rate":3.5, "estimated_location":"${safeLocation}", "location_confidence":"medium", "primary_category":"맛집/카페", "recent_post_preview":"최근 게시물 텍스트"}]`;

  const { text } = await callGeminiDirect({ prompt, model: 'gemini-3.1-pro-preview', temperature: 0.3, maxOutputTokens: 4096, googleSearch: true });
  if (!text) return [];
  try {
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
    return parsed.map((item: Record<string, unknown>) => ({
      username: String(item.username || ''), full_name: String(item.full_name || ''), profile_pic_url: '',
      follower_count: Number(item.follower_count) || 0, following_count: 0, post_count: 0,
      engagement_rate: Number(item.engagement_rate) || 0,
      estimated_location: String(item.estimated_location || body.location),
      location_confidence: (item.location_confidence || 'low') as 'high' | 'medium' | 'low',
      primary_category: String(item.primary_category || '일상'), recent_posts: item.recent_post_preview ? [{ text: String(item.recent_post_preview), likes: 0, comments: 0, hashtags: [], timestamp: new Date().toISOString() }] : [],
    })).filter((r: InfluencerResult) => r.username && r.follower_count > 0);
  } catch { return []; }
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  let body: SearchRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.location?.trim()) return NextResponse.json({ error: '위치를 입력해주세요' }, { status: 400 });

  // body.hashtags 배열 shape 검증 — 각 항목 문자열 + 길이 cap (40자) + 최대 10개.
  // user 입력이 prompt 까지 흐르는 경로 — sanitizePromptInput 으로 injection 키워드 제거.
  const rawHashtags = Array.isArray(body.hashtags) ? body.hashtags : [];
  const cleanedUserHashtags = rawHashtags
    .filter((h): h is string => typeof h === 'string')
    .map(h => sanitizePromptInput(h, 40))
    .filter(h => h.length > 0)
    .slice(0, 10);
  const safeCategories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 10).map(c => sanitizePromptInput(c, 40))
    : [];
  const searchHashtags = cleanedUserHashtags.length > 0
    ? cleanedUserHashtags
    : generateInfluencerHashtags(body.location, safeCategories);
  let results: InfluencerResult[] = [];
  let source = 'gemini';

  // 1차: RapidAPI로 실제 게시물 수집 → Gemini에 힌트로 전달
  let postHints = '';
  if (RAPIDAPI_KEY) {
    const tagsToSearch = searchHashtags.slice(0, 3);
    console.info(`[INFLUENCER] RapidAPI 검색: ${tagsToSearch.join(', ')}`);
    const allPosts: RawPost[] = [];

    // RAPIDAPI_PARALLEL=true 면 병렬 (유료 플랜), 아니면 직렬 (무료 플랜)
    const canParallel = process.env.RAPIDAPI_PARALLEL === 'true';

    if (canParallel) {
      // 유료 플랜: 병렬 수집 (~1초)
      const postResults = await Promise.all(tagsToSearch.map(tag => fetchHashtagPosts(tag)));
      for (let i = 0; i < tagsToSearch.length; i++) {
        allPosts.push(...postResults[i]);
        console.info(`[INFLUENCER] #${tagsToSearch[i]}: ${postResults[i].length}개 게시물`);
      }
    } else {
      // 무료 플랜: 직렬 수집 + 1.2초 간격 (~4초)
      for (const tag of tagsToSearch) {
        const posts = await fetchHashtagPosts(tag);
        allPosts.push(...posts);
        console.info(`[INFLUENCER] #${tag}: ${posts.length}개 게시물`);
        if (posts.length > 0) await new Promise(r => setTimeout(r, 1200));
      }
    }
    console.info(`[INFLUENCER] RapidAPI 총 ${allPosts.length}개 게시물 수집`);

    if (allPosts.length > 0) {
      const owners = groupByOwner(allPosts);
      // 상위 5개 계정의 게시물 힌트를 Gemini에 전달
      postHints = owners.slice(0, 5).map(o =>
        `캡션: "${o.captions[0]?.substring(0, 80)}" / 해시태그: ${o.hashtags.slice(0, 5).join(', ')} / 좋아요평균: ${Math.round(o.avg_engagement)}`
      ).join('\n');
    }
  }

  // Gemini 직접 검색 (RapidAPI 힌트 포함)
  console.info(`[INFLUENCER] Gemini 직접 검색 시작 (힌트: ${postHints ? '있음' : '없음'})`);
  results = await searchViaGeminiOnly(searchHashtags, body, postHints || undefined);
  source = postHints ? 'rapidapi+gemini' : 'gemini';
  console.info(`[INFLUENCER] Gemini 결과 (필터 전): ${results.length}명`);
  if (results.length > 0) {
    console.info(`[INFLUENCER] 샘플: ${results.slice(0, 3).map(r => `@${r.username}(팔${r.follower_count})`).join(', ')}`);
  }

  // 최종 필터:
  //  - IG username 정규식 통과 (CR-12 — Gemini hallucinated 'user_xxxx', 한국어
  //    phrase, 공백/특수문자 포함 등 IG 형식 위반 차단)
  //  - follower 범위 내
  // 정규식 차단 후에도 LLM 이 plausible 한 username 을 fabricate 할 수 있으나,
  // 가장 흔한 hallucination 유형 (placeholder, descriptive phrase) 은 차단됨.
  // 실 IG 프로필 존재 검증은 RAPIDAPI_KEY 기반 별도 후속 PR 에서.
  const beforeFilter = results.length;
  const followerMin = Math.max(0, Number(body.follower_min) || 0);
  const followerMax = Math.max(followerMin, Number(body.follower_max) || followerMin);
  results = results.filter(r =>
    r.username &&
    IG_USERNAME_RE.test(r.username) &&
    !r.username.startsWith('user_') &&
    r.follower_count > 0 &&
    r.follower_count >= followerMin &&
    r.follower_count <= followerMax
  );
  console.info(`[INFLUENCER] 필터 후: ${results.length}명 (${beforeFilter - results.length}명 제외)`);

  return NextResponse.json({ results: results.slice(0, 20), total_found: results.length, search_hashtags_used: searchHashtags, source });
}

// generateHashtags는 influencerHashtags.ts의 generateInfluencerHashtags로 대체됨
