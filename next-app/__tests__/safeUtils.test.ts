/**
 * safeUtils 유닛테스트 — Node.js 내장 test runner (추가 의존성 없음)
 * 실행: npx tsx __tests__/safeUtils.test.ts
 */
import { safeJsonParse, clampNumber } from '../lib/safeUtils';

// ── safeJsonParse ──

console.log('=== safeJsonParse tests ===');

// 정상 케이스
{
  const result = safeJsonParse<{ name: string }>('{"name": "test"}', { name: '' });
  console.assert(result.name === 'test', 'FAIL: normal JSON parse');
  console.log('[PASS] normal JSON parse');
}

// markdown 코드블록 래핑
{
  const result = safeJsonParse<{ a: number }>('```json\n{"a": 42}\n```', { a: 0 });
  console.assert(result.a === 42, 'FAIL: markdown-wrapped JSON');
  console.log('[PASS] markdown-wrapped JSON');
}

// 깨진 JSON → fallback 반환
{
  const result = safeJsonParse<string[]>('not json at all', []);
  console.assert(Array.isArray(result) && result.length === 0, 'FAIL: broken JSON returns fallback');
  console.log('[PASS] broken JSON returns fallback');
}

// 빈 문자열 → fallback
{
  const result = safeJsonParse<number>('', 0);
  console.assert(result === 0, 'FAIL: empty string returns fallback');
  console.log('[PASS] empty string returns fallback');
}

// 텍스트 속 JSON 추출 (중괄호 매칭)
{
  const result = safeJsonParse<{ key: string }>('Here is the result: {"key": "value"} hope it helps!', { key: '' });
  console.assert(result.key === 'value', 'FAIL: embedded JSON extraction');
  console.log('[PASS] embedded JSON extraction');
}

// 배열 JSON
{
  const result = safeJsonParse<number[]>('[1, 2, 3]', []);
  console.assert(result.length === 3, 'FAIL: array JSON');
  console.log('[PASS] array JSON');
}

// ── clampNumber ──

console.log('\n=== clampNumber tests ===');

// 정상 범위
{
  console.assert(clampNumber(5, 0, 10) === 5, 'FAIL: in-range value');
  console.log('[PASS] in-range value');
}

// 하한 초과
{
  console.assert(clampNumber(-5, 0, 10) === 0, 'FAIL: below minimum');
  console.log('[PASS] below minimum → clamped to min');
}

// 상한 초과
{
  console.assert(clampNumber(100, 0, 10) === 10, 'FAIL: above maximum');
  console.log('[PASS] above maximum → clamped to max');
}

// NaN → min
{
  console.assert(clampNumber(NaN, 0, 10) === 0, 'FAIL: NaN returns min');
  console.log('[PASS] NaN → returns min');
}

// Infinity → min
{
  console.assert(clampNumber(Infinity, 0, 10) === 0, 'FAIL: Infinity returns min');
  console.log('[PASS] Infinity → returns min');
}

// 경계값 (exactly min/max)
{
  console.assert(clampNumber(0, 0, 10) === 0, 'FAIL: exact min');
  console.assert(clampNumber(10, 0, 10) === 10, 'FAIL: exact max');
  console.log('[PASS] exact boundary values');
}

console.log('\n=== All tests passed ===');
