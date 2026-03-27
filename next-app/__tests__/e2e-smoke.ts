/**
 * E2E 스모크 테스트 — 모든 페이지 + API 라우트 + 실제 API 호출 검증
 *
 * 로컬:       npx tsx __tests__/e2e-smoke.ts
 * 프로덕션:   BASE_URL=https://your-app.vercel.app npx tsx __tests__/e2e-smoke.ts
 * API 스킵:   SKIP_LIVE_API=true npx tsx __tests__/e2e-smoke.ts
 *
 * 전제: npm run dev (또는 npm start) 가 localhost:3000에서 실행 중
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SKIP_LIVE_API = process.env.SKIP_LIVE_API === 'true';
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function fetchPage(path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Accept': 'text/html' },
    redirect: 'follow',
  });
  const html = await res.text();
  return { status: res.status, html };
}

async function fetchApi(
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: options?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      data = { _rawText: await res.text().catch(() => '(parse failed)') };
    }
    return { status: res.status, data };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ════════════════════════════════════════════
// 1. 페이지 로드 테스트 — 모든 라우트가 200 반환 + 핵심 텍스트 확인
// ════════════════════════════════════════════

async function pageLoadTests() {
  console.log('\n📄 [1] 페이지 로드 테스트');

  const pages: { path: string; contains?: string }[] = [
    { path: '/', contains: 'WINAID' },
    { path: '/auth' },
    { path: '/app' },
    { path: '/blog' },
    { path: '/press' },
    { path: '/card_news' },
    { path: '/image' },
    { path: '/refine' },
    { path: '/history' },
    { path: '/feedback' },
    { path: '/admin' },
  ];

  for (const { path, contains } of pages) {
    const label = contains ? `GET ${path} → 200 ("${contains}" 포함)` : `GET ${path} → 200`;
    await test(label, async () => {
      const { status, html } = await fetchPage(path);
      assert(status === 200, `status=${status}`);
      assert(html.includes('</html>') || html.includes('</body>'), 'HTML 응답 아님');
      assert(html.length > 500, `HTML 너무 짧음 (${html.length}자)`);
      if (contains) {
        assert(html.includes(contains), `"${contains}" 텍스트 미포함`);
      }
    });
  }
}

// ════════════════════════════════════════════
// 2. API 입력 검증 테스트
// ════════════════════════════════════════════

async function apiValidationTests() {
  console.log('\n🔌 [2] API 입력 검증 테스트');

  // Gemini health check
  await test('GET /api/gemini → 200 (health)', async () => {
    const { status, data } = await fetchApi('/api/gemini');
    assert(status === 200, `status=${status}`);
    assert(data.status === 'ok', 'health check not ok');
    assert(typeof data.keys === 'number', 'keys 필드 없음');
  });

  // Gemini — prompt 필수 검증
  await test('POST /api/gemini (no prompt) → 400', async () => {
    const { status, data } = await fetchApi('/api/gemini', {
      method: 'POST',
      body: {},
    });
    assert(status === 400, `status=${status}`);
    assert(typeof data.error === 'string', 'error 메시지 없음');
  });

  // Gemini — prompt 길이 초과 검증
  await test('POST /api/gemini (prompt too long) → 400', async () => {
    const { status } = await fetchApi('/api/gemini', {
      method: 'POST',
      body: { prompt: 'x'.repeat(100001) },
    });
    assert(status === 400, `status=${status}`);
  });

  // Gemini — invalid JSON body
  await test('POST /api/gemini (invalid JSON) → 400', async () => {
    const res = await fetch(`${BASE}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    assert(res.status === 400, `status=${res.status}`);
  });

  // Naver search — query 필수 검증
  await test('POST /api/naver/search (no query) → 400', async () => {
    const { status } = await fetchApi('/api/naver/search', {
      method: 'POST',
      body: {},
    });
    assert(status === 400, `status=${status}`);
  });

  // Naver search — query 길이 초과
  await test('POST /api/naver/search (query too long) → 400', async () => {
    const { status } = await fetchApi('/api/naver/search', {
      method: 'POST',
      body: { query: 'x'.repeat(201) },
    });
    assert(status === 400, `status=${status}`);
  });

  // Naver news — query 필수 검증 (GET 라우트)
  await test('GET /api/naver/news (no query) → 400', async () => {
    const { status } = await fetchApi('/api/naver/news');
    assert(status === 400, `status=${status}`);
  });

  // Naver news — query 길이 초과
  await test('GET /api/naver/news (query too long) → 400', async () => {
    const res = await fetch(`${BASE}/api/naver/news?query=${'y'.repeat(201)}`);
    assert(res.status === 400, `status=${res.status}`);
  });

  // Cron — CRON_SECRET 필수 (unauthorized)
  await test('GET /api/cron/crawl-all (no auth) → 401', async () => {
    const { status } = await fetchApi('/api/cron/crawl-all');
    assert(status === 401, `status=${status}`);
  });

  // Cron — wrong secret
  await test('GET /api/cron/crawl-all (wrong secret) → 401', async () => {
    const res = await fetch(`${BASE}/api/cron/crawl-all`, {
      headers: { 'Authorization': 'Bearer wrong_secret' },
    });
    assert(res.status === 401, `status=${res.status}`);
  });

  // Image — prompt 필수 검증
  await test('POST /api/image (no prompt) → 400', async () => {
    const { status } = await fetchApi('/api/image', {
      method: 'POST',
      body: {},
    });
    assert(status === 400, `status=${status}`);
  });
}

// ════════════════════════════════════════════
// 3. 라이브 API 호출 테스트 (SKIP_LIVE_API=true로 스킵 가능)
// ════════════════════════════════════════════

async function liveApiTests() {
  if (SKIP_LIVE_API) {
    console.log('\n⏭️  [3] 라이브 API 테스트 — SKIP_LIVE_API=true로 스킵됨');
    return;
  }

  console.log('\n🔥 [3] 라이브 API 호출 테스트');

  // (a) Gemini 텍스트 생성
  await test('POST /api/gemini (실제 생성) → 200 + text', async () => {
    const { status, data } = await fetchApi('/api/gemini', {
      method: 'POST',
      body: {
        prompt: '안녕하세요라고 한국어로 인사해주세요',
        model: 'gemini-3.1-flash-lite-preview',
        maxOutputTokens: 100,
        timeout: 30000,
      },
      timeoutMs: 35000,
    });
    assert(status === 200, `status=${status}, error=${JSON.stringify(data.error)}`);
    assert(typeof data.text === 'string' && data.text.length > 0, 'text가 비어있음');
  });

  // (b) Gemini JSON 응답 모드
  await test('POST /api/gemini (JSON 모드) → 200 + parseable JSON', async () => {
    const { status, data } = await fetchApi('/api/gemini', {
      method: 'POST',
      body: {
        prompt: '1+1의 답을 JSON으로',
        model: 'gemini-3.1-flash-lite-preview',
        responseType: 'json',
        schema: {
          type: 'OBJECT',
          properties: { answer: { type: 'NUMBER' } },
          required: ['answer'],
        },
        maxOutputTokens: 100,
        timeout: 30000,
      },
      timeoutMs: 35000,
    });
    assert(status === 200, `status=${status}, error=${JSON.stringify(data.error)}`);
    assert(typeof data.text === 'string', 'text가 없음');
    // JSON 파싱 가능 확인
    let parsed = false;
    try { JSON.parse(data.text as string); parsed = true; } catch { /* ignore */ }
    assert(parsed, `JSON 파싱 실패: ${(data.text as string).substring(0, 100)}`);
  });

  // (c) 이미지 생성 (가장 느린 테스트)
  console.log('  🖼️  이미지 생성 테스트 (최대 2분 소요...)');
  await test('POST /api/image (실제 생성) → 200 + imageDataUrl', async () => {
    const { status, data } = await fetchApi('/api/image', {
      method: 'POST',
      body: { prompt: '간단한 파란색 원 하나', aspectRatio: '1:1' },
      timeoutMs: 120000,
    });
    assert(status === 200, `status=${status}, error=${JSON.stringify(data.error)}`);
    const imgUrl = data.imageDataUrl as string;
    assert(typeof imgUrl === 'string' && imgUrl.startsWith('data:image'), 'imageDataUrl이 data:image로 시작하지 않음');
  });
}

// ════════════════════════════════════════════
// 4. 안정성 검증 — 에지 케이스
// ════════════════════════════════════════════

async function stabilityTests() {
  console.log('\n🛡️  [4] 안정성 검증');

  // 존재하지 않는 페이지 → 404
  await test('GET /nonexistent → 404', async () => {
    const { status } = await fetchPage('/nonexistent');
    assert(status === 404, `status=${status}`);
  });

  // API에 빈 body POST
  await test('POST /api/gemini (empty body string) → 400', async () => {
    const res = await fetch(`${BASE}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    assert(res.status === 400, `status=${res.status}`);
  });

  // Naver search — display 클램핑 (음수 → 1)
  await test('POST /api/naver/search (display=-5) → accepted (clamped)', async () => {
    const { status } = await fetchApi('/api/naver/search', {
      method: 'POST',
      body: { query: '치과', display: -5 },
    });
    // 500은 env 미설정 (허용), 400이면 안 됨 (클램핑이 동작해야)
    assert(status !== 400, `display 클램핑 실패: status=${status}`);
  });

  // Gemini — temperature/topP 경계값
  await test('POST /api/gemini (extreme params) → not 400', async () => {
    const { status } = await fetchApi('/api/gemini', {
      method: 'POST',
      body: {
        prompt: 'test',
        temperature: -100,
        topP: 999,
        maxOutputTokens: -1,
        timeout: 1,
      },
    });
    // 클램핑이 동작하므로 400이면 안 됨 (upstream 에러는 허용)
    assert(status !== 400, `파라미터 클램핑 실패: status=${status}`);
  });
}

// ════════════════════════════════════════════
// 실행
// ════════════════════════════════════════════

async function main() {
  console.log(`\n🚀 E2E 스모크 테스트 시작 (${BASE})`);
  if (SKIP_LIVE_API) console.log('   ℹ️  SKIP_LIVE_API=true — 라이브 API 테스트 스킵');
  console.log('');

  // 서버 응답 대기 (최대 30초)
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${BASE}/`);
      break;
    } catch {
      if (i === 29) {
        console.error('❌ 서버 응답 없음 — npm run dev 또는 npm start가 실행 중인지 확인하세요.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  await pageLoadTests();
  await apiValidationTests();
  await liveApiTests();
  await stabilityTests();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 결과: ${passed} passed, ${failed} failed (total: ${passed + failed})`);

  if (failures.length > 0) {
    console.log('\n❌ 실패 목록:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }

  console.log(`${'═'.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
