/**
 * blogImagePlanner — 웨이브 계획 + 레이아웃 마커 삽입 단위 테스트
 *
 * 검증 대상:
 *   A. planBlogImageWaves() — 0~5장(+α) 웨이브 분할
 *   B. insertBlogImageMarkers() — 0~5장 마커 삽입 위치/수량/순서
 *
 * 모든 함수가 순수 함수이므로 mock 없이 입력→출력 검증만 수행.
 */
import { describe, it, expect } from 'vitest';
import { planBlogImageWaves, insertBlogImageMarkers, buildHeroRetryItem } from '../blogImagePlanner';
import type { ImageStyle } from '../../../types';

// ── 테스트 헬퍼 ──

const STYLE: ImageStyle = 'illustration';
const RATIO = '16:9';

function makePrompts(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    i === 0
      ? '임플란트 치료 — 주제 상징 이미지'
      : `임플란트 관련 보조 이미지 ${i}`
  );
}

/** h3 4개 + intro 단락이 있는 전형적인 블로그 HTML */
function makeBlogHtml(sectionCount: number = 4): string {
  let html = '<div class="naver-post-container">';
  html += '<p>도입부 문단입니다. 임플란트에 대해 알아보겠습니다.</p>';
  for (let i = 1; i <= sectionCount; i++) {
    html += `<h3>소제목 ${i}</h3><p>섹션 ${i} 본문 내용입니다.</p>`;
  }
  html += '<p>마무리 문단입니다.</p></div>';
  return html;
}

/** h3 없이 p만 있는 HTML */
function makeNoH3Html(): string {
  return '<div class="naver-post-container">'
    + '<p>첫번째 문단</p><p>두번째 문단</p>'
    + '<p>세번째 문단</p><p>네번째 문단</p>'
    + '<p>다섯번째 문단</p><p>여섯번째 문단</p>'
    + '</div>';
}

// ═══════════════════════════════════════
// A. planBlogImageWaves
// ═══════════════════════════════════════

describe('planBlogImageWaves — 웨이브 분할', () => {
  it('count=0 → 웨이브 0개 (생성 완전 스킵)', () => {
    const waves = planBlogImageWaves(makePrompts(5), 0, STYLE, RATIO);
    expect(waves).toHaveLength(0);
  });

  it('count=1 → 웨이브 1개, hero 1장', () => {
    const waves = planBlogImageWaves(makePrompts(5), 1, STYLE, RATIO);
    expect(waves).toHaveLength(1);
    expect(waves[0].items).toHaveLength(1);
    expect(waves[0].items[0].role).toBe('hero');
    expect(waves[0].items[0].index).toBe(0);
  });

  it('count=2 → 웨이브 1개, hero 1 + sub 1', () => {
    const waves = planBlogImageWaves(makePrompts(5), 2, STYLE, RATIO);
    expect(waves).toHaveLength(1);
    expect(waves[0].items).toHaveLength(2);
    expect(waves[0].items[0].role).toBe('hero');
    expect(waves[0].items[1].role).toBe('sub');
  });

  it('count=3 → 웨이브 1개, hero 1 + sub 2', () => {
    const waves = planBlogImageWaves(makePrompts(5), 3, STYLE, RATIO);
    expect(waves).toHaveLength(1);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[0].items[0].role).toBe('hero');
    expect(waves[0].items[1].role).toBe('sub');
    expect(waves[0].items[2].role).toBe('sub');
  });

  it('count=4 → 웨이브 2개 (3+1), hero는 첫 웨이브', () => {
    const waves = planBlogImageWaves(makePrompts(5), 4, STYLE, RATIO);
    expect(waves).toHaveLength(2);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[1].items).toHaveLength(1);
    expect(waves[0].items[0].role).toBe('hero');
    expect(waves[1].items[0].role).toBe('sub');
  });

  it('count=5 → 웨이브 2개 (3+2), hero는 첫 웨이브', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, STYLE, RATIO);
    expect(waves).toHaveLength(2);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[1].items).toHaveLength(2);
    expect(waves[0].items[0].role).toBe('hero');
  });

  it('첫 아이템만 hero, 나머지는 전부 sub', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, STYLE, RATIO);
    const allItems = waves.flatMap(w => w.items);
    expect(allItems[0].role).toBe('hero');
    for (let i = 1; i < allItems.length; i++) {
      expect(allItems[i].role).toBe('sub');
    }
  });

  it('블로그 이미지는 blog 모드 사용 (hero 35s, sub 40s timeout)', () => {
    const waves = planBlogImageWaves(makePrompts(3), 3, STYLE, RATIO);
    const allItems = waves.flatMap(w => w.items);
    for (const item of allItems) {
      expect(item.mode).toBe('blog');
    }
  });

  it('prompt 수가 count보다 많아도 count만큼만 slice', () => {
    const prompts = makePrompts(10); // 10개 프롬프트
    const waves = planBlogImageWaves(prompts, 3, STYLE, RATIO);
    const totalItems = waves.reduce((sum, w) => sum + w.items.length, 0);
    expect(totalItems).toBe(3);
  });

  it('prompt 수가 count보다 적으면 prompt 수만큼만 생성', () => {
    const prompts = makePrompts(2); // 2개 프롬프트
    const waves = planBlogImageWaves(prompts, 5, STYLE, RATIO);
    const totalItems = waves.reduce((sum, w) => sum + w.items.length, 0);
    expect(totalItems).toBe(2);
  });

  it('빈 프롬프트 배열 → 빈 웨이브', () => {
    const waves = planBlogImageWaves([], 5, STYLE, RATIO);
    expect(waves).toHaveLength(0);
  });

  it('웨이브 label이 순차적으로 붙는지', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, STYLE, RATIO);
    expect(waves[0].label).toBe('wave-1');
    expect(waves[1].label).toBe('wave-2');
  });

  it('index가 0부터 count-1까지 연속인지', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, STYLE, RATIO);
    const indices = waves.flatMap(w => w.items.map(i => i.index));
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('count=6 → 웨이브 2개 (3+3) — 확장성 검증', () => {
    const waves = planBlogImageWaves(makePrompts(6), 6, STYLE, RATIO);
    expect(waves).toHaveLength(2);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[1].items).toHaveLength(3);
  });

  it('count=7 → 웨이브 3개 (3+3+1) — 확장성 검증', () => {
    const waves = planBlogImageWaves(makePrompts(7), 7, STYLE, RATIO);
    expect(waves).toHaveLength(3);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[1].items).toHaveLength(3);
    expect(waves[2].items).toHaveLength(1);
  });

  it('medical style: count=5 → 웨이브 3개 (2+2+1) — capacity=2', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, 'medical', RATIO);
    expect(waves).toHaveLength(3);
    expect(waves[0].items).toHaveLength(2);
    expect(waves[1].items).toHaveLength(2);
    expect(waves[2].items).toHaveLength(1);
    expect(waves[0].items[0].role).toBe('hero');
  });

  it('medical style: count=3 → 웨이브 2개 (2+1) — capacity=2', () => {
    const waves = planBlogImageWaves(makePrompts(3), 3, 'medical', RATIO);
    expect(waves).toHaveLength(2);
    expect(waves[0].items).toHaveLength(2);
    expect(waves[1].items).toHaveLength(1);
  });

  it('illustration style: count=5 → 웨이브 2개 (3+2) — capacity=3 유지', () => {
    const waves = planBlogImageWaves(makePrompts(5), 5, 'illustration', RATIO);
    expect(waves).toHaveLength(2);
    expect(waves[0].items).toHaveLength(3);
    expect(waves[1].items).toHaveLength(2);
  });
});

// ═══════════════════════════════════════
// B. insertBlogImageMarkers — 레이아웃 마커 삽입
// ═══════════════════════════════════════

describe('insertBlogImageMarkers — 마커 삽입 (h3 있는 블로그)', () => {
  it('0장 → 마커 없음, HTML 변경 없음', () => {
    const html = makeBlogHtml(4);
    const result = insertBlogImageMarkers(html, 0);
    expect(result).toBe(html);
    expect(result).not.toContain('[IMG_');
  });

  it('1장 → [IMG_1]만 삽입, intro 위치', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 1);
    expect(result).toContain('[IMG_1]');
    expect(result).not.toContain('[IMG_2]');
    // intro 위치: 첫 h3 앞
    const img1Pos = result.indexOf('[IMG_1]');
    const h3Pos = result.indexOf('<h3>');
    expect(img1Pos).toBeLessThan(h3Pos);
  });

  it('2장 → [IMG_1]+[IMG_2], intro + 첫 section', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 2);
    expect(result).toContain('[IMG_1]');
    expect(result).toContain('[IMG_2]');
    expect(result).not.toContain('[IMG_3]');
  });

  it('3장 → [IMG_1]~[IMG_3], 번호 누락 없음', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 3);
    for (let i = 1; i <= 3; i++) {
      expect(result).toContain(`[IMG_${i}]`);
    }
    expect(result).not.toContain('[IMG_4]');
  });

  it('4장 → [IMG_1]~[IMG_4], 번호 누락 없음', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 4);
    for (let i = 1; i <= 4; i++) {
      expect(result).toContain(`[IMG_${i}]`);
    }
    expect(result).not.toContain('[IMG_5]');
  });

  it('5장 → [IMG_1]~[IMG_5], 번호 누락/중복 없음', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 5);
    for (let i = 1; i <= 5; i++) {
      const matches = (result.match(new RegExp(`\\[IMG_${i}\\]`, 'g')) || []);
      expect(matches).toHaveLength(1);
    }
  });

  it('마커 번호가 1부터 순차적으로 증가', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 5);
    const markers = result.match(/\[IMG_(\d+)\]/g) || [];
    const numbers = markers.map(m => parseInt(m.match(/\d+/)![0]));
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('h3 2개 + 5장 → 자연위치 3개(intro+2 section) + tail 2개', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(2), 5);
    for (let i = 1; i <= 5; i++) {
      expect(result).toContain(`[IMG_${i}]`);
    }
  });

  it('모든 마커가 content-image-wrapper div 안에 있는지', () => {
    const result = insertBlogImageMarkers(makeBlogHtml(4), 3);
    const wrapperCount = (result.match(/class="content-image-wrapper"/g) || []).length;
    expect(wrapperCount).toBe(3);
  });
});

describe('insertBlogImageMarkers — 마커 삽입 (h3 없는 블로그)', () => {
  it('h3 없음 + 1장 → paragraph 기반 배치', () => {
    const result = insertBlogImageMarkers(makeNoH3Html(), 1);
    expect(result).toContain('[IMG_1]');
    expect(result).not.toContain('[IMG_2]');
  });

  it('h3 없음 + 3장 → paragraph 기반 + tail 보충', () => {
    const result = insertBlogImageMarkers(makeNoH3Html(), 3);
    for (let i = 1; i <= 3; i++) {
      expect(result).toContain(`[IMG_${i}]`);
    }
  });
});

describe('insertBlogImageMarkers — intro 없는 블로그', () => {
  it('intro 단락 없이 h3로 시작 → section 기반 배치', () => {
    const html = '<h3>첫 소제목</h3><p>본문1</p><h3>둘째</h3><p>본문2</p>';
    const result = insertBlogImageMarkers(html, 2);
    expect(result).toContain('[IMG_1]');
    expect(result).toContain('[IMG_2]');
    // intro 없으므로 section 위치에 배치
    const img1Pos = result.indexOf('[IMG_1]');
    const firstH3End = result.indexOf('</h3>') + '</h3>'.length;
    expect(img1Pos).toBeGreaterThan(firstH3End);
  });
});

// ═══════════════════════════════════════
// C. buildHeroRetryItem — hero 재시도 아이템
// ═══════════════════════════════════════

describe('buildHeroRetryItem — hero 재시도 전략', () => {
  it('role=hero, index=0, mode=blog', () => {
    const item = buildHeroRetryItem('임플란트 치료', STYLE, RATIO);
    expect(item.role).toBe('hero');
    expect(item.index).toBe(0);
    expect(item.mode).toBe('blog');
  });

  it('프롬프트가 간결 (원본 topic 60자 이내 + 짧은 지시)', () => {
    const longTopic = '가나다라마바사아자차카타파하'.repeat(10); // 140자
    const item = buildHeroRetryItem(longTopic, STYLE, RATIO);
    // 프롬프트 전체 길이가 합리적인 범위 (200자 이내)
    expect(item.prompt.length).toBeLessThan(200);
  });

  it('customStylePrompt가 전달되면 포함', () => {
    const item = buildHeroRetryItem('치아미백', STYLE, RATIO, '밝은 톤');
    expect(item.customStylePrompt).toBe('밝은 톤');
  });
});
