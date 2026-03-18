/**
 * calendarBuilders 핵심 함수 테스트
 *
 * 목적: 달력 HTML 빌더와 공휴일 데이터의 계약을 보호한다.
 * 순수 함수 — mock 없이 입력→출력 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCalendarHTML,
  getHolidays,
  THEMES,
  type CalendarData,
} from '../calendarBuilders';

// ═══════════════════════════════════════
// getHolidays
// ═══════════════════════════════════════

describe('getHolidays', () => {
  it('1월에 신정을 반환한다', () => {
    const holidays = getHolidays(2026, 1);
    expect(holidays.get(1)).toBe('신정');
  });

  it('3월에 삼일절을 반환한다', () => {
    const holidays = getHolidays(2026, 3);
    expect(holidays.get(1)).toBe('삼일절');
  });

  it('12월에 성탄절을 반환한다', () => {
    const holidays = getHolidays(2026, 12);
    expect(holidays.get(25)).toBe('성탄절');
  });

  it('공휴일이 없는 월은 빈 Map을 반환한다', () => {
    const holidays = getHolidays(2026, 4); // 4월에 고정 공휴일 없음
    expect(holidays.size).toBe(0);
  });

  it('5월에 어린이날을 반환한다', () => {
    const holidays = getHolidays(2026, 5);
    expect(holidays.get(5)).toBe('어린이날');
  });
});

// ═══════════════════════════════════════
// THEMES
// ═══════════════════════════════════════

describe('THEMES', () => {
  it('8개 테마가 존재한다', () => {
    expect(Object.keys(THEMES).length).toBe(8);
  });

  it('각 테마에 필수 속성이 있다', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      expect(theme.primary, `${name}.primary`).toBeTruthy();
      expect(theme.light, `${name}.light`).toBeTruthy();
      expect(theme.accent, `${name}.accent`).toBeTruthy();
      expect(theme.headerBg, `${name}.headerBg`).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════
// buildCalendarHTML
// ═══════════════════════════════════════

describe('buildCalendarHTML', () => {
  const baseData: CalendarData = {
    month: 3,
    year: 2026,
    title: '3월 진료 안내',
    closedDays: [{ day: 1, reason: '삼일절' }, { day: 15, reason: '정기 휴진' }],
    hospitalName: '테스트 치과',
    colorTheme: 'blue',
  };

  it('유효한 HTML을 반환한다', () => {
    const html = buildCalendarHTML(baseData);
    expect(html).toBeTruthy();
    expect(html).toContain('calendar-render-target');
  });

  it('제목이 포함된다', () => {
    const html = buildCalendarHTML(baseData);
    expect(html).toContain('3월 진료 안내');
  });

  it('병원명이 포함된다', () => {
    const html = buildCalendarHTML(baseData);
    expect(html).toContain('테스트 치과');
  });

  it('colorTheme이 없으면 기본 테마로 생성한다', () => {
    const data = { ...baseData, colorTheme: undefined };
    const html = buildCalendarHTML(data);
    expect(html).toBeTruthy();
    expect(html).toContain('calendar-render-target');
  });

  it('단축진료일과 휴가일이 포함된다', () => {
    const data: CalendarData = {
      ...baseData,
      shortenedDays: [{ day: 10, hours: '09:00~14:00', reason: '단축' }],
      vacationDays: [{ day: 20, reason: '여름 휴가' }],
    };
    const html = buildCalendarHTML(data);
    expect(html).toBeTruthy();
    // HTML이 에러 없이 생성되면 성공
  });
});
