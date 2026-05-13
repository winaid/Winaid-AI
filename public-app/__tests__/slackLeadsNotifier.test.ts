/**
 * slackLeadsNotifier 회귀 테스트 (public-app).
 *
 * 실행: npx tsx __tests__/slackLeadsNotifier.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - SLACK_LEADS_WEBHOOK_URL 미설정 시 fetch 호출이 일어나지 않는다 (회귀 0)
 *   - buildSlackBlocks 결과에 필수 필드 4종 (병원/담당자/연락처/유입) 이 들어간다
 *   - diagnosticUrl/메시지/admin link 는 옵션 — 값 있을 때만 블록 추가
 */
import assert from 'node:assert/strict';
import {
  buildSlackBlocks,
  notifyLeadToSlack,
  type SlackLeadPayload,
} from '../lib/slackLeadsNotifier';

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

const basePayload: SlackLeadPayload = {
  leadId: '00000000-0000-0000-0000-000000000001',
  hospitalName: '강남 OO 치과',
  contactName: '홍길동 원장',
  phone: '010-1234-5678',
  message: null,
  source: 'lock-actionplan',
  diagnosticUrl: null,
  diagnosticScore: null,
};

async function run() {
  // eslint-disable-next-line no-console
  console.log('\n>>> slackLeadsNotifier.test.ts');

  await test('buildSlackBlocks: 4 필수 필드(병원/담당자/연락처/유입) 포함', () => {
    const msg = buildSlackBlocks(basePayload);
    const fieldsBlock = msg.blocks.find((b) => b.type === 'section' && Array.isArray(b.fields));
    assert.ok(fieldsBlock, 'section/fields 블록 누락');
    const texts = (fieldsBlock!.fields ?? []).map((f) => f.text);
    assert.ok(texts.some((t) => t.includes('강남 OO 치과')), '병원명 누락');
    assert.ok(texts.some((t) => t.includes('홍길동 원장')), '담당자 누락');
    assert.ok(texts.some((t) => t.includes('010-1234-5678')), '연락처 누락');
    assert.ok(
      texts.some((t) => t.includes('우선조치 잠금')),
      'source label 누락 — LEAD_SOURCE_LABEL 와 drift',
    );
  });

  await test('buildSlackBlocks: lead_id 가 context 블록으로 첨부', () => {
    const msg = buildSlackBlocks(basePayload);
    const allText = JSON.stringify(msg);
    assert.ok(allText.includes(basePayload.leadId), 'leadId 누락 — admin 조회 시 매칭 불가');
  });

  await test('buildSlackBlocks: 진단 URL/점수 없으면 블록 추가 X', () => {
    const msg = buildSlackBlocks(basePayload);
    const hasDiagnostic = msg.blocks.some(
      (b) => b.type === 'section' && b.text?.text?.includes('진단 사이트'),
    );
    assert.equal(hasDiagnostic, false, '진단 URL 없는데 블록이 들어감');
  });

  await test('buildSlackBlocks: 진단 URL/점수 있으면 블록 + 점수 표기', () => {
    const msg = buildSlackBlocks({
      ...basePayload,
      diagnosticUrl: 'https://example-clinic.kr',
      diagnosticScore: 67,
    });
    const diagBlock = msg.blocks.find(
      (b) => b.type === 'section' && b.text?.text?.includes('진단 사이트'),
    );
    assert.ok(diagBlock, '진단 URL 블록 누락');
    assert.ok(diagBlock!.text!.text.includes('example-clinic.kr'), 'URL 누락');
    assert.ok(diagBlock!.text!.text.includes('67점'), '점수 표기 누락');
  });

  await test('buildSlackBlocks: 메시지 빈값이면 블록 추가 X', () => {
    const msg = buildSlackBlocks(basePayload);
    const hasMessage = msg.blocks.some(
      (b) => b.type === 'section' && b.text?.text?.startsWith('*메시지*'),
    );
    assert.equal(hasMessage, false);
  });

  await test('buildSlackBlocks: 메시지 있으면 인용 블록', () => {
    const msg = buildSlackBlocks({
      ...basePayload,
      message: '두 번째 줄도\n포함된 메시지입니다.',
    });
    const msgBlock = msg.blocks.find(
      (b) => b.type === 'section' && b.text?.text?.startsWith('*메시지*'),
    );
    assert.ok(msgBlock, '메시지 블록 누락');
    assert.ok(msgBlock!.text!.text.includes('>두 번째 줄도'), '인용 prefix(>) 누락');
    assert.ok(msgBlock!.text!.text.includes('>포함된 메시지'), '여러 줄 인용 누락');
  });

  await test('buildSlackBlocks: adminBaseUrl 미지정 시 어드민 링크 블록 X', () => {
    const msg = buildSlackBlocks(basePayload);
    const text = JSON.stringify(msg);
    assert.equal(text.includes('어드민에서 보기'), false);
  });

  await test('buildSlackBlocks: adminBaseUrl 끝 슬래시 제거 + 링크 첨부', () => {
    const msg = buildSlackBlocks(basePayload, 'https://admin.example.com/');
    const text = JSON.stringify(msg);
    assert.ok(text.includes('https://admin.example.com/admin'), 'admin link URL drift');
    assert.ok(!text.includes('example.com//admin'), '슬래시 중복');
  });

  await test('notifyLeadToSlack: SLACK_LEADS_WEBHOOK_URL 미설정 시 fetch 호출 X', async () => {
    const original = process.env.SLACK_LEADS_WEBHOOK_URL;
    delete process.env.SLACK_LEADS_WEBHOOK_URL;
    const origFetch = global.fetch;
    let called = false;
    global.fetch = (() => {
      called = true;
      return Promise.resolve(new Response('ok'));
    }) as unknown as typeof fetch;
    try {
      notifyLeadToSlack(basePayload);
      // microtask flush 보장
      await Promise.resolve();
      assert.equal(called, false, '미설정 상태에서 fetch 가 호출됨 — 회귀');
    } finally {
      global.fetch = origFetch;
      if (original !== undefined) process.env.SLACK_LEADS_WEBHOOK_URL = original;
    }
  });

  await test('notifyLeadToSlack: webhook URL 있으면 fetch 호출됨', async () => {
    const original = process.env.SLACK_LEADS_WEBHOOK_URL;
    process.env.SLACK_LEADS_WEBHOOK_URL = 'https://hooks.slack.com/services/T/B/X';
    const origFetch = global.fetch;
    const captured: { url: string; body: string }[] = [];
    global.fetch = ((url: string, init: RequestInit) => {
      captured.push({ url: String(url), body: String(init.body) });
      return Promise.resolve(new Response('ok'));
    }) as unknown as typeof fetch;
    try {
      notifyLeadToSlack(basePayload);
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(captured.length, 1, 'fetch 미호출 또는 중복 호출');
      assert.equal(captured[0].url, 'https://hooks.slack.com/services/T/B/X');
      assert.ok(captured[0].body.includes('강남 OO 치과'), 'body 에 병원명 누락');
    } finally {
      global.fetch = origFetch;
      if (original === undefined) delete process.env.SLACK_LEADS_WEBHOOK_URL;
      else process.env.SLACK_LEADS_WEBHOOK_URL = original;
    }
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
}

run();
