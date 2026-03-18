/**
 * Pipeline Stage C 실행 검증 테스트
 *
 * 현재 구현: FLASH 단일 시도 → 실패 시 pre-polish rawHtml 사용
 * (PRO polish는 비용 대비 효과 미미로 제거됨)
 *
 * 검증 항목:
 * 1. 완료율 — 2가지 경로(FLASH polish 성공, pre-polish fallback) 모두 완료
 * 2. 섹션 생성 모델 — 모두 FLASH
 * 3. finalQualityPath — 항상 비어있지 않고 올바른 값
 * 4. Stage C 로그 — attempt/timeout 기록
 * 5. HTML 구조 보존 프롬프트 — 최소 수정 원칙 포함
 * 6. Stage C 타이밍 기록
 * 7. 최종 결과물 — 유효한 HTML
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock 설정 ──

const SAMPLE_OUTLINE = {
  outline: {
    intro: { approach: 'A', scene: '임플란트 수술', bridge: '수술 과정', targetChars: 200 },
    sections: [
      { title: '임플란트란?', role: '개념 소개', forbidden: '', keyInfo: '인공 치근', targetChars: 300 },
      { title: '수술 과정', role: '절차 설명', forbidden: '', keyInfo: '식립-보철', targetChars: 300 },
      { title: '회복 기간', role: '사후 관리', forbidden: '', keyInfo: '3-6개월', targetChars: 300 },
    ],
    conclusion: { direction: '열린 결말', targetChars: 200 },
  },
};

const SAMPLE_INTRO_HTML = '<h1>임플란트 수술 A to Z</h1><p>치아를 상실하셨다면 임플란트가 좋은 대안이 될 수 있습니다. 오늘은 임플란트 수술의 전 과정을 알아보겠습니다.</p>';
const SAMPLE_SECTION_HTML = (i: number) =>
  `<h2>${SAMPLE_OUTLINE.outline.sections[i]?.title || '섹션'}</h2><p>이 섹션에서는 ${SAMPLE_OUTLINE.outline.sections[i]?.keyInfo || '정보'}에 대해 자세히 알아봅니다. 환자분들의 이해를 돕기 위해 단계별로 설명해 드리겠습니다.</p><p>전문 의료진과 상담하시는 것을 권장합니다.</p>`;
const SAMPLE_CONCLUSION_HTML = '<h2>마무리</h2><p>임플란트 수술은 개인마다 차이가 있을 수 있습니다. 전문 의료진과 충분히 상담하시기 바랍니다.</p>';
const SAMPLE_POLISHED_HTML = (sections: string[]) =>
  `<h1>임플란트 수술 A to Z</h1><p>치아를 상실하셨다면 임플란트가 좋은 대안이 될 수 있습니다.</p>\n${sections.join('\n')}\n<h2>마무리</h2><p>전문 의료진과 충분히 상담하시기 바랍니다.</p>`;

// 로그 수집
let capturedLogs: { level: string; msg: string }[] = [];
const originalConsole = { info: console.info, warn: console.warn, error: console.error, log: console.log };

function setupLogCapture() {
  capturedLogs = [];
  console.info = (...args: any[]) => { capturedLogs.push({ level: 'info', msg: args.map(String).join(' ') }); };
  console.warn = (...args: any[]) => { capturedLogs.push({ level: 'warn', msg: args.map(String).join(' ') }); };
  console.error = (...args: any[]) => { capturedLogs.push({ level: 'error', msg: args.map(String).join(' ') }); };
  console.log = (...args: any[]) => { capturedLogs.push({ level: 'log', msg: args.map(String).join(' ') }); };
}
function restoreConsole() { Object.assign(console, originalConsole); }
function logsContaining(pattern: string): string[] {
  return capturedLogs.filter(l => l.msg.includes(pattern)).map(l => l.msg);
}

// ── Mock Modules ──
vi.mock('../geminiClient', () => ({
  GEMINI_MODEL: { PRO: 'gemini-3.1-pro-preview', FLASH: 'gemini-3.1-flash-lite-preview', FLASH_LITE: 'gemini-3.1-flash-lite-preview' },
  TIMEOUTS: { GENERATION: 120000, CONTENT_GENERATION: 120000, IMAGE_GENERATION: 180000, QUICK_OPERATION: 60000 },
  callGemini: vi.fn(),
  callGeminiRaw: vi.fn(),
  getAiProviderSettings: vi.fn(() => ({ provider: 'gemini' })),
}));

vi.mock('../image/imageOrchestrator', () => ({
  isDemoSafeMode: vi.fn(() => false),
  updateSessionFinalPayload: vi.fn(),
  generateBlogImage: vi.fn(),
  generateImageQueue: vi.fn(),
}));

vi.mock('../image/imageEditService', () => ({ analyzeStyleReferenceImage: vi.fn() }));
vi.mock('../image/imagePromptBuilder', () => ({ STYLE_NAMES: {} }));
vi.mock('../writingStyleService', () => ({ getHospitalStylePromptForGeneration: vi.fn(() => null) }));

import { callGemini } from '../geminiClient';
import { generateBlogWithPipeline } from '../geminiService';

const mockCallGemini = vi.mocked(callGemini);

const BASE_REQUEST = {
  topic: '임플란트 수술 과정과 주의사항',
  keywords: '강남 임플란트, 임플란트 비용',
  category: '치과' as any,
  postType: 'blog' as any,
  textLength: 1500,
  imageCount: 1,
  tone: '전문적',
  persona: '치과 전문의',
  audienceMode: 'patient' as any,
  imageStyle: 'photo' as any,
  medicalLawMode: 'strict' as const,
};

const SEARCH_RESULTS = {
  collected_facts: [
    { source: 'test', content: '임플란트는 인공 치근을 식립하는 시술입니다.' },
    { source: 'test', content: '회복 기간은 보통 3~6개월입니다.' },
  ],
};

// ── Mock 헬퍼 ──
function setupMockForPath(path: 'flash_success' | 'pre_polish') {
  mockCallGemini.mockImplementation(async (config: any) => {
    // Stage A: outline (JSON)
    if (config.responseType === 'json') return SAMPLE_OUTLINE;

    // Stage B: text responses from FLASH
    if (config.model === 'gemini-3.1-flash-lite-preview' && config.responseType === 'text') {
      // Intro
      if (config.temperature === 0.85 || config.systemPrompt?.includes('도입부')) return SAMPLE_INTRO_HTML;
      // Conclusion
      if (config.prompt?.includes('다룬 내용 요약')) return SAMPLE_CONCLUSION_HTML;
      // Stage C: FLASH polish (temperature 0.3)
      if (config.temperature === 0.3) {
        if (path === 'flash_success') return SAMPLE_POLISHED_HTML([0, 1, 2].map(SAMPLE_SECTION_HTML));
        throw new Error('FLASH polish timeout');
      }
      // Regular section
      return SAMPLE_SECTION_HTML(0);
    }
    return SAMPLE_SECTION_HTML(0);
  });
}

// ═══════════════════════════════════════════
// 테스트 실행
// ═══════════════════════════════════════════

describe('Pipeline Stage C — 실행 검증', () => {
  beforeEach(() => { vi.clearAllMocks(); setupLogCapture(); });
  afterEach(() => { restoreConsole(); });

  // ── Run 1: FLASH polish 성공 경로 ──
  describe('Run 1: FLASH polish 성공', () => {
    beforeEach(() => { setupMockForPath('flash_success'); });

    it('파이프라인 완료 — 결과 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(result).toBeDefined();
      expect(result.title).toBe(BASE_REQUEST.topic);
    });

    it('polishPromise가 flash_draft+flash_polish 경로를 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBe('flash_draft+flash_polish');
      expect(polish.polishModel).toBe('FLASH');
    });

    it('Stage C 로그에 attempt=FLASH 포함', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      await result.polishPromise;
      const attemptLogs = logsContaining('Stage C attempt=FLASH');
      expect(attemptLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('Stage C 타이밍 기록됨', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      await result.polishPromise;
      const timingLogs = logsContaining('stageC=');
      expect(timingLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('FLASH polish 호출에 noAutoFallback=true, maxRetries=1', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      await result.polishPromise;
      const flashPolishCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.temperature === 0.3 && c[0]?.noAutoFallback === true,
      );
      expect(flashPolishCalls.length).toBeGreaterThanOrEqual(1);
      expect(flashPolishCalls[0][0].maxRetries).toBe(1);
    });
  });

  // ── Run 2: FLASH 실패 → pre-polish HTML ──
  describe('Run 2: FLASH 실패 → pre-polish HTML', () => {
    beforeEach(() => { setupMockForPath('pre_polish'); });

    it('파이프라인 완료 — pre-polish HTML 그대로 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(result).toBeDefined();
      expect(result.rawHtml).toBeTruthy();
      expect(result.rawHtml.includes('<')).toBe(true);
    });

    it('polishPromise가 flash_draft_only 경로를 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBe('flash_draft_only');
      expect(polish.polishModel).toBe('NONE(pre-polish)');
    });

    it('FLASH 실패 + pre-polish 로그 기록', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      await result.polishPromise;
      expect(logsContaining('Stage C FLASH polish 실패').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('pre-polish HTML 사용').length).toBeGreaterThanOrEqual(1);
    });

    it('finalQualityPath가 절대 빈 문자열이 아님', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBeTruthy();
      expect(polish.finalQualityPath).not.toBe('');
      expect(polish.finalQualityPath).not.toBe('undefined');
    });
  });

  // ── 횡단 검증 ──
  describe('횡단 검증: 경량 교정 프롬프트', () => {
    it('Stage C 프롬프트에 구조 유지 규칙 포함', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('소제목 순서와 전체 구조를 유지한다');
      expect(prompt).toContain('HTML 태그 구조를 그대로 유지한다');
    });

    it('Stage C 프롬프트에 최소 수정 원칙 포함', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('수정량은 전체 문장의 15% 이내');
      expect(prompt).toContain('전체를 재작성하지 말고');
    });

    it('[출력] 지시어 — HTML만 출력', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('HTML만 출력');
    });
  });

  describe('횡단 검증: sectionModel=FLASH', () => {
    it('config 로그에 sectionModel=FLASH 포함', async () => {
      setupMockForPath('flash_success');
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(logsContaining('sectionModel=FLASH').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('횡단 검증: 종합 성능 로그', () => {
    it('DONE 성능 요약 로그 출력', async () => {
      setupMockForPath('flash_success');
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      await result.polishPromise;
      expect(logsContaining('DONE').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('stageA=').length).toBeGreaterThanOrEqual(1);
    });
  });
});
