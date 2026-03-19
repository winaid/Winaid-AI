/**
 * P2 QA: progress UX gate 로직 검증
 *
 * resolveGatedStage / stripGateSignal / humanizeProgress를
 * 직접 테스트하여 블로그 생성 중 화면 안정성을 검증한다.
 *
 * useContentGeneration.ts에서 gate 관련 함수를 추출하여 재현.
 * (원본은 모듈 내부 함수이므로 동일 로직을 여기서 실행)
 */
import { describe, it, expect, beforeEach } from 'vitest';

type DisplayStage = 0 | 1 | 2 | 3 | 4;

function extractGateSignal(progress: string): string | null {
  const m = progress.match(/__STAGE:([A-Z_]+)__/);
  return m ? m[1] : null;
}

function stripGateSignal(progress: string): string {
  return progress.replace(/__STAGE:[A-Z_]+__\s*/g, '').trim();
}

// 이미지 단계 순환 문구
const IMAGE_STEP_MESSAGES = [
  '장면을 하나씩 정리하고 있어요',
  '내용과 잘 맞는 장면을 살펴보고 있어요',
  '화면이 심심하지 않도록 이미지를 준비하고 있어요',
  '글과 어울리는 비주얼을 고르고 있어요',
  '거의 다 왔어요, 마지막 이미지를 고르고 있어요',
];
let _imgStepIdx = 0;

/**
 * 화이트리스트 방식 humanizeProgress 재현 (원본과 동일 로직)
 * 블로그: 기본 suppress, 허용 패턴만 통과
 * 카드뉴스/보도자료: 기술 태그만 제거, 나머지 통과
 */
function humanizeProgress(msg: string, postType?: string): string {
  if (!msg) return msg;

  const cleaned = msg
    .replace(/\s*\((hero|sub)\)/gi, '')
    .replace(/\s*\[wave[- ]?\d+\]/gi, '')
    .replace(/tier=\w+/gi, '')
    .replace(/nb2|pro-rescue|pro-quality/gi, '')
    .trim();

  // 카드뉴스 / 보도자료
  if (postType === 'card_news' || postType === 'press_release') {
    if (cleaned.includes('보조 비주얼')) return '';
    if (cleaned.includes('AI 냄새')) return '';
    return cleaned;
  }

  // 블로그: 화이트리스트
  if (/이미지/.test(cleaned) && (/\d+\/\d+장/.test(cleaned) || /생성\s*(시작|중)/.test(cleaned))) {
    const step = IMAGE_STEP_MESSAGES[_imgStepIdx % IMAGE_STEP_MESSAGES.length];
    _imgStepIdx++;
    return step;
  }
  if (/이미지/.test(cleaned) && /(완료|준비 완료)/.test(cleaned)) {
    const step = IMAGE_STEP_MESSAGES[_imgStepIdx % IMAGE_STEP_MESSAGES.length];
    _imgStepIdx++;
    return step;
  }
  if (cleaned.includes('재시도') && !cleaned.includes('실패') && !cleaned.includes('보조 비주얼')) return '조금 더 다듬고 있어요';
  if (cleaned.includes('모든 생성 작업 완료')) return '마지막 손질을 하고 있어요';

  return '';
}

function resolveGatedStage(
  currentStage: DisplayStage,
  gateSignal: string | null,
  textReady: boolean,
  rawProgress: string,
): DisplayStage {
  if (gateSignal === 'SAVING') return Math.max(currentStage, 4) as DisplayStage;
  if (gateSignal === 'IMAGE_START' && textReady) return Math.max(currentStage, 3) as DisplayStage;
  if (gateSignal === 'TEXT_READY') return Math.max(currentStage, 2) as DisplayStage;

  const p = rawProgress.toLowerCase();
  if (p.includes('모든 생성 작업 완료')) return Math.max(currentStage, 4) as DisplayStage;
  if (textReady && (p.includes('이미지') || p.includes('대표 이미지') || p.includes('대체 렌더'))) {
    return Math.max(currentStage, 3) as DisplayStage;
  }
  if (p.includes('폴리싱') || p.includes('faq') || p.includes('seo 점수')
    || p.includes('검사') || p.includes('파이프라인 생성 완료')) {
    return Math.max(currentStage, 2) as DisplayStage;
  }
  if (p.includes('파이프라인') || p.includes('검색') || p.includes('소제목')
    || p.includes('섹션') || p.includes('도입부') || p.includes('기존 방식')) {
    return Math.max(currentStage, 1) as DisplayStage;
  }
  return currentStage;
}

// ── P2-1: gate 신호 추출 ──
describe('P2 gate 신호 추출', () => {
  it('TEXT_READY 추출', () => {
    expect(extractGateSignal('__STAGE:TEXT_READY__ ✅ 텍스트 생성 완료')).toBe('TEXT_READY');
  });

  it('IMAGE_START 추출', () => {
    expect(extractGateSignal('__STAGE:IMAGE_START__ 🎨 이미지 생성 중')).toBe('IMAGE_START');
  });

  it('SAVING 추출', () => {
    expect(extractGateSignal('__STAGE:SAVING__ ✅ 모든 생성 작업 완료!')).toBe('SAVING');
  });

  it('gate 신호 없으면 null', () => {
    expect(extractGateSignal('🔍 키워드 분석 중...')).toBeNull();
  });
});

// ── P2-2: gate 신호 strip ──
describe('P2 gate 신호 strip', () => {
  it('__STAGE:TEXT_READY__ 제거', () => {
    expect(stripGateSignal('__STAGE:TEXT_READY__ ✅ 텍스트 생성 완료')).toBe('✅ 텍스트 생성 완료');
  });

  it('일반 메시지는 그대로', () => {
    expect(stripGateSignal('🔍 키워드 분석 중...')).toBe('🔍 키워드 분석 중...');
  });
});

// ── P2-3: 이미지 조기 진입 차단 ──
describe('P2 이미지 조기 진입 차단', () => {
  it('textReady=false일 때 IMAGE_START가 와도 stage 3 차단', () => {
    const stage = resolveGatedStage(1, 'IMAGE_START', false, '');
    expect(stage).toBe(1); // stage 3이 아닌 현재 stage 유지
  });

  it('textReady=true일 때 IMAGE_START → stage 3', () => {
    const stage = resolveGatedStage(2, 'IMAGE_START', true, '');
    expect(stage).toBe(3);
  });

  it('textReady=false일 때 "이미지" 키워드가 와도 stage 3 차단', () => {
    const stage = resolveGatedStage(1, null, false, '🎨 이미지 3장 생성 시작...');
    expect(stage).toBe(1);
  });

  it('textReady=true일 때 "이미지" 키워드 → stage 3', () => {
    const stage = resolveGatedStage(2, null, true, '🎨 이미지 3장 생성 시작...');
    expect(stage).toBe(3);
  });
});

// ── P2-4: monotonic 역행 방지 ──
describe('P2 monotonic 역행 방지', () => {
  it('stage 3에서 writing 키워드가 와도 stage 1로 역행 안 함', () => {
    const stage = resolveGatedStage(3, null, true, '소제목 작성 중');
    expect(stage).toBe(3);
  });

  it('stage 4에서 이미지 키워드가 와도 stage 3으로 역행 안 함', () => {
    const stage = resolveGatedStage(4, null, true, '이미지 생성 중');
    expect(stage).toBe(4);
  });

  it('TEXT_READY가 와도 이미 stage 3이면 역행 안 함', () => {
    const stage = resolveGatedStage(3, 'TEXT_READY', true, '');
    expect(stage).toBe(3);
  });
});

// ── P2-5: 전체 시나리오 시뮬레이션 ──
describe('P2 블로그 생성 전체 시나리오', () => {
  it('정상 흐름: 0 → 1 → 2 → 3 → 4', () => {
    let stage: DisplayStage = 0;
    let textReady = false;

    // 글 작성 시작
    stage = resolveGatedStage(stage, null, textReady, '소제목 구조 분석');
    expect(stage).toBe(1);

    // 도입부 작성
    stage = resolveGatedStage(stage, null, textReady, '도입부 생성');
    expect(stage).toBe(1);

    // 글 검토
    stage = resolveGatedStage(stage, null, textReady, '폴리싱 진행 중');
    expect(stage).toBe(2);

    // TEXT_READY
    stage = resolveGatedStage(stage, 'TEXT_READY', textReady, '');
    textReady = true;
    expect(stage).toBe(2);

    // IMAGE_START
    stage = resolveGatedStage(stage, 'IMAGE_START', textReady, '');
    expect(stage).toBe(3);

    // 이미지 진행
    stage = resolveGatedStage(stage, null, textReady, '이미지 3/5장 완료');
    expect(stage).toBe(3);

    // SAVING
    stage = resolveGatedStage(stage, 'SAVING', textReady, '');
    expect(stage).toBe(4);
  });

  it('비정상 흐름: 이미지가 먼저 와도 gate가 차단', () => {
    let stage: DisplayStage = 0;
    let textReady = false;

    // 글 작성 시작
    stage = resolveGatedStage(stage, null, textReady, '소제목 분석');
    expect(stage).toBe(1);

    // 이미지 관련 메시지가 먼저 옴 (내부 병렬 처리)
    stage = resolveGatedStage(stage, null, textReady, '이미지 1/5장 생성 중');
    expect(stage).toBe(1); // 차단: textReady=false

    // IMAGE_START 신호가 와도 차단
    stage = resolveGatedStage(stage, 'IMAGE_START', textReady, '');
    expect(stage).toBe(1); // 차단: textReady=false

    // TEXT_READY 도착
    stage = resolveGatedStage(stage, 'TEXT_READY', textReady, '');
    textReady = true;
    expect(stage).toBe(2);

    // 이제야 이미지 stage 진입 허용
    stage = resolveGatedStage(stage, null, textReady, '이미지 2/5장 생성 중');
    expect(stage).toBe(3);
  });
});

// ── P2-6: humanizeProgress 블로그 화이트리스트 ──
describe('P2 humanizeProgress 블로그 화이트리스트', () => {
  beforeEach(() => { _imgStepIdx = 0; });

  // ── 6a. 블로그: 모든 내부 용어 suppress ──
  it('"Stage A 파이프라인" → 빈 문자열', () => {
    expect(humanizeProgress('Stage A 파이프라인 시작', 'blog')).toBe('');
  });

  it('"폴리싱 진행 중" → 빈 문자열', () => {
    expect(humanizeProgress('폴리싱 진행 중', 'blog')).toBe('');
  });

  it('"소제목 2/5 작성" → 빈 문자열', () => {
    expect(humanizeProgress('소제목 2/5 작성 중', 'blog')).toBe('');
  });

  it('"도입부 작성 중" → 빈 문자열', () => {
    expect(humanizeProgress('도입부 작성 중', 'blog')).toBe('');
  });

  it('"도입부 완료" → 빈 문자열', () => {
    expect(humanizeProgress('✅ 도입부 완료', 'blog')).toBe('');
  });

  it('"섹션 3 생성" → 빈 문자열', () => {
    expect(humanizeProgress('섹션 3 생성 중', 'blog')).toBe('');
  });

  it('"파이프라인 생성 완료" → 빈 문자열', () => {
    expect(humanizeProgress('파이프라인 생성 완료', 'blog')).toBe('');
  });

  it('"AI 냄새 제거" → 빈 문자열', () => {
    expect(humanizeProgress('AI 냄새 제거 중', 'blog')).toBe('');
  });

  it('"[1/4] 글 구조 설계 중..." → 빈 문자열', () => {
    expect(humanizeProgress('📐 [1/4] 글 구조 설계 중...', 'blog')).toBe('');
  });

  it('"[2/4] 본문 생성 중..." → 빈 문자열', () => {
    expect(humanizeProgress('✍️ [2/4] 본문 생성 중...', 'blog')).toBe('');
  });

  it('"[4/4] 전체 통합 및 품질 보정 중..." → 빈 문자열', () => {
    expect(humanizeProgress('🔍 [4/4] 전체 통합 및 품질 보정 중...', 'blog')).toBe('');
  });

  it('"통합 검증 완료" → 빈 문자열', () => {
    expect(humanizeProgress('✅ [4/4] 통합 검증 완료', 'blog')).toBe('');
  });

  it('"본문 생성 완료" → 빈 문자열', () => {
    expect(humanizeProgress('✅ 본문 생성 완료', 'blog')).toBe('');
  });

  it('"경쟁 분석 완료" → 빈 문자열', () => {
    expect(humanizeProgress('✅ 경쟁 분석 완료: 3400자, 소제목 5개', 'blog')).toBe('');
  });

  it('"SEO 평가 완료" → 빈 문자열', () => {
    expect(humanizeProgress('📊 SEO 평가 완료 - 총점: 85점', 'blog')).toBe('');
  });

  it('"FAQ 섹션 생성 중..." → 빈 문자열', () => {
    expect(humanizeProgress('❓ FAQ 섹션 생성 중... (네이버 질문 수집)', 'blog')).toBe('');
  });

  it('"보조 비주얼 유지" → 빈 문자열', () => {
    expect(humanizeProgress('⚠️ 대표 이미지 재시도 실패 — 보조 비주얼 유지', 'blog')).toBe('');
  });

  // ── 6b. 블로그: 이미지 → 순환 문구 교체 ──
  it('"이미지 3/5장 생성 중 (hero)" → 순환 문구', () => {
    const result = humanizeProgress('이미지 3/5장 생성 중 (hero)', 'blog');
    expect(IMAGE_STEP_MESSAGES).toContain(result);
  });

  it('"이미지 1/5장 완료 (sub)" → 순환 문구', () => {
    const result = humanizeProgress('이미지 1/5장 완료 (sub)', 'blog');
    expect(IMAGE_STEP_MESSAGES).toContain(result);
  });

  it('이미지 순환 문구 반복 호출 시 다른 문구', () => {
    const r1 = humanizeProgress('이미지 1/5장 생성 중 (hero)', 'blog');
    const r2 = humanizeProgress('이미지 2/5장 생성 중 (sub)', 'blog');
    expect(r1).not.toBe(r2);
  });

  // ── 6c. 블로그: 재시도/완료 허용 ──
  it('"재시도" → "조금 더 다듬고 있어요"', () => {
    expect(humanizeProgress('🔄 대표 이미지 재시도 중', 'blog')).toBe('조금 더 다듬고 있어요');
  });

  it('"모든 생성 작업 완료" → "마지막 손질을 하고 있어요"', () => {
    expect(humanizeProgress('✅ 모든 생성 작업 완료!', 'blog')).toBe('마지막 손질을 하고 있어요');
  });

  it('빈 문자열은 빈 문자열', () => {
    expect(humanizeProgress('', 'blog')).toBe('');
  });

  // ── 6d. 카드뉴스: 대부분 통과 (기존 호환) ──
  it('카드뉴스: "[1단계] 원고 기획 중..." 그대로 통과', () => {
    expect(humanizeProgress('📝 [1단계] 원고 기획 중...', 'card_news')).toBe('📝 [1단계] 원고 기획 중...');
  });

  it('카드뉴스: "이미지 생성 중" 그대로 통과', () => {
    expect(humanizeProgress('🎨 카드 이미지 2/5장 생성 중...', 'card_news')).toBe('🎨 카드 이미지 2/5장 생성 중...');
  });

  it('카드뉴스: "보조 비주얼" → 빈 문자열', () => {
    expect(humanizeProgress('보조 비주얼 유지', 'card_news')).toBe('');
  });

  it('카드뉴스: "AI 냄새" → 빈 문자열', () => {
    expect(humanizeProgress('AI 냄새 검사 중', 'card_news')).toBe('');
  });

  // ── 6e. postType 없으면 블로그 취급 (기본 suppress) ──
  it('postType 미지정: 내부 용어 suppress', () => {
    expect(humanizeProgress('[1/4] 글 구조 설계 중...')).toBe('');
  });
});

// ── P2-7: __STAGE:*__ 사용자 노출 방지 ──
describe('P2 __STAGE:*__ 노출 방지', () => {
  const signals = [
    '__STAGE:TEXT_READY__ ✅ 파이프라인 생성 완료',
    '__STAGE:IMAGE_START__ 🎨 이미지 생성 중',
    '__STAGE:SAVING__ ✅ 모든 생성 작업 완료!',
  ];

  for (const signal of signals) {
    it(`"${signal.substring(0, 30)}..." strip 후 __STAGE 없음`, () => {
      const stripped = stripGateSignal(signal);
      expect(stripped).not.toContain('__STAGE');
    });
  }
});
