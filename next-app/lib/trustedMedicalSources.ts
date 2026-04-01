/**
 * 신뢰할 수 있는 의료 정보 출처 + 진료과별 전문성 가이드
 * 모든 프롬프트에서 import해서 사용
 */

/** 공통 (모든 진료과) */
export const COMMON_SOURCES = [
  { name: '질병관리청', url: 'kdca.go.kr' },
  { name: '보건복지부', url: 'mohw.go.kr' },
  { name: '국민건강보험공단', url: 'nhis.or.kr' },
  { name: '건강보험심사평가원', url: 'hira.or.kr' },
  { name: '대한의사협회', url: 'kma.org' },
  { name: '서울대학교병원 건강정보', url: 'snuh.org' },
  { name: '삼성서울병원 건강정보', url: 'samsunghospital.com' },
  { name: '세브란스병원 건강정보', url: 'severance.healthcare' },
  { name: '국가건강정보포털', url: 'health.kdca.go.kr' },
  { name: '식품의약품안전처', url: 'mfds.go.kr' },
];

/** 진료과별 전문 출처 */
export const CATEGORY_SOURCES: Record<string, { name: string; url: string }[]> = {
  '치과': [
    { name: '대한치과의사협회', url: 'kda.or.kr' },
    { name: '대한치의학회', url: 'kads.or.kr' },
    { name: '대한치과보철학회', url: 'kap.or.kr' },
    { name: '대한치과보존학회', url: 'kscd.org' },
    { name: '대한치주과학회', url: 'perio.or.kr' },
    { name: '대한구강악안면외과학회', url: 'kaoms.org' },
    { name: '대한치과교정학회', url: 'kao.or.kr' },
    { name: '대한소아치과학회', url: 'kapd.org' },
    { name: '대한치과재료학회', url: 'kadm.org' },
    { name: '대한치과기공사협회', url: 'kdtech.or.kr' },
    { name: '대한치과기공학회', url: 'kci.go.kr' },
  ],
  '피부과': [
    { name: '대한피부과학회', url: 'derma.or.kr' },
    { name: '대한피부과의사회', url: 'dermatologist.or.kr' },
    { name: '대한미용피부외과학회', url: 'kacos.org' },
    { name: '대한레이저피부모발학회', url: 'kslms.or.kr' },
    { name: '대한피부항노화학회', url: 'ksdaa.or.kr' },
  ],
  '정형외과': [
    { name: '대한정형외과학회', url: 'koa.or.kr' },
    { name: '대한정형외과의사회', url: 'koreanos.org' },
    { name: '대한척추외과학회', url: 'spine.or.kr' },
    { name: '대한관절경학회', url: 'arthroscopy.or.kr' },
    { name: '대한슬관절학회', url: 'kkss.or.kr' },
    { name: '대한견주관절학회', url: 'kses.or.kr' },
    { name: '대한스포츠의학회', url: 'kssm.or.kr' },
    { name: '대한골대사학회', url: 'ksbmr.org' },
  ],
};

/** 프롬프트에 삽입할 출처 가이드 텍스트 */
export function getTrustedSourcesPromptBlock(category?: string): string {
  const common = COMMON_SOURCES.map(s => s.name).join(', ');
  const specific = CATEGORY_SOURCES[category || ''];
  const specificText = specific ? specific.map(s => s.name).join(', ') : '';

  return `[신뢰할 수 있는 의료 정보 출처 — Google Search 시 우선 참조]
공통: ${common}
${specificText ? `${category} 전문: ${specificText}` : ''}
→ 위 기관의 정보를 우선적으로 참고하세요.
→ 블로그, 카페, 지식인, 나무위키 등 비공식 출처의 의학 정보는 참고하지 마세요.
→ 출처를 글에 직접 인용하지는 마세요 ("~에 따르면" 금지). 정보만 자연스럽게 반영.`;
}
