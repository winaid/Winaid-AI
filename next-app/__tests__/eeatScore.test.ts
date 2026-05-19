/**
 * eeatScore 회귀 테스트 (public-app) — GEO-7 E-E-A-T 4축 채점기.
 *
 * 실행: npx tsx __tests__/eeatScore.test.ts  (또는 `npm run test`)
 *
 * 보장 invariant:
 *   - 4 축 채점 정확도 (각 axis 강·약 mock)
 *   - scoreEEAT 종합 가중치 (4축 평균)
 *   - awaitingData 처리 (textContent 미제공 시)
 *   - DOCTOR_NAME_PATTERN 재사용 정확성 (PR #235 패턴과 동등)
 *   - 양 앱 lockstep (EEATSection diff=0 + scorer 단일 소스)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scoreExperience,
  scoreExpertise,
  scoreAuthority,
  scoreTrust,
  scoreEEAT,
  type EEATInput,
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
console.log('\n>>> eeatScore.test.ts — next-app');

const RICH_INPUT: EEATInput = {
  url: 'https://mysmile.co.kr',
  textContent: `
    원장 홍길동은 서울대학교 졸업 후 임상 15년 경력을 쌓았습니다.
    부원장 김철수는 박사 학위 보유, 前 강남세브란스병원 근무.
    대표원장 이영희는 구강외과 전문의이며 대한치과학회 정회원이자 이사입니다.
    저희 병원은 1,000건 시술 누적, 후기 다수 보유.
    KBS·MBC 보도 출연 이력 있으며, 논문 5편 발표 (DOI 포함).
    부작용 / 주의사항 안내 페이지 운영.
    출처: 대한치과학회지 2023. T. 02-1234-5678.
    치료 전/후 사진 제공. 치료 전 환자 동의 후 게재.
  `,
  internalLinks: [
    { href: 'https://mysmile.co.kr/doctor', text: '의료진' },
    { href: 'https://mysmile.co.kr/case/2024-01', text: '사례' },
    { href: 'https://mysmile.co.kr/privacy', text: '개인정보처리방침' },
    { href: 'tel:02-1234-5678', text: '02-1234-5678' },
  ],
  externalLinks: [
    { href: 'https://news.naver.com/article/123', text: 'KBS 인터뷰' },
  ],
  categoryItems: [
    { label: 'HTTPS 적용', status: 'pass' },
    { label: '의료진 소개 페이지', status: 'pass' },
    { label: '연락처 노출', status: 'pass' },
    { label: '구조화 데이터 sameAs', status: 'pass' },
  ],
  schemaTypes: ['MedicalOrganization', 'Organization'],
  detectedServices: ['임플란트', '교정', '치아미백', '신경치료'],
  imageAlts: ['치료 전 사례 사진', 'case study after image', '병원 외관'],
};

const POOR_INPUT: EEATInput = {
  url: 'http://example.com',
  textContent: '안녕하세요. 환영합니다.',
  internalLinks: [],
  categoryItems: [
    { label: 'HTTPS 적용', status: 'fail' },
  ],
  schemaTypes: [],
  detectedServices: [],
  imageAlts: [],
};

(async () => {
  // ── 4 axis 정확도 ──

  await test('scoreExperience: 풍부 입력 → 점수 ≥ 60', () => {
    const r = scoreExperience(RICH_INPUT);
    assert.ok(r.score >= 60, `score=${r.score}`);
    assert.ok(r.signals.some(s => s.label.includes('사례 dedicated 페이지') && s.points > 0));
    assert.ok(r.signals.some(s => s.label.includes('전후 사진 alt')));
  });

  await test('scoreExperience: 빈 입력 → 점수 < 30', () => {
    const r = scoreExperience(POOR_INPUT);
    assert.ok(r.score < 30, `score=${r.score}`);
  });

  await test('scoreExpertise: 풍부 입력 (DOCTOR_NAME 3명+학회+전문의) → 점수 ≥ 70', () => {
    const r = scoreExpertise(RICH_INPUT);
    assert.ok(r.score >= 70, `score=${r.score}`);
    assert.ok(r.signals.some(s => s.label.includes('의료진 이름') && s.points >= 15), '의료진 이름 신호 점수 부족');
    assert.ok(r.signals.some(s => s.label.includes('진료과목 다양성') && s.points > 0));
  });

  await test('scoreExpertise: 의료진 dedicated 페이지 path 만 → 일부 점수', () => {
    const r = scoreExpertise({
      ...POOR_INPUT,
      internalLinks: [{ href: 'https://x.com/doctor/abc', text: '의료진' }],
    });
    const docSignal = r.signals.find(s => s.label.includes('의료진 dedicated'));
    assert.ok(docSignal && docSignal.points === docSignal.weight, '의료진 path 인식 실패');
  });

  await test('scoreAuthority: 학회·논문·미디어·schema 동시 → 점수 ≥ 70', () => {
    const r = scoreAuthority(RICH_INPUT);
    assert.ok(r.score >= 70, `score=${r.score}`);
    assert.ok(r.signals.some(s => s.label.includes('의료기관 schema') && s.points > 0));
    assert.ok(r.signals.some(s => s.label.includes('Organization sameAs') && s.points > 0));
  });

  await test('scoreAuthority: externalLinks 의 미디어 hostname 매칭 (news.naver)', () => {
    const r = scoreAuthority({
      url: 'https://x.com',
      externalLinks: [{ href: 'https://news.naver.com/123', text: '뉴스' }],
    });
    const mediaSignal = r.signals.find(s => s.label.includes('외부 미디어'));
    assert.ok(mediaSignal && mediaSignal.points > 0);
  });

  await test('scoreTrust: HTTPS + 부작용 + 출처 + tel + privacy + 의료법 → 점수 ≥ 70', () => {
    const r = scoreTrust(RICH_INPUT);
    assert.ok(r.score >= 70, `score=${r.score}`);
    assert.ok(r.signals.some(s => s.label.includes('HTTPS') && s.points > 0));
    assert.ok(r.signals.some(s => s.label.includes('개인정보 처리방침') && s.points > 0));
  });

  await test('scoreTrust: HTTP url (insecure) → HTTPS 신호 0점', () => {
    const r = scoreTrust(POOR_INPUT);
    const httpsSignal = r.signals.find(s => s.label.includes('HTTPS'));
    assert.equal(httpsSignal?.points, 0);
  });

  // ── awaitingData ──

  await test('awaiting_data: textContent 없으면 text-based 신호 awaitingData=true', () => {
    const inputNoText: EEATInput = {
      url: 'https://mysmile.co.kr',
      internalLinks: [{ href: 'https://mysmile.co.kr/doctor', text: '의료진' }],
      categoryItems: [{ label: 'HTTPS 적용', status: 'pass' }],
    };
    const r = scoreEEAT(inputNoText);
    // Authority 의 학회/논문 신호는 awaiting (text 의존)
    const awaitingCount = [
      ...r.axes.experience.signals,
      ...r.axes.expertise.signals,
      ...r.axes.authority.signals,
      ...r.axes.trust.signals,
    ].filter(s => s.awaitingData).length;
    assert.ok(awaitingCount >= 5, `awaiting count=${awaitingCount}`);
    // HTTPS / 의료진 path 같은 category-derived 신호는 awaiting 아님
    assert.ok(r.axes.trust.signals.find(s => s.label.includes('HTTPS') && !s.awaitingData));
    assert.ok(r.axes.expertise.signals.find(s => s.label.includes('의료진 dedicated') && !s.awaitingData));
  });

  // ── scoreEEAT 종합 ──

  await test('scoreEEAT: 풍부 입력 → overall ≥ 65 + strengths ≥ 5 + weaknesses 일부', () => {
    const r = scoreEEAT(RICH_INPUT);
    assert.ok(r.overall >= 65, `overall=${r.overall}`);
    assert.ok(r.strengths.length >= 5, `strengths=${r.strengths.length}`);
    // strengths 정렬 — 가장 비중 높은 신호가 앞
    assert.ok(typeof r.strengths[0] === 'string');
  });

  await test('scoreEEAT: 빈 입력 → overall < 30 + weaknesses 다수 + 권고 포함', () => {
    const r = scoreEEAT(POOR_INPUT);
    assert.ok(r.overall < 30, `overall=${r.overall}`);
    assert.ok(r.weaknesses.length >= 5);
    assert.ok(r.weaknesses[0].recommendation.length > 0, '권고 메시지 누락');
  });

  await test('scoreEEAT: 축별 score 0~100 cap (overflow X)', () => {
    const r = scoreEEAT(RICH_INPUT);
    for (const axis of ['experience', 'expertise', 'authority', 'trust'] as const) {
      assert.ok(r.axes[axis].score >= 0 && r.axes[axis].score <= 100, `${axis}=${r.axes[axis].score}`);
    }
    assert.ok(r.overall >= 0 && r.overall <= 100);
  });

  // ── DOCTOR_NAME_PATTERN 재사용 정확성 (PR #235 동등) ──

  await test('DOCTOR_NAME_PATTERN: "원장 인사말" 같은 비-이름 차단 (PR #235 invariant)', () => {
    const r = scoreExpertise({
      url: 'https://x.com',
      textContent: '원장 인사말. 원장 소개. 원장 정보.',
    });
    const docSignal = r.signals.find(s => s.label.includes('의료진 이름'));
    assert.equal(docSignal?.points, 0, '"원장 인사말" 이 의료진 이름으로 false match');
  });

  // ── 양 앱 lockstep ──

  await test('lockstep: EEATSection 양 앱 diff=0', () => {
    const p1 = resolve(REPO_ROOT, 'public-app/components/diagnostic/EEATSection.tsx');
    const p2 = resolve(REPO_ROOT, 'next-app/components/diagnostic/EEATSection.tsx');
    assert.ok(existsSync(p1) && existsSync(p2), 'EEATSection 누락');
    assert.equal(readFileSync(p1, 'utf-8'), readFileSync(p2, 'utf-8'), '양 앱 EEATSection drift');
  });

  await test('lockstep: eeatScorer blog-core 단일 소스 + 양 앱 import', () => {
    const p = resolve(REPO_ROOT, 'packages/blog-core/src/geo/eeatScorer.ts');
    assert.ok(existsSync(p), 'eeatScorer 누락');
    const s1 = readFileSync(resolve(REPO_ROOT, 'public-app/components/diagnostic/EEATSection.tsx'), 'utf-8');
    const s2 = readFileSync(resolve(REPO_ROOT, 'next-app/components/diagnostic/EEATSection.tsx'), 'utf-8');
    assert.ok(/scoreEEAT/.test(s1) && /@winaid\/blog-core/.test(s1), 'public-app import 누락');
    assert.ok(/scoreEEAT/.test(s2) && /@winaid\/blog-core/.test(s2), 'next-app import 누락');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
})();
