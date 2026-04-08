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

// ── Gemini로 프로필 정보 보충 ──

async function enrichWithGemini(owners: OwnerActivity[], location: string): Promise<InfluencerResult[]> {
  if (owners.length === 0) return [];

  const ownerSummaries = owners.slice(0, 15).map((o, i) =>
    `${i + 1}. shortcode: ${o.shortcodes[0]} | 좋아요 평균: ${Math.round(o.avg_engagement)} | 해시태그: ${o.hashtags.slice(0, 5).join(', ')} | 캡션 미리보기: "${o.captions[0]?.substring(0, 60)}"`
  ).join('\n');

  const prompt = `아래는 인스타그램 "${location}" 지역 해시태그에서 수집된 게시물 데이터입니다.
각 게시물의 shortcode로 Instagram에서 작성자를 찾아 프로필 정보를 조사해주세요.

Google Search로 각 shortcode를 "instagram.com/p/{shortcode}" 형식으로 검색하여 작성자를 확인하세요.

[수집된 게시물]
${ownerSummaries}

[조사할 정보]
각 계정에 대해:
1. username (인스타 아이디)
2. full_name (표시 이름)
3. follower_count (팔로워 수 추정)
4. primary_category (맛집/뷰티/일상/육아/건강/패션/지역소식 중 택1)

[규칙]
- 실제 확인된 정보만. 추측이면 follower_count를 0으로.
- 기업/브랜드 계정이면 username을 빈 문자열로.
- 비공개 계정이면 제외.

JSON 배열로만:
[{"index":1, "username":"...", "full_name":"...", "follower_count":5000, "primary_category":"맛집/카페"}]`;

  const { text } = await callGeminiDirect({
    prompt,
    model: 'gemini-3.1-flash-lite-preview',
    temperature: 0.2,
    maxOutputTokens: 4096,
    googleSearch: true,
  });

  if (!text) return owners.slice(0, 15).map(o => ownerToResult(o, location));

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const enriched: Array<{ index: number; username: string; full_name: string; follower_count: number; primary_category: string }> =
      jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const enrichedResults = owners.slice(0, 15).map((o, i) => {
      const info = enriched.find(e => e.index === i + 1);
      return {
        ...ownerToResult(o, location),
        username: info?.username || `user_${o.owner_id.substring(0, 8)}`,
        full_name: info?.full_name || '',
        follower_count: info?.follower_count || 0,
        primary_category: info?.primary_category || guessCategory(o.hashtags, o.captions.join(' ')),
      };
    });
    // username 확인된 계정만 반환 (미확인은 쓸모없음)
    const confirmed = enrichedResults.filter(r => !r.username.startsWith('user_') && r.follower_count > 0);
    console.info(`[INFLUENCER] Gemini 보충: ${confirmed.length}명 확인 / ${enrichedResults.length - confirmed.length}명 제외 (미확인)`);
    return confirmed;
  } catch (err) {
    console.error('[INFLUENCER] Gemini 보충 실패:', err);
    return owners.slice(0, 15).map(o => ownerToResult(o, location));
  }
}

function ownerToResult(o: OwnerActivity, location: string): InfluencerResult {
  const locEst = estimateLocation(o.hashtags, location);
  return {
    username: `user_${o.owner_id.substring(0, 8)}`,
    full_name: '',
    profile_pic_url: o.best_post.display_url || '',
    follower_count: 0,
    following_count: 0,
    post_count: o.post_count,
    engagement_rate: Math.round(o.avg_engagement * 10) / 10, // 게시물당 평균 참여(좋아요+댓글)
    estimated_location: locEst.location,
    location_confidence: locEst.confidence,
    primary_category: guessCategory(o.hashtags, o.captions.join(' ')),
    recent_posts: [{
      text: o.best_post.caption,
      likes: o.best_post.likes,
      comments: o.best_post.comments,
      hashtags: o.hashtags.slice(0, 10),
      timestamp: o.best_post.timestamp,
    }],
  };
}

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
  const hintsBlock = postHints ? `\n\n[참고: 실제 인스타그램에서 수집된 게시물 데이터]\n${postHints}\n→ 위 게시물을 올린 계정의 username을 찾아주세요.\n` : '';

  const prompt = `너는 인스타그램 인플루언서 리서치 전문가다.

Google Search로 "site:instagram.com ${hashtags.slice(0, 3).join(' ')} ${body.location}" 를 검색해서
${body.location} 지역 마이크로 인플루언서(팔로워 ${body.follower_min}~${body.follower_max})를 찾아줘.
${hintsBlock}
[필수 조건]
- 반드시 실제 존재하는 Instagram 계정만 (가짜 username 생성 절대 금지)
- 각 계정의 실제 팔로워 수를 검색해서 확인
- 팔로워 수를 모르면 해당 계정을 결과에 포함하지 마
- 0명이어도 OK. 확실하지 않은 계정보다 정확한 소수가 낫다

JSON 배열만:
[{"username":"실제아이디", "full_name":"표시이름", "follower_count":5000, "engagement_rate":3.5, "estimated_location":"강남", "location_confidence":"medium", "primary_category":"맛집/카페", "recent_post_preview":"최근 게시물 텍스트"}]`;

  const { text } = await callGeminiDirect({ prompt, model: 'gemini-3.1-flash-lite-preview', temperature: 0.3, maxOutputTokens: 4096, googleSearch: true });
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
  let body: SearchRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.location?.trim()) return NextResponse.json({ error: '위치를 입력해주세요' }, { status: 400 });

  const searchHashtags = body.hashtags.length > 0 ? body.hashtags : generateInfluencerHashtags(body.location, body.categories);
  let results: InfluencerResult[] = [];
  let source = 'gemini';

  // 1차: RapidAPI로 실제 게시물 수집 + Gemini로 프로필 보충
  if (RAPIDAPI_KEY) {
    console.info(`[INFLUENCER] RapidAPI 검색 시작: ${searchHashtags.slice(0, 3).join(', ')}`);
    const allPosts: RawPost[] = [];
    for (const tag of searchHashtags.slice(0, 3)) {
      const posts = await fetchHashtagPosts(tag);
      allPosts.push(...posts);
      console.info(`[INFLUENCER] #${tag}: ${posts.length}개 게시물`);
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    if (allPosts.length > 0) {
      const owners = groupByOwner(allPosts);
      console.info(`[INFLUENCER] ${allPosts.length}개 게시물 → ${owners.length}명 고유 계정 (스팸 제외)`);

      // Gemini 보충 시도 (실패해도 RapidAPI 데이터만으로 결과 반환)
      try {
        const enriched = await enrichWithGemini(owners, body.location);
        if (enriched.length > 0) {
          results = enriched;
          source = 'rapidapi+gemini';
        }
      } catch (err) {
        console.warn('[INFLUENCER] Gemini 보충 실패, RapidAPI 데이터만 사용:', err);
      }

      // Gemini 보충으로 확인된 계정이 없으면 fallback
      if (results.length === 0) {
        console.info(`[INFLUENCER] Gemini 보충에서 확인된 계정 0 → Gemini 직접 검색으로 전환`);
        // RapidAPI에서 수집한 캡션/해시태그를 힌트로 제공
        const hints = owners.slice(0, 5).map(o =>
          `캡션: "${o.captions[0]?.substring(0, 60)}" / 해시태그: ${o.hashtags.slice(0, 5).join(', ')} / 좋아요평균: ${Math.round(o.avg_engagement)}`
        ).join('\n');
        results = await searchViaGeminiOnly(searchHashtags, body, hints);
        source = 'gemini';
      }
    }
  }

  // 2차: Gemini-only fallback (RapidAPI 키 없는 경우)
  if (results.length === 0) {
    console.info(`[INFLUENCER] ${RAPIDAPI_KEY ? '전부 실패' : 'RapidAPI 키 없음'} → Gemini 직접 검색`);
    results = await searchViaGeminiOnly(searchHashtags, body);
    source = 'gemini';
  }

  // 최종 필터: 팔로워 확인 + 범위 내 + username 확인된 것만
  results = results.filter(r =>
    r.username &&
    !r.username.startsWith('user_') &&
    r.follower_count > 0 &&
    r.follower_count >= body.follower_min &&
    r.follower_count <= body.follower_max
  );

  return NextResponse.json({ results: results.slice(0, 20), total_found: results.length, search_hashtags_used: searchHashtags, source });
}

// generateHashtags는 influencerHashtags.ts의 generateInfluencerHashtags로 대체됨
