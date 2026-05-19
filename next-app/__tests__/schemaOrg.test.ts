/**
 * schemaOrg 회귀 테스트 (public-app) — GEO-6 schema.org JSON-LD 자동 생성기.
 *
 * 실행: npx tsx __tests__/schemaOrg.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - 4 builder 출력 schema.org 표준 준수 (@context + @type + 필수 필드)
 *   - 입력 빈/누락 시 graceful (undefined 반환, throw X)
 *   - 모든 schema JSON.parse 가능 + valid JSON
 *   - 양 앱 lockstep (SchemaOrgSection diff=0 + builder 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMedicalOrganizationSchema,
  buildPhysicianSchema,
  buildFAQPageSchema,
  buildLocalBusinessSchema,
  buildAllSchemas,
  serializeSchema,
  wrapAsScript,
  type SchemaBuilderInput,
} from '@winaid/blog-core';

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
console.log('\n>>> schemaOrg.test.ts — next-app');

const FULL_INPUT: SchemaBuilderInput = {
  name: '강남스마일치과',
  url: 'https://mysmile.co.kr',
  specialties: ['임플란트', '치아교정', '치아미백'],
  doctors: ['김철수', '이영희'],
  faqs: [
    { question: '임플란트는 얼마인가요?', answer: '1개당 120만원입니다.' },
    { question: '마취는 어떻게 하나요?', answer: '국소마취로 진행합니다.' },
  ],
  address: '서울특별시 강남구 테헤란로 1',
  region: '강남구',
  telephone: '02-1234-5678',
  openingHours: 'Mo-Fr 09:00-18:00',
  priceRange: '₩₩',
  sameAs: ['https://blog.naver.com/mysmile', 'https://instagram.com/mysmile'],
};

(async () => {
  // ── MedicalOrganization ──

  await test('MedicalOrganization: 필수 필드 (@context + @type + name + url)', () => {
    const s = buildMedicalOrganizationSchema(FULL_INPUT)!;
    assert.equal(s['@context'], 'https://schema.org');
    assert.equal(s['@type'], 'MedicalOrganization');
    assert.equal(s.name, '강남스마일치과');
    assert.equal(s.url, 'https://mysmile.co.kr');
  });

  await test('MedicalOrganization: 옵션 필드 (specialties / telephone / address / sameAs) 매핑', () => {
    const s = buildMedicalOrganizationSchema(FULL_INPUT)!;
    assert.deepEqual(s.medicalSpecialty, ['임플란트', '치아교정', '치아미백']);
    assert.equal(s.telephone, '02-1234-5678');
    const addr = s.address as Record<string, unknown>;
    assert.equal(addr['@type'], 'PostalAddress');
    assert.equal(addr.streetAddress, '서울특별시 강남구 테헤란로 1');
    assert.equal(addr.addressRegion, '강남구');
    assert.equal(addr.addressCountry, 'KR');
    assert.deepEqual(s.sameAs, ['https://blog.naver.com/mysmile', 'https://instagram.com/mysmile']);
  });

  await test('MedicalOrganization: 필수 필드 누락 → undefined (throw X)', () => {
    assert.equal(buildMedicalOrganizationSchema({ name: '', url: 'https://x' } as SchemaBuilderInput), undefined);
    assert.equal(buildMedicalOrganizationSchema({ name: 'x', url: '' } as SchemaBuilderInput), undefined);
    assert.equal(buildMedicalOrganizationSchema({ name: 'x', url: 'javascript:alert(1)' } as SchemaBuilderInput), undefined);
    assert.equal(buildMedicalOrganizationSchema({ name: 'x', url: 'ftp://example.com' } as SchemaBuilderInput), undefined);
  });

  // ── Physician ──

  await test('Physician: 의료진 1명 + worksFor 매핑', () => {
    const p = buildPhysicianSchema('김철수', FULL_INPUT)!;
    assert.equal(p['@type'], 'Physician');
    assert.equal(p.name, '김철수');
    assert.deepEqual(p.medicalSpecialty, ['임플란트', '치아교정', '치아미백']);
    const w = p.worksFor as Record<string, unknown>;
    assert.equal(w['@type'], 'MedicalOrganization');
    assert.equal(w.name, '강남스마일치과');
    assert.equal(w.url, 'https://mysmile.co.kr');
  });

  await test('Physician: 빈 이름 → undefined', () => {
    assert.equal(buildPhysicianSchema('', FULL_INPUT), undefined);
    assert.equal(buildPhysicianSchema('   ', FULL_INPUT), undefined);
  });

  // ── FAQPage ──

  await test('FAQPage: faqs 다수 → mainEntity 배열 변환', () => {
    const s = buildFAQPageSchema(FULL_INPUT.faqs)!;
    assert.equal(s['@type'], 'FAQPage');
    const entities = s.mainEntity as Array<Record<string, unknown>>;
    assert.equal(entities.length, 2);
    assert.equal(entities[0]['@type'], 'Question');
    assert.equal(entities[0].name, '임플란트는 얼마인가요?');
    const ans = entities[0].acceptedAnswer as Record<string, unknown>;
    assert.equal(ans['@type'], 'Answer');
    assert.equal(ans.text, '1개당 120만원입니다.');
  });

  await test('FAQPage: 빈 배열 → undefined (mainEntity 1개 이상 필수)', () => {
    assert.equal(buildFAQPageSchema(undefined), undefined);
    assert.equal(buildFAQPageSchema([]), undefined);
  });

  await test('FAQPage: question 또는 answer 빈 항목 제외 + 모두 빈 시 undefined', () => {
    const s = buildFAQPageSchema([
      { question: '', answer: '답' },
      { question: '질문', answer: '' },
    ]);
    assert.equal(s, undefined);
  });

  // ── LocalBusiness ──

  await test('LocalBusiness: 필수 + 옵션 필드 (telephone / openingHours / priceRange)', () => {
    const s = buildLocalBusinessSchema(FULL_INPUT)!;
    assert.equal(s['@type'], 'LocalBusiness');
    assert.equal(s.name, '강남스마일치과');
    assert.equal(s.telephone, '02-1234-5678');
    assert.equal(s.openingHours, 'Mo-Fr 09:00-18:00');
    assert.equal(s.priceRange, '₩₩');
  });

  await test('LocalBusiness: 주소 / 영업시간 누락 → omit (필수 X)', () => {
    const s = buildLocalBusinessSchema({ name: '치과', url: 'https://x.com' })!;
    assert.equal(s['@type'], 'LocalBusiness');
    assert.ok(!('address' in s));
    assert.ok(!('telephone' in s));
    assert.ok(!('openingHours' in s));
    assert.ok(!('priceRange' in s));
  });

  // ── buildAllSchemas 종합 ──

  await test('buildAllSchemas: 전체 입력 → 4 schema 모두 생성 + combined script', () => {
    const r = buildAllSchemas(FULL_INPUT);
    assert.ok(r.medicalOrganization, 'medicalOrganization 누락');
    assert.ok(r.localBusiness, 'localBusiness 누락');
    assert.ok(r.faqPage, 'faqPage 누락');
    assert.equal(r.physicians.length, 2);
    // combined script 가 4개 schema script 모두 포함
    const scripts = r.combinedScripts.match(/<script type="application\/ld\+json">/g) || [];
    assert.equal(scripts.length, 5, `combinedScripts script 개수: ${scripts.length} (medicalOrg 1 + physicians 2 + faq 1 + local 1 = 5)`);
    // missingFields — 모두 있으므로 빈 배열
    assert.equal(r.missingFields.length, 0, `missingFields 비어있어야 함: ${r.missingFields}`);
  });

  await test('buildAllSchemas: 최소 입력 → 2 schema (medicalOrg + localBusiness) + missingFields 안내', () => {
    const r = buildAllSchemas({ name: '치과', url: 'https://x.com' });
    assert.ok(r.medicalOrganization);
    assert.ok(r.localBusiness);
    assert.equal(r.faqPage, undefined);
    assert.equal(r.physicians.length, 0);
    assert.ok(r.missingFields.length >= 4, `missingFields 안내 부족: ${r.missingFields.length}`);
    assert.ok(r.missingFields.some(m => m.includes('doctors')), 'doctors 안내 누락');
    assert.ok(r.missingFields.some(m => m.includes('faqs')), 'faqs 안내 누락');
  });

  await test('buildAllSchemas: 필수 필드 누락 → 모두 undefined + missingFields 에 name/url', () => {
    const r = buildAllSchemas({ name: '', url: '' });
    assert.equal(r.medicalOrganization, undefined);
    assert.equal(r.localBusiness, undefined);
    assert.equal(r.combinedScripts, '');
    assert.ok(r.missingFields.some(m => m.includes('name')), 'name missing 안내 누락');
    assert.ok(r.missingFields.some(m => m.includes('url')), 'url missing 안내 누락');
  });

  // ── JSON 직렬화 + script wrapper ──

  await test('serialize: 모든 schema 가 JSON.parse 가능 (valid JSON)', () => {
    const r = buildAllSchemas(FULL_INPUT);
    if (r.medicalOrganization) JSON.parse(serializeSchema(r.medicalOrganization));
    for (const p of r.physicians) JSON.parse(serializeSchema(p));
    if (r.faqPage) JSON.parse(serializeSchema(r.faqPage));
    if (r.localBusiness) JSON.parse(serializeSchema(r.localBusiness));
  });

  await test('wrapAsScript: <script type="application/ld+json"> 으로 감싸기', () => {
    const r = buildAllSchemas(FULL_INPUT);
    const wrapped = wrapAsScript(r.medicalOrganization!);
    assert.ok(wrapped.startsWith('<script type="application/ld+json">\n'));
    assert.ok(wrapped.endsWith('\n</script>'));
    // 안쪽 본문은 valid JSON
    const inner = wrapped.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, '');
    JSON.parse(inner);
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: SchemaOrgSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/SchemaOrgSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/SchemaOrgSection.tsx');
    assert.ok(existsSync(p1) && existsSync(p2), 'SchemaOrgSection 누락');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), '양 앱 SchemaOrgSection drift');
  });

  await test('lockstep: schemaOrgBuilder 단일 소스 (blog-core 에서 양 앱 import)', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/schemaOrgBuilder.ts');
    assert.ok(existsSync(p), 'schemaOrgBuilder 누락');
    const s1 = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/SchemaOrgSection.tsx'), 'utf-8');
    const s2 = readFileSync(resolve(REPO_ROOT, 'next-app/components/diagnostic/SchemaOrgSection.tsx'), 'utf-8');
    assert.ok(/buildAllSchemas/.test(s1) && /@winaid\/blog-core/.test(s1), 'public-app import 누락');
    assert.ok(/buildAllSchemas/.test(s2) && /@winaid\/blog-core/.test(s2), 'next-app import 누락');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
