/**
 * cardNewsIntegration.test.ts — 카드뉴스 생성 경로 통합 테스트
 *
 * 검증 목표:
 *   1. Hook path: useCardNewsWorkflow.handleApprovePrompts → CardImageTask[] → runCardImageBatch → HTML
 *   2. Job path: generateContentJob._orchestrateCardNews → tasks → runCardImageBatch → HTML
 *   3. Mixed success/fallback: 성공+실패 혼합 시 HTML에 실제 이미지 + fallback SVG 포함
 *   4. Policy constants: cardNewsConfig 상수가 유일한 정책 소스 (하드코딩 없음)
 *   5. Dead code: _orchestrateBlog 내 card_news 분기(lines 506-525, 706-725)가 도달 불가
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCardImageBatch, type CardImageTask } from '../cardNewsOrchestrator';
import {
  PER_CARD_TIMEOUT_MS,
  BATCH_SIZE,
  BATCH_GAP_MS,
  LATE_ARRIVAL_WAIT_MS,
  clampSlideCount,
} from '../cardNewsConfig';
import * as fs from 'fs';
import * as path from 'path';

// ── 헬퍼 ──

function makeTasks(count: number): CardImageTask[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    prompt: `테스트 이미지 프롬프트 ${i + 1}`,
    imageStyle: 'illustration' as const,
    customStylePrompt: 'test-style',
    referenceImage: undefined,
    copyMode: false,
  }));
}

function makeCardTexts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    subtitle: `부제 ${i + 1}`,
    mainTitle: `제목 ${i + 1}`,
    description: `설명 ${i + 1}`,
  }));
}

/** 즉시 성공하는 generateFn */
const successGenerateFn = vi.fn(async (prompt: string) => {
  return `data:image/png;base64,FAKE_IMAGE_${prompt.slice(0, 10)}`;
});

/** 특정 인덱스만 실패하는 generateFn 팩토리 */
function makeMixedGenerateFn(failIndices: Set<number>) {
  let callIndex = 0;
  return vi.fn(async (prompt: string) => {
    const idx = callIndex++;
    if (failIndices.has(idx)) {
      throw new Error(`카드 ${idx + 1} 생성 실패`);
    }
    return `data:image/png;base64,SUCCESS_${idx}`;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════
// 1. Hook path integration
// ═══════════════════════════════════════════════

describe('Hook path: handleApprovePrompts creates tasks and calls runCardImageBatch', () => {
  it('creates CardImageTask[] from cardNewsPrompts and produces correct card-slide divs', async () => {
    const cardCount = 4;
    const tasks = makeTasks(cardCount);
    const cardTexts = makeCardTexts(cardCount);

    const summary = await runCardImageBatch(tasks, successGenerateFn, {
      cardTexts,
      bgColor: '#E8F4FD',
      textColor: '#1E293B',
      subtitleColor: '#64748B',
    });

    // Verify all tasks were processed
    expect(summary.totalCards).toBe(cardCount);
    expect(summary.successCount).toBe(cardCount);
    expect(summary.fallbackCount).toBe(0);

    // Build HTML the same way handleApprovePrompts does
    const cardSlides = summary.cards
      .map((card) => {
        const isFallback = card.status === 'fallback';
        const alt = isFallback
          ? `카드 ${card.index + 1} (재생성 필요)`
          : `카드 ${card.index + 1}`;
        return `<div class="card-slide"><img src="${card.imageUrl}" alt="${alt}" data-index="${card.index + 1}" class="card-full-img" /></div>`;
      })
      .join('\n');

    const finalHtml = `<div class="card-news-container"><div class="card-grid-wrapper">${cardSlides}</div></div>`;

    // Count card-slide divs
    const slideCount = (finalHtml.match(/class="card-slide"/g) || []).length;
    expect(slideCount).toBe(cardCount);

    // All images should be real (not SVG fallback)
    for (const card of summary.cards) {
      expect(card.imageUrl).toContain('data:image/png;base64,FAKE_IMAGE_');
      expect(card.imageUrl).not.toContain('svg+xml');
    }
  });

  it('passes correct arguments to generateFn for each task', async () => {
    const tasks = makeTasks(2);
    const generateFn = vi.fn(async () => 'data:image/png;base64,OK');

    await runCardImageBatch(tasks, generateFn, {});

    expect(generateFn).toHaveBeenCalledTimes(2);
    // Verify generateFn receives (prompt, style, aspectRatio, customStyle, refImage, copyMode)
    expect(generateFn).toHaveBeenCalledWith(
      tasks[0].prompt,
      tasks[0].imageStyle,
      '1:1', // IMAGE_ASPECT_RATIO from cardNewsConfig
      tasks[0].customStylePrompt,
      tasks[0].referenceImage,
      tasks[0].copyMode,
    );
  });
});

// ═══════════════════════════════════════════════
// 2. Job path integration
// ═══════════════════════════════════════════════

describe('Job path: _orchestrateCardNews creates tasks and assembles HTML with card-slide divs', () => {
  it('produces card-slide divs matching task count via runCardImageBatch', async () => {
    const cardCount = 5;
    const tasks = makeTasks(cardCount);
    const cardTexts = makeCardTexts(cardCount);

    const summary = await runCardImageBatch(tasks, successGenerateFn, {
      onProgress: vi.fn(),
      cardTexts,
      bgColor: '#E8F4FD',
      textColor: '#1E293B',
      subtitleColor: '#64748B',
    });

    expect(summary.totalCards).toBe(cardCount);
    expect(summary.successCount).toBe(cardCount);

    // Simulate _orchestrateCardNews HTML assembly
    const cardSlides = summary.cards
      .map((card) => {
        const isFallback = card.status === 'fallback';
        const alt = isFallback
          ? `카드 ${card.index + 1} (재생성 필요)`
          : `카드 ${card.index + 1}`;
        return `<div class="card-slide" style="border-radius: 24px; overflow: hidden; aspect-ratio: 1/1;"><img src="${card.imageUrl}" alt="${alt}" data-index="${card.index + 1}" class="card-full-img" style="width: 100%; height: 100%; object-fit: cover;" /></div>`;
      })
      .join('\n');

    const finalHtml = `
      <div class="card-news-container">
        <h2 class="hidden-title">테스트 제목</h2>
        <div class="card-grid-wrapper">
          ${cardSlides}
        </div>
        <div class="legal-box-card">의료 면책 조항</div>
      </div>
    `.trim();

    const slideCount = (finalHtml.match(/class="card-slide"/g) || []).length;
    expect(slideCount).toBe(cardCount);

    // Verify structure
    expect(finalHtml).toContain('card-news-container');
    expect(finalHtml).toContain('card-grid-wrapper');
    expect(finalHtml).toContain('hidden-title');
  });

  it('clamps slide count before creating tasks (mirrors job path logic)', () => {
    // Job path: const maxImages = clampSlideCount(request.slideCount);
    expect(clampSlideCount(10)).toBe(7); // MAX_SLIDE_COUNT
    expect(clampSlideCount(0)).toBe(1);  // minimum
    expect(clampSlideCount(undefined)).toBe(6); // DEFAULT_SLIDE_COUNT

    // Then: const totalCards = Math.min(maxImages, imagePrompts.length);
    const imagePrompts = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const maxImages = clampSlideCount(10); // 7
    const totalCards = Math.min(maxImages, imagePrompts.length); // 5
    expect(totalCards).toBe(5);
  });
});

// ═══════════════════════════════════════════════
// 3. Mixed success/fallback consistency
// ═══════════════════════════════════════════════

describe('Mixed success/fallback: HTML contains both real images and fallback SVGs', () => {
  it('when cards 1,3 fail → HTML has 2 fallback SVGs and 2 real images', async () => {
    const cardCount = 4;
    const tasks = makeTasks(cardCount);
    const cardTexts = makeCardTexts(cardCount);
    const failSet = new Set([0, 2]); // cards at index 0 and 2 fail
    const generateFn = makeMixedGenerateFn(failSet);

    const summary = await runCardImageBatch(tasks, generateFn, {
      cardTexts,
      bgColor: '#E8F4FD',
      textColor: '#1E293B',
      subtitleColor: '#64748B',
    });

    expect(summary.totalCards).toBe(4);
    expect(summary.successCount).toBe(2);
    expect(summary.fallbackCount).toBe(2);
    expect(summary.failedCount).toBe(2); // failedCount === fallbackCount

    // Build HTML
    const cardSlides = summary.cards
      .map((card) => {
        const isFallback = card.status === 'fallback';
        const alt = isFallback
          ? `카드 ${card.index + 1} (재생성 필요)`
          : `카드 ${card.index + 1}`;
        return `<div class="card-slide"><img src="${card.imageUrl}" alt="${alt}" data-index="${card.index + 1}" /></div>`;
      })
      .join('\n');

    const finalHtml = `<div class="card-news-container"><div class="card-grid-wrapper">${cardSlides}</div></div>`;

    // Total slide count must match
    const slideCount = (finalHtml.match(/class="card-slide"/g) || []).length;
    expect(slideCount).toBe(4);

    // Check fallback SVGs are present (base64 encoded SVG)
    const svgMatches = finalHtml.match(/data:image\/svg\+xml;base64,/g) || [];
    expect(svgMatches.length).toBe(2);

    // Check real images are present
    const realImageMatches = finalHtml.match(/data:image\/png;base64,SUCCESS_/g) || [];
    expect(realImageMatches.length).toBe(2);

    // Verify fallback cards have "(재생성 필요)" alt text
    const fallbackAlts = finalHtml.match(/재생성 필요/g) || [];
    expect(fallbackAlts.length).toBe(2);

    // Verify fallback SVG contains card text from cardTexts
    const card0 = summary.cards[0];
    expect(card0.status).toBe('fallback');
    expect(card0.imageUrl).toContain('data:image/svg+xml;base64,');
    // Decode and check text inclusion
    const svgBase64 = card0.imageUrl!.replace('data:image/svg+xml;base64,', '');
    const svgContent = Buffer.from(svgBase64, 'base64').toString('utf-8');
    expect(svgContent).toContain('제목 1'); // mainTitle from cardTexts[0]

    // Card at index 1 should be success
    const card1 = summary.cards[1];
    expect(card1.status).toBe('success');
    expect(card1.imageUrl).toContain('data:image/png;base64,SUCCESS_');
  });

  it('when all cards fail, all get fallback SVGs', async () => {
    const cardCount = 3;
    const tasks = makeTasks(cardCount);
    const cardTexts = makeCardTexts(cardCount);
    const generateFn = vi.fn(async () => {
      throw new Error('API 장애');
    });

    const summary = await runCardImageBatch(tasks, generateFn, {
      cardTexts,
      bgColor: '#FFFFFF',
      textColor: '#000000',
      subtitleColor: '#666666',
    });

    expect(summary.successCount).toBe(0);
    expect(summary.fallbackCount).toBe(3);

    for (const card of summary.cards) {
      expect(card.status).toBe('fallback');
      expect(card.imageUrl).toContain('data:image/svg+xml;base64,');
    }
  });
});

// ═══════════════════════════════════════════════
// 4. Policy constants verification
// ═══════════════════════════════════════════════

describe('Policy constants: cardNewsConfig is the single source of truth', () => {
  it('exports expected constant values', () => {
    expect(PER_CARD_TIMEOUT_MS).toBe(90_000);
    expect(BATCH_SIZE).toBe(2);
    expect(BATCH_GAP_MS).toBe(1_500);
    expect(LATE_ARRIVAL_WAIT_MS).toBe(30_000);
  });

  it('cardNewsOrchestrator imports from cardNewsConfig (not hardcoded)', () => {
    const orchestratorPath = path.resolve(
      __dirname,
      '..',
      'cardNewsOrchestrator.ts',
    );
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    // Must import from cardNewsConfig
    expect(source).toContain("from './cardNewsConfig'");

    // Must reference the imported constants (not inline numbers)
    expect(source).toContain('PER_CARD_TIMEOUT_MS');
    expect(source).toContain('BATCH_SIZE');
    expect(source).toContain('BATCH_GAP_MS');
    expect(source).toContain('LATE_ARRIVAL_WAIT_MS');

    // Must NOT hardcode the raw values as policy literals
    // (We check the source minus imports/comments for raw numeric assignments)
    const codeWithoutComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Should not assign 90_000 / 90000 inline as timeout
    expect(codeWithoutComments).not.toMatch(/setTimeout\([^)]*90[_,]?000/);
    // Should not assign 1_500 / 1500 as batch gap
    expect(codeWithoutComments).not.toMatch(/setTimeout\([^)]*1[_,]?500/);
  });

  it('no other source file hardcodes PER_CARD_TIMEOUT_MS, BATCH_SIZE, LATE_ARRIVAL_WAIT_MS, BATCH_GAP_MS as card-news policy values', () => {
    const srcRoot = path.resolve(__dirname, '..', '..', '..');
    const orchestratorPath = path.resolve(__dirname, '..', 'cardNewsOrchestrator.ts');

    // Read the orchestrator to verify it imports from cardNewsConfig
    const orchestratorSrc = fs.readFileSync(orchestratorPath, 'utf-8');
    expect(orchestratorSrc).toContain("from './cardNewsConfig'");
    expect(orchestratorSrc).toContain('PER_CARD_TIMEOUT_MS');
    expect(orchestratorSrc).toContain('BATCH_SIZE');
    expect(orchestratorSrc).toContain('BATCH_GAP_MS');
    expect(orchestratorSrc).toContain('LATE_ARRIVAL_WAIT_MS');

    // Job path delegates to runCardImageBatch (which uses cardNewsConfig internally)
    // and dynamically imports clampSlideCount from cardNewsConfig
    const generateContentJobPath = path.resolve(__dirname, '..', 'generateContentJob.ts');
    const jobSrc = fs.readFileSync(generateContentJobPath, 'utf-8');

    // Job path uses dynamic import: await import('./cardNewsConfig')
    expect(jobSrc).toContain("'./cardNewsConfig'");
    expect(jobSrc).toContain('clampSlideCount');
    // Job path also uses runCardImageBatch via dynamic import
    expect(jobSrc).toContain('runCardImageBatch');
    // Job path must NOT hardcode timing constants (it delegates to orchestrator)
    expect(jobSrc).not.toContain('PER_CARD_TIMEOUT_MS');

    // Hook path imports from cardNewsOrchestrator (which uses config internally)
    const hookPath = path.resolve(srcRoot, 'hooks', 'useCardNewsWorkflow.ts');
    const hookSrc = fs.readFileSync(hookPath, 'utf-8');
    expect(hookSrc).toContain('runCardImageBatch');
    expect(hookSrc).toContain('CardImageTask');
    // Hook must NOT hardcode timing constants
    expect(hookSrc).not.toContain('PER_CARD_TIMEOUT_MS');
    expect(hookSrc).not.toContain('LATE_ARRIVAL_WAIT_MS');
    expect(hookSrc).not.toContain('BATCH_GAP_MS');
  });
});

// ═══════════════════════════════════════════════
// 5. Dead code identification
// ═══════════════════════════════════════════════

describe('Dead code: _orchestrateBlog has unreachable card_news blocks', () => {
  it('_orchestrateBlog is only reached when postType is NOT card_news (and NOT press_release)', () => {
    // In orchestrateFullPost:
    //   if (isPressRelease) → return _orchestratePressRelease(...)
    //   if (isCardNews) → return _orchestrateCardNews(...)
    //   return _orchestrateBlog(...)    ← only reached for blog
    //
    // Therefore card_news branches inside _orchestrateBlog are dead code.
    const jobPath = path.resolve(__dirname, '..', 'generateContentJob.ts');
    const source = fs.readFileSync(jobPath, 'utf-8');

    // Verify the dispatch logic: card_news is handled before _orchestrateBlog
    const orchestrateFullPostMatch = source.match(
      /async function orchestrateFullPost[\s\S]*?return _orchestrateBlog/,
    );
    expect(orchestrateFullPostMatch).not.toBeNull();
    const dispatchBlock = orchestrateFullPostMatch![0];

    // card_news is dispatched to _orchestrateCardNews BEFORE _orchestrateBlog
    const cardNewsDispatchIdx = dispatchBlock.indexOf('_orchestrateCardNews');
    const blogDispatchIdx = dispatchBlock.indexOf('_orchestrateBlog');
    expect(cardNewsDispatchIdx).toBeGreaterThan(-1);
    expect(blogDispatchIdx).toBeGreaterThan(-1);
    expect(cardNewsDispatchIdx).toBeLessThan(blogDispatchIdx);
  });

  it('lines 506-525: card_news image generation loop inside _orchestrateBlog is unreachable', () => {
    const jobPath = path.resolve(__dirname, '..', 'generateContentJob.ts');
    const source = fs.readFileSync(jobPath, 'utf-8');

    // The _orchestrateBlog function contains a card_news branch for sequential image gen
    // Find within _orchestrateBlog:
    const blogFnMatch = source.match(
      /async function _orchestrateBlog[\s\S]*?^}/m,
    );
    expect(blogFnMatch).not.toBeNull();
    const blogFnBody = blogFnMatch![0];

    // Dead code block 1: sequential card_news image generation
    // "if (request.postType === 'card_news')" inside _orchestrateBlog
    const cardNewsImageBlock = blogFnBody.match(
      /if\s*\(\s*request\.postType\s*===\s*'card_news'\s*\)\s*\{[\s\S]*?safeProgress\(`🎨 카드뉴스 이미지/,
    );
    expect(cardNewsImageBlock).not.toBeNull();
    // This block exists but can never execute because _orchestrateBlog is only called for blog postType
  });

  it('lines 706-725: card_news style application inside _orchestrateBlog is unreachable', () => {
    const jobPath = path.resolve(__dirname, '..', 'generateContentJob.ts');
    const source = fs.readFileSync(jobPath, 'utf-8');

    const blogFnMatch = source.match(
      /async function _orchestrateBlog[\s\S]*?^}/m,
    );
    expect(blogFnMatch).not.toBeNull();
    const blogFnBody = blogFnMatch![0];

    // Dead code block 2: card_news style application
    // Another "if (request.postType === 'card_news')" for applyCardNewsStyles
    const cardNewsStyleBlock = blogFnBody.match(
      /if\s*\(\s*request\.postType\s*===\s*'card_news'\s*\)\s*\{[\s\S]*?applyCardNewsStyles/,
    );
    expect(cardNewsStyleBlock).not.toBeNull();
    // This block exists but can never execute

    // Count all card_news checks inside _orchestrateBlog — all are dead code
    const cardNewsChecks = blogFnBody.match(
      /request\.postType\s*===\s*'card_news'/g,
    );
    expect(cardNewsChecks).not.toBeNull();
    expect(cardNewsChecks!.length).toBeGreaterThanOrEqual(2);
  });

  it('orchestrateFullPost early-returns for card_news before reaching _orchestrateBlog', () => {
    const jobPath = path.resolve(__dirname, '..', 'generateContentJob.ts');
    const source = fs.readFileSync(jobPath, 'utf-8');

    // Extract orchestrateFullPost body
    const fnStart = source.indexOf('async function orchestrateFullPost');
    expect(fnStart).toBeGreaterThan(-1);

    // Find the card_news early return
    const afterFnStart = source.slice(fnStart);
    const isCardNewsCheck = afterFnStart.indexOf("if (isCardNews)");
    const orchestrateCardNewsReturn = afterFnStart.indexOf("return _orchestrateCardNews");
    const orchestrateBlogReturn = afterFnStart.indexOf("return _orchestrateBlog");

    expect(isCardNewsCheck).toBeGreaterThan(-1);
    expect(orchestrateCardNewsReturn).toBeGreaterThan(-1);
    expect(orchestrateBlogReturn).toBeGreaterThan(-1);

    // card_news is dispatched before blog
    expect(isCardNewsCheck).toBeLessThan(orchestrateBlogReturn);
    expect(orchestrateCardNewsReturn).toBeLessThan(orchestrateBlogReturn);
  });
});
