/**
 * cardNewsOrchestrator.ts — 카드뉴스 이미지 생성의 단일 실행 계층
 *
 * 모든 card_news 실행 경로(hook의 3단계 워크플로우, generateContentJob의 1-shot)는
 * 이 오케스트레이터를 통해 이미지를 생성한다.
 *
 * 책임:
 *   1. batch scheduling (BATCH_SIZE 단위 병렬)
 *   2. per-card timeout + late-arrival recovery
 *   3. per-card lifecycle 추적 (CardImageResult)
 *   4. fallback SVG 생성
 *   5. 전체 결과 집계 (CardNewsRunSummary)
 *
 * 이 파일이 담당하지 않는 것:
 *   - 스크립트/프롬프트 생성 (cardNewsService.ts)
 *   - React state 관리 (useCardNewsWorkflow.ts)
 *   - 크레딧 게이트 (policies.ts)
 *   - HTML 조립 (caller가 결과를 받아 조립)
 */

import {
  PER_CARD_TIMEOUT_MS,
  BATCH_SIZE,
  BATCH_GAP_MS,
  LATE_ARRIVAL_WAIT_MS,
  IMAGE_ASPECT_RATIO,
  type CardImageResult,
  type CardNewsRunSummary,
  type CardStatus,
} from './cardNewsConfig';
import type { ImageStyle } from '../../types';

// ══════════════════════════════════════════════
// 입력 타입
// ══════════════════════════════════════════════

export interface CardImageTask {
  /** 0-based index */
  index: number;
  /** 이미지 프롬프트 */
  prompt: string;
  /** 이미지 스타일 */
  imageStyle: ImageStyle;
  /** 커스텀 스타일 프롬프트 (디자인 템플릿 또는 사용자 지정) */
  customStylePrompt?: string;
  /** 참고 이미지 (base64) */
  referenceImage?: string;
  /** 스타일 복사 모드 */
  copyMode?: boolean;
}

export interface OrchestratorOptions {
  /** 진행률 콜백 */
  onProgress?: (msg: string) => void;
  /** fallback SVG 생성에 필요한 카드 텍스트 */
  cardTexts?: Array<{
    subtitle: string;
    mainTitle: string;
    description: string;
  }>;
  /** fallback SVG 배경색 */
  bgColor?: string;
  /** fallback SVG 텍스트 색상 */
  textColor?: string;
  /** fallback SVG 부제 색상 */
  subtitleColor?: string;
}

// ══════════════════════════════════════════════
// 메인 오케스트레이션 함수
// ══════════════════════════════════════════════

/**
 * 카드뉴스 이미지 N장을 batch 단위로 생성하고 결과를 집계한다.
 *
 * 호출자는 이 함수의 결과(CardNewsRunSummary)를 받아 HTML 조립, UI 갱신 등을 수행한다.
 *
 * @param tasks - 생성할 카드 이미지 태스크 배열
 * @param generateFn - 실제 이미지 생성 함수 (cardNewsImageService.generateSingleImage)
 * @param options - 진행률 콜백, fallback 텍스트 등
 */
export async function runCardImageBatch(
  tasks: CardImageTask[],
  generateFn: (
    prompt: string,
    style: ImageStyle,
    aspectRatio: string,
    customStyle?: string,
    refImage?: string,
    copyMode?: boolean,
  ) => Promise<string>,
  options: OrchestratorOptions = {},
): Promise<CardNewsRunSummary> {
  const { onProgress, cardTexts, bgColor, textColor, subtitleColor } = options;
  const safeProgress = onProgress || (() => {});
  const totalCards = tasks.length;
  const overallStart = Date.now();

  // per-card 결과 초기화
  const results: CardImageResult[] = tasks.map((t) => ({
    index: t.index,
    status: 'queued' as CardStatus,
    imageUrl: null,
    prompt: t.prompt,
    durationMs: 0,
    retryCount: 0,
  }));

  // late-arrival 캡처용: timeout 후에도 원본 promise를 보존
  const lateArrivalPromises: Map<number, Promise<string | null>> = new Map();

  // ── batch 실행 ──
  for (let batchStart = 0; batchStart < totalCards; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCards);
    const batchIndices = Array.from(
      { length: batchEnd - batchStart },
      (_, k) => batchStart + k,
    );

    safeProgress(
      `🖼️ 이미지 ${batchStart + 1}~${batchEnd}/${totalCards}장 생성 중...`,
    );

    // batch gap (첫 batch 제외)
    if (batchStart > 0) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }

    const batchPromises = batchIndices.map(async (i) => {
      const task = tasks[i];
      const cardStart = Date.now();
      results[i].status = 'generating';

      // 원본 이미지 promise
      const imagePromise = generateFn(
        task.prompt,
        task.imageStyle,
        IMAGE_ASPECT_RATIO,
        task.customStylePrompt,
        task.referenceImage,
        task.copyMode,
      );

      // late-arrival용 wrapped promise (reject → null)
      const wrappedPromise = imagePromise.then(
        (url) => url,
        () => null,
      );
      lateArrivalPromises.set(i, wrappedPromise);

      try {
        // timeout race
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`카드 ${i + 1} timeout (${PER_CARD_TIMEOUT_MS / 1000}s)`)),
            PER_CARD_TIMEOUT_MS,
          ),
        );
        const result = await Promise.race([imagePromise, timeoutPromise]);

        results[i].status = 'success';
        results[i].imageUrl = result;
        results[i].durationMs = Date.now() - cardStart;
        safeProgress(`✅ 이미지 ${i + 1}/${totalCards}장 완료`);
      } catch (err: any) {
        const isTimeout = err?.message?.includes('timeout');
        results[i].status = isTimeout ? 'timeout' : 'failed';
        results[i].error = err?.message;
        results[i].durationMs = Date.now() - cardStart;

        console.warn(
          `⚠️ 카드 ${i + 1} 이미지 ${isTimeout ? 'timeout' : '실패'}: ${err?.message}`,
        );
        safeProgress(
          `⚠️ 이미지 ${i + 1}/${totalCards}장 ${isTimeout ? 'timeout' : '실패'} — 다음 진행...`,
        );
      }
    });

    await Promise.allSettled(batchPromises);
  }

  // ── late-arrival 복구 ──
  const failedIndices = results
    .filter((r) => r.status === 'timeout' || r.status === 'failed')
    .map((r) => r.index);

  if (failedIndices.length > 0) {
    safeProgress(
      `🔄 실패 카드 ${failedIndices.length}장 응답 대기 중 (최대 ${LATE_ARRIVAL_WAIT_MS / 1000}초)...`,
    );

    const lateResults = await Promise.race([
      Promise.allSettled(
        failedIndices.map(async (i) => {
          const pending = lateArrivalPromises.get(i);
          if (!pending) return null;
          return pending;
        }),
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LATE_ARRIVAL_WAIT_MS),
      ),
    ]);

    if (lateResults && Array.isArray(lateResults)) {
      let recoveredCount = 0;
      lateResults.forEach((settled, idx) => {
        const cardIdx = failedIndices[idx];
        if (
          settled.status === 'fulfilled' &&
          settled.value &&
          typeof settled.value === 'string' &&
          !settled.value.includes('svg+xml') // SVG placeholder는 복구로 치지 않음
        ) {
          results[cardIdx].status = 'recovered';
          results[cardIdx].imageUrl = settled.value;
          recoveredCount++;
          console.info(`🔄 카드 ${cardIdx + 1} late-arrival 복구 성공`);
        }
      });
      if (recoveredCount > 0) {
        safeProgress(`🔄 ${recoveredCount}장 추가 복구 완료!`);
      }
    }
  }

  // ── fallback 적용 ──
  for (const r of results) {
    if (r.status === 'timeout' || r.status === 'failed') {
      r.status = 'fallback';
      r.imageUrl = buildFallbackSvg(r.index, {
        cardTexts,
        bgColor: bgColor || '#E8F4FD',
        textColor: textColor || '#1E293B',
        subtitleColor: subtitleColor || '#64748B',
      });
    }
  }

  // ── 결과 집계 ──
  const successCount = results.filter((r) => r.status === 'success').length;
  const recoveredCount = results.filter((r) => r.status === 'recovered').length;
  const fallbackCount = results.filter((r) => r.status === 'fallback').length;
  const totalDurationMs = Date.now() - overallStart;

  const summary: CardNewsRunSummary = {
    totalCards,
    successCount,
    recoveredCount,
    fallbackCount,
    failedCount: fallbackCount, // fallback = 최종적으로 AI 이미지 실패한 카드
    totalDurationMs,
    cards: results,
  };

  // structured logging
  console.info(
    `[CardNews] 완료: ${totalCards}장 | ` +
    `성공=${successCount} 복구=${recoveredCount} fallback=${fallbackCount} | ` +
    `${(totalDurationMs / 1000).toFixed(1)}s`,
  );

  if (fallbackCount > 0) {
    safeProgress(
      `🖼️ 완료: ${successCount + recoveredCount}장 성공, ${fallbackCount}장 fallback 적용`,
    );
  }

  return summary;
}

// ══════════════════════════════════════════════
// Fallback SVG 생성
// ══════════════════════════════════════════════

interface FallbackSvgOptions {
  cardTexts?: Array<{ subtitle: string; mainTitle: string; description: string }>;
  bgColor: string;
  textColor: string;
  subtitleColor: string;
}

function buildFallbackSvg(index: number, options: FallbackSvgOptions): string {
  const { cardTexts, bgColor, textColor, subtitleColor } = options;

  const cardText = cardTexts?.[index];
  const subtitle = cardText?.subtitle || '';
  const mainTitle = cardText?.mainTitle || `카드 ${index + 1}`;
  const description = cardText?.description || '';

  const esc = (t: string) =>
    t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const svgSub = esc(subtitle).substring(0, 40);
  const svgMain = esc(mainTitle).substring(0, 25);
  const svgDesc = esc(description).substring(0, 50);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect fill="${bgColor}" width="800" height="800" rx="24"/>
  <rect fill="#ffffff" x="50" y="50" width="700" height="700" rx="20" opacity="0.85"/>
  <text x="400" y="280" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="20" fill="${subtitleColor}">${svgSub}</text>
  <text x="400" y="360" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="36" font-weight="bold" fill="${textColor}">${svgMain}</text>
  ${svgDesc ? `<text x="400" y="420" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="18" fill="${subtitleColor}">${svgDesc}</text>` : ''}
  <line x1="300" y1="480" x2="500" y2="480" stroke="${subtitleColor}" stroke-width="1" opacity="0.3"/>
  <text x="400" y="540" text-anchor="middle" font-family="'Noto Sans KR',Arial,sans-serif" font-size="14" fill="#94A3B8">카드를 클릭하여 이미지를 재생성하세요</text>
  <circle cx="400" cy="610" r="30" fill="${bgColor}" opacity="0.5"/>
  <text x="400" y="618" text-anchor="middle" font-size="24">🔄</text>
</svg>`;

  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg).toString('base64');

  return `data:image/svg+xml;base64,${b64}`;
}
