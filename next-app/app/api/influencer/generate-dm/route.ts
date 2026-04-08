/**
 * POST /api/influencer/generate-dm — 인플루언서 협업 DM 자동 생성
 *
 * 인플루언서 프로필 + 병원 정보를 기반으로 개인화된 DM 3개를 생성합니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { callGeminiDirect } from '../../../../lib/geminiDirect';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface GenerateDmRequest {
  influencer: {
    username: string;
    full_name: string;
    follower_count: number;
    engagement_rate: number;
    estimated_location: string;
    primary_category: string;
    recent_posts: { text: string }[];
  };
  hospital: {
    name: string;
    location: string;
    features: string;
    instagram: string;
  };
  tone: 'casual' | 'business' | 'friendly';
}

// ── 의료광고법 금지 표현 체크 ──
const MEDICAL_AD_VIOLATIONS = [
  { pattern: /최고|최초|유일|탁월|혁신/g, message: '최상급/과장 표현' },
  { pattern: /완치|100%|확실|보장/g, message: '효과 보장 표현' },
  { pattern: /무료|할인|특가|이벤트/g, message: '가격/할인 언급 (첫 DM에서 금지)' },
  { pattern: /지금\s*바로|서두르|한정/g, message: '긴급성 압박 표현' },
  { pattern: /전후\s*사진|비포\s*애프터|before.*after/gi, message: '전후 비교 언급' },
];

function checkMedicalAdViolations(text: string): string[] {
  const warnings: string[] = [];
  for (const rule of MEDICAL_AD_VIOLATIONS) {
    const matches = text.match(rule.pattern);
    if (matches) warnings.push(`${rule.message}: "${matches[0]}"`);
  }
  return warnings;
}

export async function POST(request: NextRequest) {
  let body: GenerateDmRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { influencer, tone } = body;
  const hospital = body.hospital || { name: '저희 병원', location: '', features: '', instagram: '' };
  if (!influencer) {
    return NextResponse.json({ error: '인플루언서 정보가 없습니다' }, { status: 400 });
  }
  if (!hospital.name) hospital.name = '저희 병원';

  const recentPostText = influencer.recent_posts?.[0]?.text || '';

  const toneGuides: Record<string, string> = {
    casual: `캐주얼 톤 — 친구에게 말하듯 가볍고 따뜻하게.
이모지 1~2개 사용. "~요" 체. "안녕하세요~" 로 시작.
❌ 비즈니스 용어 금지 ("제안드립니다", "협업 문의")`,
    business: `비즈니스 톤 — 전문적이고 간결하게.
"안녕하세요, ○○치과 마케팅 담당자입니다." 로 시작.
이모지 최소화. "~합니다" 체.`,
    friendly: `친근한 제안 톤 — 관심사를 공유하는 이웃처럼.
"혹시 ~에 관심 있으실까 해서요~" 느낌.
부담 없이 가볍게. 이모지 적당히.`,
  };

  const prompt = `너는 인스타그램 인플루언서 마케팅 전문가다.

[인플루언서 정보]
- 아이디: @${influencer.username}
- 이름: ${influencer.full_name || '미확인'}
- 팔로워: ${influencer.follower_count.toLocaleString()}명
- 참여율: ${influencer.engagement_rate}%
- 지역: ${influencer.estimated_location}
- 카테고리: ${influencer.primary_category}
${recentPostText ? `- 최근 게시물: "${recentPostText.substring(0, 150)}"` : ''}

[병원 정보]
- 병원명: ${hospital.name}
- 위치: ${hospital.location}
- 특징: ${hospital.features || '미입력'}
- 인스타: ${hospital.instagram || '미입력'}

[DM 톤]
${toneGuides[tone] || toneGuides.casual}

[DM 작성 규칙]
1. 200자 이내로 짧게 (인스타 DM은 짧아야 읽힘)
2. 상대방의 최근 게시물이나 콘텐츠 스타일을 구체적으로 언급 (개인화)
3. "광고" 느낌 최소화. 자연스러운 대화 톤
4. 첫 DM에서 가격/할인/이벤트 절대 언급 금지
5. CTA는 "관심 있으시면 답장 주세요~" 수준으로 가볍게
6. 의료광고법 위반 표현 절대 금지 (완치/최고/보장/100%)
7. 지역 연결고리 자연스럽게 활용 ("같은 동네에서~" 등)

[DM 구조]
1줄: 인사 + 상대방 콘텐츠/활동 구체적 언급 (개인화 핵심)
2줄: 간단한 자기소개 (병원명 + 위치)
3줄: 협업 제안 (구체적이되 부담 없게)
4줄: 가벼운 CTA

3가지 버전을 JSON으로 생성해줘:

[{"tone":"${tone}","message":"DM 본문"},{"tone":"${tone} 변형1","message":"DM 본문"},{"tone":"${tone} 변형2","message":"DM 본문"}]`;

  try {
    const { text, error } = await callGeminiDirect({
      prompt,
      model: 'gemini-3.1-flash-preview',
      temperature: 0.8,
      maxOutputTokens: 2048,
    });

    if (!text) {
      console.error('[INFLUENCER DM] Gemini 응답 없음:', error);
      return NextResponse.json({ drafts: [
        { tone, message: `안녕하세요! ${hospital.name}입니다 😊\n${influencer.full_name || influencer.username || '크리에이터'}님의 콘텐츠를 보고 연락드렸어요.\n같은 ${hospital.location || '동네'}에서 활동하시는 것 같아 소소한 협업을 제안드리고 싶은데, 혹시 관심 있으시면 편하게 답장 주세요~`, warnings: [] },
      ] });
    }

    let parsed: Array<{ tone: string; message: string }>;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      // JSON 파싱 실패 — 텍스트 자체를 DM으로 사용
      parsed = [{ tone, message: text.substring(0, 500) }];
    }

    if (parsed.length === 0) {
      parsed = [{ tone, message: text.substring(0, 500) }];
    }

    // 의료광고법 검사
    const drafts = parsed.map(draft => ({
      tone: draft.tone || tone,
      message: draft.message || '',
      warnings: checkMedicalAdViolations(draft.message || ''),
    }));

    return NextResponse.json({ drafts });
  } catch (err) {
    console.error('[INFLUENCER DM] 오류:', err);
    return NextResponse.json({ error: `DM 생성 오류: ${(err as Error).message}` }, { status: 500 });
  }
}
