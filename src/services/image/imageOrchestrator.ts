/**
 * Image Orchestrator — 최상위 이미지 생성 오케스트레이션
 *
 * 라우터 + 프롬프트 빌더 + 폴백을 호출하여
 * queue / semaphore / hero-sub 실행 정책을 관리한다.
 *
 * imageGenerationService.ts에서 추출:
 * - generateBlogImage()
 * - generateImageQueue()
 * - 세마포어 (acquireImageSlot / releaseImageSlot / reportCooldown)
 * - 세션 누적 통계 (SessionStats)
 * - 베타 판정 / 벤치마크
 */

import { GEMINI_MODEL, TIMEOUTS, callGeminiRaw } from '../geminiClient';
import type { ImageStyle } from '../../types';
import type {
  ImageRole,
  ImageGenMode,
  ModelTier,
  ImageResultType,
  ImageQueueItem,
  ImageQueueResult,
  BlogImageOutput,
  AttemptDef,
} from './imageTypes';
import { BLOG_IMAGE_STYLE_COMPACT, STYLE_KEYWORD_SHORT } from './imagePromptBuilder';
import { generateTemplateFallback } from './imageFallbackService';

// ── Demo-safe mode ──
export function isDemoSafeMode(): boolean {
  try {
    return localStorage.getItem('DEMO_SAFE_MODE') === 'true';
  } catch {
    return false;
  }
}

export function setDemoSafeMode(enabled: boolean): void {
  try {
    localStorage.setItem('DEMO_SAFE_MODE', enabled ? 'true' : 'false');
    console.info(`[IMG] 🎛️ demo-safe mode ${enabled ? 'ON' : 'OFF'}`);
  } catch { /* ignore */ }
}

// ── 설정값 (상수화) ──

const TIER_CONCURRENCY: Record<ModelTier, number> = {
  pro: 1,
  nb2: 2,  // hero+sub 또는 sub+sub 병렬 — 직렬 대기 시간 40-50% 감소
};

const IMAGE_TIMEOUT: Record<ImageGenMode, Record<ImageRole, number>> = {
  auto:   { hero: 25000, sub: 18000 },
  manual: { hero: 35000, sub: 25000 },
};

// 디버그 verbose 로그 플래그
function isImgDebug(): boolean {
  try { return localStorage.getItem('IMG_DEBUG') === 'true'; } catch { return false; }
}

// ── 모델별 세마포어 ──

const _activeJobs: Record<ModelTier, number> = { pro: 0, nb2: 0 };
const _cooldownUntil: Record<ModelTier, number> = { pro: 0, nb2: 0 };

function getTierConcurrency(tier: ModelTier): number {
  return TIER_CONCURRENCY[tier];
}

async function acquireImageSlot(idx: number, total: number, role: ImageRole, tier: ModelTier): Promise<{ queueWaitMs: number }> {
  const t0 = Date.now();
  const maxC = getTierConcurrency(tier);

  while (true) {
    const now = Date.now();

    if (_cooldownUntil[tier] > now) {
      const wait = _cooldownUntil[tier] - now + 300 + Math.random() * 500;
      if (isImgDebug()) console.debug(`[IMG-Q] cooldown-wait idx=${idx} tier=${tier} ${Math.round(wait)}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (_activeJobs[tier] >= maxC) {
      if (isImgDebug()) console.debug(`[IMG-Q] slot-wait idx=${idx} tier=${tier} active=${_activeJobs[tier]}/${maxC}`);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
      continue;
    }

    _activeJobs[tier]++;
    const queueWaitMs = Date.now() - t0;
    if (isImgDebug()) console.debug(`[IMG-Q] acquired idx=${idx} tier=${tier} slot=${_activeJobs[tier]}/${maxC} queueWait=${queueWaitMs}ms`);
    return { queueWaitMs };
  }
}

function releaseImageSlot(tier: ModelTier): void {
  _activeJobs[tier] = Math.max(0, _activeJobs[tier] - 1);
}

function reportCooldown(tier: ModelTier, nextAvailableAt?: number, retryAfterMs?: number): void {
  const now = Date.now();
  if (nextAvailableAt && nextAvailableAt > now) {
    _cooldownUntil[tier] = Math.max(_cooldownUntil[tier], nextAvailableAt);
  } else if (retryAfterMs && retryAfterMs > 0) {
    _cooldownUntil[tier] = Math.max(_cooldownUntil[tier], now + retryAfterMs);
  }
}

// ── 에러 유형 파서 ──

interface ParsedError {
  errorType: string;
  retryAfterMs: number;
  isCooldown: boolean;
  isUpstream503: boolean;
  isUpstream500: boolean;
  isTimeout: boolean;
}

function parseImageError(error: any): ParsedError {
  const isCooldown = error?.isCooldown === true;
  const isUpstream503 = error?.isUpstream503 === true;
  const isUpstream500 = !isCooldown && !isUpstream503 && error?.status === 500;
  const retryAfterMs = error?.retryAfterMs || 0;
  const isTimeout = error?.status === 504 || (error?.message || '').includes('timeout');

  let errorType: string;
  if (isCooldown) errorType = 'all_keys_in_cooldown';
  else if (isUpstream503) errorType = 'upstream_503';
  else if (isUpstream500) errorType = 'upstream_500';
  else if (isTimeout) errorType = 'timeout';
  else errorType = String(error?.status || 'ERR');

  return { errorType, retryAfterMs, isCooldown, isUpstream503, isUpstream500, isTimeout };
}

// ── 퍼센트 유틸 ──
function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 100;
}

// ── Auto tier 결정 ──
// hero/sub 모두 상황 기반으로 시작 tier를 결정한다.
// "hero=PRO 고정" 편향을 제거하고, upstream 상태를 반영한다.
function resolveStartTier(role: ImageRole, demoSafe: boolean): ModelTier {
  const now = Date.now();

  // demo-safe 모드: 항상 NB2 (빠른 경로)
  if (demoSafe) return 'nb2';

  // PRO가 현재 cooldown 상태면 NB2로 시작
  if (_cooldownUntil.pro > now) {
    console.info(`[IMG-TIER] role=${role} → nb2 (pro in cooldown, ${Math.round((_cooldownUntil.pro - now) / 1000)}s remaining)`);
    return 'nb2';
  }

  // 세션 내 최근 PRO 실패율 확인: 최근 3회 중 2회 이상 실패면 NB2 우선
  const recentHistory = _sessionStats.history.slice(-3);
  if (recentHistory.length >= 2) {
    const recentProFails = recentHistory.filter(h =>
      h.failReasons.includes('upstream_503') ||
      h.failReasons.includes('timeout') ||
      h.failReasons.includes('all_keys_in_cooldown')
    ).length;
    if (recentProFails >= 2) {
      console.info(`[IMG-TIER] role=${role} → nb2 (recent ${recentProFails}/3 sessions had failures)`);
      return 'nb2';
    }
  }

  // hero: PRO 사용 가능 상태이면 PRO 시도 (단, 위 조건에서 걸러지면 NB2)
  if (role === 'hero') return 'pro';

  // sub: 항상 NB2 우선
  return 'nb2';
}

// =============================================
// 🎨 generateBlogImage — auto-tier 이미지 생성
// =============================================

export const generateBlogImage = async (
  promptText: string,
  style: ImageStyle,
  aspectRatio: string = "16:9",
  customStylePrompt?: string,
  mode: ImageGenMode = 'auto',
  role: ImageRole = 'sub'
): Promise<BlogImageOutput> => {
  const timeout = IMAGE_TIMEOUT[mode][role];
  const styleKw = customStylePrompt || STYLE_KEYWORD_SHORT[style] || STYLE_KEYWORD_SHORT.illustration;
  const demoSafe = isDemoSafeMode();
  const isHero = role === 'hero';

  // ── 공통 제약 ──
  const COMMON_CONSTRAINTS = 'No text, no letters, no typography, no watermark, no logo. No hanbok, no traditional clothing, no cultural costume, no historical styling, no wedding styling, no festival styling. No exaggerated poses, no glamorous fashion portrait.';

  // ── 프롬프트 전략 ──
  const heroPrompt = `Generate a 16:9 landscape editorial image for a Korean medical/dental health blog.
[Subject] ${promptText}
[Person] Modern Korean adult with natural Korean facial features, wearing contemporary everyday clothing or realistic medical attire.
[Atmosphere] Calm, trustworthy, realistic editorial photo. The setting should match the subject — hospital/clinic if about treatment, home/daily life if about prevention or symptoms.
[Style] ${customStylePrompt || BLOG_IMAGE_STYLE_COMPACT[style] || BLOG_IMAGE_STYLE_COMPACT.illustration}
[Rules] ${COMMON_CONSTRAINTS}`.trim();

  const subPrompt = `Korean health blog image: ${promptText.substring(0, 140)}. Modern Korean adult, natural Korean facial features, contemporary clothing. ${styleKw}. ${COMMON_CONSTRAINTS} 16:9.`.trim();
  const ultraMinimal = `${promptText.substring(0, 80)}. Modern Korean adult. ${styleKw}. No text, no watermark, no hanbok. 16:9.`.trim();

  // ── auto tier 결정 ──
  const startTier = resolveStartTier(role, demoSafe);
  const wallCapMs = isHero ? 50_000 : 30_000;
  console.info(`[IMG-TIER] role=${role} startTier=${startTier} mode=${mode} timeout=${timeout}ms wallCap=${wallCapMs / 1000}s`);

  // ── 시도 체인: startTier에 따라 동적으로 구성 ──
  let chain: AttemptDef[];

  if (isHero) {
    // hero: fast-success-first 전략
    // NB2로 먼저 빠르게 시도 → 실패 시 PRO 또는 축소 프롬프트로 재시도
    // 이전 pro-first 전략은 hero wall time의 대부분을 첫 시도에서 소비하여
    // fallback이 사실상 실패하는 구조적 문제가 있었음
    if (startTier === 'pro') {
      chain = [
        { model: GEMINI_MODEL.IMAGE_FLASH, tier: 'nb2', prompt: heroPrompt, label: '#1(nb2-fast)' },
        { model: GEMINI_MODEL.IMAGE_PRO, tier: 'pro', prompt: heroPrompt, label: '#2(pro-quality)' },
      ];
    } else {
      chain = [
        { model: GEMINI_MODEL.IMAGE_FLASH, tier: 'nb2', prompt: heroPrompt, label: '#1(nb2-hero)' },
        { model: GEMINI_MODEL.IMAGE_FLASH, tier: 'nb2', prompt: ultraMinimal, label: '#2(nb2-minimal)' },
      ];
    }
  } else {
    // sub: 항상 NB2 우선
    chain = [
      { model: GEMINI_MODEL.IMAGE_FLASH, tier: 'nb2', prompt: subPrompt, label: '#1(nb2)' },
      { model: GEMINI_MODEL.IMAGE_FLASH, tier: 'nb2', prompt: ultraMinimal, label: '#2(nb2-retry)' },
    ];
  }

  const maxAttempts = chain.length;

  // ── wall time cap: hero 50s / sub 30s (sub는 속도 우선, 빠른 fallback) ──
  const WALL_TIME_CAP_MS = wallCapMs;
  const wallStart = Date.now();

  let lastError: any = null;
  const debug = isImgDebug();
  const attemptLog: { errorType: string; retryAfterMs: number; tier: ModelTier; ms: number }[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (Date.now() - wallStart > WALL_TIME_CAP_MS) {
      if (debug) console.debug(`[IMG-WALL] wall time cap ${WALL_TIME_CAP_MS}ms exceeded, skipping to template`);
      break;
    }
    const def = chain[attempt];
    const t0 = Date.now();
    const tier = def.tier;

    try {
      const result = await callGeminiRaw(def.model, {
        contents: [{ role: "user", parts: [{ text: def.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.6,
        },
      }, timeout);

      const ms = Date.now() - t0;
      const finishReason = result?.candidates?.[0]?.finishReason;

      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        lastError = new Error(`SAFETY:${finishReason}`);
        attemptLog.push({ errorType: `SAFETY:${finishReason}`, retryAfterMs: 0, tier, ms });
        if (debug) console.debug(`[IMG-TRY] type=${role} attempt=${attempt + 1} tier=${tier} errorType=SAFETY:${finishReason} ${ms}ms`);
        if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const imagePart = (result?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
      if (imagePart?.inlineData) {
        console.info(`[IMG-FINAL] type=${role} result=ai-image tier=${tier} attempt=${attempt + 1} ${ms}ms`);
        return {
          data: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`,
          modelTier: tier,
          attemptIndex: attempt + 1,
          resultType: 'ai-image',
        };
      }

      lastError = new Error('no image data');
      attemptLog.push({ errorType: 'no_data', retryAfterMs: 0, tier, ms });
      if (debug) console.debug(`[IMG-TRY] type=${role} attempt=${attempt + 1} tier=${tier} errorType=no_data ${ms}ms`);
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 1000));

    } catch (error: any) {
      lastError = error;
      const ms = Date.now() - t0;
      const parsed = parseImageError(error);
      attemptLog.push({ errorType: parsed.errorType, retryAfterMs: parsed.retryAfterMs, tier, ms });

      if (debug) console.debug(`[IMG-TRY] type=${role} attempt=${attempt + 1} tier=${tier} errorType=${parsed.errorType} ${ms}ms${parsed.retryAfterMs ? ` retryAfterMs=${parsed.retryAfterMs}` : ''}`);

      if (parsed.isUpstream500) {
        console.error(`[IMG-TRY] upstream_500 detected — possible proxy/code bug. model=${def.model} status=${error?.status}`);
      }

      if (parsed.isCooldown || error?.nextAvailableAt || parsed.retryAfterMs) {
        reportCooldown(tier, error?.nextAvailableAt, parsed.retryAfterMs);
      }

      if (attempt < maxAttempts - 1) {
        const nextTier = chain[attempt + 1]?.tier;
        const isCrossTier = nextTier && nextTier !== tier;

        // sub에서 서버 과부하(timeout/503/cooldown) → 2차 시도 건너뛰고 바로 template
        // 같은 서버에 같은 tier로 재시도해도 다시 timeout될 확률이 높아 wall time만 낭비
        // SAFETY/RECITATION/no_data 등 프롬프트 문제는 ultra-minimal로 재시도 가치 있음
        if (!isHero && !isCrossTier && (parsed.isTimeout || parsed.isUpstream503 || parsed.isCooldown)) {
          console.info(`[IMG-SKIP-RETRY] type=${role} reason=${parsed.errorType} → skip remaining attempts, fast-template`);
          break;
        }

        // 빠른 downgrade: 503/504/timeout/cooldown → 즉시 다음 시도로 전환
        if (isCrossTier) {
          // cross-tier 전환은 대기 없이 즉시
          console.info(`[IMG-DOWNGRADE] type=${role} from=${tier} to=${nextTier} reason=${parsed.errorType}`);
        } else if (parsed.isCooldown) {
          // cooldown: 최소 대기 (기존 8-10s → 2-3s)
          const waitMs = Math.min(parsed.retryAfterMs || 2000, 3000) + Math.random() * 500;
          if (debug) console.debug(`[IMG-WAIT] cooldown ${Math.round(waitMs)}ms tier=${tier}`);
          await new Promise(r => setTimeout(r, waitMs));
        } else if (parsed.isUpstream503 || parsed.isTimeout) {
          // 503/timeout: 즉시 다음 시도 (backoff 제거 — wall cap이 시간 제한)
          if (debug) console.debug(`[IMG-WAIT] fast-skip reason=${parsed.errorType} tier=${tier}`);
          await new Promise(r => setTimeout(r, 500));
        } else {
          // 기타 에러: 짧은 대기
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  // ── AI 모두 실패 → 보조 비주얼 모드 (template) ──
  const wallElapsed = Date.now() - wallStart;
  const tierPath = attemptLog.map(e => `${e.tier}:${e.errorType}`).join('→');
  const templateData = generateTemplateFallback(promptText, style, role);
  if (isHero) {
    console.warn(`[IMG-FINAL] type=hero result=TEMPLATE (hero AI 실패) tierPath=[${tierPath}] attempts=${attemptLog.length} wallTime=${Math.round(wallElapsed / 1000)}s`);
  } else {
    console.info(`[IMG-FINAL] type=${role} result=template tierPath=[${tierPath}] attempts=${attemptLog.length} wallTime=${Math.round(wallElapsed / 1000)}s`);
  }
  return {
    data: templateData,
    modelTier: attemptLog[attemptLog.length - 1]?.tier || 'pro',
    attemptIndex: attemptLog.length,
    resultType: 'template',
  };
};

// =============================================
// 🖼️ generateImageQueue — cooldown-aware 큐 + 제한 병렬
// =============================================

export async function generateImageQueue(
  items: ImageQueueItem[],
  onProgress?: (msg: string) => void,
): Promise<ImageQueueResult[]> {
  const totalImages = items.length;
  const mode = isDemoSafeMode() ? 'demo-safe' : 'normal';
  const safeProgress = onProgress || ((msg: string) => console.log('📍 IMG:', msg));

  const heroCount = items.filter(i => i.role === 'hero').length;
  const subCount = items.filter(i => i.role === 'sub').length;

  console.info(`[IMG-PLAN] total=${totalImages} hero=${heroCount} sub=${subCount} mode=${mode} proConcurrency=${TIER_CONCURRENCY.pro} nb2Concurrency=${TIER_CONCURRENCY.nb2}`);
  safeProgress(`🎨 이미지 ${totalImages}장 생성 시작 (hero ${heroCount} + sub ${subCount})...`);

  // hero 우선 정렬
  const sorted = [...items].sort((a, b) => {
    if (a.role === 'hero' && b.role !== 'hero') return -1;
    if (a.role !== 'hero' && b.role === 'hero') return 1;
    return a.index - b.index;
  });

  const demoSafe = isDemoSafeMode();
  if (isImgDebug()) {
    sorted.forEach(item => {
      const tier = resolveStartTier(item.role, demoSafe);
      console.debug(`[IMG-ROUTE] idx=${item.index} type=${item.role} tier=${tier}`);
    });
  }

  const results: ImageQueueResult[] = [];

  const tasks = sorted.map(async (item) => {
    const initialTier: ModelTier = resolveStartTier(item.role, demoSafe);
    const { queueWaitMs } = await acquireImageSlot(item.index, totalImages, item.role, initialTier);

    safeProgress(`🎨 이미지 ${item.index + 1}/${totalImages}장 생성 중 (${item.role})...`);
    const t0 = Date.now();

    try {
      const imgResult = await generateBlogImage(
        item.prompt, item.style, item.aspectRatio,
        item.customStylePrompt, item.mode, item.role
      );
      const elapsedMs = Date.now() - t0;
      const isAi = imgResult.resultType === 'ai-image';

      const elapsedSec = Math.round(elapsedMs / 1000);
      if (isAi) {
        safeProgress(`✅ 이미지 ${item.index + 1}/${totalImages}장 완료 (${elapsedSec}초)`);
      } else {
        safeProgress(`🎨 이미지 ${item.index + 1}/${totalImages}장 대체 렌더 적용 (${elapsedSec}초)`);
      }

      results.push({
        index: item.index, data: imgResult.data, prompt: item.prompt,
        role: item.role,
        status: isAi ? 'success' : 'fallback',
        resultType: imgResult.resultType,
        elapsedMs, queueWaitMs,
        modelTier: imgResult.modelTier, attemptIndex: imgResult.attemptIndex,
      });
    } catch (err: any) {
      const elapsedMs = Date.now() - t0;
      const errorType = err?.errorType || (err?.isCooldown ? 'cooldown' : String(err?.status || 'unknown'));

      if (err?.isCooldown || err?.nextAvailableAt || err?.retryAfterMs) {
        reportCooldown(initialTier, err.nextAvailableAt, err.retryAfterMs);
      }

      const templateData = generateTemplateFallback(item.prompt, item.style, item.role);
      console.info(`[IMG-FINAL] idx=${item.index} type=${item.role} result=template reason=exception errorType=${errorType} ${elapsedMs}ms`);

      results.push({
        index: item.index, data: templateData, prompt: item.prompt,
        role: item.role, status: 'fallback', resultType: 'template',
        elapsedMs, queueWaitMs, errorType,
      });
    } finally {
      releaseImageSlot(initialTier);
    }
  });

  await Promise.allSettled(tasks);
  results.sort((a, b) => a.index - b.index);

  // ── [IMG-SUMMARY] 세분화 지표 ──
  const heroResults = results.filter(r => r.role === 'hero');
  const subResults = results.filter(r => r.role === 'sub');

  const aiCount = results.filter(r => r.resultType === 'ai-image').length;
  const templateCount = results.filter(r => r.resultType === 'template').length;
  const placeholderCount = results.filter(r => r.resultType === 'placeholder').length;
  const nonPlaceholder = aiCount + templateCount;

  const heroAi = heroResults.filter(r => r.resultType === 'ai-image').length;
  const heroTemplate = heroResults.filter(r => r.resultType === 'template').length;
  const subAi = subResults.filter(r => r.resultType === 'ai-image').length;

  const metrics = {
    completionRate:       pct(nonPlaceholder, totalImages),
    aiCoverageRate:       pct(aiCount, totalImages),
    heroAIHitRate:        pct(heroAi, heroResults.length),
    subAICoverageRate:    pct(subAi, subResults.length),
    templateFallbackRate: pct(templateCount, totalImages),
    placeholderRate:      pct(placeholderCount, totalImages),
  };

  const proSuccess = results.filter(r => r.modelTier === 'pro' && r.resultType === 'ai-image').length;
  const nb2Success = results.filter(r => r.modelTier === 'nb2' && r.resultType === 'ai-image').length;
  const crossTier = results.filter(r =>
    (r.role === 'hero' && r.modelTier === 'nb2' && r.resultType === 'ai-image') ||
    (r.role === 'sub' && r.modelTier === 'pro' && r.resultType === 'ai-image')
  ).length;

  const failReasons = results
    .filter(r => r.errorType)
    .reduce((acc, r) => { acc[r.errorType!] = (acc[r.errorType!] || 0) + 1; return acc; }, {} as Record<string, number>);

  const totalElapsed = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  console.info(`[IMG-SUMMARY] ═══════════════════════════════════════`);
  console.info(`[IMG-SUMMARY] total=${totalImages} ai=${aiCount} template=${templateCount} placeholder=${placeholderCount}`);
  console.info(`[IMG-SUMMARY] completionRate=${metrics.completionRate}% aiCoverage=${metrics.aiCoverageRate}% templateFallback=${metrics.templateFallbackRate}% placeholder=${metrics.placeholderRate}%`);
  console.info(`[IMG-SUMMARY] heroAIHitRate=${metrics.heroAIHitRate}% (${heroAi}/${heroResults.length}) subAICoverage=${metrics.subAICoverageRate}% (${subAi}/${subResults.length})`);
  if (heroTemplate > 0) {
    console.warn(`[IMG-SUMMARY] ⚠️ HERO_TEMPLATE_FALLBACK hero=${heroTemplate}건 — hero 품질 저하 (AI 미생성)`);
  }
  console.info(`[IMG-SUMMARY] tierStats: pro=${proSuccess} nb2=${nb2Success} crossTier=${crossTier}`);
  if (Object.keys(failReasons).length > 0) {
    console.info(`[IMG-SUMMARY] failReasons: ${Object.entries(failReasons).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  console.info(`[IMG-SUMMARY] totalMs=${totalElapsed} mode=${mode}`);
  console.info(`[IMG-SUMMARY] perImage: ${results.map(r => `idx${r.index}(${r.role}/${r.modelTier || '?'})=${r.resultType}/${r.elapsedMs}ms`).join(' | ')}`);
  console.info(`[IMG-SUMMARY] ═══════════════════════════════════════`);

  // 세션 누적 통계
  accumulateSessionStats(results, totalElapsed, mode);

  return results;
}

// =============================================
// 세션 누적 통계 (SessionStats)
// =============================================

interface SessionStatsData {
  runs: number;
  totalImages: number;
  aiCount: number;
  templateCount: number;
  placeholderCount: number;
  heroTotal: number;
  heroAi: number;
  heroTemplate: number;
  subTotal: number;
  subAi: number;
  proSuccess: number;
  nb2Success: number;
  crossTier: number;
  totalMs: number;
  failReasons: Record<string, number>;
  heroWallTimeMs: number[];
  payloadKB: number[];
  history: Array<{
    ts: string;
    total: number;
    ai: number;
    template: number;
    placeholder: number;
    heroResult: string;
    totalMs: number;
    heroMaxMs: number;
    payloadKB: number;
    failReasons: string;
  }>;
}

const _sessionStats: SessionStatsData = {
  runs: 0, totalImages: 0, aiCount: 0, templateCount: 0, placeholderCount: 0,
  heroTotal: 0, heroAi: 0, heroTemplate: 0,
  subTotal: 0, subAi: 0,
  proSuccess: 0, nb2Success: 0, crossTier: 0,
  totalMs: 0, failReasons: {},
  heroWallTimeMs: [], payloadKB: [],
  history: [],
};

function accumulateSessionStats(results: ImageQueueResult[], totalMs: number, mode: string): void {
  const s = _sessionStats;
  s.runs++;
  s.totalImages += results.length;
  s.totalMs += totalMs;

  const heroR = results.filter(r => r.role === 'hero');
  const subR = results.filter(r => r.role === 'sub');

  const ai = results.filter(r => r.resultType === 'ai-image').length;
  const tpl = results.filter(r => r.resultType === 'template').length;
  const ph = results.filter(r => r.resultType === 'placeholder').length;

  s.aiCount += ai;
  s.templateCount += tpl;
  s.placeholderCount += ph;
  s.heroTotal += heroR.length;
  s.heroAi += heroR.filter(r => r.resultType === 'ai-image').length;
  s.heroTemplate += heroR.filter(r => r.resultType === 'template').length;
  s.subTotal += subR.length;
  s.subAi += subR.filter(r => r.resultType === 'ai-image').length;
  s.proSuccess += results.filter(r => r.modelTier === 'pro' && r.resultType === 'ai-image').length;
  s.nb2Success += results.filter(r => r.modelTier === 'nb2' && r.resultType === 'ai-image').length;
  s.crossTier += results.filter(r =>
    (r.role === 'hero' && r.modelTier === 'nb2' && r.resultType === 'ai-image') ||
    (r.role === 'sub' && r.modelTier === 'pro' && r.resultType === 'ai-image')
  ).length;

  results.filter(r => r.errorType).forEach(r => {
    s.failReasons[r.errorType!] = (s.failReasons[r.errorType!] || 0) + 1;
  });

  const heroMaxMs = heroR.length > 0
    ? Math.max(...heroR.map(r => r.elapsedMs + r.queueWaitMs))
    : 0;
  if (heroMaxMs > 0) s.heroWallTimeMs.push(heroMaxMs);

  const runFailReasons = results.filter(r => r.errorType).map(r => r.errorType).join(',');
  const heroResult = heroR.length > 0
    ? heroR.map(r => r.resultType).join(',')
    : 'none';
  s.history.push({
    ts: new Date().toISOString().substring(11, 19),
    total: results.length, ai, template: tpl, placeholder: ph,
    heroResult, totalMs, heroMaxMs, payloadKB: 0,
    failReasons: runFailReasons || '-',
  });

  try {
    (window as any).__IMG_SESSION_STATS = s;
    (window as any).__IMG_PRINT_STATS = printSessionSummary;
    (window as any).__IMG_RESET_STATS = resetImageSessionStats;
  } catch { /* SSR safe */ }

  if (s.runs % 5 === 0 || s.runs === 1) {
    printSessionSummary();
  } else {
    console.info(`[IMG-SESSION] run=${s.runs} (next session summary at run=${Math.ceil(s.runs / 5) * 5})`);
  }
}

function printSessionSummary(): void {
  const s = _sessionStats;
  const avgMs = s.runs > 0 ? Math.round(s.totalMs / s.runs) : 0;

  console.info(`[IMG-SESSION] ═══════════════════════════════════════════`);
  console.info(`[IMG-SESSION] 누적 통계 (${s.runs}회 실행)`);
  console.info(`[IMG-SESSION]`);
  console.info(`[IMG-SESSION]   📊 KPI`);
  console.info(`[IMG-SESSION]   heroAIHitRate     ${pct(s.heroAi, s.heroTotal)}%  (${s.heroAi}/${s.heroTotal})`);
  console.info(`[IMG-SESSION]   aiCoverageRate    ${pct(s.aiCount, s.totalImages)}%  (${s.aiCount}/${s.totalImages})`);
  console.info(`[IMG-SESSION]   completionRate    ${pct(s.aiCount + s.templateCount, s.totalImages)}%`);
  console.info(`[IMG-SESSION]   templateRate      ${pct(s.templateCount, s.totalImages)}%  (${s.templateCount})`);
  console.info(`[IMG-SESSION]   placeholderRate   ${pct(s.placeholderCount, s.totalImages)}%  (${s.placeholderCount})`);
  console.info(`[IMG-SESSION]   avgTimePerRun     ${avgMs}ms  (${(avgMs / 1000).toFixed(1)}s)`);
  if (s.heroTemplate > 0) {
    console.warn(`[IMG-SESSION]   ⚠️ heroTemplateFallback=${s.heroTemplate}건`);
  }
  console.info(`[IMG-SESSION]`);

  if (s.heroWallTimeMs.length > 0) {
    const sorted = [...s.heroWallTimeMs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const over50s = sorted.filter(ms => ms > 50000).length;
    console.info(`[IMG-SESSION]   🕐 hero wallTime (cap=50s)`);
    console.info(`[IMG-SESSION]   median=${(median / 1000).toFixed(1)}s  p95=${(p95 / 1000).toFixed(1)}s  max=${(max / 1000).toFixed(1)}s  over50s=${over50s}/${sorted.length}`);
  }

  const validPayloads = s.payloadKB.filter(kb => kb >= 0);
  if (validPayloads.length > 0) {
    const avgKB = Math.round(validPayloads.reduce((a, b) => a + b, 0) / validPayloads.length);
    const maxKB = Math.max(...validPayloads);
    const over100KB = validPayloads.filter(kb => kb > 100).length;
    console.info(`[IMG-SESSION]`);
    console.info(`[IMG-SESSION]   📦 finalPayload (저장 HTML 기준)`);
    console.info(`[IMG-SESSION]   avgFinalPayloadKB=${avgKB}  maxFinalPayloadKB=${maxKB}  over100KB=${over100KB}/${validPayloads.length}`);
  }

  console.info(`[IMG-SESSION]`);
  console.info(`[IMG-SESSION]   🔧 tier`);
  console.info(`[IMG-SESSION]   pro=${s.proSuccess}  nb2=${s.nb2Success}  crossTier=${s.crossTier}`);
  console.info(`[IMG-SESSION]   sub: ai=${s.subAi}/${s.subTotal} (${pct(s.subAi, s.subTotal)}%)`);
  if (Object.keys(s.failReasons).length > 0) {
    console.info(`[IMG-SESSION]   failReasons: ${Object.entries(s.failReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  console.info(`[IMG-SESSION]`);
  console.info(`[IMG-SESSION]   📋 history (${s.history.length}건)`);
  console.info(`[IMG-SESSION]   #    time      tot  ai  tpl  ph  hero          ms     heroMs  payKB  fail`);
  s.history.forEach((h, i) => {
    const heroIcon = h.heroResult === 'ai-image' ? '✅' : h.heroResult === 'template' ? '⚠️' : '❌';
    console.info(`[IMG-SESSION]   ${String(i + 1).padStart(3)}  ${h.ts}  ${String(h.total).padStart(3)}  ${String(h.ai).padStart(2)}  ${String(h.template).padStart(3)}  ${String(h.placeholder).padStart(2)}  ${heroIcon} ${h.heroResult.padEnd(10)}  ${String(h.totalMs).padStart(6)}  ${String(h.heroMaxMs).padStart(6)}  ${String(h.payloadKB).padStart(5)}  ${h.failReasons}`);
  });
  console.info(`[IMG-SESSION] ═══════════════════════════════════════════`);

  if (s.runs >= BETA_CRITERIA.minRuns) {
    printBetaVerdict();
  } else {
    console.info(`[IMG-SESSION] 베타 판정까지 ${BETA_CRITERIA.minRuns - s.runs}회 더 필요`);
  }
}

/** 세션 통계 수동 출력 */
export function printImageSessionStats(): void {
  printSessionSummary();
}

/**
 * 최종 저장 HTML 기준으로 payload 크기를 기록
 */
export function updateSessionFinalPayload(persistedHtmlKB: number, finalPayloadKB: number): void {
  const s = _sessionStats;
  if (s.payloadKB.length > 0) {
    s.payloadKB[s.payloadKB.length - 1] = finalPayloadKB;
  } else {
    s.payloadKB.push(finalPayloadKB);
  }
  if (s.history.length > 0) {
    s.history[s.history.length - 1].payloadKB = finalPayloadKB;
  }
  console.info(`[IMG-SESSION] 📦 finalPayload 갱신: persistedHtmlKB=${persistedHtmlKB} finalPayloadKB=${finalPayloadKB}`);
}

/** 세션 통계 리셋 */
export function resetImageSessionStats(): void {
  Object.assign(_sessionStats, {
    runs: 0, totalImages: 0, aiCount: 0, templateCount: 0, placeholderCount: 0,
    heroTotal: 0, heroAi: 0, heroTemplate: 0,
    subTotal: 0, subAi: 0,
    proSuccess: 0, nb2Success: 0, crossTier: 0,
    totalMs: 0, failReasons: {},
    heroWallTimeMs: [], payloadKB: [],
    history: [],
  });
  console.info('[IMG-SESSION] stats reset');
}

// ── 베타 판정 ──

const BETA_CRITERIA = {
  minRuns:              20,
  heroAIHitRate:        80,
  aiCoverageRate:       60,
  completionRate:       95,
  placeholderRate:       5,
  avgTimePerRunMs:  120000,
} as const;

interface BetaVerdict {
  pass: boolean;
  runsEnough: boolean;
  details: Record<string, { value: number; threshold: number; unit: string; pass: boolean }>;
}

function evaluateBetaCriteria(): BetaVerdict {
  const s = _sessionStats;
  const runsEnough = s.runs >= BETA_CRITERIA.minRuns;

  const heroAIHit = pct(s.heroAi, s.heroTotal);
  const aiCoverage = pct(s.aiCount, s.totalImages);
  const completion = pct(s.aiCount + s.templateCount, s.totalImages);
  const placeholder = pct(s.placeholderCount, s.totalImages);
  const avgTime = s.runs > 0 ? Math.round(s.totalMs / s.runs) : 0;

  const details = {
    heroAIHitRate:   { value: heroAIHit,   threshold: BETA_CRITERIA.heroAIHitRate,     unit: '%',  pass: heroAIHit >= BETA_CRITERIA.heroAIHitRate },
    aiCoverageRate:  { value: aiCoverage,  threshold: BETA_CRITERIA.aiCoverageRate,    unit: '%',  pass: aiCoverage >= BETA_CRITERIA.aiCoverageRate },
    completionRate:  { value: completion,  threshold: BETA_CRITERIA.completionRate,    unit: '%',  pass: completion >= BETA_CRITERIA.completionRate },
    placeholderRate: { value: placeholder, threshold: BETA_CRITERIA.placeholderRate,   unit: '%',  pass: placeholder <= BETA_CRITERIA.placeholderRate },
    avgTimePerRun:   { value: avgTime,     threshold: BETA_CRITERIA.avgTimePerRunMs,   unit: 'ms', pass: avgTime <= BETA_CRITERIA.avgTimePerRunMs },
  };

  const allPass = Object.values(details).every(d => d.pass);
  return { pass: runsEnough && allPass, runsEnough, details };
}

function printBetaVerdict(): void {
  const v = evaluateBetaCriteria();
  const s = _sessionStats;

  console.info(`[IMG-BETA] ═══════════════════════════════════════════`);
  console.info(`[IMG-BETA] 내부 베타(10명) 통과 판정 — ${s.runs}회 실행`);

  if (!v.runsEnough) {
    console.warn(`[IMG-BETA] ⏳ 데이터 부족: ${s.runs}/${BETA_CRITERIA.minRuns}회 (최소 ${BETA_CRITERIA.minRuns}회 필요)`);
  }

  for (const [key, d] of Object.entries(v.details)) {
    const icon = d.pass ? '✅' : '❌';
    const cmp = key === 'placeholderRate' || key === 'avgTimePerRun'
      ? `≤${d.threshold}${d.unit}`
      : `≥${d.threshold}${d.unit}`;
    console.info(`[IMG-BETA]   ${icon} ${key}: ${d.value}${d.unit} (기준 ${cmp})`);
  }

  if (v.pass) {
    console.info(`[IMG-BETA] 🎉 PASS — 내부 베타 배포 가능`);
  } else if (v.runsEnough) {
    const fails = Object.entries(v.details).filter(([, d]) => !d.pass).map(([k]) => k);
    console.warn(`[IMG-BETA] ❌ FAIL — 미달 항목: ${fails.join(', ')}`);
  }
  console.info(`[IMG-BETA] ═══════════════════════════════════════════`);
}

// ── TSV export / 클립보드 ──

function exportSessionStatsTSV(): string {
  const s = _sessionStats;
  const header = ['run', 'time', 'total', 'ai', 'template', 'placeholder', 'hero', 'ms', 'failReasons'].join('\t');
  const rows = s.history.map((h, i) =>
    [i + 1, h.ts, h.total, h.ai, h.template, h.placeholder, h.heroResult, h.totalMs, h.failReasons].join('\t')
  );

  const heroAIHit = pct(s.heroAi, s.heroTotal);
  const aiCoverage = pct(s.aiCount, s.totalImages);
  const completion = pct(s.aiCount + s.templateCount, s.totalImages);
  const avgTime = s.runs > 0 ? Math.round(s.totalMs / s.runs) : 0;
  rows.push('');
  rows.push(['SUMMARY', '', s.totalImages, s.aiCount, s.templateCount, s.placeholderCount, `heroAI=${heroAIHit}%`, avgTime, `aiCov=${aiCoverage}% comp=${completion}%`].join('\t'));

  return [header, ...rows].join('\n');
}

async function copySessionStatsToClipboard(): Promise<void> {
  const tsv = exportSessionStatsTSV();
  try {
    await navigator.clipboard.writeText(tsv);
    console.info(`[IMG-SESSION] 📋 ${_sessionStats.runs}회 데이터 클립보드에 복사 완료`);
  } catch {
    console.info(`[IMG-SESSION] 클립보드 접근 불가 — 아래 데이터를 수동 복사:`);
    console.info(tsv);
  }
}

// ── 벤치마크 ──

const BENCHMARK_PROMPTS = [
  '무릎 관절 치환술 후 재활 과정과 주의사항',
  '소아 치과 정기검진의 중요성과 올바른 양치법',
  '위내시경 검사 전 준비사항과 검사 과정',
  '허리 디스크 비수술 치료법 비교',
  '임플란트 시술 과정과 관리법',
  '아토피 피부염 관리와 생활습관 개선',
  '고혈압 약 복용 시 주의사항',
  '백내장 수술 후 회복 과정',
  '턱관절 장애 증상과 치료법',
  '만성 두통의 원인과 진단 방법',
];

async function runImageBenchmark(
  rounds: number = 1,
  imagesPerRound: number = 5,
  style: ImageStyle = 'illustration',
): Promise<void> {
  console.info(`[IMG-BENCH] ═══════════════════════════════════════════`);
  console.info(`[IMG-BENCH] 벤치마크 시작: ${rounds}회 × ${imagesPerRound}장`);
  console.info(`[IMG-BENCH] ═══════════════════════════════════════════`);

  for (let r = 0; r < rounds; r++) {
    const topic = BENCHMARK_PROMPTS[r % BENCHMARK_PROMPTS.length];
    console.info(`[IMG-BENCH] round ${r + 1}/${rounds}: "${topic.substring(0, 30)}..."`);

    const items: ImageQueueItem[] = [];
    for (let i = 0; i < imagesPerRound; i++) {
      const isHero = i === 0;
      const prompt = isHero
        ? `${topic} 대표 이미지, 전문적이고 신뢰감 있는 분위기`
        : `${topic} 관련 보조 이미지 ${i}`;
      items.push({
        index: i,
        prompt,
        role: isHero ? 'hero' : 'sub',
        style,
        aspectRatio: '16:9',
        mode: 'auto',
      });
    }

    await generateImageQueue(items);

    if (r < rounds - 1) {
      const gap = 3000 + Math.random() * 2000;
      console.info(`[IMG-BENCH] round gap ${Math.round(gap)}ms...`);
      await new Promise(resolve => setTimeout(resolve, gap));
    }
  }

  console.info(`[IMG-BENCH] ═══════════════════════════════════════════`);
  console.info(`[IMG-BENCH] 벤치마크 완료: ${rounds}회`);
  console.info(`[IMG-BENCH] ═══════════════════════════════════════════`);

  printSessionSummary();
  printBetaVerdict();
}

// ── SaaS 품질 검증 ──

async function verifySaaSQuality(rounds: number = 3): Promise<void> {
  resetImageSessionStats();
  console.info(`[VERIFY] SaaS 품질 검증 시작: ${rounds}회`);
  await runImageBenchmark(rounds, 3);

  const s = _sessionStats;
  const heroWallMax = s.heroWallTimeMs.length > 0 ? Math.max(...s.heroWallTimeMs) : 0;
  const validPayloads = s.payloadKB.filter(kb => kb >= 0);
  const payloadMax = validPayloads.length > 0 ? Math.max(...validPayloads) : 0;
  const payloadAvg = validPayloads.length > 0 ? Math.round(validPayloads.reduce((a, b) => a + b, 0) / validPayloads.length) : 0;
  const heroRate = pct(s.heroAi, s.heroTotal);

  const wallPass = heroWallMax <= 55000;
  const payloadPass = payloadMax <= 200;
  const heroPass = heroRate >= 50;
  const completionRate = pct(s.aiCount + s.templateCount, s.totalImages);
  const compPass = completionRate >= 95;
  const allPass = wallPass && payloadPass && compPass;

  console.info(`[VERIFY] ${allPass ? '🎉 SaaS 품질 기준 PASS' : '⚠️ 일부 기준 미달'}`);
}

// ── window 전역 등록 ──
try {
  (window as any).__IMG_BENCHMARK = runImageBenchmark;
  (window as any).__IMG_BETA_CHECK = printBetaVerdict;
  (window as any).__IMG_EXPORT_TSV = exportSessionStatsTSV;
  (window as any).__IMG_COPY_STATS = copySessionStatsToClipboard;
  (window as any).__IMG_VERIFY = verifySaaSQuality;
} catch { /* SSR safe */ }

/**
 * 앱 초기화 시 호출 — 디버그 함수를 window에 등록
 */
export function initImageDebugGlobals(): void {
  try {
    (window as any).__IMG_VERIFY = verifySaaSQuality;
    (window as any).__IMG_PRINT_STATS = printSessionSummary;
    (window as any).__IMG_RESET_STATS = resetImageSessionStats;
    (window as any).__IMG_SESSION_STATS = _sessionStats;
    console.info('[IMG-DEBUG] globals attached: verify/print/reset/session');
  } catch { /* SSR safe */ }
}
