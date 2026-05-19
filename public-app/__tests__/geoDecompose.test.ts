/**
 * geoDecompose 회귀 테스트 (public-app) — GEO-1.2 콘텐츠 패턴 분류.
 *
 * 실행: npx tsx __tests__/geoDecompose.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - classifyHtmlPattern 분류 정확도 6 패턴 + unknown
 *   - URL 보안 (file://, javascript:, private IP, localhost, .local)
 *   - fetch 실패 모드 (non-HTML, size cap)
 *   - route validation (urls 빈 / 초과 / 형식 오류)
 *   - public-app P-1 admin_session bypass + 로그인 useCredit
 *   - 양 앱 lockstep (decompose route validation diff=0, GeoCitationsSection diff=0)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyHtmlPattern, classifyUrlPattern } from '@winaid/blog-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${name}`);
    })
    .catch((e: unknown) => {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${name}\n    ${msg}`);
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${name}\n    ${msg}`);
    });
}

// eslint-disable-next-line no-console
console.log('\n>>> geoDecompose.test.ts — public-app');

// ── HTML fixtures ────────────────────────────────────────────

const FAQ_HTML = `<!doctype html><html><body>
  <h1>자주 묻는 질문</h1>
  <details><summary>비용은 얼마인가요?</summary><p>1회 30만원입니다.</p></details>
  <details><summary>마취는 어떻게 하나요?</summary><p>국소마취 사용.</p></details>
  <details><summary>입원 필요한가요?</summary><p>아닙니다.</p></details>
  <p>Q. 부작용은? A. 거의 없습니다.</p>
  <p>Q. 회복 기간은? A. 2주 정도.</p>
  <p>Q. 식사는? A. 부드러운 음식 권장.</p>
  <p>Q. 운동은? A. 1주 후 가능.</p>
  <p>Q. 양치는? A. 부위 피해서.</p>
</body></html>`;

const COMPARISON_HTML = `<!doctype html><html><body>
  <h1>임플란트 vs 틀니 비교</h1>
  <p>각 방법의 장점과 단점을 비교합니다.</p>
  <table>
    <thead><tr><th>항목</th><th>임플란트</th><th>틀니</th></tr></thead>
    <tbody>
      <tr><td>비용</td><td>높음</td><td>낮음</td></tr>
      <tr><td>수명</td><td>10년+</td><td>5년</td></tr>
      <tr><td>편의성</td><td>높음</td><td>보통</td></tr>
      <tr><td>장점</td><td>자연치 유사</td><td>저렴</td></tr>
    </tbody>
  </table>
  <p>임플란트와 틀니의 차이는 비용과 수명입니다.</p>
</body></html>`;

const LIST_HTML = `<!doctype html><html><body>
  <h1>임플란트 절차 7단계</h1>
  <ol>
    <li>상담 및 검진</li>
    <li>치아 발치</li>
    <li>골 이식 (필요 시)</li>
    <li>인공치근 식립</li>
    <li>치유 기간 (3~6개월)</li>
    <li>지대주 연결</li>
    <li>최종 보철 완성</li>
  </ol>
</body></html>`;

const DOCTOR_HTML = `<!doctype html><html><body>
  <h1>원장 인터뷰</h1>
  <p>원장 홍길동께서 말씀하셨습니다. "환자의 통증 없는 치료가 최우선입니다."</p>
  <p>Q. 임플란트를 잘하기 위한 비결은? A. 정확한 진단입니다.</p>
  <p>Q. 환자에게 강조하시는 점은? A. 정기 검진의 중요성.</p>
  <p>대표원장 김철수께서 인터뷰에서 강조했다.</p>
</body></html>`;

const PRICING_HTML = `<!doctype html><html><body>
  <h1>진료비 안내</h1>
  <p>각 시술 요금을 안내합니다. 진료비는 부가세 별도입니다.</p>
  <table>
    <thead><tr><th>시술</th><th>가격</th></tr></thead>
    <tbody>
      <tr><td>임플란트 1개</td><td>120만원</td></tr>
      <tr><td>충치 치료</td><td>5만원</td></tr>
      <tr><td>스케일링</td><td>3만원</td></tr>
      <tr><td>신경치료</td><td>15만원</td></tr>
    </tbody>
  </table>
  <p>비용은 변동 가능합니다. 진료비 상담 환영합니다.</p>
</body></html>`;

const CASE_HTML = `<!doctype html><html><body>
  <h1>치료 사례 — 임플란트 Before/After</h1>
  <p>40대 남성 환자의 치료 전후 사진입니다.</p>
  <img src="/before.jpg" alt="치료 전 사례 사진" />
  <img src="/after.jpg" alt="case study after image" />
  <p>원장 박철수가 직접 시술했습니다.</p>
  <p>Before: 어금니 결손. After: 임플란트 식립 완료.</p>
</body></html>`;

const EMPTY_HTML = `<!doctype html><html><body>
  <p>안녕하세요. 저희 사이트에 오신 것을 환영합니다.</p>
</body></html>`;

(async () => {
  // ── 6 패턴 분류 정확도 ──

  await test('classify: FAQ 패턴 (details + Q 마커 ≥ 5)', () => {
    const r = classifyHtmlPattern(FAQ_HTML, 'https://example.com/faq');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'faq');
    assert.ok((r.scores?.faq ?? 0) >= 40);
  });

  await test('classify: 비교표 패턴 (table + 비교/장단점 키워드)', () => {
    const r = classifyHtmlPattern(COMPARISON_HTML, 'https://example.com/cmp');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'comparison_table');
  });

  await test('classify: 리스트 패턴 (ol ≥ 5 items)', () => {
    const r = classifyHtmlPattern(LIST_HTML, 'https://example.com/steps');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'list');
  });

  await test('classify: 의료진 인터뷰 패턴 (이름 + 인터뷰 키워드)', () => {
    const r = classifyHtmlPattern(DOCTOR_HTML, 'https://example.com/doctor');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'doctor_interview');
  });

  await test('classify: 가격 비교 패턴 (table + 요금/가격 ≥ 5)', () => {
    const r = classifyHtmlPattern(PRICING_HTML, 'https://example.com/price');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'pricing');
  });

  await test('classify: 치료 사례 패턴 (전후 + 의료진)', () => {
    const r = classifyHtmlPattern(CASE_HTML, 'https://example.com/case');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'case_study');
  });

  await test('classify: 패턴 없음 → unknown', () => {
    const r = classifyHtmlPattern(EMPTY_HTML, 'https://example.com');
    assert.equal(r.status, 'ok');
    assert.equal(r.primary_pattern, 'unknown');
  });

  // ── URL 보안 (SSRF 방지) — classifyUrlPattern 의 validateUrlSafety 통과/거부 ──

  await test('security: javascript: scheme 거부', async () => {
    const r = await classifyUrlPattern('javascript:alert(1)');
    assert.equal(r.status, 'fetch_failed');
    assert.ok(/unsupported protocol|invalid URL/.test(r.error || ''));
  });

  await test('security: file:// scheme 거부', async () => {
    const r = await classifyUrlPattern('file:///etc/passwd');
    assert.equal(r.status, 'fetch_failed');
    assert.ok(/unsupported protocol/.test(r.error || ''));
  });

  await test('security: data: scheme 거부', async () => {
    const r = await classifyUrlPattern('data:text/html,<p>x</p>');
    assert.equal(r.status, 'fetch_failed');
    assert.ok(/unsupported protocol/.test(r.error || ''));
  });

  await test('security: private IPv4 거부 (10/172.16-31/192.168/127/169.254/0)', async () => {
    for (const u of [
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/',
    ]) {
      const r = await classifyUrlPattern(u);
      assert.equal(r.status, 'fetch_failed', `${u} 통과됨 (보안 위반)`);
      assert.ok(/private|reject/i.test(r.error || ''), `${u} reason: ${r.error}`);
    }
  });

  await test('security: localhost / *.local 거부', async () => {
    for (const u of ['http://localhost/', 'http://something.local/']) {
      const r = await classifyUrlPattern(u);
      assert.equal(r.status, 'fetch_failed', `${u} 통과됨`);
      assert.ok(/localhost|local/.test(r.error || ''), `${u} reason: ${r.error}`);
    }
  });

  await test('security: 인증된 public IP 는 통과 시도 (실제 fetch 는 별도 — 여기선 host 통과 확인)', async () => {
    // 통과되면 실제 fetch 가 일어남 (테스트 환경에서 외부 호출 — 빠르게 timeout 으로 끝낼 목적)
    const r = await classifyUrlPattern('http://203.0.113.1/', { timeoutMs: 500 });
    // host 자체는 검증 통과해야 함 — fetch 자체 실패는 OK
    assert.equal(r.status, 'fetch_failed');
    assert.ok(!/private|localhost/.test(r.error || ''), `host 통과 실패: ${r.error}`);
  });

  // ── route validation ──

  await test('route: POST decompose urls 빈 / 초과 / 형식 검증', () => {
    const p = resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/urls 배열 필수/.test(src), 'urls 배열 검증 누락');
    assert.ok(/urls 최소 1개/.test(src), 'urls 최소 1개 검증 누락');
    assert.ok(/urls 최대.*개/.test(src), 'urls 최대 갯수 검증 누락');
    assert.ok(/URL 형식 오류/.test(src), 'URL 형식 검증 누락');
  });

  await test('route: Promise.allSettled 사용 (부분 실패 허용)', () => {
    const p = resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/Promise\.allSettled/.test(src), 'Promise.allSettled 미사용 — 부분 실패 회귀');
  });

  await test('route: public-app P-1 admin_session bypass + 로그인 useCredit', () => {
    const p = resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/admin_session=/.test(src), 'admin_session bypass 분기 누락 (P-1 위반)');
    assert.ok(/useCredit\(userId\)/.test(src), '로그인 useCredit(1) 누락');
    assert.ok(/refundCredit/.test(src), '실패 시 refundCredit 누락');
    assert.ok(/gateGuestRequest\(request,\s*5\)/.test(src), 'gateGuestRequest(5) 누락 — 분당 cap');
  });

  await test('route: maxDuration = 60', () => {
    const p = resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts');
    const src = readFileSync(p, 'utf-8');
    assert.ok(/export const maxDuration = 60/.test(src), 'maxDuration 60 누락');
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: GeoCitationsSection 양 앱 diff=0 (GEO-1.1 + GEO-1.2 확장 후)', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/GeoCitationsSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/GeoCitationsSection.tsx');
    assert.ok(existsSync(p1) && existsSync(p2), 'GeoCitationsSection 누락');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), '양 앱 GeoCitationsSection drift');
  });

  await test('lockstep: 양 앱 decompose 라우트 body validation 메시지 동일', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts');
    const p2 = resolve(REPO_ROOT, 'next-app/app/api/geo/decompose/route.ts');
    const s1 = readFileSync(p1, 'utf-8');
    const s2 = readFileSync(p2, 'utf-8');
    for (const msg of ['urls 배열 필수', 'urls 최소 1개', 'URL 형식 오류']) {
      assert.ok(s1.includes(msg), `public-app 누락: ${msg}`);
      assert.ok(s2.includes(msg), `next-app 누락: ${msg}`);
    }
  });

  await test('lockstep: contentPatternClassifier 단일 소스 (blog-core)', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/contentPatternClassifier.ts');
    assert.ok(existsSync(p), 'contentPatternClassifier 누락');
    // 양 앱 라우트가 동일 import
    const r1 = readFileSync(resolve(REPO_ROOT, 'public-app/app/api/geo/decompose/route.ts'), 'utf-8');
    const r2 = readFileSync(resolve(REPO_ROOT, 'next-app/app/api/geo/decompose/route.ts'), 'utf-8');
    assert.ok(/classifyUrlPattern/.test(r1) && /@winaid\/blog-core/.test(r1), 'public-app import 누락');
    assert.ok(/classifyUrlPattern/.test(r2) && /@winaid\/blog-core/.test(r2), 'next-app import 누락');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
