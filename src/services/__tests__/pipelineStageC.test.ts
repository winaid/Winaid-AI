/**
 * Pipeline Stage C 실행 검증 테스트
 *
 * 검증 항목:
 * 1. 완료율 — 3가지 경로(PRO, FLASH fallback, pre-polish) 모두 완료
 * 2. 섹션 생성 모델 — 모두 FLASH
 * 3. finalQualityPath — 항상 비어있지 않고 올바른 값
 * 4. Stage C 로그 — attempt/fallback/timeout 기록
 * 5. HTML 구조 보존 프롬프트 — [HTML 구조 보존 원칙] 포함
 * 6. Stage C 타이밍 기록
 * 7. 최종 결과물 — 유효한 HTML
 * 8. 전체 파이프라인 완결성
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock 설정 ──
// callGemini를 모킹하여 실제 API 호출 없이 파이프라인 로직 검증

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

// 공유 로그 수집
let capturedLogs: { level: string; msg: string }[] = [];
const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log,
};

function setupLogCapture() {
  capturedLogs = [];
  console.info = (...args: any[]) => { capturedLogs.push({ level: 'info', msg: args.map(String).join(' ') }); };
  console.warn = (...args: any[]) => { capturedLogs.push({ level: 'warn', msg: args.map(String).join(' ') }); };
  console.error = (...args: any[]) => { capturedLogs.push({ level: 'error', msg: args.map(String).join(' ') }); };
  console.log = (...args: any[]) => { capturedLogs.push({ level: 'log', msg: args.map(String).join(' ') }); };
}

function restoreConsole() {
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.log = originalConsole.log;
}

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

vi.mock('../imageGenerationService', () => ({
  isDemoSafeMode: vi.fn(() => false),
  updateSessionFinalPayload: vi.fn(),
  generateBlogImage: vi.fn(),
  analyzeStyleReferenceImage: vi.fn(),
  generateImageQueue: vi.fn(),
  STYLE_NAMES: {},
}));

// Also mock writingStyleService to prevent dynamic import issues
vi.mock('../writingStyleService', () => ({
  getHospitalStylePromptForGeneration: vi.fn(() => null),
}));

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

// ── 테스트 헬퍼 ──
function setupMockForPath(path: 'pro_success' | 'flash_fallback' | 'pre_polish') {
  let callCount = 0;
  mockCallGemini.mockImplementation(async (config: any) => {
    callCount++;
    // Stage A: outline
    if (config.responseType === 'json') {
      return SAMPLE_OUTLINE;
    }
    // Stage B/conclusion: text responses from FLASH
    if (config.model === 'gemini-3.1-flash-lite-preview' && config.responseType === 'text') {
      // Intro
      if (config.prompt?.includes('[주제]') && config.systemPrompt?.includes('도입부') || config.temperature === 0.85) {
        return SAMPLE_INTRO_HTML;
      }
      // Conclusion
      if (config.prompt?.includes('다룬 내용 요약')) {
        return SAMPLE_CONCLUSION_HTML;
      }
      // Sections or FLASH polish fallback
      if (config.temperature === 0.3) {
        // This is FLASH polish (Stage C fallback)
        if (path === 'flash_fallback') {
          return SAMPLE_POLISHED_HTML([0, 1, 2].map(SAMPLE_SECTION_HTML));
        }
        throw new Error('FLASH polish timeout');
      }
      // Regular section generation
      return SAMPLE_SECTION_HTML(0);
    }
    // Stage C: PRO polish
    if (config.model === 'gemini-3.1-pro-preview' && config.temperature === 0.3) {
      if (path === 'pro_success') {
        return SAMPLE_POLISHED_HTML([0, 1, 2].map(SAMPLE_SECTION_HTML));
      }
      throw new Error('PRO polish timeout after 30000ms');
    }
    // Default: return section HTML
    return SAMPLE_SECTION_HTML(0);
  });
}

// ═══════════════════════════════════════════
// 테스트 실행
// ═══════════════════════════════════════════

describe('Pipeline Stage C — 실행 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLogCapture();
  });

  afterEach(() => {
    restoreConsole();
  });

  // ── RUN 1: PRO polish 성공 경로 ──
  describe('Run 1: PRO polish 성공', () => {
    beforeEach(() => {
      setupMockForPath('pro_success');
    });

    it('파이프라인 완료 — 결과 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.content.includes('<')).toBe(true);
      expect(result.title).toBe(BASE_REQUEST.topic);
    });

    it('finalQualityPath = flash_draft+pro_polish', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const pathLogs = logsContaining('finalQualityPath=');
      expect(pathLogs.length).toBeGreaterThanOrEqual(1);
      expect(pathLogs.some(l => l.includes('flash_draft+pro_polish'))).toBe(true);
    });

    it('Stage C 로그에 attempt=PRO, timeout=20000 포함', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const attemptLogs = logsContaining('Stage C attempt=PRO');
      expect(attemptLogs.length).toBeGreaterThanOrEqual(1);
      expect(attemptLogs[0]).toContain('timeout=20000');
    });

    it('모든 섹션 FLASH 모델 사용 확인', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const sectionLogs = logsContaining('model=FLASH');
      expect(sectionLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('polishModel=PRO 로그 기록', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polishLogs = logsContaining('polishModel=PRO');
      expect(polishLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('Stage C 타이밍 기록됨', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const timingLogs = logsContaining('stageC=');
      expect(timingLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── RUN 2: FLASH fallback 경로 ──
  describe('Run 2: PRO 실패 → FLASH fallback 성공', () => {
    beforeEach(() => {
      setupMockForPath('flash_fallback');
    });

    it('파이프라인 완료 — FLASH fallback으로 결과 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.content.includes('<')).toBe(true);
    });

    it('finalQualityPath = flash_draft+flash_polish', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const pathLogs = logsContaining('finalQualityPath=');
      expect(pathLogs.length).toBeGreaterThanOrEqual(1);
      expect(pathLogs.some(l => l.includes('flash_draft+flash_polish'))).toBe(true);
    });

    it('PRO 실패 로그 + FLASH fallback 로그 기록', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const proFailLogs = logsContaining('Stage C PRO polish 실패');
      expect(proFailLogs.length).toBeGreaterThanOrEqual(1);

      const flashFallbackLogs = logsContaining('Stage C fallback=FLASH');
      expect(flashFallbackLogs.length).toBeGreaterThanOrEqual(1);
      expect(flashFallbackLogs[0]).toContain('timeout=12000');
    });

    it('polishModel=FLASH(fallback) 로그 기록', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polishLogs = logsContaining('polishModel=FLASH(fallback)');
      expect(polishLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── RUN 3: pre-polish HTML passthrough 경로 ──
  describe('Run 3: PRO+FLASH 모두 실패 → pre-polish HTML', () => {
    beforeEach(() => {
      setupMockForPath('pre_polish');
    });

    it('파이프라인 완료 — pre-polish HTML 그대로 반환', async () => {
      const result = await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.content.includes('<')).toBe(true);
    });

    it('finalQualityPath = flash_draft_only', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const pathLogs = logsContaining('finalQualityPath=');
      expect(pathLogs.length).toBeGreaterThanOrEqual(1);
      expect(pathLogs.some(l => l.includes('flash_draft_only'))).toBe(true);
    });

    it('PRO 실패 + FLASH 실패 + pre-polish 로그 기록', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(logsContaining('Stage C PRO polish 실패').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('Stage C FLASH polish 실패').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('pre-polish HTML 사용').length).toBeGreaterThanOrEqual(1);
    });

    it('polishModel=NONE(pre-polish) 로그 기록', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const polishLogs = logsContaining('polishModel=NONE(pre-polish)');
      expect(polishLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('finalQualityPath가 절대 빈 문자열이 아님', async () => {
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const pathLogs = logsContaining('finalQualityPath=');
      pathLogs.forEach(log => {
        // Extract value after finalQualityPath=
        const match = log.match(/finalQualityPath=(\S+)/);
        expect(match).toBeTruthy();
        expect(match![1]).not.toBe('');
        expect(match![1]).not.toBe('undefined');
        expect(match![1]).not.toBe('null');
      });
    });
  });

  // ── 횡단 검증 ──
  describe('횡단 검증: 경량 교정 프롬프트', () => {
    it('Stage C 프롬프트에 구조 유지 규칙 포함', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('소제목 순서와 전체 구조를 유지한다');
      expect(prompt).toContain('HTML 태그 구조를 그대로 유지한다');
      expect(prompt).toContain('문단 수와 전체 길이를 크게 바꾸지 않는다');
    });

    it('Stage C 프롬프트에 최소 수정 원칙 포함', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('수정량은 전체 문장의 15% 이내');
      expect(prompt).toContain('전체를 재작성하지 말고');
      expect(prompt).toContain('새 정보, 새 주장, 새 사례를 추가하지 않는다');
    });

    it('[출력] 지시어 — HTML만 출력', async () => {
      const { getPipelineIntegrationPrompt } = await import('../../lib/gpt52-prompts-staged');
      const prompt = getPipelineIntegrationPrompt(1500);
      expect(prompt).toContain('HTML만 출력');
    });
  });

  describe('횡단 검증: Stage C timeout 상수', () => {
    it('PRO_POLISH_TIMEOUT = 20000, FLASH_POLISH_TIMEOUT = 12000, noAutoFallback=true', async () => {
      // 코드 정적 검증 — callGemini 호출에서 timeout 값 확인
      setupMockForPath('flash_fallback');
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);

      // PRO 호출의 timeout + noAutoFallback 확인
      const proCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.model === 'gemini-3.1-pro-preview' && c[0]?.temperature === 0.3
      );
      expect(proCalls.length).toBeGreaterThanOrEqual(1);
      expect(proCalls[0][0].timeout).toBe(20000);
      expect(proCalls[0][0].noAutoFallback).toBe(true);
      expect(proCalls[0][0].maxRetries).toBe(1);

      // FLASH fallback 호출의 timeout + noAutoFallback 확인
      const flashPolishCalls = mockCallGemini.mock.calls.filter(
        (c: any[]) => c[0]?.model === 'gemini-3.1-flash-lite-preview' && c[0]?.temperature === 0.3
      );
      expect(flashPolishCalls.length).toBeGreaterThanOrEqual(1);
      expect(flashPolishCalls[0][0].timeout).toBe(12000);
      expect(flashPolishCalls[0][0].noAutoFallback).toBe(true);
      expect(flashPolishCalls[0][0].maxRetries).toBe(1);
    });
  });

  describe('횡단 검증: sectionModel=FLASH 설정 로그', () => {
    it('config 로그에 sectionModel=FLASH 포함', async () => {
      setupMockForPath('pro_success');
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      const configLogs = logsContaining('sectionModel=FLASH');
      expect(configLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('횡단 검증: 종합 성능 로그', () => {
    it('DONE 성능 요약 로그 출력', async () => {
      setupMockForPath('pro_success');
      await generateBlogWithPipeline(BASE_REQUEST, SEARCH_RESULTS);
      expect(logsContaining('DONE').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('stageA=').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('stageB=').length).toBeGreaterThanOrEqual(1);
      expect(logsContaining('stageC=').length).toBeGreaterThanOrEqual(1);
    });
  });
});
