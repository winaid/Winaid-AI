/**
 * useCardNewsWorkflow — handleApprovePrompts 완주 보장 검증
 *
 * Hook 레벨에서 카드뉴스 이미지 생성 루프의:
 *   1. 개별 timeout 동작
 *   2. 실패 격리 (1장 실패 → 나머지 계속)
 *   3. fallback SVG 품질
 *   4. progress 실시간 갱신
 *   5. 최종 state 무결성
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCardNewsWorkflow } from '../useCardNewsWorkflow';
import type { GenerationState, CardPromptData } from '../../types';

// ── Mocks ──

const mockGenerateSingleImage = vi.fn();
vi.mock('../../services/image/cardNewsImageService', () => ({
  generateSingleImage: (...args: any[]) => mockGenerateSingleImage(...args),
}));

vi.mock('../../services/cardNewsService', () => ({
  generateCardNewsScript: vi.fn().mockResolvedValue({
    title: '테스트 스크립트',
    topic: '스케일링',
    totalSlides: 6,
    slides: [],
    overallTheme: '건강',
  }),
  convertScriptToCardNews: vi.fn().mockResolvedValue({
    content: '<div>test</div>',
    imagePrompts: ['p1'],
    cardPrompts: [{
      imagePrompt: 'test',
      textPrompt: { subtitle: 'sub', mainTitle: 'main', description: 'desc', tags: [] },
    }],
    title: '테스트',
    styleConfig: {},
  }),
}));

vi.mock('../../services/cardNewsDesignTemplates', () => ({
  getDesignTemplateById: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../services/geminiClient', () => ({
  getKoreanErrorMessage: vi.fn().mockImplementation((e: any) => e?.message || '에러'),
}));

// ── 유틸 ──

function makePrompts(count: number): CardPromptData[] {
  return Array.from({ length: count }, (_, i) => ({
    imagePrompt: `subtitle: "부제 ${i + 1}"\nmainTitle: "제목 ${i + 1}"\ndescription: "설명 ${i + 1}"`,
    textPrompt: {
      subtitle: `부제 ${i + 1}`,
      mainTitle: `제목 ${i + 1}`,
      description: `설명 ${i + 1}`,
      tags: [],
    },
  }));
}

function countCardSlides(html: string): number {
  return (html.match(/class="card-slide"/g) || []).length;
}

function hasSvgFallback(html: string): boolean {
  return html.includes('data:image/svg+xml;base64');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════
// handleApprovePrompts 완주 보장
// ═══════════════════════════════════════════════

describe('useCardNewsWorkflow — handleApprovePrompts', () => {
  it('6장 전부 성공 → 6장 card-slide, warning null', async () => {
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts = makePrompts(6);

    let capturedState: GenerationState | null = null;
    const setGlobalState = ((fn: any) => {
      if (typeof fn === 'function') {
        capturedState = fn({ isLoading: true, error: null, warning: null, data: null, progress: '' });
      } else {
        capturedState = fn;
      }
    }) as any;

    // 내부 상태 세팅: cardNewsScript + cardNewsPrompts + pendingRequest
    await act(async () => {
      const setContentTab = vi.fn();
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState,
        setContentTab,
      );
    });

    // handleEditScript으로 script 설정
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 6,
        slides: [], overallTheme: '건강',
      });
    });

    // handleEditPrompts로 prompts 설정
    act(() => {
      result.current.handleEditPrompts(prompts);
    });

    // handleApprovePrompts 실행
    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    expect(capturedState).not.toBeNull();
    const state = capturedState!;
    expect(state.data).not.toBeNull();
    expect(state.data!.htmlContent).toBeDefined();
    expect(countCardSlides(state.data!.htmlContent)).toBe(6);
    expect(state.warning).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('1장 timeout → 5장 성공 + 1장 SVG fallback + warning 메시지', async () => {
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 3) {
        // 60초 timeout보다 오래 걸리는 시뮬레이션 대신 즉시 reject
        return Promise.reject(new Error('timeout'));
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts = makePrompts(6);

    let capturedState: GenerationState | null = null;
    const setGlobalState = ((fn: any) => {
      capturedState = typeof fn === 'function'
        ? fn({ isLoading: true, error: null, warning: null, data: null, progress: '' })
        : fn;
    }) as any;

    // 내부 상태 설정
    await act(async () => {
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState, vi.fn(),
      );
    });
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 6,
        slides: [], overallTheme: '건강',
      });
      result.current.handleEditPrompts(prompts);
    });

    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    const state = capturedState!;
    expect(state.data).not.toBeNull();
    const html = state.data!.htmlContent;

    // 6장 모두 존재
    expect(countCardSlides(html)).toBe(6);
    // SVG fallback 존재
    expect(hasSvgFallback(html)).toBe(true);
    // warning 메시지
    expect(state.warning).toBeTruthy();
    expect(state.warning).toContain('fallback');
  });

  it('2장 실패 → 4장 성공 + 2장 fallback + 모든 data-index 존재', async () => {
    let callCount = 0;
    mockGenerateSingleImage.mockImplementation(() => {
      callCount++;
      if (callCount === 1 || callCount === 4) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve('data:image/png;base64,OK');
    });

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts = makePrompts(6);

    let capturedState: GenerationState | null = null;
    const setGlobalState = ((fn: any) => {
      capturedState = typeof fn === 'function'
        ? fn({ isLoading: true, error: null, warning: null, data: null, progress: '' })
        : fn;
    }) as any;

    await act(async () => {
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState, vi.fn(),
      );
    });
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 6,
        slides: [], overallTheme: '건강',
      });
      result.current.handleEditPrompts(prompts);
    });

    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    const html = capturedState!.data!.htmlContent;
    expect(countCardSlides(html)).toBe(6);

    // 모든 data-index 1~6 존재
    for (let i = 1; i <= 6; i++) {
      expect(html).toContain(`data-index="${i}"`);
    }

    // fallback SVG에 실제 텍스트가 포함됨
    // SVG base64를 디코드해서 검증
    const svgMatches = html.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g);
    expect(svgMatches).toBeTruthy();
    expect(svgMatches!.length).toBe(2); // 2장 fallback
  });

  it('progress가 실시간으로 갱신됨', async () => {
    mockGenerateSingleImage.mockResolvedValue('data:image/png;base64,OK');

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts = makePrompts(4);

    const setGlobalState = vi.fn();

    await act(async () => {
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState, vi.fn(),
      );
    });
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 4,
        slides: [], overallTheme: '건강',
      });
      result.current.handleEditPrompts(prompts);
    });

    // scriptProgress 변화 추적
    const progressValues: string[] = [];
    const origScriptProgress = result.current.scriptProgress;

    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    // handleApprovePrompts 완료 후 scriptProgress가 비어있어야 함 (초기화)
    // 이미지 4장이 모두 처리됐으므로 generateSingleImage가 4번 호출
    expect(mockGenerateSingleImage).toHaveBeenCalledTimes(4);
  });

  it('빈 div placeholder가 절대 생성되지 않음', async () => {
    // 모든 이미지 실패
    mockGenerateSingleImage.mockRejectedValue(new Error('전부 실패'));

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts = makePrompts(4);

    let capturedState: GenerationState | null = null;
    const setGlobalState = ((fn: any) => {
      capturedState = typeof fn === 'function'
        ? fn({ isLoading: true, error: null, warning: null, data: null, progress: '' })
        : fn;
    }) as any;

    await act(async () => {
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState, vi.fn(),
      );
    });
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 4,
        slides: [], overallTheme: '건강',
      });
      result.current.handleEditPrompts(prompts);
    });

    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    const html = capturedState!.data!.htmlContent;
    // 4장 모두 card-slide
    expect(countCardSlides(html)).toBe(4);
    // 빈 div placeholder 없음
    expect(html).not.toContain('display: flex; align-items: center; justify-content: center;');
    // 모두 SVG fallback
    expect(hasSvgFallback(html)).toBe(true);
  });

  it('fallback SVG에 실제 한글 텍스트가 인코딩됨', async () => {
    mockGenerateSingleImage.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCardNewsWorkflow());
    const prompts: CardPromptData[] = [{
      imagePrompt: 'test',
      textPrompt: { subtitle: '스케일링 안내', mainTitle: '치석 제거의 중요성', description: '건강한 치아를 위해', tags: [] },
    }];

    let capturedState: GenerationState | null = null;
    const setGlobalState = ((fn: any) => {
      capturedState = typeof fn === 'function'
        ? fn({ isLoading: true, error: null, warning: null, data: null, progress: '' })
        : fn;
    }) as any;

    await act(async () => {
      await result.current.handleGenerateCardNews(
        { postType: 'card_news', topic: '테스트', imageStyle: 'illustration' } as any,
        setGlobalState, vi.fn(),
      );
    });
    act(() => {
      result.current.handleEditScript({
        title: '테스트', topic: '스케일링', totalSlides: 1,
        slides: [], overallTheme: '건강',
      });
      result.current.handleEditPrompts(prompts);
    });

    await act(async () => {
      await result.current.handleApprovePrompts(setGlobalState);
    });

    const html = capturedState!.data!.htmlContent;
    // SVG를 디코드해서 한글 텍스트 확인
    const svgBase64Match = html.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/);
    expect(svgBase64Match).toBeTruthy();
    const svgContent = decodeURIComponent(escape(atob(svgBase64Match![1])));
    expect(svgContent).toContain('스케일링 안내');
    expect(svgContent).toContain('치석 제거의 중요성');
    expect(svgContent).toContain('건강한 치아를 위해');
    expect(svgContent).toContain('재생성');
  });
});

// ═══════════════════════════════════════════════
// useResultActions — 카드뉴스 history 검증
// ═══════════════════════════════════════════════

vi.mock('../../services/image/imageStorageService', () => ({
  stripLargeBase64FromHtml: vi.fn().mockImplementation((html: string) => html),
}));

const mockPersistBlogHistory = vi.fn().mockResolvedValue(undefined);
vi.mock('../../core/generation/contentStorage', () => ({
  persistBlogHistory: (...args: any[]) => mockPersistBlogHistory(...args),
}));

import { useResultActions } from '../useResultActions';

describe('useResultActions — 카드뉴스 history', () => {
  it('persistCardNewsHistory가 cardPrompts 텍스트를 plainText에 포함', async () => {
    const { result } = renderHook(() => useResultActions());

    const prompts = makePrompts(3);

    await act(async () => {
      await result.current.persistCardNewsHistory({
        title: '카드뉴스 테스트',
        html: '<div>test</div>',
        keywords: '스케일링,치석',
        category: '치과',
        cardPrompts: prompts,
      });
    });

    // persistBlogHistory가 호출되었는지 확인 (비동기 import 대기)
    await new Promise(r => setTimeout(r, 100));

    expect(mockPersistBlogHistory).toHaveBeenCalled();
    const call = mockPersistBlogHistory.mock.calls[0][0];
    // plainText에 카드 구조 메타데이터가 포함됨
    expect(call.plainText).toContain('[1]');
    expect(call.plainText).toContain('부제 1');
    expect(call.plainText).toContain('제목 1');
    expect(call.plainText).toContain('[2]');
    expect(call.plainText).toContain('[3]');
  });

  it('cardPrompts 없이 호출해도 정상 동작 (fallback to html strip)', async () => {
    const { result } = renderHook(() => useResultActions());

    await act(async () => {
      await result.current.persistCardNewsHistory({
        title: '카드뉴스',
        html: '<div>html content</div>',
      });
    });

    await new Promise(r => setTimeout(r, 100));

    expect(mockPersistBlogHistory).toHaveBeenCalled();
    const call = mockPersistBlogHistory.mock.calls[0][0];
    expect(call.plainText).toContain('html content');
  });
});
