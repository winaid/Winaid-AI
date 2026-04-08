/**
 * POST /api/influencer/search — 인플루언서 검색
 *
 * 해시태그 기반으로 인플루언서를 검색하고 프로필을 분석합니다.
 * Instagram 데이터는 Gemini의 Google Search를 통해 수집합니다.
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

  const searchHashtags = body.hashtags.length > 0 ? body.hashtags : generateHashtags(body.location);
  const categoryFilter = body.categories.length > 0 ? body.categories.join(', ') : '맛집, 뷰티, 일상, 건강';

  const prompt = `너는 인스타그램 인플루언서 리서치 전문가다.

[검색 조건]
- 지역: ${body.location}
- 해시태그: ${searchHashtags.join(', ')}
- 팔로워 범위: ${body.follower_min.toLocaleString()} ~ ${body.follower_max.toLocaleString()}
- 카테고리: ${categoryFilter}
- 최소 참여율: ${body.min_engagement_rate}%

Google Search로 "site:instagram.com ${searchHashtags.slice(0, 3).join(' ')} ${body.location}" 를 검색하고,
해당 지역의 마이크로 인플루언서(팔로워 ${body.follower_min.toLocaleString()}~${body.follower_max.toLocaleString()})를 찾아주세요.

[분석 항목]
각 인플루언서에 대해:
1. username: 인스타그램 아이디
2. full_name: 표시 이름
3. follower_count: 팔로워 수 (추정)
4. engagement_rate: 참여율 (추정, %)
5. estimated_location: 추정 활동 지역
6. location_confidence: high/medium/low
7. primary_category: 주요 카테고리
8. recent_post_preview: 최근 게시물 텍스트 미리보기 (1개)

[규칙]
- 실제 존재하는 계정만 (가짜 계정 생성 금지)
- 검색에서 찾을 수 없으면 결과를 적게 반환해도 됨 (0개도 OK)
- 비공개 계정 제외
- 기업/브랜드 계정 제외 (개인 크리에이터만)
- 팔로워 수와 참여율은 검색 결과 기반 추정치
- 확실하지 않은 정보는 location_confidence를 "low"로

JSON 배열로만 출력. 최대 15명:
[{"username":"...", "full_name":"...", "follower_count":5000, "engagement_rate":3.5, "estimated_location":"강남", "location_confidence":"medium", "primary_category":"맛집/카페", "recent_post_preview":"최근 게시물 텍스트..."}]`;

  try {
    const { text, error } = await callGeminiDirect({
      prompt,
      model: 'gemini-3.1-flash-preview',
      temperature: 0.3,
      maxOutputTokens: 8192,
      googleSearch: true,
    });

    if (!text) {
      return NextResponse.json({ error: error || '검색 결과 없음' }, { status: 500 });
    }

    let parsed: Array<Record<string, unknown>>;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      parsed = [];
    }

    // 결과 정제
    const results = parsed.map((item) => ({
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
        likes: 0,
        comments: 0,
        hashtags: [],
        timestamp: new Date().toISOString(),
      }] : [],
    })).filter(r => r.username && r.follower_count > 0);

    return NextResponse.json({
      results,
      total_found: results.length,
      search_hashtags_used: searchHashtags,
    });
  } catch (err) {
    return NextResponse.json({ error: `검색 중 오류: ${(err as Error).message}` }, { status: 500 });
  }
}

function generateHashtags(location: string): string[] {
  const loc = location.replace(/역|구|동|시/g, '').trim();
  if (!loc) return ['맛집', '일상', '카페'];
  return [`${loc}맛집`, `${loc}일상`, `${loc}카페`, `${loc}추천`, `${loc}핫플`];
}
