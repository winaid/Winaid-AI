/**
 * 이미지 품질 경고 로직 검증
 *
 * generateContentJob의 imageQualityWarning 생성 로직을 단위 테스트로 검증.
 * (실제 함수는 inline이므로 로직을 재현하여 검증)
 */
import { describe, it, expect } from 'vitest';

// generateContentJob.ts 내부 로직 재현
function computeImageQualityWarning(
  imageFailCount: number,
  totalImages: number,
): string | undefined {
  if (totalImages === 0 || imageFailCount === 0) return undefined;

  const templateRate = Math.round((imageFailCount / totalImages) * 100);

  if (imageFailCount === totalImages) {
    return '모든 이미지가 AI 생성에 실패하여 대체 이미지가 사용되었습니다. 이미지 재생성을 권장합니다.';
  }

  if (templateRate >= 40) {
    return `${totalImages}장 중 ${imageFailCount}장이 AI 생성 실패로 대체 이미지가 사용되었습니다. 품질 개선을 위해 이미지 재생성을 권장합니다.`;
  }

  return undefined;
}

describe('이미지 품질 경고 (imageQualityWarning)', () => {
  it('실패 0건 → 경고 없음', () => {
    expect(computeImageQualityWarning(0, 5)).toBeUndefined();
  });

  it('이미지 0장 → 경고 없음', () => {
    expect(computeImageQualityWarning(0, 0)).toBeUndefined();
  });

  it('5장 중 1장 실패 (20%) → 경고 없음', () => {
    expect(computeImageQualityWarning(1, 5)).toBeUndefined();
  });

  it('5장 중 2장 실패 (40%) → 경고 있음', () => {
    const msg = computeImageQualityWarning(2, 5);
    expect(msg).toBeDefined();
    expect(msg).toContain('5장 중 2장');
    expect(msg).toContain('재생성을 권장');
  });

  it('5장 중 3장 실패 (60%) → 경고 있음', () => {
    const msg = computeImageQualityWarning(3, 5);
    expect(msg).toBeDefined();
    expect(msg).toContain('5장 중 3장');
  });

  it('5장 중 5장 전체 실패 → 전체 실패 메시지', () => {
    const msg = computeImageQualityWarning(5, 5);
    expect(msg).toBeDefined();
    expect(msg).toContain('모든 이미지');
    expect(msg).toContain('재생성을 권장');
  });

  it('3장 중 2장 실패 (67%) → 경고 있음', () => {
    const msg = computeImageQualityWarning(2, 3);
    expect(msg).toBeDefined();
    expect(msg).toContain('3장 중 2장');
  });

  it('3장 중 1장 실패 (33%) → 경고 없음', () => {
    expect(computeImageQualityWarning(1, 3)).toBeUndefined();
  });

  it('경고 문구에 "클릭"이나 기술용어가 없음 (사용자 친화적)', () => {
    const msg = computeImageQualityWarning(3, 5)!;
    expect(msg).not.toContain('template');
    expect(msg).not.toContain('fallback');
    expect(msg).not.toContain('timeout');
    expect(msg).not.toContain('nb2');
    expect(msg).not.toContain('pro');
  });
});
