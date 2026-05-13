/**
 * 카테고리별 CTA 힌트 (블로그 5빌더 quartet — PR #194-197 set 정합).
 *
 * 진단 결과 dashboard 의 "추천 CTA" chip 박스용. 환자 친화 권유 톤이라 register 가
 * PRESS_CATEGORY_TONE (3인칭 기사체) / CATEGORY_TONE (블로그 본문) 와 다름:
 *   - 본 record: 콘텐츠 말미에 자연스럽게 붙는 "행동 권유 한 줄"
 *   - 의료법 정합 — "보장", "완치", "최고", "100%", "확실" 등 금기 어휘 0
 *   - CLAUDE.md prose_flow 정합 — 줄글 한 문장 (글머리표·번호 list 금지)
 *
 * 미등록 카테고리 → getCategoryCtaHint() 가 null 반환 → UI 가 chip 미렌더.
 */

export const CATEGORY_CTA_HINT: Record<string, string> = {
  '치과':
    '치과 상담은 평일 진료 시간 내 전화 또는 카카오톡 채널로 편하게 문의 주세요.',
  '피부과':
    '피부 고민 상담은 정기 진료 예약으로 시술 가능 여부와 일정을 함께 안내드립니다.',
  '성형외과':
    '상담 예약은 공식 홈페이지 폼 또는 카카오톡 채널로 받으며, 충분한 시간을 두고 진행합니다.',
  '내과':
    '증상이 지속된다면 평일 정기 진료 시간 내 방문 또는 전화 문의로 일정 안내를 받아보세요.',
  '정형외과':
    'X-ray 나 MRI 검사가 필요할 수 있으니 사전 예약으로 검사 시간까지 함께 잡으시는 편이 좋습니다.',
  '한의원':
    '맥진과 체질 상담은 진료 시간 내 방문 예약이 필요하니 미리 일정을 잡아 주세요.',
  '안과':
    '시력 검사와 정밀 진단은 진료 예약 시 충분한 시간을 두고 함께 진행됩니다.',
};

/**
 * 카테고리 → CTA 힌트 한 줄. 미등록·undefined 시 null.
 */
export function getCategoryCtaHint(category: string | undefined | null): string | null {
  if (!category) return null;
  return CATEGORY_CTA_HINT[category] ?? null;
}
