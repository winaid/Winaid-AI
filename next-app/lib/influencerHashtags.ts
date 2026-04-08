/**
 * 인플루언서 탐색 — 해시태그 자동 생성 유틸리티
 *
 * 지역명 + 카테고리 조합으로 풍부한 검색 해시태그를 자동 생성합니다.
 */

// ── 카테고리 목록 (12개) ──

export const INFLUENCER_CATEGORIES = [
  { id: 'food', label: '맛집/카페' },
  { id: 'beauty', label: '뷰티/미용' },
  { id: 'lifestyle', label: '일상/라이프스타일' },
  { id: 'parenting', label: '육아/가족' },
  { id: 'health', label: '건강/운동' },
  { id: 'fashion', label: '패션' },
  { id: 'local', label: '지역소식' },
  { id: 'office', label: '직장인/회사원' },
  { id: 'selfcare', label: '자기관리/셀프케어' },
  { id: 'vlog', label: '브이로그/일상기록' },
  { id: 'interior', label: '인테리어/살림' },
  { id: 'pet', label: '반려동물' },
] as const;

export type InfluencerCategoryId = (typeof INFLUENCER_CATEGORIES)[number]['id'];

// ── 지역별 해시태그 매핑 ──

export const LOCATION_HASHTAGS: Record<string, string[]> = {
  // 서울
  '강남': ['강남', '강남역', '신사동', '압구정', '청담', '역삼', '삼성동', '선릉'],
  '서초': ['서초', '방배', '반포', '잠원', '교대'],
  '마포': ['마포', '홍대', '합정', '상수', '연남동', '망원'],
  '성수': ['성수', '성수동', '뚝섬', '서울숲'],
  '잠실': ['잠실', '송파', '방이동', '석촌', '롯데월드'],
  '영등포': ['영등포', '여의도', '당산', '문래'],
  '종로': ['종로', '광화문', '북촌', '삼청동', '익선동'],
  '용산': ['용산', '이태원', '한남동', '경리단길'],
  '강서': ['강서', '마곡', '발산', '화곡'],
  '노원': ['노원', '중계동', '상계'],
  '강동': ['강동', '천호', '길동', '암사'],
  '관악': ['관악', '신림', '봉천'],
  '동작': ['동작', '사당', '노량진'],
  // 경기
  '분당': ['분당', '서현', '정자', '야탑', '판교', '미금'],
  '판교': ['판교', '판교테크노밸리', '분당'],
  '일산': ['일산', '라페스타', '웨스턴돔', '킨텍스', '정발산'],
  '수원': ['수원', '광교', '영통', '인계동', '행궁동'],
  '용인': ['용인', '수지', '기흥', '처인'],
  '화성': ['화성', '동탄', '동탄신도시'],
  '안양': ['안양', '평촌', '범계'],
  '부천': ['부천', '중동', '상동'],
  '고양': ['고양', '삼송', '화정'],
  '성남': ['성남', '모란', '태평'],
  '하남': ['하남', '미사', '스타필드하남'],
  '김포': ['김포', '장기동', '걸포'],
  // 인천
  '인천': ['인천', '송도', '부평', '구월동', '청라'],
  '송도': ['송도', '송도신도시', '인천송도'],
  // 부산
  '해운대': ['해운대', '광안리', '센텀', '마린시티', '좌동'],
  '서면': ['서면', '부산서면', '전포동', '전포카페거리'],
  '남포동': ['남포동', '부산남포', '광복동'],
  '부산': ['부산', '부산일상', '부산사람'],
  '기장': ['기장', '정관', '오시리아'],
  // 대구
  '대구': ['대구', '동성로', '수성구', '범어', '대구일상'],
  '수성구': ['수성구', '수성못', '범어', '들안길'],
  // 대전
  '대전': ['대전', '유성', '둔산', '대전일상'],
  '유성': ['유성', '유성온천', '봉명동', '궁동'],
  // 광주
  '광주': ['광주', '충장로', '상무지구', '수완', '광주일상'],
  // 제주
  '제주': ['제주', '제주도', '서귀포', '애월', '제주일상'],
};

// ── 카테고리별 해시태그 접미어 ──

export const CATEGORY_SUFFIXES: Record<string, string[]> = {
  food:      ['맛집', '카페', '핫플', '맛집추천', '카페추천', '먹스타그램', '맛스타그램'],
  beauty:    ['뷰티', '미용', '네일', '피부관리', '헤어', '셀프케어'],
  lifestyle: ['일상', '데일리', '라이프', '소통'],
  parenting: ['육아', '육아맘', '아기', '워킹맘', '주부'],
  health:    ['운동', '헬스', '필라테스', '요가', '다이어트', '건강'],
  fashion:   ['패션', '오오티디', '데일리룩', '코디'],
  local:     ['일상', '소식', '동네', '이벤트'],
  office:    ['직장인', '회사원', '퇴근후', '점심', '직장인맛집', '직장인일상'],
  selfcare:  ['자기관리', '셀프케어', '뷰티루틴', '피부', '건강관리'],
  vlog:      ['브이로그', '일상기록', '일상브이로그', '데일리로그'],
  interior:  ['인테리어', '살림', '홈카페', '집꾸미기', '살림스타그램'],
  pet:       ['반려견', '반려묘', '강아지', '고양이', '펫스타그램'],
};

// ── 해시태그 자동 생성 ──

/**
 * 지역 + 카테고리 조합으로 해시태그를 자동 생성합니다.
 *
 * @param location 병원 위치 (예: "강남", "해운대")
 * @param categoryIds 선택된 카테고리 ID 배열
 * @returns 해시태그 배열 (중복 제거)
 */
export function generateInfluencerHashtags(location: string, categoryIds: string[]): string[] {
  // 지역 변형 찾기 (입력 텍스트에서 매칭)
  const cleanLoc = location.replace(/역|구|동|시|특별시|광역시/g, '').trim();
  const locationVariants = findLocationVariants(cleanLoc);
  const hashtags = new Set<string>();

  // 주요 지역명 2~3개만 사용 (너무 많으면 검색 효율 떨어짐)
  const topLocations = locationVariants.slice(0, 3);

  // 지역 + 카테고리 조합
  for (const loc of topLocations) {
    if (categoryIds.length > 0) {
      for (const catId of categoryIds) {
        const suffixes = CATEGORY_SUFFIXES[catId] || [];
        for (const suffix of suffixes.slice(0, 4)) { // 카테고리당 최대 4개
          hashtags.add(`${loc}${suffix}`);
        }
      }
    }
    // 지역 기본
    hashtags.add(`${loc}일상`);
    hashtags.add(`${loc}추천`);
  }

  // 카테고리 미선택 시 기본 세트
  if (categoryIds.length === 0) {
    for (const loc of topLocations) {
      hashtags.add(`${loc}맛집`);
      hashtags.add(`${loc}카페`);
      hashtags.add(`${loc}핫플`);
    }
  }

  return Array.from(hashtags);
}

/** 입력 지역명에서 LOCATION_HASHTAGS의 변형을 찾습니다 */
function findLocationVariants(input: string): string[] {
  // 정확 매칭
  if (LOCATION_HASHTAGS[input]) return LOCATION_HASHTAGS[input];

  // 부분 매칭 (입력이 키워드에 포함되거나, 키워드가 입력에 포함)
  for (const [region, variants] of Object.entries(LOCATION_HASHTAGS)) {
    if (input.includes(region) || region.includes(input)) return variants;
    if (variants.some(v => input.includes(v) || v.includes(input))) return variants;
  }

  // 매칭 실패 → 입력 그대로 사용
  return [input];
}

/**
 * 해시태그 배열을 표시용 문자열로 변환
 */
export function hashtagsToString(tags: string[]): string {
  return tags.join(', ');
}

/**
 * 문자열에서 해시태그 배열로 변환
 */
export function stringToHashtags(str: string): string[] {
  return str.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
}
