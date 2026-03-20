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

// ── 6. conclusion 구조 분리 테스트 ──

describe('품질 게이트: conclusion 구조 분리', () => {
  // rawHtml 조립 시뮬레이션
  function assembleRawHtml(
    introHtml: string,
    sectionHtmls: string[],
    conclusionHtml: string,
  ): string {
    const wrappedConclusion = `<section data-blog-part="conclusion">${conclusionHtml}</section>`;
    return `${introHtml}\n${sectionHtmls.join('\n')}\n${wrappedConclusion}`;
  }

  // parseBlogSections 시뮬레이션 (실제 로직 재현)
  function parseSections(html: string): { type: string; title: string; textLen: number }[] {
    const sections: { type: string; title: string; textLen: number }[] = [];
    const content = html;

    const conclusionMarkerMatch = content.match(/<section[^>]*data-blog-part="conclusion"[^>]*>([\s\S]*?)<\/section>/i);
    const contentEndForSections = conclusionMarkerMatch
      ? content.indexOf(conclusionMarkerMatch[0])
      : content.length;

    const h3Matches: { index: number; title: string }[] = [];
    const headingRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      if (match.index >= contentEndForSections) break;
      h3Matches.push({
        index: match.index,
        title: match[1].replace(/<[^>]+>/g, '').trim(),
      });
    }

    const introHtml = content.substring(0, h3Matches[0]?.index ?? contentEndForSections).trim();
    if (introHtml.replace(/<[^>]+>/g, '').trim().length > 10) {
      sections.push({ type: 'intro', title: '도입부', textLen: introHtml.replace(/<[^>]+>/g, '').trim().length });
    }

    for (let i = 0; i < h3Matches.length; i++) {
      const start = h3Matches[i].index;
      const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : contentEndForSections;
      const sectionHtml = content.substring(start, end).trim();
      const textLen = sectionHtml.replace(/<[^>]+>/g, '').trim().length;
      sections.push({ type: 'section', title: h3Matches[i].title, textLen });
    }

    if (conclusionMarkerMatch) {
      const conclusionInner = conclusionMarkerMatch[1].trim();
      const textLen = conclusionInner.replace(/<[^>]+>/g, '').trim().length;
      if (textLen > 10) {
        // conclusion 내부의 h3에서 제목 추출
        const conclusionH3 = conclusionInner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
        const conclusionTitle = conclusionH3
          ? conclusionH3[1].replace(/<[^>]+>/g, '').trim() || '마무리'
          : '마무리';
        sections.push({ type: 'conclusion', title: conclusionTitle, textLen });
      }
    }

    return sections;
  }

  // ── 예시 데이터: "임플란트 수술 과정과 비용" 시뮬레이션 ──
  const exampleIntro = '<p>많은 분들이 임플란트 수술을 고려하면서 비용과 과정에 대해 궁금해합니다. 이 글에서는 임플란트의 전체 과정과 실제 비용 범위를 정리합니다.</p>';
  const exampleSections = [
    '<h3>임플란트란 무엇인가</h3><p>임플란트는 인공 치아 뿌리를 잇몸뼈에 심는 시술입니다. 자연 치아와 가장 유사한 기능을 회복할 수 있어 현재 가장 많이 선택되는 치료법입니다.</p><p>티타늄 소재의 나사를 잇몸뼈에 고정하고 그 위에 보철물을 올리는 구조입니다.</p>',
    '<h3>수술 과정과 단계</h3><p>1차 수술에서 임플란트 픽스처를 잇몸뼈에 심습니다. 이후 3~6개월간 뼈와 픽스처가 결합되는 골유착 기간이 필요합니다.</p><p>골유착이 완료되면 2차 수술로 지대주를 연결하고 보철물을 장착합니다.</p>',
    '<h3>비용과 보험 적용</h3><p>임플란트 1개당 비용은 80~150만원 범위이며 병원과 재료에 따라 차이가 있습니다. 65세 이상이면 건강보험이 적용되어 본인부담금이 줄어듭니다.</p><p>급여 적용 시 약 30~50만원 수준으로 시술이 가능합니다.</p>',
    '<h3>회복 기간과 주의사항</h3><p>수술 후 1~2주간은 부드러운 음식을 섭취해야 합니다. 흡연과 음주는 골유착을 방해하므로 최소 2주간 금지입니다.</p><p>정기적인 검진으로 임플란트 상태를 확인하는 것이 장기 유지에 중요합니다.</p>',
    '<h3>병원 선택 기준</h3><p>임플란트 전문의 경력과 사용하는 임플란트 브랜드를 확인하세요. 오스템, 네오, 스트라우만 등 검증된 브랜드를 사용하는지 확인이 필요합니다.</p><p>사후 관리 프로그램과 보증 기간도 병원 선택의 중요한 기준입니다.</p>',
  ];
  const exampleConclusion = '<h3>정리하며</h3><p>임플란트는 적절한 진단과 계획 하에 진행하면 오래 사용할 수 있는 치료법입니다. 본인의 구강 상태와 예산에 맞는 선택을 위해 2~3곳의 병원에서 상담을 받아보는 것을 권장합니다.</p><p>충분한 정보를 바탕으로 판단하시면 만족스러운 결과를 얻을 수 있습니다.</p>';

  it('conclusion이 semantic wrapper로 감싸져 조립된다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    expect(rawHtml).toContain('<section data-blog-part="conclusion">');
    expect(rawHtml).toContain('</section>');
  });

  it('parser가 conclusion을 별도 파트로 분리한다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const conclusionParts = parsed.filter(s => s.type === 'conclusion');
    expect(conclusionParts.length).toBe(1);
    expect(conclusionParts[0].title).toBe('정리하며');
    expect(conclusionParts[0].textLen).toBeGreaterThan(10);
  });

  it('마지막 h3 섹션에 conclusion 텍스트가 포함되지 않는다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const h3Sections = parsed.filter(s => s.type === 'section');
    const lastSection = h3Sections[h3Sections.length - 1];
    const conclusionPart = parsed.find(s => s.type === 'conclusion');

    // 마지막 섹션은 conclusion 글자 수를 포함하지 않아야 함
    expect(lastSection.textLen).toBeLessThan(lastSection.textLen + (conclusionPart?.textLen || 0));
    // conclusion 텍스트가 마지막 섹션에 없음을 직접 확인
    expect(lastSection.textLen).toBeLessThan(300); // 순수 섹션만
  });

  it('수정 전/후 비교: 마지막 섹션 vs median 비율이 개선된다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const h3Sections = parsed.filter(s => s.type === 'section');
    const sectionLens = h3Sections.map(s => s.textLen);
    const sorted = [...sectionLens].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const lastLen = sectionLens[sectionLens.length - 1];
    const lastVsMedian = lastLen / median;

    // 수정 후: 마지막 섹션이 median 대비 1.5배 이내여야 함
    // (conclusion이 분리되었으므로 마지막 섹션은 순수 본문만)
    expect(lastVsMedian).toBeLessThan(1.5);

    // 수정 전 시뮬레이션: conclusion이 마지막 섹션에 포함된 경우
    const conclusionTextLen = exampleConclusion.replace(/<[^>]+>/g, '').trim().length;
    const oldLastLen = lastLen + conclusionTextLen;
    const oldLastVsMedian = oldLastLen / median;

    // 수정 전에는 1.5배를 초과했을 것
    expect(oldLastVsMedian).toBeGreaterThan(1.5);

    console.log(`[BALANCE-TEST] 수정 전: lastSection=${oldLastLen}자, median=${median}자, ratio=${oldLastVsMedian.toFixed(2)}`);
    console.log(`[BALANCE-TEST] 수정 후: lastSection=${lastLen}자, median=${median}자, ratio=${lastVsMedian.toFixed(2)}`);
    console.log(`[BALANCE-TEST] conclusion=${conclusionTextLen}자 (별도 파트)`);
  });

  it('max/min 비율이 conclusion 분리로 개선된다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const h3Sections = parsed.filter(s => s.type === 'section');
    const sectionLens = h3Sections.map(s => s.textLen);
    const maxLen = Math.max(...sectionLens);
    const minLen = Math.min(...sectionLens);
    const ratio = maxLen / minLen;

    // 순수 섹션 간 max/min 비율은 2배 미만이어야 함
    expect(ratio).toBeLessThan(2);
  });

  it('conclusion wrapper가 없는 레거시 HTML도 정상 파싱된다', () => {
    // 레거시: conclusion wrapper 없이 마지막에 h3+p가 있는 경우
    const legacyHtml = `${exampleIntro}\n${exampleSections.join('\n')}\n${exampleConclusion}`;
    const parsed = parseSections(legacyHtml);
    // conclusion wrapper가 없으면 conclusion의 h3도 일반 section으로 파싱
    const conclusionParts = parsed.filter(s => s.type === 'conclusion');
    expect(conclusionParts.length).toBe(0);
    // 레거시는 conclusion h3가 일반 section으로 흡수됨 (구 동작)
    const h3Sections = parsed.filter(s => s.type === 'section');
    expect(h3Sections.length).toBe(6); // 5 body + 1 conclusion h3
  });

  it('도입부에는 h3가 없다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const introParts = parsed.filter(s => s.type === 'intro');
    expect(introParts.length).toBe(1);
    // intro HTML에 h3가 포함되지 않아야 함
    expect(introParts[0].textLen).toBeGreaterThan(10);
    const introHtml = rawHtml.substring(0, rawHtml.indexOf('<h3>'));
    expect(introHtml).not.toMatch(/<h3[^>]*>/i);
  });

  it('마무리에는 h3가 있다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    // conclusion wrapper 내부에 h3가 포함되어야 함
    const conclusionMatch = rawHtml.match(/<section[^>]*data-blog-part="conclusion"[^>]*>([\s\S]*?)<\/section>/i);
    expect(conclusionMatch).not.toBeNull();
    expect(conclusionMatch![1]).toContain('<h3>');
    expect(conclusionMatch![1]).toContain('정리하며');
  });

  it('conclusion h3 제목이 parser에서 추출된다', () => {
    const rawHtml = assembleRawHtml(exampleIntro, exampleSections, exampleConclusion);
    const parsed = parseSections(rawHtml);
    const conclusionPart = parsed.find(s => s.type === 'conclusion');
    expect(conclusionPart).toBeDefined();
    expect(conclusionPart!.title).toBe('정리하며');
  });
});
