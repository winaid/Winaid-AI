/**
 * templateBuilders 핵심 함수 테스트
 *
 * 목적: 비달력 카테고리 HTML 빌더의 계약을 보호한다.
 * 특히 buildPricingHTML fallback 버그 재발을 방지.
 * 순수 함수 — mock 없이 입력→출력 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEventHTML,
  buildDoctorHTML,
  buildNoticeHTML,
  buildGreetingHTML,
  buildHiringHTML,
  buildCautionHTML,
  buildPricingHTML,
} from '../templateBuilders';

// ═══════════════════════════════════════
// 공통 검증 헬퍼
// ═══════════════════════════════════════

function expectValidHTML(html: string) {
  expect(html).toBeTruthy();
  expect(html).toContain('calendar-render-target');
  expect(html).toContain('font-family');
}

// ═══════════════════════════════════════
// buildEventHTML
// ═══════════════════════════════════════

describe('buildEventHTML', () => {
  it('제목과 할인율이 포함된 HTML을 생성한다', () => {
    const html = buildEventHTML({
      title: '여름 할인 이벤트',
      discount: '30% OFF',
      price: '150,000원',
      originalPrice: '200,000원',
    });
    expectValidHTML(html);
    expect(html).toContain('여름 할인 이벤트');
    expect(html).toContain('30% OFF');
    expect(html).toContain('150,000원');
    expect(html).toContain('line-through'); // 원가 취소선
  });

  it('최소 입력으로도 에러 없이 생성된다', () => {
    const html = buildEventHTML({ title: '이벤트' });
    expectValidHTML(html);
  });

  it('병원명이 footer에 포함된다', () => {
    const html = buildEventHTML({
      title: '이벤트',
      hospitalName: '테스트 병원',
    });
    expect(html).toContain('테스트 병원');
  });
});

// ═══════════════════════════════════════
// buildDoctorHTML
// ═══════════════════════════════════════

describe('buildDoctorHTML', () => {
  it('의사명과 전문분야가 포함된다', () => {
    const html = buildDoctorHTML({
      doctorName: '김철수',
      specialty: '구강악안면외과',
      career: ['서울대 치의학과 졸업', '분당서울대병원 수련'],
    });
    expectValidHTML(html);
    expect(html).toContain('김철수');
    expect(html).toContain('구강악안면외과');
    expect(html).toContain('서울대 치의학과 졸업');
  });

  it('최소 입력으로도 에러 없이 생성된다', () => {
    const html = buildDoctorHTML({
      doctorName: '홍길동',
      specialty: '일반 진료',
    });
    expectValidHTML(html);
  });
});

// ═══════════════════════════════════════
// buildNoticeHTML
// ═══════════════════════════════════════

describe('buildNoticeHTML', () => {
  it('제목과 내용이 포함된다', () => {
    const html = buildNoticeHTML({
      title: '진료시간 변경 안내',
      content: ['평일 진료시간이 변경됩니다', '토요일 진료는 기존과 동일'],
      effectiveDate: '2026년 4월 1일',
    });
    expectValidHTML(html);
    expect(html).toContain('진료시간 변경 안내');
    expect(html).toContain('평일 진료시간이 변경됩니다');
    expect(html).toContain('2026년 4월 1일');
  });

  it('빈 content 배열이어도 에러 없이 생성된다', () => {
    const html = buildNoticeHTML({
      title: '공지사항',
      content: [],
    });
    expectValidHTML(html);
  });
});

// ═══════════════════════════════════════
// buildGreetingHTML
// ═══════════════════════════════════════

describe('buildGreetingHTML', () => {
  it('명절명과 인사말이 포함된다', () => {
    const html = buildGreetingHTML({
      holiday: '설날',
      greeting: '새해 복 많이 받으세요',
      closurePeriod: '1/28(화) ~ 1/30(목)',
      hospitalName: '행복 치과',
    });
    expectValidHTML(html);
    expect(html).toContain('설날');
    expect(html).toContain('새해 복 많이 받으세요');
    expect(html).toContain('1/28');
  });

  it('추석 테마가 다크 배경을 사용한다', () => {
    const html = buildGreetingHTML({
      holiday: '추석',
      greeting: '풍성한 한가위 보내세요',
    });
    expectValidHTML(html);
    // 추석은 다크 배경
    expect(html).toContain('#1e293b');
  });

  it('미등록 명절도 기본 디자인으로 생성된다', () => {
    const html = buildGreetingHTML({
      holiday: '광복절',
      greeting: '광복절을 축하합니다',
    });
    expectValidHTML(html);
  });
});

// ═══════════════════════════════════════
// buildHiringHTML
// ═══════════════════════════════════════

describe('buildHiringHTML', () => {
  it('포지션과 자격요건이 포함된다', () => {
    const html = buildHiringHTML({
      position: '치과위생사 모집',
      qualifications: ['치위생학과 졸업', '경력 2년 이상'],
      benefits: ['4대보험', '중식 제공'],
      salary: '월 300만원~',
    });
    expectValidHTML(html);
    expect(html).toContain('치과위생사 모집');
    expect(html).toContain('치위생학과 졸업');
    expect(html).toContain('300만원');
  });
});

// ═══════════════════════════════════════
// buildCautionHTML
// ═══════════════════════════════════════

describe('buildCautionHTML', () => {
  it('주의사항 항목이 번호와 함께 표시된다', () => {
    const html = buildCautionHTML({
      title: '임플란트 수술 후 주의사항',
      type: '수술 후',
      items: ['거즈는 1시간 후 제거', '당일 음주 금지', '딱딱한 음식 피하기'],
      emergency: '긴급 연락: 02-1234-5678',
    });
    expectValidHTML(html);
    expect(html).toContain('임플란트 수술 후 주의사항');
    expect(html).toContain('거즈는 1시간 후 제거');
    expect(html).toContain('02-1234-5678');
  });
});

// ═══════════════════════════════════════
// buildPricingHTML — fallback 버그 재발 방지
// ═══════════════════════════════════════

describe('buildPricingHTML', () => {
  it('시술 항목과 가격이 표시된다', () => {
    const html = buildPricingHTML({
      title: '비급여 진료비 안내',
      items: [
        { name: '임플란트', price: '1,200,000원' },
        { name: '치아미백', price: '300,000원' },
      ],
    });
    expectValidHTML(html);
    expect(html).toContain('비급여 진료비 안내');
    expect(html).toContain('임플란트');
    expect(html).toContain('1,200,000원');
    expect(html).toContain('치아미백');
  });

  it('빈 items 배열이어도 에러 없이 생성된다 (fallback 보호)', () => {
    const html = buildPricingHTML({
      title: '비급여 안내',
      items: [],
    });
    expectValidHTML(html);
    expect(html).toContain('비급여 안내');
  });

  it('notice가 포함되면 하단에 표시된다', () => {
    const html = buildPricingHTML({
      title: '가격표',
      items: [{ name: '스케일링', price: '50,000원' }],
      notice: '부가세 별도',
    });
    expect(html).toContain('부가세 별도');
  });

  it('colorTheme이 적용된다', () => {
    const html = buildPricingHTML({
      title: '가격표',
      items: [{ name: '테스트', price: '10,000원' }],
      colorTheme: 'pink',
    });
    expectValidHTML(html);
    // pink 테마의 primary color
    expect(html).toContain('#db2777');
  });

  it('hospitalName이 footer에 표시된다', () => {
    const html = buildPricingHTML({
      title: '가격표',
      items: [{ name: '테스트', price: '10,000원' }],
      hospitalName: '예쁜 치과',
    });
    expect(html).toContain('예쁜 치과');
  });
});
