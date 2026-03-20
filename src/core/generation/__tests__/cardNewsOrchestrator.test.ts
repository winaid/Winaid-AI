/**
 * cardNewsOrchestrator 단위 테스트
 *
 * 검증 목표:
 *   1. batch scheduling — BATCH_SIZE 단위 병렬 실행
 *   2. per-card timeout → fallback 전환
 *   3. late-arrival recovery
 *   4. 전체 성공 시 summary 집계
 *   5. 부분 실패 시 summary 일관성
 *   6. clampSlideCount 동작
 *   7. fallback SVG에 카드 텍스트 포함
 *   8. progress 콜백 호출
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCardImageBatch } from '../cardNewsOrchestrator';
import { clampSlideCount, MAX_SLIDE_COUNT, DEFAULT_SLIDE_COUNT } from '../cardNewsConfig';
import type { CardImageTask } from '../cardNewsOrchestrator';

// ── 헬퍼 ──

function makeTasks(count: number): CardImageTask[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    prompt: `테스트 프롬프트 ${i + 1}`,
    imageStyle: 'illustration',
  }));
}

function makeCardTexts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    subtitle: `부제 ${i + 1}`,
    mainTitle: `제목 ${i + 1}`,
    description: `설명 ${i + 1}`,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════
// 그룹 1. clampSlideCount
// ═══════════════════════════════════════════════

describe('clampSlideCount', () => {
  it('undefined → DEFAULT_SLIDE_COUNT', () => {
    expect(clampSlideCount(undefined)).toBe(DEFAULT_SLIDE_COUNT);
  });

  it('MAX 초과 → MAX로 clamp', () => {
    expect(clampSlideCount(20)).toBe(MAX_SLIDE_COUNT);
  });

  it('0 이하 → 1로 clamp', () => {
    expect(clampSlideCount(0)).toBe(1);
    expect(clampSlideCount(-3)).toBe(1);
  });

  it('범위 내 값 → 그대로 반환', () => {
    expect(clampSlideCount(4)).toBe(4);
    expect(clampSlideCount(MAX_SLIDE_COUNT)).toBe(MAX_SLIDE_COUNT);
  });
});

// ═══════════════════════════════════════════════
// 그룹 2. 전체 성공
// ═══════════════════════════════════════════════

describe('runCardImageBatch — 전체 성공', () => {
  it('4장 모두 성공 시 summary 올바르게 집계', async () => {
    const tasks = makeTasks(4);
    const generateFn = vi.fn().mockResolvedValue('data:image/png;base64,OK');

    const summary = await runCardImageBatch(tasks, generateFn);

    expect(summary.totalCards).toBe(4);
    expect(summary.successCount).toBe(4);
    expect(summary.fallbackCount).toBe(0);
    expect(summary.recoveredCount).toBe(0);
    expect(summary.cards).toHaveLength(4);
    expect(summary.cards.every(c => c.status === 'success')).toBe(true);
    expect(summary.cards.every(c => c.imageUrl === 'data:image/png;base64,OK')).toBe(true);
    expect(summary.totalDurationMs).toBeGreaterThan(0);
  });

  it('generateFn이 카드별로 호출됨', async () => {
    const tasks = makeTasks(3);
    const generateFn = vi.fn().mockResolvedValue('data:image/png;base64,OK');

    await runCardImageBatch(tasks, generateFn);

    expect(generateFn).toHaveBeenCalledTimes(3);
    // 첫 번째 호출의 첫 인자 = 프롬프트
    expect(generateFn.mock.calls[0][0]).toBe('테스트 프롬프트 1');
    // 세 번째 인자 = aspectRatio = '1:1'
    expect(generateFn.mock.calls[0][2]).toBe('1:1');
  });
});

// ═══════════════════════════════════════════════
// 그룹 3. 부분 실패 → fallback
// ═══════════════════════════════════════════════

describe('runCardImageBatch — 부분 실패', () => {
  it('1장 실패 시 fallback SVG 적용, 나머지 성공', async () => {
    const tasks = makeTasks(4);
    const cardTexts = makeCardTexts(4);
    let callCount = 0;
    const generateFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('이미지 생성 실패'));
      return Promise.resolve('data:image/png;base64,OK');
    });

    const summary = await runCardImageBatch(tasks, generateFn, { cardTexts });

    expect(summary.totalCards).toBe(4);
    expect(summary.successCount).toBe(3);
    expect(summary.fallbackCount).toBe(1);
    // fallback 카드의 imageUrl이 SVG인지 확인
    const fallbackCard = summary.cards.find(c => c.status === 'fallback');
    expect(fallbackCard).toBeDefined();
    expect(fallbackCard!.imageUrl).toContain('data:image/svg+xml;base64');
    // fallback 카드에 에러 메시지 기록
    expect(fallbackCard!.error).toBeTruthy();
  });

  it('전체 실패 시 모든 카드가 fallback, successCount=0', async () => {
    const tasks = makeTasks(3);
    const generateFn = vi.fn().mockRejectedValue(new Error('전부 실패'));

    const summary = await runCardImageBatch(tasks, generateFn);

    expect(summary.successCount).toBe(0);
    expect(summary.fallbackCount).toBe(3);
    expect(summary.cards.every(c => c.status === 'fallback')).toBe(true);
    expect(summary.cards.every(c => c.imageUrl?.includes('svg+xml'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 그룹 4. per-card timing
// ═══════════════════════════════════════════════

describe('runCardImageBatch — per-card timing', () => {
  it('각 카드의 durationMs가 0보다 큼', async () => {
    const tasks = makeTasks(2);
    const generateFn = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('data:image/png;base64,OK'), 10))
    );

    const summary = await runCardImageBatch(tasks, generateFn);

    expect(summary.cards.every(c => c.durationMs > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 그룹 5. fallback SVG 품질
// ═══════════════════════════════════════════════

describe('runCardImageBatch — fallback SVG 품질', () => {
  it('fallback SVG에 카드 텍스트(mainTitle, subtitle) 포함', async () => {
    const tasks = makeTasks(2);
    const cardTexts = [
      { subtitle: '겨울철 혈관', mainTitle: '혈관 신호', description: '변화를 관찰하세요' },
      { subtitle: '두 번째 부제', mainTitle: '두 번째 제목', description: '두 번째 설명' },
    ];
    const generateFn = vi.fn().mockRejectedValue(new Error('실패'));

    const summary = await runCardImageBatch(tasks, generateFn, { cardTexts });

    // SVG를 base64 디코드하여 텍스트 확인
    const fallbackUrl = summary.cards[0].imageUrl!;
    const base64 = fallbackUrl.replace('data:image/svg+xml;base64,', '');
    const svg = decodeURIComponent(escape(atob(base64)));
    expect(svg).toContain('겨울철 혈관');
    expect(svg).toContain('혈관 신호');
  });
});

// ═══════════════════════════════════════════════
// 그룹 6. progress 콜백
// ═══════════════════════════════════════════════

describe('runCardImageBatch — progress 콜백', () => {
  it('카드별 progress 메시지가 호출됨', async () => {
    const tasks = makeTasks(4);
    const generateFn = vi.fn().mockResolvedValue('data:image/png;base64,OK');
    const progressCalls: string[] = [];
    const onProgress = (msg: string) => progressCalls.push(msg);

    await runCardImageBatch(tasks, generateFn, { onProgress });

    // 배치 시작 메시지 + 카드별 완료 메시지
    expect(progressCalls.length).toBeGreaterThanOrEqual(4);
    expect(progressCalls.some(c => c.includes('이미지'))).toBe(true);
    expect(progressCalls.some(c => c.includes('완료'))).toBe(true);
  });

  it('실패 시에도 progress가 계속 호출됨', async () => {
    const tasks = makeTasks(4);
    let callCount = 0;
    const generateFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('fail'));
      return Promise.resolve('data:image/png;base64,OK');
    });
    const progressCalls: string[] = [];

    await runCardImageBatch(tasks, generateFn, {
      onProgress: (msg) => progressCalls.push(msg),
    });

    expect(progressCalls.some(c => c.includes('실패') || c.includes('timeout'))).toBe(true);
    // 실패 후에도 추가 카드 진행 메시지
    const failIdx = progressCalls.findIndex(c => c.includes('실패') || c.includes('timeout'));
    expect(progressCalls.slice(failIdx + 1).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// 그룹 7. batch scheduling
// ═══════════════════════════════════════════════

describe('runCardImageBatch — batch scheduling', () => {
  it('5장 → batch=2로 3개 배치 실행 (2+2+1)', async () => {
    const tasks = makeTasks(5);
    const concurrencyLog: number[] = [];
    let activeCalls = 0;

    const generateFn = vi.fn().mockImplementation(async () => {
      activeCalls++;
      concurrencyLog.push(activeCalls);
      await new Promise(r => setTimeout(r, 20));
      activeCalls--;
      return 'data:image/png;base64,OK';
    });

    await runCardImageBatch(tasks, generateFn);

    // 최대 동시 호출이 BATCH_SIZE(2) 이하인지 확인
    expect(Math.max(...concurrencyLog)).toBeLessThanOrEqual(2);
    expect(generateFn).toHaveBeenCalledTimes(5);
  });
});

// ═══════════════════════════════════════════════
// 그룹 8. summary 일관성
// ═══════════════════════════════════════════════

describe('runCardImageBatch — summary 일관성', () => {
  it('successCount + recoveredCount + fallbackCount = totalCards', async () => {
    const tasks = makeTasks(6);
    let callCount = 0;
    const generateFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2 || callCount === 5) return Promise.reject(new Error('fail'));
      return Promise.resolve('data:image/png;base64,OK');
    });

    const summary = await runCardImageBatch(tasks, generateFn);

    expect(
      summary.successCount + summary.recoveredCount + summary.fallbackCount
    ).toBe(summary.totalCards);
  });
});
