/**
 * LLM 모델 ID alias map + deprecation 추적.
 *
 * 배경 (audit doc #5):
 *   - `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite-preview` 등 preview suffix
 *     모델은 Google 측 GA 전환 시 명칭 변경됨. kill-switch 없는 라우트가 일제히
 *     502 — handoff 2026-05-15 §3.5 와 정합.
 *   - 약 30+ 호출지에 모델 ID 가 hardcode. 호출지 일제 변경은 effort 큼.
 *
 * 본 모듈의 책임:
 *   - `resolveModel(id)` — entry-point 단일 호출. alias 적용 + deprecation warn.
 *   - `DEPRECATED_MODELS` — 옛 모델 set. GA 전환 발견 시 본 set 으로 이동.
 *   - `MODEL_ALIASES` — 옛 → 새 매핑. resolveModel 이 자동 적용.
 *   - 모델 ID 별 1회 warn dedup (모듈 단위 Set) — log 폭주 회피.
 *
 * 호출 패턴:
 *   - `packages/blog-core/src/llm/gemini.ts` / `next-app/lib/geminiDirect.ts` /
 *     `public-app/lib/geminiDirect.ts` 의 model 사용 entry 에서 resolveModel 호출.
 *   - 호출지 (route.ts 들) 는 변경 0 — alias 가 callee 안에서 자동 처리.
 *
 * 회귀 가드: `packages/blog-core/src/__tests__/llmModels.test.ts`.
 */

/**
 * Deprecated 모델 ID set — 호출 시 console.warn 1회 발급.
 *
 * **운영 절차**: Google / Anthropic / OpenAI 의 deprecation 발표 발견 시 본 set 에
 * 모델 ID 추가 + `MODEL_ALIASES` 에 대체 모델 매핑. 코드 호출지 변경 없이 자동 마이그레이션.
 *
 * 현재 활성 preview 모델은 본 set 에 없음 — GA 전환 발표 시 추가.
 */
export const DEPRECATED_MODELS: ReadonlySet<string> = new Set<string>([
  // 예: GA 전환 발표 시 이동
  //   'gemini-3.0-pro',          // → gemini-3.1-pro-preview (alias)
  //   'gemini-2.5-flash',         // → gemini-3.1-flash-lite-preview (alias)
]);

/**
 * 옛 모델 → 새 권장 모델 alias map.
 *
 * resolveModel 이 본 map 으로 자동 substitution. 호출지가 옛 모델 hardcode 해도
 * 실제 API 호출 시 새 모델로 변환.
 *
 * 현재는 empty — GA 전환 발생 시 운영자가 본 map 업데이트.
 */
export const MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // 예시: 'gemini-3.0-pro': 'gemini-3.1-pro-preview',
});

/** 모듈 단위 warn dedup — 같은 모델 ID 에 대한 console.warn 중복 폭주 회피. */
const _warnedModels = new Set<string>();

/**
 * preview suffix 모델 detect — production 운영자가 snapshot pin 안 한 케이스 가시화.
 * 본 함수 단독으론 warn 발생 X — `resolveModel` 의 verbose 옵션에서 사용.
 */
export function isPreviewModel(modelId: string): boolean {
  return /-preview\b/i.test(modelId);
}

/**
 * 모델 ID 의 alias 적용 + deprecation warn.
 *
 * @param modelId 호출지가 지정한 raw 모델 ID
 * @param options.silent — true 면 deprecation warn 도 skip (test 환경).
 * @returns 실제 API 호출에 사용할 resolved 모델 ID. alias 없으면 그대로.
 */
export function resolveModel(modelId: string, options: { silent?: boolean } = {}): string {
  if (!modelId) return modelId;

  // 1) alias resolution
  const aliased = MODEL_ALIASES[modelId] ?? modelId;

  // 2) deprecation warning (모델별 1회, silent 면 skip)
  if (!options.silent && DEPRECATED_MODELS.has(modelId) && !_warnedModels.has(modelId)) {
    _warnedModels.add(modelId);
    // eslint-disable-next-line no-console
    console.warn(
      `[llm/models] Deprecated model in use: '${modelId}'. Resolved to '${aliased}'. ` +
        `See docs/ai-image-pipeline-audit.md #5 — preview-to-GA migration policy.`,
    );
  }

  return aliased;
}

/** 테스트·운영자 진단용 — 모듈 단위 dedup 캐시 reset. */
export function _resetDeprecationWarnCache(): void {
  _warnedModels.clear();
}
