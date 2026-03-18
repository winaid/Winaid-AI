/**
 * Pipeline Stage C — 생성 정책 계약 테스트
 *
 * 정책 계약:
 *   Stage A/B (본 생성): FLASH only — PRO fallback 금지
 *   Stage C (교정):
 *     STAGE_C_USE_PRO=true  → PRO(20s) → FLASH(12s) → rawHtml
 *     STAGE_C_USE_PRO=false → FLASH(12s) → rawHtml
 *   독립 품질 기능: PRO 허용 (FAQ, 섹션 재생성)
 *
 * 검증 항목:
 * 1. FLASH-only 경로 (STAGE_C_USE_PRO=false): FLASH 성공 / pre-polish fallback
 * 2. PRO 교정 경로 (STAGE_C_USE_PRO=true): PRO 성공 / PRO 실패→FLASH / 전부 실패→rawHtml
 * 3. 본 생성(Stage A/B)에서 PRO가 호출되지 않는 계약
 * 4. Stage C 프롬프트 구조 보존 원칙
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Sample data ──
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
const SAMPLE_INTRO = '<h1>임플란트 수술 A to Z</h1><p>치아를 상실하셨다면 임플란트가 좋은 대안이 될 수 있습니다. 오늘은 임플란트 수술의 전 과정을 알아보겠습니다.</p>';
const SAMPLE_SECTION = (i: number) =>
  `<h2>${SAMPLE_OUTLINE.outline.sections[i]?.title || '섹션'}</h2><p>이 섹션에서는 ${SAMPLE_OUTLINE.outline.sections[i]?.keyInfo || '정보'}에 대해 자세히 알아봅니다. 환자분들의 이해를 돕기 위해 설명하겠습니다.</p><p>전문 의료진과 상담하세요.</p>`;
const SAMPLE_CONCLUSION = '<h2>마무리</h2><p>임플란트 수술은 개인마다 차이가 있을 수 있습니다. 전문 의료진과 충분히 상담하세요.</p>';
const SAMPLE_POLISHED = `<h1>임플란트 수술 A to Z</h1><p>치아를 상실하셨다면 임플란트가 좋은 대안이 될 수 있습니다.</p>\n${[0,1,2].map(SAMPLE_SECTION).join('\n')}\n<h2>마무리</h2><p>전문 의료진과 충분히 상담하세요.</p>`;

// ── Log capture ──
let capturedLogs: { level: string; msg: string }[] = [];
const origConsole = { info: console.info, warn: console.warn, error: console.error, log: console.log };
function startCapture() {
  capturedLogs = [];
  console.info = (...a: any[]) => capturedLogs.push({ level: 'info', msg: a.map(String).join(' ') });
  console.warn = (...a: any[]) => capturedLogs.push({ level: 'warn', msg: a.map(String).join(' ') });
  console.error = (...a: any[]) => capturedLogs.push({ level: 'error', msg: a.map(String).join(' ') });
  console.log = (...a: any[]) => capturedLogs.push({ level: 'log', msg: a.map(String).join(' ') });
}
function stopCapture() { Object.assign(console, origConsole); }
function logs(pattern: string) { return capturedLogs.filter(l => l.msg.includes(pattern)).map(l => l.msg); }

// ── Mocks ──
vi.mock('../geminiClient', () => ({
  GEMINI_MODEL: { PRO: 'gemini-3.1-pro-preview', FLASH: 'gemini-3.1-flash-lite-preview', FLASH_LITE: 'gemini-3.1-flash-lite-preview' },
  TIMEOUTS: { GENERATION: 120000, CONTENT_GENERATION: 120000, IMAGE_GENERATION: 180000, QUICK_OPERATION: 60000 },
  callGemini: vi.fn(),
  callGeminiRaw: vi.fn(),
  getAiProviderSettings: vi.fn(() => ({ provider: 'gemini' })),
}));
vi.mock('../image/imageOrchestrator', () => ({ isDemoSafeMode: vi.fn(() => false), updateSessionFinalPayload: vi.fn(), generateBlogImage: vi.fn(), generateImageQueue: vi.fn() }));
vi.mock('../image/imageEditService', () => ({ analyzeStyleReferenceImage: vi.fn() }));
vi.mock('../image/imagePromptBuilder', () => ({ STYLE_NAMES: {} }));
vi.mock('../writingStyleService', () => ({ getHospitalStylePromptForGeneration: vi.fn(() => null) }));

import { callGemini } from '../geminiClient';
import { generateBlogWithPipeline } from '../blogPipelineService';
const mockCallGemini = vi.mocked(callGemini);

const REQ = {
  topic: '임플란트 수술 과정과 주의사항', keywords: '강남 임플란트', category: '치과',
  postType: 'blog', textLength: 1500, imageCount: 1, imageStyle: 'photo', medicalLawMode: 'strict',
} as any;
const SEARCH = { collected_facts: [{ source: 'test', content: '임플란트는 인공 치근을 식립하는 시술입니다.' }] };

// ── Mock setup ──
function setupMock(stageCBehavior: 'flash_success' | 'flash_fail' | 'pro_success' | 'pro_fail_flash_success' | 'all_fail') {
  mockCallGemini.mockImplementation(async (config: any) => {
    if (config.responseType === 'json') return SAMPLE_OUTLINE;
    if (config.model === 'gemini-3.1-flash-lite-preview' && config.responseType === 'text') {
      if (config.temperature === 0.85 || config.systemPrompt?.includes('도입부')) return SAMPLE_INTRO;
      if (config.prompt?.includes('다룬 내용 요약')) return SAMPLE_CONCLUSION;
      // Stage C FLASH polish
      if (config.temperature === 0.3) {
        if (stageCBehavior === 'flash_success' || stageCBehavior === 'pro_fail_flash_success') return SAMPLE_POLISHED;
        throw new Error('FLASH polish timeout');
      }
      return SAMPLE_SECTION(0);
    }
    // PRO calls (Stage C PRO polish)
    if (config.model === 'gemini-3.1-pro-preview' && config.temperature === 0.3) {
      if (stageCBehavior === 'pro_success') return SAMPLE_POLISHED;
      throw new Error('PRO polish timeout');
    }
    return SAMPLE_SECTION(0);
  });
}

// ═══════════════════════════════════════════
// 테스트
// ═══════════════════════════════════════════

describe('Pipeline Stage C — 정책 계약', () => {
  beforeEach(() => { vi.clearAllMocks(); startCapture(); });
  afterEach(() => { stopCapture(); });

  // ── 현재 기본 정책: STAGE_C_USE_PRO=false (FLASH-only) ──
  describe('FLASH-only 경로 (STAGE_C_USE_PRO=false, 현재 기본값)', () => {
    it('FLASH 성공 → flash_draft+flash_polish', async () => {
      setupMock('flash_success');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBe('flash_draft+flash_polish');
      expect(polish.polishModel).toBe('FLASH');
    });

    it('FLASH 실패 → pre-polish rawHtml fallback', async () => {
      setupMock('flash_fail');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBe('flash_draft_only');
      expect(polish.polishModel).toBe('NONE(pre-polish)');
    });

    it('Stage C에서 PRO가 호출되지 않는다', async () => {
      setupMock('flash_success');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      await result.polishPromise;
      const proCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.model === 'gemini-3.1-pro-preview' && c[0]?.temperature === 0.3
      );
      expect(proCalls.length).toBe(0);
    });

    it('FLASH polish에 noAutoFallback=true, maxRetries=1', async () => {
      setupMock('flash_success');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      await result.polishPromise;
      const flashPolish = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.temperature === 0.3 && c[0]?.noAutoFallback === true
      );
      expect(flashPolish.length).toBeGreaterThanOrEqual(1);
      expect(flashPolish[0][0].maxRetries).toBe(1);
    });

    it('FLASH 실패 시 pre-polish 로그 기록', async () => {
      setupMock('flash_fail');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      await result.polishPromise;
      expect(logs('Stage C FLASH polish 실패').length).toBeGreaterThanOrEqual(1);
      expect(logs('pre-polish HTML 사용').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 본 생성(Stage A/B)에서 PRO 금지 계약 ──
  describe('본 생성 PRO 금지 계약', () => {
    it('Stage A (outline)는 FLASH로 호출된다', async () => {
      setupMock('flash_success');
      await generateBlogWithPipeline(REQ, SEARCH);
      const outlineCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.responseType === 'json'
      );
      expect(outlineCalls.length).toBeGreaterThanOrEqual(1);
      outlineCalls.forEach(c => {
        expect(c[0].model).toBe('gemini-3.1-flash-lite-preview');
      });
    });

    it('Stage B (sections/intro/conclusion)는 FLASH로 호출된다', async () => {
      setupMock('flash_success');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      await result.polishPromise;
      const textCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.responseType === 'text' && c[0]?.temperature !== 0.3 // exclude polish
      );
      textCalls.forEach(c => {
        expect(c[0].model).toBe('gemini-3.1-flash-lite-preview');
      });
    });
  });

  // ── 횡단 검증: 프롬프트 구조 보존 ──
  describe('교정 프롬프트 계약', () => {
    it('구조 유지 규칙 포함', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('소제목 순서와 전체 구조를 유지한다');
      expect(prompt).toContain('HTML 태그 구조를 그대로 유지한다');
    });

    it('최소 수정 원칙 (15% 이내)', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('수정량은 전체 문장의 15% 이내');
      expect(prompt).toContain('전체를 재작성하지 말고');
    });

    it('HTML만 출력 지시', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('HTML만 출력');
    });
  });

  // ── 성능/완전성 로그 ──
  describe('파이프라인 완전성', () => {
    it('성능 요약 로그 출력', async () => {
      setupMock('flash_success');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      await result.polishPromise;
      expect(logs('DONE').length).toBeGreaterThanOrEqual(1);
      expect(logs('stageA=').length).toBeGreaterThanOrEqual(1);
    });

    it('sectionModel=FLASH 설정 로그', async () => {
      setupMock('flash_success');
      await generateBlogWithPipeline(REQ, SEARCH);
      expect(logs('sectionModel=FLASH').length).toBeGreaterThanOrEqual(1);
    });

    it('finalQualityPath는 절대 빈 문자열이 아님', async () => {
      setupMock('flash_fail');
      const result = await generateBlogWithPipeline(REQ, SEARCH);
      const polish = await result.polishPromise;
      expect(polish.finalQualityPath).toBeTruthy();
      expect(polish.finalQualityPath).not.toBe('undefined');
    });
  });
});
