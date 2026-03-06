/**
 * 키워드 분석 서비스
 * - 병원 주소 기반 지역 키워드 생성
 * - 네이버 검색광고 API로 검색량 + 블로그 발행량 조회
 */

export interface KeywordStat {
  keyword: string;
  monthlySearchVolume: number;
  monthlyPcVolume: number;
  monthlyMobileVolume: number;
  blogPostCount: number;
  saturation?: number; // 발행량/검색량 비율 (낮을수록 블루오션)
}

// 주소에서 지역 키워드 추출
export function extractLocationKeywords(address: string): string[] {
  if (!address) return [];

  const locations: string[] = [];

  // 시/도 추출
  const cityMatch = address.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);

  // 구/군/시 추출
  const guMatch = address.match(/([가-힣]+[구군시])\b/g);
  if (guMatch) {
    for (const gu of guMatch) {
      if (!gu.match(/^(서울|부산|대구|인천|광주|대전|울산|세종)$/)) {
        locations.push(gu);
      }
    }
  }

  // 동/읍/면 추출
  const dongMatch = address.match(/([가-힣]+[동읍면])\b/g);
  if (dongMatch) {
    for (const dong of dongMatch) {
      if (dong.length >= 2 && dong.length <= 6) {
        locations.push(dong);
      }
    }
  }

  // 역 이름 추출 (OO역 근처)
  const stationMatch = address.match(/([가-힣]+역)\b/g);
  if (stationMatch) locations.push(...stationMatch);

  // 시/도 + 구 조합 (예: "인천 서구")
  if (cityMatch && guMatch) {
    locations.push(`${cityMatch[1]} ${guMatch[0]}`);
  }

  return [...new Set(locations)];
}

// 지역 + 치과 관련 키워드 조합 생성
export function generateKeywordCandidates(
  locationKeywords: string[],
  hospitalName: string,
  category?: string
): string[] {
  const dentalTerms = [
    '치과', '임플란트', '치아교정', '라미네이트',
    '치아미백', '충치치료', '스케일링', '사랑니발치',
  ];

  // 카테고리별 추가 키워드
  const categoryTerms: Record<string, string[]> = {
    '치과': dentalTerms,
    '교정과': ['치아교정', '투명교정', '교정치과', '교정비용'],
    '임플란트': ['임플란트', '임플란트비용', '임플란트추천', '원데이임플란트'],
    '소아치과': ['소아치과', '어린이치과', '아이치과', '소아교정'],
    '성형외과': ['성형외과', '쌍꺼풀', '코성형', '안면윤곽'],
    '피부과': ['피부과', '여드름', '레이저', '보톡스'],
    '안과': ['안과', '라식', '라섹', '백내장'],
    '한의원': ['한의원', '추나요법', '침', '한약'],
  };

  const terms = categoryTerms[category || '치과'] || dentalTerms;
  const keywords: string[] = [];

  // 병원명 자체
  keywords.push(hospitalName);

  // 지역 + 진료 키워드
  for (const loc of locationKeywords) {
    for (const term of terms) {
      keywords.push(`${loc} ${term}`);
    }
    // 지역+치과 (기본)
    if (!terms.includes('치과')) {
      keywords.push(`${loc} 치과`);
    }
  }

  // 최대 20개로 제한 (API 비용)
  return [...new Set(keywords)].slice(0, 20);
}

// 키워드 검색량 + 블로그 발행량 조회
export async function fetchKeywordStats(keywords: string[]): Promise<KeywordStat[]> {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const response = await fetch(`${API_BASE_URL}/api/naver/keyword-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '알 수 없는 오류' }));
    throw new Error((error as any).error || `API 오류: ${response.status}`);
  }

  const data = await response.json() as { results: KeywordStat[] };

  // 포화도 계산 (발행량 / 검색량)
  return data.results.map((item) => ({
    ...item,
    saturation: item.monthlySearchVolume > 0
      ? Math.round((item.blogPostCount / item.monthlySearchVolume) * 100) / 100
      : 0,
  }));
}

// 병원 주소 기반 키워드 분석 전체 플로우
export async function analyzeHospitalKeywords(
  hospitalName: string,
  address: string,
  category?: string
): Promise<KeywordStat[]> {
  const locationKeywords = extractLocationKeywords(address);
  const candidates = generateKeywordCandidates(locationKeywords, hospitalName, category);

  if (candidates.length === 0) {
    throw new Error('주소에서 지역 키워드를 추출할 수 없습니다.');
  }

  return fetchKeywordStats(candidates);
}
