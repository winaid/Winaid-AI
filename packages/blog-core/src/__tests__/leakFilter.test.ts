/**
 * leakFilter / leakFilterJson 회귀 테스트 (PR #161).
 *
 * 실행: cd packages/blog-core && npx tsx src/__tests__/leakFilter.test.ts
 *
 * 양 앱 routes (clinical / press / cardNews) 가 이 모듈을 import 하므로 본 테스트
 * 통과 = 해당 routes 의 누수 차단 보장. PR #160 의 normalizeBlog 테스트와 별도
 * (서로 다른 모듈이지만 동일 LEAK_PATTERNS 사용).
 */

import assert from 'node:assert/strict';
import {
  sanitizeLeakInHtml,
  sanitizeLeakInString,
  sanitizeLeakInSlideData,
  sanitizeLeakInSlideOutline,
  sanitizeLeakInSlides,
} from '../index';
import type { SlideData } from '../cardNewsLayouts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: boolean, expected = true): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`[FAIL] ${label} (expected ${expected}, got ${actual})`);
  }
}

// ── HTML 케이스 (clinical / press 후처리) ──────────────────────────────

console.log('\n=== sanitizeLeakInHtml ===');

// 정상 HTML 보존
{
  const html = '<h3>스케일링 받는 시기</h3><p>치아 관리 설명. [IMG_1 alt="치아"] 다음 설명.</p>';
  const r = sanitizeLeakInHtml(html);
  check('정상 HTML — 변경 없음 (paragraphs)', r.paragraphsStripped === 0);
  check('정상 HTML — 변경 없음 (headings)', r.headingsStripped === 0);
  check('정상 HTML — 출력 동일', r.html === html);
}

// 누수 헤딩 제거
{
  const html = '<h3>소제목을</h3><p>본문 내용입니다.</p>';
  const r = sanitizeLeakInHtml(html);
  check('누수 헤딩 — strip 발생', r.headingsStripped === 1);
  check('누수 헤딩 — body 보존', r.html.includes('<p>본문 내용입니다.</p>'));
  check('누수 헤딩 — heading 제거', !r.html.includes('소제목을'));
}

// 누수 <p> 제거
{
  const html = '<p>정상 본문.</p><p>이미지 위치는 [IMG_N alt="..."] 마커.</p>';
  const r = sanitizeLeakInHtml(html);
  check('누수 <p> — strip 발생', r.paragraphsStripped === 1);
  check('누수 <p> — 정상 본문 보존', r.html.includes('정상 본문.'));
  check('누수 <p> — leak 부분 제거', !r.html.includes('[IMG_N alt'));
}

// 누수 헤딩 + body 보존 (parseBlogSections 흡수 시뮬레이션)
{
  const html = '<h3>[META] Output format</h3><p>정상 본문 시작.</p><h3>스케일링 비용</h3><p>의료 본문.</p>';
  const r = sanitizeLeakInHtml(html);
  check('[META] 헤딩 제거', r.headingsStripped === 1);
  check('정상 헤딩 보존', r.html.includes('<h3>스케일링 비용</h3>'));
  check('첫 body 보존', r.html.includes('정상 본문 시작.'));
}

// press HTML 클래스 보존 (다운스트림 CSS 의존)
{
  const html = '<div class="press-release-container"><h1 class="press-title">제목</h1><p>본문</p></div>';
  const r = sanitizeLeakInHtml(html);
  check('press 클래스 보존', r.html.includes('press-release-container'));
  check('press 제목 클래스 보존', r.html.includes('press-title'));
}

// CLINICAL_IMG 마커 보존 (clinical 특수)
{
  const html = '<p>이 시술은 다음 단계로 진행됩니다. [CLINICAL_IMG_1] 환자 설명.</p>';
  const r = sanitizeLeakInHtml(html);
  check('CLINICAL_IMG 마커 보존', r.html.includes('[CLINICAL_IMG_1]'));
  check('CLINICAL_IMG <p> 보존', r.paragraphsStripped === 0);
}

// ── sanitizeLeakInString (cardNews 슬라이드 필드) ───────────────────────

console.log('\n=== sanitizeLeakInString ===');

// 정상 의료 텍스트 보존
{
  const r = sanitizeLeakInString('스케일링은 3개월에 한 번 받는 것이 좋습니다.');
  check('정상 의료 텍스트 — strip 0', r.stripped === 0);
  check('정상 의료 텍스트 — 출력 동일', r.text === '스케일링은 3개월에 한 번 받는 것이 좋습니다.');
}

// 짧은 정상 제목
{
  const r = sanitizeLeakInString('임플란트 가격 비교');
  check('정상 제목 통과', r.stripped === 0 && r.text === '임플란트 가격 비교');
}

// 메타 어휘 부분 매칭 — 매칭 부분만 제거
{
  const r = sanitizeLeakInString('스케일링 안내. [IMG_N alt="..."] 마커');
  check('메타 [IMG_N — strip', r.stripped >= 1);
  check('스케일링 본문 보존', r.text.includes('스케일링'));
  check('[IMG_N 제거', !r.text.includes('[IMG_N'));
}

// 전체가 메타인 짧은 헤딩 — anchored 패턴 적용 → 빈 문자열
{
  const r = sanitizeLeakInString('소제목을');
  check('"소제목을" 단독 — strip', r.stripped >= 1);
  check('"소제목을" — 빈 문자열', r.text === '');
}

// [META] 라벨 헤딩 — anchored
{
  const r = sanitizeLeakInString('[META] format');
  check('[META] 라벨 — strip', r.stripped >= 1);
  check('[META] 라벨 — 빈 문자열', r.text === '');
}

// 정상 텍스트 안 [IMG_1] (숫자 placeholder) — 보존
{
  const r = sanitizeLeakInString('치아 관리 [IMG_1 alt="..."] 본문');
  check('[IMG_1 정상 — strip 0', r.stripped === 0);
  check('[IMG_1 정상 — 보존', r.text.includes('[IMG_1'));
}

// "사용 가능 태그" 메타 어휘
{
  const r = sanitizeLeakInString('이번 단계는 사용 가능 태그 h3 입니다.');
  check('"사용 가능 태그" — strip', r.stripped >= 1);
  check('"사용 가능 태그" — 본문 일부 보존', r.text.includes('이번 단계는'));
}

// ── sanitizeLeakInSlideOutline ────────────────────────────────────────

console.log('\n=== sanitizeLeakInSlideOutline ===');

{
  const outline = [
    { layout: 'cover', index: 1, role: '표지', titleHint: '임플란트', contentHint: '시술 소개' },
    { layout: 'info', index: 2, role: '도입', titleHint: '소제목을', contentHint: '본문' },
    { layout: 'closing', index: 3, role: '마무리', titleHint: '비용', contentHint: '[META] format' },
  ];
  const r = sanitizeLeakInSlideOutline(outline);
  check('outline — 누수 발견', r.stripped >= 2);
  check('outline 정상 항목 보존', r.outline[0].titleHint === '임플란트');
  check('outline "소제목을" → 빈 문자열', r.outline[1].titleHint === '');
  check('outline [META] → 빈 문자열', r.outline[2].contentHint === '');
  check('outline layout enum 보존', r.outline[0].layout === 'cover');
  check('outline index 보존', r.outline[1].index === 2);
}

// ── sanitizeLeakInSlideData ────────────────────────────────────────────

console.log('\n=== sanitizeLeakInSlideData ===');

{
  const slide = {
    id: 's1',
    index: 1,
    layout: 'info' as const,
    title: '임플란트 후 관리',
    subtitle: '소제목을',
    body: '관리 본문. [IMG_N alt="x"] 마커.',
    checkItems: ['정상 항목', '[META] 라벨'],
  } as SlideData;
  const r = sanitizeLeakInSlideData(slide);
  check('slide — 누수 발견', r.stripped >= 2);
  check('slide title 보존', r.slide.title === '임플란트 후 관리');
  check('slide subtitle 빈 문자열', r.slide.subtitle === '');
  check('slide body — [IMG_N 부분 제거', r.slide.body !== undefined && !r.slide.body.includes('[IMG_N'));
  check('slide body — 정상 부분 보존', r.slide.body !== undefined && r.slide.body.includes('관리 본문'));
  check('slide checkItems[0] 보존', r.slide.checkItems?.[0] === '정상 항목');
  check('slide checkItems[1] 빈 문자열', r.slide.checkItems?.[1] === '');
  check('slide id 보존', r.slide.id === 's1');
  check('slide layout 보존', r.slide.layout === 'info');
}

// columns 객체 배열 (SlideComparisonColumn: header / items)
{
  const slide = {
    id: 's2',
    index: 2,
    layout: 'comparison' as const,
    title: '비교',
    columns: [
      { header: '정상 제목', items: ['항목 1', 'h3 태그로 감싸'] },
      { header: '소제목을', items: ['항목 2'] },
    ],
  } as SlideData;
  const r = sanitizeLeakInSlideData(slide);
  check('columns[].header 정상 보존', r.slide.columns?.[0].header === '정상 제목');
  check('columns[].items 누수 제거', r.slide.columns?.[0].items?.[1] === '');
  check('columns[].header 누수 빈문자열', r.slide.columns?.[1].header === '');
}

// ── sanitizeLeakInSlides (배열 일괄) ───────────────────────────────────

console.log('\n=== sanitizeLeakInSlides ===');

{
  const slides = [
    { id: 'a', index: 1, layout: 'cover' as const, title: '치아 관리' },
    { id: 'b', index: 2, layout: 'info' as const, title: '소제목을', body: '본문' },
  ] as SlideData[];
  const r = sanitizeLeakInSlides(slides);
  check('slides 배열 — 누수 1건', r.stripped >= 1);
  check('slides 배열 길이 보존', r.slides.length === 2);
  check('slides[0] title 보존', r.slides[0].title === '치아 관리');
  check('slides[1] title 빈 문자열', r.slides[1].title === '');
}

// ── 결과 출력 ─────────────────────────────────────────────────────────

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`\n${failed} FAILURES:\n`);
  for (const f of failures) console.error(f);
  process.exit(1);
}

assert.equal(failed, 0, 'all leakFilter tests must pass');
process.exit(0);
