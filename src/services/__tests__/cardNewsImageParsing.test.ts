/**
 * cardNewsImageService — 텍스트 추출 파싱 방어 테스트
 *
 * 검증:
 *   - 정상 key: "value" 파싱
 *   - escaped quotes 방어
 *   - 따옴표 없는 값 파싱
 *   - 특수문자 포함 한글 파싱
 *   - 빈 입력 방어
 */
import { describe, it, expect } from 'vitest';

// parseField 함수를 직접 테스트하기 위해 동일 로직 추출
function parseField(text: string, key: string): string {
  const quotedMatch = text.match(new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i'));
  if (quotedMatch) return quotedMatch[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
  const unquotedMatch = text.match(new RegExp(`${key}:\\s*([^\\n,]+)`, 'i'));
  if (unquotedMatch) return unquotedMatch[1].trim().replace(/^["']|["']$/g, '');
  return '';
}

describe('parseField — 텍스트 추출', () => {
  it('정상 key: "value" 파싱', () => {
    expect(parseField('subtitle: "스케일링 안내"', 'subtitle')).toBe('스케일링 안내');
    expect(parseField('mainTitle: "치석 제거의 중요성"', 'mainTitle')).toBe('치석 제거의 중요성');
  });

  it('escaped quotes 방어', () => {
    expect(parseField('subtitle: "그는 \\"전문가\\"입니다"', 'subtitle')).toBe('그는 "전문가"입니다');
  });

  it('따옴표 없는 값', () => {
    expect(parseField('subtitle: 스케일링 안내\nmainTitle: 제목', 'subtitle')).toBe('스케일링 안내');
  });

  it('특수문자 포함 한글', () => {
    expect(parseField('mainTitle: "뇌신경계통(CNS)의 구조"', 'mainTitle')).toBe('뇌신경계통(CNS)의 구조');
    expect(parseField('description: "100% 자연 치유?"', 'description')).toBe('100% 자연 치유?');
  });

  it('빈 입력 방어', () => {
    expect(parseField('', 'subtitle')).toBe('');
    expect(parseField('unrelated text', 'subtitle')).toBe('');
  });

  it('복합 프롬프트에서 각 필드 독립 추출', () => {
    const prompt = `subtitle: "부제목 텍스트"
mainTitle: "메인 제목 텍스트"
description: "설명 텍스트입니다"
비주얼: 병원에서 상담받는 환자`;

    expect(parseField(prompt, 'subtitle')).toBe('부제목 텍스트');
    expect(parseField(prompt, 'mainTitle')).toBe('메인 제목 텍스트');
    expect(parseField(prompt, 'description')).toBe('설명 텍스트입니다');
  });

  it('작은따옴표 포함 값', () => {
    expect(parseField("subtitle: \"환자's 이야기\"", 'subtitle')).toBe("환자's 이야기");
  });

  it('콜론이 값에 포함된 경우', () => {
    expect(parseField('mainTitle: "시간: 오후 3시"', 'mainTitle')).toBe('시간: 오후 3시');
  });
});
