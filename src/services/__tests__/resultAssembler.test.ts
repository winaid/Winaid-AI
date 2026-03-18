/**
 * resultAssembler 핵심 변환 함수 테스트
 *
 * 목적: HTML 변환 파이프라인의 계약을 보호한다.
 * 모든 함수가 순수 함수이므로 mock 없이 입력→출력 검증만 수행.
 */
import { describe, it, expect } from 'vitest';
import {
  cleanMarkdownArtifacts,
  ensureContainerWrapper,
  normalizeSubtitles,
  insertImageMarkers,
  wrapFinalHtml,
  generateCardNewsFallbackTemplate,
  MEDICAL_DISCLAIMER,
} from '../resultAssembler';

// ═══════════════════════════════════════
// cleanMarkdownArtifacts
// ═══════════════════════════════════════

describe('cleanMarkdownArtifacts', () => {
  it('마크다운 ** 볼드를 제거한다', () => {
    const input = '<p>**중요한 내용**입니다</p>';
    const result = cleanMarkdownArtifacts(input);
    expect(result).toBe('<p>중요한 내용입니다</p>');
    expect(result).not.toContain('**');
  });

  it('JSON 배열 응답에서 content를 추출한다', () => {
    const input = JSON.stringify([
      { content: '<p>첫번째</p>' },
      { content: '<p>두번째</p>' },
    ]);
    const result = cleanMarkdownArtifacts(input);
    expect(result).toContain('<p>첫번째</p>');
    expect(result).toContain('<p>두번째</p>');
  });

  it('JSON 객체 응답에서 html을 추출한다', () => {
    const input = JSON.stringify({ html: '<div>내용</div>' });
    const result = cleanMarkdownArtifacts(input);
    expect(result).toBe('<div>내용</div>');
  });

  it('일반 HTML은 그대로 반환한다', () => {
    const input = '<div class="test"><p>안녕하세요</p></div>';
    expect(cleanMarkdownArtifacts(input)).toBe(input);
  });
});

// ═══════════════════════════════════════
// ensureContainerWrapper
// ═══════════════════════════════════════

describe('ensureContainerWrapper', () => {
  it('블로그에 naver-post-container가 없으면 래핑한다', () => {
    const input = '<p>본문</p>';
    const result = ensureContainerWrapper(input, 'blog');
    expect(result).toBe('<div class="naver-post-container"><p>본문</p></div>');
  });

  it('이미 naver-post-container가 있으면 그대로 반환한다', () => {
    const input = '<div class="naver-post-container"><p>본문</p></div>';
    const result = ensureContainerWrapper(input, 'blog');
    expect(result).toBe(input);
  });

  it('카드뉴스는 래핑하지 않는다', () => {
    const input = '<div class="card-slide">내용</div>';
    const result = ensureContainerWrapper(input, 'card_news');
    expect(result).toBe(input);
  });

  it('보도자료도 naver-post-container로 래핑한다', () => {
    const input = '<p>보도자료 내용</p>';
    const result = ensureContainerWrapper(input, 'press_release');
    expect(result).toContain('naver-post-container');
  });
});

// ═══════════════════════════════════════
// normalizeSubtitles
// ═══════════════════════════════════════

describe('normalizeSubtitles', () => {
  it('<p>**제목**</p>을 <h3>로 변환한다', () => {
    const input = '<p>**소제목입니다**</p>';
    const result = normalizeSubtitles(input);
    expect(result).toBe('<h3>소제목입니다</h3>');
  });

  it('<p>## 제목</p>을 <h3>로 변환한다', () => {
    const input = '<p>## 마크다운 제목</p>';
    const result = normalizeSubtitles(input);
    expect(result).toBe('<h3>마크다운 제목</h3>');
  });

  it('<p><strong>제목</strong></p>을 <h3>로 변환한다', () => {
    const input = '<p><strong>강조 제목</strong></p>';
    const result = normalizeSubtitles(input);
    expect(result).toBe('<h3>강조 제목</h3>');
  });

  it('<p><b>제목</b></p>을 <h3>로 변환한다', () => {
    const input = '<p><b>볼드 제목</b></p>';
    const result = normalizeSubtitles(input);
    expect(result).toBe('<h3>볼드 제목</h3>');
  });

  it('일반 p 태그는 건드리지 않는다', () => {
    const input = '<p>일반 본문 내용입니다</p>';
    const result = normalizeSubtitles(input);
    expect(result).toBe(input);
  });
});

// ═══════════════════════════════════════
// insertImageMarkers
// ═══════════════════════════════════════

describe('insertImageMarkers', () => {
  it('블로그: h3 뒤 첫 p 이후에 [IMG_N] 마커를 삽입한다', () => {
    const input = '<h3>소제목</h3><p>본문 내용</p><h3>두번째</h3><p>본문2</p>';
    const result = insertImageMarkers(input, 2, 'blog');
    expect(result).toContain('[IMG_1]');
    expect(result).toContain('[IMG_2]');
  });

  it('이미 [IMG_] 마커가 있으면 추가하지 않는다', () => {
    const input = '<h3>소제목</h3><p>본문</p>[IMG_1]';
    const result = insertImageMarkers(input, 1, 'blog');
    // 마커가 하나만 존재해야 한다
    const matches = result.match(/\[IMG_1\]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('imageCount=0이면 마커를 삽입하지 않는다', () => {
    const input = '<h3>소제목</h3><p>본문</p>';
    const result = insertImageMarkers(input, 0, 'blog');
    expect(result).not.toContain('[IMG_');
  });

  it('h3가 없으면 p 태그 기반으로 삽입한다', () => {
    const input = '<p>첫번째 문단</p><p>두번째 문단</p><p>세번째 문단</p><p>네번째 문단</p>';
    const result = insertImageMarkers(input, 1, 'blog');
    expect(result).toContain('[IMG_1]');
  });
});

// ═══════════════════════════════════════
// wrapFinalHtml
// ═══════════════════════════════════════

describe('wrapFinalHtml', () => {
  it('카드뉴스: card-news-container + 면책조항으로 래핑한다', () => {
    const body = '<div class="card-slide">슬라이드</div>';
    const result = wrapFinalHtml(body, {
      postType: 'card_news',
      topic: '임플란트',
      title: '임플란트 카드뉴스',
    });
    expect(result).toContain('card-news-container');
    expect(result).toContain('card-grid-wrapper');
    expect(result).toContain(MEDICAL_DISCLAIMER);
    expect(result).toContain('hidden-title');
  });

  it('블로그: BLOG_STYLES + main-title + naver-post-container로 래핑한다', () => {
    const body = '<p>본문 내용</p>';
    const result = wrapFinalHtml(body, {
      postType: 'blog',
      topic: '치아 미백',
      title: '치아 미백 가이드',
    });
    expect(result).toContain('<style>');
    expect(result).toContain('naver-post-container');
    expect(result).toContain('main-title');
    expect(result).toContain('치아 미백');
  });

  it('블로그: 이미 main-title이 있으면 중복 삽입하지 않는다', () => {
    const body = '<div class="naver-post-container"><h2 class="main-title">기존 제목</h2><p>내용</p></div>';
    const result = wrapFinalHtml(body, {
      postType: 'blog',
      topic: '치아 미백',
      title: '치아 미백 가이드',
    });
    const titleMatches = result.match(/class="main-title"/g) || [];
    expect(titleMatches.length).toBe(1);
  });

  it('블로그: topic이 없으면 title을 main-title로 사용한다', () => {
    const body = '<p>내용</p>';
    const result = wrapFinalHtml(body, {
      postType: 'blog',
      topic: '',
      title: '대체 제목',
    });
    expect(result).toContain('대체 제목');
  });
});

// ═══════════════════════════════════════
// generateCardNewsFallbackTemplate
// ═══════════════════════════════════════

describe('generateCardNewsFallbackTemplate', () => {
  it('이미 card-slide가 있으면 그대로 반환한다', () => {
    const input = '<div class="card-slide">기존 슬라이드</div>';
    expect(generateCardNewsFallbackTemplate(input, 3, '주제')).toBe(input);
  });

  it('card-slide 없으면 요청한 개수만큼 슬라이드를 생성한다', () => {
    const input = '<p>간단한 텍스트 내용입니다. 건강한 생활 습관을 알아봅시다.</p>';
    const result = generateCardNewsFallbackTemplate(input, 4, '건강');
    const slides = result.match(/class="card-slide"/g) || [];
    expect(slides.length).toBe(4);
  });
});
