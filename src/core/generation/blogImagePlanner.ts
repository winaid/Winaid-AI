/**
 * Blog Image Planner — 블로그 이미지 생성/배치 범용 정책
 *
 * 블로그 postType에서 이미지 0~5장(또는 그 이상) 전체 범위를
 * 일관된 전략으로 처리하는 블로그 전용 계획 모듈.
 *
 * 설계 원칙:
 *   - 특정 imageCount에 묶인 하드코딩 분기 금지
 *   - 0장이든 5장이든 동일 알고리즘으로 자연스럽게 처리
 *   - 카드뉴스/보도자료/공용 이미지 파이프라인에 영향 없음
 *
 * 이 모듈이 제공하는 두 가지 전략:
 *   1. 생성 전략 — planBlogImageWaves(): 웨이브 기반 배치 (API rate limit 관리)
 *   2. 배치 전략 — insertBlogImageMarkers(): HTML 레이아웃 마커 삽입
 */

import type { ImageQueueItem } from '../../services/image/imageTypes';
import type { ImageStyle } from '../../types';

// ═══════════════════════════════════════════════
// 생성 전략: 웨이브 기반 배치
// ═══════════════════════════════════════════════

/**
 * 한 웨이브에 포함할 최대 이미지 수.
 *
 * NB2 concurrency(2슬롯) 환경에서 이 수 이하면
 * 큐 대기가 짧아 rate limit 위험이 낮다.
 * 초과하면 웨이브를 나눠 API 회복 시간을 확보한다.
 *
 * 이 값은 특정 imageCount에 묶이지 않는 시스템 파라미터다.
 * imageCount가 6, 7로 늘어나도 동일하게 적용된다.
 */
const WAVE_CAPACITY = 3;

export interface BlogImageWave {
  items: ImageQueueItem[];
  /** 'wave-1', 'wave-2', ... — 로그/UX 표시용 */
  label: string;
}

/**
 * 블로그 이미지 생성 웨이브를 계획한다.
 *
 * imageCount 0~N 전체 범위에서 동일 알고리즘:
 *   - 0장: 빈 배열 (생성 완전 스킵)
 *   - count <= WAVE_CAPACITY: 단일 웨이브
 *   - count > WAVE_CAPACITY: ceil(count / WAVE_CAPACITY) 웨이브
 *
 * hero(index=0)는 항상 첫 웨이브에 포함된다.
 */
export function planBlogImageWaves(
  imagePrompts: string[],
  imageCount: number,
  style: ImageStyle,
  aspectRatio: string,
  customStylePrompt?: string,
): BlogImageWave[] {
  if (imageCount <= 0 || imagePrompts.length === 0) return [];

  const effectiveCount = Math.min(imageCount, imagePrompts.length);
  const allItems: ImageQueueItem[] = imagePrompts.slice(0, effectiveCount).map((p, i) => ({
    index: i,
    prompt: p,
    role: (i === 0 ? 'hero' : 'sub') as 'hero' | 'sub',
    style,
    aspectRatio,
    customStylePrompt,
    // 블로그 전용 timeout 정책: manual 모드 사용
    // auto: hero 25s / sub 18s → Gemini 응답 시간(15~35s) 대비 부족 → timeout 실패 빈발
    // manual: hero 35s / sub 30s → 응답 시간 대부분 커버 → AI 커버리지 대폭 향상
    // 카드뉴스는 별도 경로(generateSingleImage)를 사용하므로 영향 없음
    mode: 'manual' as const,
  }));

  const waves: BlogImageWave[] = [];
  for (let offset = 0; offset < allItems.length; offset += WAVE_CAPACITY) {
    const chunk = allItems.slice(offset, offset + WAVE_CAPACITY);
    waves.push({
      items: chunk,
      label: `wave-${waves.length + 1}`,
    });
  }

  const desc = waves.map(w => `${w.label}(${w.items.length}장)`).join(' → ');
  console.info(`[IMG-PLAN] 블로그 ${effectiveCount}장 웨이브 계획: ${desc} (capacity=${WAVE_CAPACITY})`);

  return waves;
}

// ═══════════════════════════════════════════════
// hero 재시도 전략
// ═══════════════════════════════════════════════

/**
 * hero가 template fallback된 경우 간결 프롬프트로 1회 재시도 아이템을 생성한다.
 *
 * 재시도 근거:
 *   - hero의 기본 chain은 heroPrompt(5줄 복합 프롬프트)로 2회 시도
 *   - startTier=pro일 때 두 번 다 heroPrompt 사용 → 복잡한 프롬프트가 원인이면 둘 다 실패
 *   - 재시도는 간결 프롬프트(1줄) + manual mode(35s) → 성공 확률이 의미 있게 높음
 *   - "같은 프롬프트 재시도"가 아니라 "다른 프롬프트 재시도" → 시간 낭비가 아님
 *
 * null을 반환하면 재시도하지 않는다 (이미 AI 이미지이거나, hero가 없는 경우).
 */
export function buildHeroRetryItem(
  topic: string,
  style: ImageStyle,
  aspectRatio: string,
  customStylePrompt?: string,
): ImageQueueItem {
  // 간결 프롬프트: 핵심 주제 + 최소 지시만
  const shortTopic = topic.substring(0, 60);
  return {
    index: 0,
    prompt: `${shortTopic} — 건강/의료 블로그 대표 이미지. 현대 한국인, 신뢰감 있는 분위기.`,
    role: 'hero',
    style,
    aspectRatio,
    customStylePrompt,
    mode: 'manual',
  };
}

// ═══════════════════════════════════════════════
// 배치 전략: HTML 레이아웃 마커 삽입
// ═══════════════════════════════════════════════

/**
 * 블로그 HTML에 이미지 마커 [IMG_N]을 삽입한다.
 *
 * imageCount 0~N 전체 범위에서 동일 알고리즘:
 *
 * 삽입 순서 (= 우선순위):
 *   1. intro: 첫 h3 앞 마지막 </p> 뒤 (도입부 이미지)
 *   2. section: 각 h3 + 첫 </p> 뒤 (섹션별 이미지)
 *   3. paragraph: h3가 없으면 매 2번째 </p> 뒤 (폴백)
 *   4. tail: 마지막 </div> 앞 (자연 위치 소진 시 보충)
 *
 * 앞에서부터 imageCount개를 채운다.
 * 어떤 count든 동일 경로를 탄다.
 */
export function insertBlogImageMarkers(html: string, imageCount: number): string {
  if (imageCount <= 0) return html;

  let result = html;
  let imgIndex = 1;
  const h3Tags = result.match(/<h3[^>]*>.*?<\/h3>/gi) || [];

  // ── 1. intro 배치 ──
  // 첫 h3 앞에 도입부 단락이 있으면 그 뒤에 1장 배치
  if (h3Tags.length > 0 && imgIndex <= imageCount) {
    const firstH3 = h3Tags[0]!;
    const firstH3Idx = result.indexOf(firstH3);
    if (firstH3Idx > 0) {
      const introSection = result.substring(0, firstH3Idx);
      const lastPClose = introSection.lastIndexOf('</p>');
      if (lastPClose >= 0) {
        const insertAt = lastPClose + '</p>'.length;
        const marker = `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
        result = result.substring(0, insertAt) + marker + result.substring(insertAt);
        imgIndex++;
      }
    }
  }

  // ── 2. section 배치 ──
  // 각 h3 + 첫 </p> 뒤에 순차 배치
  if (h3Tags.length > 0 && imgIndex <= imageCount) {
    result = result.replace(
      /(<h3[^>]*>.*?<\/h3>[\s\S]*?<\/p>)/gi,
      (match: string) => {
        if (imgIndex <= imageCount) {
          const marker = `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
          imgIndex++;
          return match + marker;
        }
        return match;
      }
    );
  }

  // ── 3. paragraph 배치 (h3 없는 경우 폴백) ──
  if (h3Tags.length === 0 && imgIndex <= imageCount) {
    let pCount = 0;
    result = result.replace(/<\/p>/gi, (match: string) => {
      pCount++;
      if (pCount % 2 === 0 && imgIndex <= imageCount) {
        const marker = `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
        imgIndex++;
        return match + marker;
      }
      return match;
    });
  }

  // ── 4. tail 보충 ──
  // 자연 위치가 부족한 경우에만 하단에 보충
  if (imgIndex <= imageCount) {
    const remaining = imageCount - imgIndex + 1;
    console.info(`[IMG-LAYOUT] ${imageCount}장 중 ${remaining}장 하단 보충 (자연위치 ${imgIndex - 1}개)`);
    let tailMarkers = '';
    while (imgIndex <= imageCount) {
      tailMarkers += `\n<div class="content-image-wrapper">[IMG_${imgIndex}]</div>\n`;
      imgIndex++;
    }
    const lastDivIdx = result.lastIndexOf('</div>');
    if (lastDivIdx >= 0) {
      result = result.substring(0, lastDivIdx) + tailMarkers + result.substring(lastDivIdx);
    } else {
      result += tailMarkers;
    }
  }

  const placed = imgIndex - 1;
  console.info(`[IMG-LAYOUT] ✅ ${imageCount}장 마커 삽입 완료 (배치=${placed})`);

  return result;
}
