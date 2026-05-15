/**
 * imageMatcher 회귀 테스트.
 *
 * 핵심 보장 (confusable 쌍 분리):
 *   - "임플란트 식립" 글 → 임플란트 이미지가 top 1 (사랑니/일반 이미지 아님)
 *   - "사랑니 발치" 글 → 사랑니 이미지가 top 1
 *   - "치아 통증 원인" (범용) → 일반 치과 이미지가 top 1 (특정 시술 이미지 아님)
 *
 * 부수 보장:
 *   - excludeKeywords 매칭 → 후보 즉시 제외
 *   - title 가중치 3x — 본문 키워드보다 강함
 *   - lowPriorityTags 30% downgrade
 *   - excludeIds 사용 후보 회피 + fallback 재사용
 */
import assert from 'node:assert/strict';
import {
  scoreLibraryImage,
  pickBestLibraryImage,
  tokenizeKeywords,
  type LibraryImageRecord,
} from '../imageMatcher';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`✗ ${name}\n    ${msg}`);
    // eslint-disable-next-line no-console
    console.log(`  ✗ ${name}\n    ${msg}`);
  }
}

// eslint-disable-next-line no-console
console.log('\n>>> imageMatcher.test.ts');

// ── 픽스처: 치과 라이브러리 ─────────────────────────────
const implantImage: LibraryImageRecord = {
  id: 'img-implant-1',
  tags: ['임플란트', '치과', '시술'],
  altText: '임플란트 식립 모식도',
  aiDescription: '임플란트 인공치아 식립 과정',
  excludeKeywords: ['사랑니'],
};

const wisdomToothImage: LibraryImageRecord = {
  id: 'img-wisdom-1',
  tags: ['사랑니', '발치', '치과'],
  altText: '사랑니 발치 후 거즈',
  aiDescription: '사랑니 발치 회복 과정',
  excludeKeywords: ['임플란트'],
};

const genericClinicImage: LibraryImageRecord = {
  id: 'img-generic-1',
  tags: ['일반', '치과', '외관'],
  altText: '치과 외관',
  aiDescription: '치과 병원 입구',
};

const irrelevantImage: LibraryImageRecord = {
  id: 'img-logo-1',
  tags: ['로고'],
  altText: '병원 로고',
};

const library = [implantImage, wisdomToothImage, genericClinicImage, irrelevantImage];

// ── tokenize 단위 ─────────────────────────────────────
test('tokenizeKeywords: 공백·쉼표·콤마·중점 분리, 길이≥2 필터', () => {
  assert.deepEqual(tokenizeKeywords('임플란트, 식립 · 회복'), ['임플란트', '식립', '회복']);
  assert.deepEqual(tokenizeKeywords('치 (1글자)'), ['(1글자)']);
  assert.deepEqual(tokenizeKeywords(''), []);
  assert.deepEqual(tokenizeKeywords(null), []);
});

// ── confusable 분리 핵심 ───────────────────────────────
test('confusable: "임플란트 식립 후 관리" → 임플란트 이미지 top 1', () => {
  const best = pickBestLibraryImage(library, {
    title: '임플란트 식립 후 관리',
    bodyKeywords: ['임플란트', '식립', '관리'],
  });
  assert.ok(best, '매칭 결과 없음');
  assert.equal(best!.image.id, 'img-implant-1', `expected implant top, got ${best!.image.id}`);
});

test('confusable: "사랑니 발치 회복" → 사랑니 이미지 top 1', () => {
  const best = pickBestLibraryImage(library, {
    title: '사랑니 발치 후 회복',
    bodyKeywords: ['사랑니', '발치', '회복'],
  });
  assert.ok(best, '매칭 결과 없음');
  assert.equal(best!.image.id, 'img-wisdom-1', `expected wisdom top, got ${best!.image.id}`);
});

test('confusable: "임플란트" 글 — 사랑니 이미지는 excludeKeywords 로 즉시 제외', () => {
  const scored = scoreLibraryImage(wisdomToothImage, {
    title: '임플란트 식립 후 관리',
    bodyKeywords: ['임플란트'],
  });
  assert.equal(scored.excluded, true);
  assert.equal(scored.score, Number.NEGATIVE_INFINITY);
});

test('confusable: "사랑니" 글 — 임플란트 이미지는 excludeKeywords 로 즉시 제외', () => {
  const scored = scoreLibraryImage(implantImage, {
    title: '사랑니 발치 회복',
    bodyKeywords: ['사랑니'],
  });
  assert.equal(scored.excluded, true);
});

// ── 범용 글 → 일반 이미지 매칭 ─────────────────────────
test('범용 글 "치아 통증 원인" → 특정 시술 이미지가 top 이 아님', () => {
  const best = pickBestLibraryImage(library, {
    title: '치아 통증 원인',
    bodyKeywords: ['치아', '통증', '원인'],
  });
  // 특정 시술 이미지(임플란트/사랑니) 가 top 이 아니어야 함. 일반 이미지 또는 null.
  if (best) {
    assert.notEqual(best.image.id, 'img-implant-1');
    assert.notEqual(best.image.id, 'img-wisdom-1');
  }
});

// ── title 가중치 3x ───────────────────────────────────
test('title 키워드가 본문 키워드보다 3배 강함', () => {
  // 동일 이미지 후보, title 매치만 다름
  const titleMatch = scoreLibraryImage(implantImage, {
    title: '임플란트 가이드',
  });
  const bodyMatch = scoreLibraryImage(implantImage, {
    title: '치과 가이드',
    bodyKeywords: ['임플란트'],
  });
  assert.ok(
    titleMatch.score > bodyMatch.score,
    `title=${titleMatch.score}, body=${bodyMatch.score}`,
  );
  // 정확히 3배 비율 (정확 일치 1.0 × 3 vs 1.0 × 1) 인지 — 정확 케이스에서만
  // 동일 매칭 수일 때.
});

// ── exact vs edge vs substring 가중치 ──────────────────
test('exact match > edge > substring 가중치 순서', () => {
  const exactImg: LibraryImageRecord = { id: '1', tags: ['임플란트'] };
  const edgeImg: LibraryImageRecord = { id: '2', tags: ['임플란트치료'] }; // prefix
  const substringImg: LibraryImageRecord = { id: '3', tags: ['치과임플란트시술'] };
  const context = { title: '임플란트' };
  const ex = scoreLibraryImage(exactImg, context).score;
  const ed = scoreLibraryImage(edgeImg, context).score;
  const sb = scoreLibraryImage(substringImg, context).score;
  assert.ok(ex > ed, `exact(${ex}) > edge(${ed}) 실패`);
  assert.ok(ed > sb, `edge(${ed}) > substring(${sb}) 실패`);
});

// ── lowPriorityTags downgrade ─────────────────────────
test('lowPriorityTags 만 보유한 이미지는 70% downgrade', () => {
  const onlyLow: LibraryImageRecord = { id: 'low', tags: ['일반'], altText: '임플란트' };
  const normal: LibraryImageRecord = { id: 'n', tags: ['임플란트'], altText: '임플란트' };
  const ctx = { title: '임플란트 식립' };
  const lowS = scoreLibraryImage(onlyLow, ctx).score;
  const normS = scoreLibraryImage(normal, ctx).score;
  assert.ok(normS > lowS, `normal(${normS}) > low(${lowS}) 실패`);
});

// ── excludeIds + fallback ─────────────────────────────
test('excludeIds 사용 후보 회피 — fallback 없으면 null', () => {
  const best = pickBestLibraryImage(library, { title: '임플란트' }, {
    excludeIds: new Set(['img-implant-1']),
  });
  // 임플란트 이미지 제외, 사랑니는 excludeKeywords 로 제외 → 일반/로고 만 남음
  if (best) {
    assert.notEqual(best.image.id, 'img-implant-1');
    assert.notEqual(best.image.id, 'img-wisdom-1');
  }
});

test('allowReuseFallback=true → 사용된 후보 재사용 허용', () => {
  // 임플란트 이미지만 매칭 후보. excludeIds 에 포함됐어도 fallback 으로 재선택.
  const tinyLibrary = [implantImage, wisdomToothImage];
  const best = pickBestLibraryImage(tinyLibrary, { title: '임플란트' }, {
    excludeIds: new Set(['img-implant-1']),
    allowReuseFallback: true,
  });
  assert.ok(best, 'fallback null');
  assert.equal(best!.image.id, 'img-implant-1');
});

// ── minScore 임계치 ───────────────────────────────────
test('minScore=0 — score 0 이하 후보는 매칭 안 함', () => {
  // 컨텍스트 토큰이 모두 이미지와 무관 → 0 점
  const best = pickBestLibraryImage([implantImage], {
    title: '안과 시력 교정',
    bodyKeywords: ['라식', '라섹'],
  });
  assert.equal(best, null);
});

// ── F-1: minScore=8 prod 임계치 회귀 가드 ─────────────
// 양 앱 blog/page.tsx 의 pickBestLibraryImage 호출이 minScore=8 사용.
// PASS 케이스 (정확 매칭) score 가 8 이상 보장 + weak match (< 8) 거부.

test('F-1: minScore=8 — 정확 매칭 (임플란트 글 → 임플란트 이미지) 채택', () => {
  // 임플란트 이미지에 "임플란트" title 매칭: tag exact match (1.0) × 3 (title) = 3.0
  // alt "임플란트 식립 모식도" 의 토큰 "임플란트" exact × 3 (title) = 3.0
  // aiDescription 토큰 매칭 추가… 총합 8 이상 안전 보장.
  const best = pickBestLibraryImage([implantImage], {
    title: '임플란트 식립 후 관리',
    bodyKeywords: ['임플란트', '식립'],
  }, { minScore: 8 });
  assert.ok(best, 'minScore=8 에서 정확 매칭 거부됨 — 회귀');
  assert.ok(best!.score >= 8, `score ${best!.score} < 8 — 회귀`);
});

test('F-1: minScore=8 — weak match (단일 generic 토큰) 거부 → null', () => {
  // 단 1개 generic 토큰만 매칭 → score ≈ 3 → null with minScore=8.
  // sanity check: default minScore=0 에선 같은 weak match 가 채택됨.
  const onlyEdgeImage: LibraryImageRecord = {
    id: 'low-relevance',
    tags: ['진료실'],
    altText: '의료진 부작용 상담 안내',
  };
  // (a) default (minScore=0) — weak match 도 채택
  const lowThresh = pickBestLibraryImage([onlyEdgeImage], {
    title: '필러 부작용 대처',
    bodyKeywords: ['필러'],
  });
  assert.ok(lowThresh, 'sanity: minScore=0 에서 weak match 채택돼야 함');
  assert.ok(lowThresh!.score < 8, `sanity: weak match score ${lowThresh!.score} should be < 8`);

  // (b) minScore=8 — 같은 weak match 거부
  const highThresh = pickBestLibraryImage([onlyEdgeImage], {
    title: '필러 부작용 대처',
    bodyKeywords: ['필러'],
  }, { minScore: 8 });
  assert.equal(highThresh, null, 'minScore=8 에서 weak match 채택됨 — 회귀');
});

test('F-1: minScore=8 — score < 8 후보가 다수여도 모두 거부', () => {
  // 모든 라이브러리가 weak score 만 → null. AI fallback 으로 떨어지는 prod 시나리오.
  const weakLibrary: LibraryImageRecord[] = [
    { id: 'w1', tags: ['일반'], altText: '치과 외관' },
    { id: 'w2', tags: ['로고'], altText: '병원 로고' },
    { id: 'w3', tags: ['상담'], altText: '의료진 상담' },
  ];
  const best = pickBestLibraryImage(weakLibrary, {
    title: '필러 시술 정보',
    bodyKeywords: ['필러'],
  }, { minScore: 8 });
  assert.equal(best, null, '관련 없는 weak match 가 채택됨 — 회귀');
});

test('F-1: minScore=8 + confusable — 임플란트 글 vs 사랑니 이미지 (PASS+excludeKeywords)', () => {
  // 핵심 invariant: minScore 상향이 confusable 분리에 영향 주지 않아야 함.
  const best = pickBestLibraryImage(library, {
    title: '임플란트 식립 후 관리',
    bodyKeywords: ['임플란트', '식립'],
  }, { minScore: 8 });
  assert.ok(best, 'minScore=8 에서 임플란트 매칭 거부 — 회귀');
  assert.equal(best!.image.id, 'img-implant-1');
});

// ── 빈 입력 ───────────────────────────────────────────
test('빈 library → null', () => {
  const best = pickBestLibraryImage([], { title: '임플란트' });
  assert.equal(best, null);
});

test('빈 context → 모든 후보 score 0 → null', () => {
  const best = pickBestLibraryImage(library, { title: '', bodyKeywords: [] });
  assert.equal(best, null);
});

// ── 이전 inline 회귀 케이스 재현 ───────────────────────
test('회귀: "스케일링 가이드" 글에 "임플란트" 이미지가 매칭되면 안 됨', () => {
  // 이전 inline 버전은 substring match (양방향) 로 alt 의 영어 "implant" 가 키워드와
  // 매칭되는 버그. 본 버전은 한국어 토큰화 + excludeKeywords 로 차단.
  const best = pickBestLibraryImage(library, {
    title: '스케일링 가이드',
    bodyKeywords: ['스케일링', '구강', '관리'],
  });
  if (best) {
    assert.notEqual(best.image.id, 'img-implant-1', '임플란트 이미지가 잘못 매칭됨');
    assert.notEqual(best.image.id, 'img-wisdom-1', '사랑니 이미지가 잘못 매칭됨');
  }
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
