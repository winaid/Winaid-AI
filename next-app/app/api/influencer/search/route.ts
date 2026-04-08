/**
 * POST /api/influencer/search — 인플루언서 검색
 *
 * 1차: RapidAPI Instagram Scraper (정확한 실제 데이터)
 * 2차: Gemini Google Search (RapidAPI 키 없거나 실패 시 fallback)
 */
import { NextRequest, NextResponse } from 'next/server';
import { callGeminiDirect } from '../../../../lib/geminiDirect';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// ── 지역 키워드 매핑 ──
const LOCATION_KEYWORDS: Record<string, string[]> = {
  '강남': ['강남', '신사', '압구정', '청담', '역삼', '삼성동', '선릉', '논현'],
  '서초': ['서초', '방배', '반포', '잠원', '교대'],
  '마포': ['마포', '홍대', '합정', '상수', '연남', '망원'],
  '성수': ['성수', '뚝섬', '서울숲'],
  '잠실': ['잠실', '송파', '방이', '석촌', '문정'],
  '분당': ['분당', '판교', '서현', '정자', '야탑', '미금'],
  '일산': ['일산', '라페스타', '웨스턴돔', '킨텍스', '탄현'],
  '해운대': ['해운대', '광안리', '센텀', '마린시티'],
  '대구': ['대구', '동성로', '수성구', '범어'],
  '대전': ['대전', '유성', '둔산', '중구'],
  '수원': ['수원', '인계동', '광교', '영통'],
  '인천': ['인천', '송도', '부평', '구월'],
  '제주': ['제주', '애월', '서귀포', '중문'],
  '부산': ['부산', '서면', '남포동', '전포', '광안리'],
};

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
  recent_posts: {
    text: string;
    likes: number;
    comments: number;
    hashtags: string[];
    timestamp: string;
  }[];
}

// ── RapidAPI Instagram Scraper ──

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';

async function searchViaRapidAPI(
  hashtags: string[],
  body: SearchRequest,
): Promise<{ results: InfluencerResult[]; source: 'rapidapi' } | null> {
  if (!RAPIDAPI_KEY) return null;

  try {
    const allProfiles: Map<string, InfluencerResult> = new Map();

    // 각 해시태그로 검색 (최대 3개)
    for (const tag of hashtags.slice(0, 3)) {
      const cleanTag = tag.replace(/^#/, '').trim();
      if (!cleanTag) continue;

      const res = await fetch(
        `https://${RAPIDAPI_HOST}/v1/hashtag?hashtag=${encodeURIComponent(cleanTag)}`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST,
          },
        },
      );

      if (!res.ok) {
        console.warn(`[INFLUENCER] RapidAPI hashtag "${cleanTag}" 실패: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const items = data?.data?.items || data?.items || [];

      for (const item of items) {
        const user = item?.user || item?.owner || {};
        const username = user?.username;
        if (!username || allProfiles.has(username)) continue;

        const followerCount = user?.follower_count || user?.edge_followed_by?.count || 0;
        if (followerCount < body.follower_min || followerCount > body.follower_max) continue;

        const postCount = user?.media_count || user?.edge_owner_to_timeline_media?.count || 0;
        const likes = item?.like_count || item?.edge_liked_by?.count || 0;
        const comments = item?.comment_count || item?.edge_media_to_comment?.count || 0;
        const engagementRate = followerCount > 0 ? ((likes + comments) / followerCount) * 100 : 0;

        if (engagementRate < body.min_engagement_rate) continue;

        // 위치 추정
        const locationName = item?.location?.name || '';
        const caption = item?.caption?.text || item?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const captionHashtags = caption.match(/#[가-힣a-zA-Z0-9_]+/g) || [];
        const estimatedLoc = estimateLocation(locationName, captionHashtags, body.location);

        allProfiles.set(username, {
          username,
          full_name: user?.full_name || '',
          profile_pic_url: user?.profile_pic_url || '',
          follower_count: followerCount,
          following_count: user?.following_count || 0,
          post_count: postCount,
          engagement_rate: Math.round(engagementRate * 10) / 10,
          estimated_location: estimatedLoc.location,
          location_confidence: estimatedLoc.confidence,
          primary_category: guessCategory(captionHashtags, caption),
          recent_posts: [{
            text: caption.substring(0, 200),
            likes,
            comments,
            hashtags: captionHashtags.slice(0, 10).map((h: string) => h.replace('#', '')),
            timestamp: item?.taken_at ? new Date(item.taken_at * 1000).toISOString() : new Date().toISOString(),
          }],
        });
      }

      // Rate limit 보호 (해시태그 간 0.5초 간격)
      await new Promise(r => setTimeout(r, 500));
    }

    const results = Array.from(allProfiles.values());
    if (results.length === 0) return null;

    return { results, source: 'rapidapi' };
  } catch (err) {
    console.error('[INFLUENCER] RapidAPI 오류:', err);
    return null;
  }
}

// ── 위치 추정 ──
function estimateLocation(
  locationTag: string,
  hashtags: string[],
  searchLocation: string,
): { location: string; confidence: 'high' | 'medium' | 'low' } {
  const allText = `${locationTag} ${hashtags.join(' ')}`.toLowerCase();

  // 1순위: 위치태그에서 직접 매칭
  for (const [region, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    if (keywords.some(kw => locationTag.includes(kw))) {
      return { location: region, confidence: 'high' };
    }
  }

  // 2순위: 해시태그에서 지역 추출
  for (const [region, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    if (keywords.some(kw => allText.includes(kw))) {
      return { location: region, confidence: 'medium' };
    }
  }

  // 3순위: 검색 지역 기본값
  return { location: searchLocation, confidence: 'low' };
}

// ── 카테고리 추정 ──
function guessCategory(hashtags: string[], caption: string): string {
  const text = `${hashtags.join(' ')} ${caption}`.toLowerCase();
  if (/맛집|카페|음식|레스토랑|브런치|디저트|파스타|스시|라멘/.test(text)) return '맛집/카페';
  if (/뷰티|메이크업|화장|스킨케어|피부|네일|헤어/.test(text)) return '뷰티/미용';
  if (/육아|아이|아기|맘|엄마|아빠|가족|키즈/.test(text)) return '육아/가족';
  if (/운동|헬스|피트니스|요가|필라테스|다이어트|건강/.test(text)) return '건강/운동';
  if (/패션|옷|코디|스타일|ootd/.test(text)) return '패션';
  if (/동네|지역|소식|추천|핫플/.test(text)) return '지역소식';
  return '일상/라이프스타일';
}

// ── Gemini Search fallback ──

async function searchViaGemini(
  hashtags: string[],
  body: SearchRequest,
  categoryFilter: string,
): Promise<InfluencerResult[]> {
  const prompt = `너는 인스타그램 인플루언서 리서치 전문가다.

[검색 조건]
- 지역: ${body.location}
- 해시태그: ${hashtags.join(', ')}
- 팔로워 범위: ${body.follower_min.toLocaleString()} ~ ${body.follower_max.toLocaleString()}
- 카테고리: ${categoryFilter}
- 최소 참여율: ${body.min_engagement_rate}%

Google Search로 "site:instagram.com ${hashtags.slice(0, 3).join(' ')} ${body.location}" 를 검색하고,
해당 지역의 마이크로 인플루언서를 찾아주세요.

[규칙]
- 실제 존재하는 계정만 (가짜 계정 생성 금지)
- 0개도 OK. 확실하지 않으면 빈 배열.
- 비공개/기업 계정 제외

JSON 배열로만 출력. 최대 15명:
[{"username":"...", "full_name":"...", "follower_count":5000, "engagement_rate":3.5, "estimated_location":"강남", "location_confidence":"medium", "primary_category":"맛집/카페", "recent_post_preview":"..."}]`;

  const { text } = await callGeminiDirect({
    prompt,
    model: 'gemini-3.1-flash-preview',
    temperature: 0.3,
    maxOutputTokens: 8192,
    googleSearch: true,
  });

  if (!text) return [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    return parsed.map((item: Record<string, unknown>) => ({
      username: String(item.username || ''),
      full_name: String(item.full_name || ''),
      profile_pic_url: '',
      follower_count: Number(item.follower_count) || 0,
      following_count: 0,
      post_count: 0,
      engagement_rate: Number(item.engagement_rate) || 0,
      estimated_location: String(item.estimated_location || body.location),
      location_confidence: (['high', 'medium', 'low'].includes(String(item.location_confidence)) ? item.location_confidence : 'low') as 'high' | 'medium' | 'low',
      primary_category: String(item.primary_category || '일상'),
      recent_posts: item.recent_post_preview ? [{
        text: String(item.recent_post_preview),
        likes: 0, comments: 0, hashtags: [],
        timestamp: new Date().toISOString(),
      }] : [],
    })).filter((r: InfluencerResult) => r.username && r.follower_count > 0);
  } catch {
    return [];
  }
}

// ── 메인 핸들러 ──

export async function POST(request: NextRequest) {
  let body: SearchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.location?.trim()) {
    return NextResponse.json({ error: '위치를 입력해주세요' }, { status: 400 });
  }

  const searchHashtags = body.hashtags.length > 0 ? body.hashtags : generateHashtags(body.location, body.categories);
  const categoryFilter = body.categories.length > 0 ? body.categories.join(', ') : '맛집, 뷰티, 일상, 건강';

  let results: InfluencerResult[] = [];
  let source = 'gemini';

  // 1차: RapidAPI (정확한 실제 데이터)
  const rapidResult = await searchViaRapidAPI(searchHashtags, body);
  if (rapidResult && rapidResult.results.length > 0) {
    results = rapidResult.results;
    source = 'rapidapi';
    console.info(`[INFLUENCER] RapidAPI: ${results.length}명 발견`);
  } else {
    // 2차: Gemini Search (fallback)
    console.info(`[INFLUENCER] RapidAPI ${RAPIDAPI_KEY ? '결과 없음' : '키 미설정'} → Gemini fallback`);
    results = await searchViaGemini(searchHashtags, body, categoryFilter);
    source = 'gemini';
    console.info(`[INFLUENCER] Gemini: ${results.length}명 발견`);
  }

  // 카테고리 필터 적용 (RapidAPI 결과에만 — Gemini는 프롬프트에서 이미 필터)
  if (source === 'rapidapi' && body.categories.length > 0) {
    results = results.filter(r => body.categories.some(cat => r.primary_category.includes(cat) || cat.includes(r.primary_category)));
  }

  return NextResponse.json({
    results: results.slice(0, 20),
    total_found: results.length,
    search_hashtags_used: searchHashtags,
    source,
  });
}

function generateHashtags(location: string, categories?: string[]): string[] {
  const loc = location.replace(/역|구|동|시/g, '').trim();
  if (!loc) return ['맛집', '일상', '카페'];

  // 기본 지역 해시태그
  const tags: string[] = [`${loc}맛집`, `${loc}카페`, `${loc}일상`, `${loc}추천`, `${loc}핫플`];

  // 카테고리별 특화 해시태그
  const CATEGORY_TAGS: Record<string, string[]> = {
    food:      [`${loc}맛집추천`, `${loc}브런치`, `${loc}디저트`, `${loc}점심`, `${loc}데이트`],
    beauty:    [`${loc}네일`, `${loc}뷰티`, `${loc}헤어`, `${loc}피부관리`, `${loc}미용실`],
    lifestyle: [`${loc}라이프`, `${loc}데일리`, `${loc}주말`, `${loc}산책`, `${loc}동네`],
    parenting: [`${loc}맘`, `${loc}육아`, `${loc}아이`, `${loc}키즈카페`, `${loc}어린이`],
    health:    [`${loc}운동`, `${loc}헬스`, `${loc}필라테스`, `${loc}요가`, `${loc}다이어트`],
    fashion:   [`${loc}패션`, `${loc}코디`, `${loc}쇼핑`, `${loc}스타일`, `${loc}ootd`],
    local:     [`${loc}소식`, `${loc}동네맛집`, `${loc}로컬`, `${loc}신상`, `${loc}오픈`],
  };

  // 선택된 카테고리가 있으면 해당 태그 추가
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      const catTags = CATEGORY_TAGS[cat];
      if (catTags) tags.push(...catTags);
    }
  } else {
    // 카테고리 없으면 기본 인기 태그
    tags.push(`${loc}브런치`, `${loc}데일리`, `${loc}동네맛집`);
  }

  return [...new Set(tags)]; // 중복 제거
}
