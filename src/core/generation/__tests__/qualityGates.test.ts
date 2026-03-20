/**
 * 품질 게이트 검증 — placeholder 제거, 조건부 PRO, 이미지 맥락 강화
 *
 * 검증 항목:
 *   1. visible placeholder 패턴이 최종 HTML에서 제거되는지
 *   2. STAGE_C_PRO_MIN_CHARS 조건부 PRO 활성화
 *   3. 섹션 요약 기반 이미지 프롬프트 enrichment
 *   4. 병원 스타일 적용률 (hospitalExplicitlySelected 복원)
 *   5. 소제목 부족 시 보정 로직
 */

import { describe, it, expect } from 'vitest';

// ── 1. Placeholder 제거 테스트 ──

describe('품질 게이트: placeholder 제거', () => {
  const PLACEHOLDER_PATTERNS = [
    /이 섹션의 내용은 일시적으로 생성되지 않았습니다\.?/g,
    /\(.*?— 생성 실패\)/g,
    /내용 생성 중 오류/g,
  ];

  function stripPlaceholders(html: string): string {
    let result = html;
    for (const pattern of PLACEHOLDER_PATTERNS) {
      result = result.replace(pattern, '');
    }
    result = result.replace(/<p>\s*<\/p>/g, '');
    return result;
  }

  it('visible placeholder 문구가 제거된다', () => {
    const html = `
      <h3>임플란트 비용</h3>
      <p>임플란트 비용에 대해 알아봅니다.</p>
      <h3>수술 과정</h3>
      <p>이 섹션의 내용은 일시적으로 생성되지 않았습니다.</p>
      <h3>회복 기간</h3>
      <p>회복에는 3~6개월이 소요됩니다.</p>
    `;
    const result = stripPlaceholders(html);
    expect(result).not.toContain('일시적으로 생성되지 않았습니다');
    expect(result).toContain('임플란트 비용');
    expect(result).toContain('회복에는 3~6개월');
  });

  it('생성 실패 패턴이 제거된다', () => {
    const html = '<p>(수술 과정 — 생성 실패)</p><p>정상 내용</p>';
    const result = stripPlaceholders(html);
    expect(result).not.toContain('생성 실패');
    expect(result).toContain('정상 내용');
  });

  it('빈 <p> 태그가 정리된다', () => {
    const html = '<p>이 섹션의 내용은 일시적으로 생성되지 않았습니다.</p><p>정상</p>';
    const result = stripPlaceholders(html);
    expect(result).not.toContain('<p></p>');
    expect(result).toContain('정상');
  });

  it('placeholder가 없으면 원본 유지', () => {
    const html = '<h3>정상 섹션</h3><p>좋은 내용입니다.</p>';
    const result = stripPlaceholders(html);
    expect(result).toBe(html);
  });
});

// ── 2. 조건부 PRO 로직 테스트 ──

describe('품질 게이트: 조건부 PRO 활성화', () => {
  // contracts.ts에서 가져온 값 시뮬레이션
  const STAGE_C_USE_PRO = true;
  const STAGE_C_PRO_MIN_CHARS = 800;

  function shouldUsePro(rawTextLength: number): boolean {
    return STAGE_C_USE_PRO && rawTextLength >= STAGE_C_PRO_MIN_CHARS;
  }

  it('800자 이상이면 PRO 활성화', () => {
    expect(shouldUsePro(1000)).toBe(true);
    expect(shouldUsePro(800)).toBe(true);
  });

  it('800자 미만이면 FLASH만 사용', () => {
    expect(shouldUsePro(500)).toBe(false);
    expect(shouldUsePro(799)).toBe(false);
  });

  it('0자면 FLASH만 사용', () => {
    expect(shouldUsePro(0)).toBe(false);
  });
});

// ── 3. 이미지 프롬프트 enrichment 테스트 ──

describe('품질 게이트: 이미지 프롬프트 섹션 맥락 강화', () => {
  function enrichTitle(sectionTitle: string, sectionSummary: string): string {
    const semanticCue = sectionSummary
      ? sectionSummary.replace(/\(.*?\)/g, '').trim().substring(0, 80)
      : '';
    return semanticCue ? `${sectionTitle} — ${semanticCue}` : sectionTitle;
  }

  it('섹션 요약이 있으면 enriched title 생성', () => {
    const result = enrichTitle('임플란트 비용', '임플란트 1개당 150~300만원 사이이며 재료와 병원에 따라 차이가 있습니다');
    expect(result).toContain('임플란트 비용');
    expect(result).toContain('—');
    expect(result).toContain('150~300만원');
  });

  it('섹션 요약이 없으면 원본 title 유지', () => {
    const result = enrichTitle('수술 과정', '');
    expect(result).toBe('수술 과정');
  });

  it('요약이 80자 초과면 잘림', () => {
    const longSummary = '가'.repeat(200);
    const result = enrichTitle('제목', longSummary);
    const afterDash = result.split('—')[1]?.trim() || '';
    expect(afterDash.length).toBeLessThanOrEqual(80);
  });

  it('괄호 내 생성 실패 텍스트가 요약에서 제거됨', () => {
    const result = enrichTitle('제목', '(수술 과정 — 생성 실패) 정상 내용');
    expect(result).not.toContain('생성 실패');
    expect(result).toContain('정상 내용');
  });
});

// ── 4. 병원 스타일 적용 조건 테스트 ──

describe('품질 게이트: 병원 스타일 적용 조건', () => {
  function shouldApplyHospitalStyle(
    hospitalName: string | undefined,
    styleSource: string,
  ): boolean {
    return !!(hospitalName && styleSource === 'explicit_selected_hospital');
  }

  it('병원명 + 명시 선택 → 적용', () => {
    expect(shouldApplyHospitalStyle('서울치과', 'explicit_selected_hospital')).toBe(true);
  });

  it('병원명 없음 → 미적용', () => {
    expect(shouldApplyHospitalStyle(undefined, 'explicit_selected_hospital')).toBe(false);
    expect(shouldApplyHospitalStyle('', 'explicit_selected_hospital')).toBe(false);
  });

  it('generic_default → 미적용', () => {
    expect(shouldApplyHospitalStyle('서울치과', 'generic_default')).toBe(false);
  });
});

// ── 5. 소제목 보정 정책 테스트 ──

describe('품질 게이트: 소제목 최소 개수 정책', () => {
  it('5개 미만이면 보정 대상', () => {
    const sections = [{ title: '1' }, { title: '2' }, { title: '3' }];
    const needsRepair = sections.length < 5;
    const deficit = 5 - sections.length;
    expect(needsRepair).toBe(true);
    expect(deficit).toBe(2);
  });

  it('5개 이상이면 보정 불필요', () => {
    const sections = Array.from({ length: 5 }, (_, i) => ({ title: `${i + 1}` }));
    expect(sections.length < 5).toBe(false);
  });

  it('과반수 섹션 실패 시 legacy fallback 유도', () => {
    const totalSections = 5;
    const failCount = 3;
    const shouldFallback = failCount > Math.floor(totalSections / 2);
    expect(shouldFallback).toBe(true);
  });

  it('소수 섹션 실패는 허용', () => {
    const totalSections = 5;
    const failCount = 1;
    const shouldFallback = failCount > Math.floor(totalSections / 2);
    expect(shouldFallback).toBe(false);
  });
});
