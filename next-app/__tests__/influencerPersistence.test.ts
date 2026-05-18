/**
 * PR-A 회귀 가드 — 인플루언서 상태 영속 + 검색 이력 + ★ 즐겨찾기
 * (docs/instagram-audit-2026-05-18.md §6 세부 6)
 *
 * 실행: npx tsx __tests__/influencerPersistence.test.ts
 *
 * 검증 범위:
 *  - GET /api/influencer/status — hospital_id 가드 + 응답 shape
 *  - POST /api/influencer/status — status / starred / 둘 다 없음 분기
 *  - search/route.ts — hospital_name 옵션 인터페이스 (호환성)
 *  - relativeTime UI 헬퍼는 page.tsx 안에 있어 별도 import 불가 (skip).
 *
 * 라우트 함수를 직접 import + `Request` mock 으로 호출.
 * Supabase 미설정 환경에서 fallback 분기 통과를 검증 — DB 실제 access 안 함.
 */
import assert from 'node:assert/strict';

// ── 인증 setup — checkAuth 가 admin_session cookie 검증하므로 valid cookie 필요 ──
// ADMIN_API_TOKEN 설정 후 동일 비밀로 HMAC cookie 생성.
process.env.ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || 'test-secret-for-influencer-persistence';
import { issueAdminCookieValue, ADMIN_COOKIE_NAME } from '../lib/adminCookie';

const ADMIN_COOKIE_VALUE = issueAdminCookieValue() || '';
if (!ADMIN_COOKIE_VALUE) throw new Error('테스트 셋업: admin cookie 발급 실패 (ADMIN_API_TOKEN 미설정?)');
const COOKIE_HEADER = `${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}`;

// NextRequest 타입을 받는 핸들러지만 런타임상 fetch Request 와 호환.
// next/server 의 NextResponse.json 은 web Response 그대로 반환.
import { GET, POST } from '../app/api/influencer/status/route';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${name}\n    ${msg}`);
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${name}\n    ${msg}`);
    });
}

function mockReq(url: string, init?: RequestInit): Request {
  // 모든 요청에 valid admin_session cookie 자동 첨부 — checkAuth 통과.
  const baseHeaders: Record<string, string> = { cookie: COOKIE_HEADER };
  const initHeaders = (init?.headers as Record<string, string> | undefined) || {};
  return new Request(url, { ...init, headers: { ...baseHeaders, ...initHeaders } });
}

// eslint-disable-next-line no-console
console.log('\n>>> influencerPersistence.test.ts');

(async () => {
  // ── 1. GET — hospital_id 누락 시 400 ─────────────────────────────

  await test('GET — hospital_id 누락 → 400', async () => {
    const res = await GET(mockReq('http://localhost/api/influencer/status') as never);
    assert.equal(res.status, 400, `status=${res.status}`);
    const body = await res.json() as { error?: string };
    assert.ok(body.error, 'error 메시지 누락');
    assert.ok(body.error.includes('hospital_id'), `error 메시지에 hospital_id 안내 누락: ${body.error}`);
  });

  // ── 2. GET — hospital_id 있음 → outreach/searches 키 존재 ──────────

  await test('GET — hospital_id 정상 → 응답 shape { outreach, searches }', async () => {
    const res = await GET(mockReq('http://localhost/api/influencer/status?hospital_id=test-clinic') as never);
    // Supabase 미설정이면 200 + 빈 배열. 설정되어 있으면 200 + DB 결과.
    assert.equal(res.status, 200, `status=${res.status}`);
    const body = await res.json() as { outreach?: unknown; searches?: unknown };
    assert.ok(Array.isArray(body.outreach), 'outreach 키가 배열이 아님');
    assert.ok(Array.isArray(body.searches), 'searches 키가 배열이 아님');
  });

  // ── 3. POST — status / starred 둘 다 없음 → 400 ────────────────────

  await test('POST — status/starred 둘 다 없음 → 400', async () => {
    const res = await POST(mockReq('http://localhost/api/influencer/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'someone', hospital_id: 'test-clinic' }),
    }) as never);
    assert.equal(res.status, 400, `status=${res.status}`);
    const body = await res.json() as { error?: string };
    assert.ok(body.error?.includes('status') || body.error?.includes('starred'),
      `error 메시지에 status/starred 안내 누락: ${body.error}`);
  });

  // ── 4. POST — starred=true 만 (status 없이) 통과 ────────────────────

  await test('POST — starred:true only → 정상 (400 아님)', async () => {
    const res = await POST(mockReq('http://localhost/api/influencer/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'someone', hospital_id: 'test-clinic', starred: true }),
    }) as never);
    // Supabase 미설정이면 200 success / local. 설정돼 있어도 200.
    assert.equal(res.status, 200, `starred-only POST 가 차단됨 (status=${res.status})`);
    const body = await res.json() as { success?: boolean };
    assert.equal(body.success, true, 'success 필드 누락 또는 false');
  });

  // ── 5. POST — starred 가 boolean 아님 → 400 ────────────────────────

  await test('POST — starred:"yes" (boolean 아님) → 400', async () => {
    const res = await POST(mockReq('http://localhost/api/influencer/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'someone', hospital_id: 'test-clinic', starred: 'yes' }),
    }) as never);
    assert.equal(res.status, 400, `boolean 아닌 starred 통과됨 (status=${res.status})`);
  });

  // ── 6. POST — username 누락 → 400 ──────────────────────────────────

  await test('POST — username 누락 → 400', async () => {
    const res = await POST(mockReq('http://localhost/api/influencer/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hospital_id: 'test-clinic', starred: true }),
    }) as never);
    assert.equal(res.status, 400, `status=${res.status}`);
  });

  // ── 7. search route — hospital_name optional field 컨트랙트 ───────

  await test('search/route.ts — SearchRequest 에 hospital_name? 필드 존재', async () => {
    const src = await (await import('node:fs')).readFileSync(
      new URL('../app/api/influencer/search/route.ts', import.meta.url),
      'utf-8',
    );
    assert.ok(/hospital_name\?\s*:\s*string/.test(src),
      'search/route.ts 의 SearchRequest 인터페이스에 hospital_name? 필드 누락');
    assert.ok(/influencer_searches/.test(src),
      'search/route.ts 가 influencer_searches 테이블 insert 호출 누락');
    assert.ok(/검색 이력 자동 저장|search_params/.test(src),
      'search/route.ts 에 검색 이력 저장 로직 마커 누락');
  });

  // ── 8. SQL 마이그레이션 멱등성 invariant ─────────────────────────

  await test('sql/migrations/2026-05-18_influencer_searches.sql — 멱등성 마커 + starred 컬럼', async () => {
    const fs = await import('node:fs');
    const path = new URL('../../sql/migrations/2026-05-18_influencer_searches.sql', import.meta.url);
    const src = fs.readFileSync(path, 'utf-8');
    assert.ok(/CREATE TABLE IF NOT EXISTS\s+public\.influencer_searches/.test(src),
      'CREATE TABLE IF NOT EXISTS 누락 — 멱등성 위반');
    assert.ok(/ADD COLUMN IF NOT EXISTS\s+starred/.test(src),
      'starred 컬럼 ADD COLUMN IF NOT EXISTS 누락');
    assert.ok(/service_role/.test(src),
      'RLS service_role 정책 누락');
    assert.ok(/idx_influencer_searches_hospital_created/.test(src),
      '인덱스 idx_influencer_searches_hospital_created 누락');
  });

  // ── 결과 출력 ───────────────────────────────────────────────────

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
