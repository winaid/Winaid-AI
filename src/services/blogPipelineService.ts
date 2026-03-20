/**
 * blogPipelineService.ts — 다단계 파이프라인 블로그 생성
 *
 * Stage A: 아웃라인 생성 (FLASH)
 * Stage B: 섹션별 초안 (FLASH, 병렬)
 * Stage C: 최종 polish (PRO or FLASH)
 *
 * 원본: 구 geminiService.ts에서 분리됨 (2024-03, 현재 독립 모듈)
 * 사용처: core/generation/generateContentJob.ts (_orchestrateBlog 주 경로)
 * 테스트: services/__tests__/pipelineStageC.test.ts
 */
import { GEMINI_MODEL, callGemini } from "./geminiClient";
import { isDemoSafeMode } from "./image/imageOrchestrator";
import { classifySceneType, buildScenePrompt, buildHeroScenePrompt, resolveSceneBucket, SCENE_BUCKETS, CONSULTATION_BUCKETS, detectTopicHint } from "./image/imageRouter";
import { GenerationRequest } from "../types";
import {
  getPipelineOutlinePrompt,
  getPipelineSectionPrompt,
  getPipelineIntroPrompt,
  getPipelineConclusionPrompt,
  getPipelineIntegrationPrompt,
} from "../lib/gpt52-prompts-staged";
import {
  STAGE_A_TIMEOUT_MS,
  STAGE_B_SECTION_TIMEOUT_MS,
  STAGE_B_BATCH_SIZE,
  STAGE_B_INTRO_TIMEOUT_MS,
  STAGE_B_CONCLUSION_TIMEOUT_MS,
  STAGE_C_USE_PRO,
  STAGE_C_PRO_TIMEOUT_MS,
  STAGE_C_FLASH_TIMEOUT_MS,
  STAGE_C_PRO_MIN_CHARS,
  DEFAULT_BLOG_IMAGE_COUNT,
} from "../core/generation/contracts";

export const generateBlogWithPipeline = async (
  request: GenerationRequest,
  searchResults: any,
  onProgress?: (msg: string) => void
): Promise<{ title: string; rawHtml: string; polishPromise: Promise<{ content: string; polishModel: string; finalQualityPath: string; stageCMs: number }>; imagePrompts: string[]; conclusionLength?: number }> => {
  const safeProgress = onProgress || ((msg: string) => console.log('Pipeline:', msg));
  const pipelineStart = Date.now();
  const timings: Record<string, number> = {};
  console.info(`[PIPELINE] ▶ START topic="${request.topic?.substring(0, 30)}"`);
  const targetLength = request.textLength || 1500;
  // LLM은 글자수를 정확히 세지 못해 항상 20~30% 부족하게 생성 → 프롬프트용 목표를 1.35배로 설정
  const promptTargetLength = Math.round(targetLength * 1.35);
  const medicalLawMode = request.medicalLawMode || 'strict';

  // 병원 블로그 학습 말투 로드 — 명시적 선택 시 적용 (learnedStyleId와 독립)
  let hospitalStyleSuffix = '';
  const styleSource = request.hospitalStyleSource || 'generic_default';
  // 조건 완화: 병원명이 있고 명시 선택이면 학습 말투 적용 시도
  // learnedStyleId가 있어도 병원 말투는 별도 레이어로 적용 가능
  if (request.hospitalName && styleSource === 'explicit_selected_hospital') {
    try {
      const { getHospitalStylePromptForGeneration } = await import('./writingStyleService');
      if (typeof getHospitalStylePromptForGeneration !== 'function') {
        console.warn('[PIPELINE] 병원 말투 로드 실패: getHospitalStylePromptForGeneration is not a function');
      } else {
        const prompt = await getHospitalStylePromptForGeneration(request.hospitalName);
        if (prompt) {
          hospitalStyleSuffix = `\n\n[🏥 병원 블로그 학습 말투 - 반드시 적용]\n${prompt}`;
          console.info(`[STYLE] applied=hospital_tone hospital=${request.hospitalName}`);
        } else {
          console.info(`[STYLE] applied=generic_default reason=no_style_data hospital=${request.hospitalName}`);
        }
      }
    } catch (e) {
      console.warn('[STYLE] load_failed:', e);
    }
  } else {
    const reason = !request.hospitalName ? 'no_hospital' : 'not_explicit';
    console.info(`[STYLE] source=generic_default reason=${reason}`);
  }

  // ── Stage A: 아웃라인 생성 (FLASH) ── [재시도 포함]
  const stageAStart = Date.now();
  safeProgress('📐 [1/4] 글 구조 설계 중...');
  const outlinePrompt = getPipelineOutlinePrompt(promptTargetLength, medicalLawMode, {
    audienceMode: request.audienceMode,
    persona: request.persona,
    tone: request.tone,
  });

  const outlineUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}
[진료과] ${request.category}
${request.customSubheadings ? `[사용자 지정 소제목]\n${request.customSubheadings}` : ''}

[검색 결과 요약]
${JSON.stringify(searchResults?.collected_facts?.slice(0, 3) || [], null, 2)}`;

  let outlineResponse: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      outlineResponse = await callGemini({
        prompt: outlineUserPrompt,
        systemPrompt: outlinePrompt,
        model: GEMINI_MODEL.FLASH,
        responseType: 'json',
        timeout: STAGE_A_TIMEOUT_MS,
        temperature: 0.7,
      });
      if (outlineResponse?.outline || outlineResponse?.sections) break;
    } catch (err) {
      if (attempt === 1) throw err;
      safeProgress('⚠️ 아웃라인 재시도 중...');
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const outline = outlineResponse?.outline || outlineResponse;
  if (!outline || !outline.sections || outline.sections.length === 0) {
    throw new Error('아웃라인 생성 실패: 소제목이 없습니다. 다시 시도해주세요.');
  }

  // 소제목 최소 5개 정책: 4개 이하면 경량 보정 시도 (1회)
  if (outline.sections.length < 5) {
    const deficit = 5 - outline.sections.length;
    console.warn(`[PIPELINE] ⚠️ 소제목 ${outline.sections.length}개 — 정책 최소 5개 미달 (부족 ${deficit}개). 보정 시도.`);
    try {
      const repairPrompt = `다음 블로그 아웃라인에 소제목이 ${outline.sections.length}개뿐입니다. ${deficit}개를 추가하여 정확히 5개로 만드세요.
기존 소제목과 내용이 겹치지 않는 새로운 관점의 소제목만 추가하세요.
응답 형식: JSON 배열 [{"title": "소제목", "role": "역할", "keyInfo": "핵심정보"}]

주제: ${request.topic}
기존 소제목: ${outline.sections.map((s: any) => s.title).join(', ')}`;
      const repairResult = await callGemini({
        prompt: repairPrompt,
        systemPrompt: '블로그 소제목 보정 전문가. JSON 배열만 반환하라.',
        model: GEMINI_MODEL.FLASH,
        responseType: 'json',
        timeout: 10_000,
        temperature: 0.7,
      });
      const newSections = Array.isArray(repairResult) ? repairResult : repairResult?.sections || [];
      if (newSections.length > 0) {
        outline.sections.push(...newSections.slice(0, deficit));
        console.info(`[PIPELINE] ✅ 소제목 보정 성공: ${outline.sections.length}개`);
      }
    } catch (repairErr: any) {
      console.warn(`[PIPELINE] ⚠️ 소제목 보정 실패 (원본 유지): ${repairErr?.message?.substring(0, 60)}`);
    }
  }

  // 사용자 지정 소제목이 있으면 아웃라인에 반영
  if (request.customSubheadings) {
    const customTitles = request.customSubheadings.split(/\r?\n/).filter(h => h.trim());
    outline.sections = outline.sections.map((s: any, i: number) => ({
      ...s,
      title: customTitles[i] || s.title
    }));
  }

  // 각 섹션에 글자 수 배분 (프롬프트용 뻥튀기 목표 기준)
  const bodyChars = Math.round(promptTargetLength * 0.7);
  const charsPerSection = Math.round(bodyChars / outline.sections.length);
  outline.sections.forEach((s: any) => { s.targetChars = s.targetChars || charsPerSection; });

  timings.stageA = Date.now() - stageAStart;
  safeProgress(`✅ Stage A 완료: 소제목 ${outline.sections.length}개 설계 (${(timings.stageA / 1000).toFixed(1)}초)`);
  console.info(`[PIPELINE] ✅ Stage A: ${outline.sections.length}개 소제목 ${timings.stageA}ms`);
  const stageBStart = Date.now();

  // ── Stage B: 본문 생성 (배치 병렬) ──
  // 도입부(FLASH) + 첫 번째 섹션 배치를 동시에 시작
  // 섹션은 2개씩 배치 병렬 생성 (이전 배치의 요약만 전달)
  safeProgress('✍️ [2/4] 본문 생성 중...');

  // ── 성능 카운터 ──
  const demoSafe = isDemoSafeMode();
  // 섹션 생성은 FLASH 직행 — PRO는 최종 polish(Stage C)에서만 사용
  console.info(`[PIPELINE] ⚙️ config: sectionModel=FLASH flashTimeoutMs=${STAGE_B_SECTION_TIMEOUT_MS} proPolish=StageC demoSafe=${demoSafe}`);

  // ── 도입부 생성 함수 ──
  const generateIntro = async (): Promise<string> => {
    const t0 = Date.now();
    const introPrompt = getPipelineIntroPrompt(
      outline.intro?.approach || 'A',
      outline.intro?.scene || request.topic,
      outline.intro?.bridge || request.topic,
      outline.intro?.targetChars || Math.round(promptTargetLength * 0.15),
      request.persona,
      request.keywords
    );

    const introUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}

[검색 결과]
${JSON.stringify(searchResults?.collected_facts?.slice(0, 2) || [], null, 2)}`;

    const introResult = await callGemini({
      prompt: introUserPrompt,
      systemPrompt: introPrompt + hospitalStyleSuffix,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: STAGE_B_INTRO_TIMEOUT_MS,
      temperature: 0.85,
    });
    const html = typeof introResult === 'string' ? introResult.trim() : '';
    if (!html || html.length < 30) {
      throw new Error('도입부 생성에 실패했습니다. 다시 시도해주세요.');
    }
    console.info(`[PIPELINE] ✅ intro ${html.length}자 ${Date.now() - t0}ms`);
    return html;
  };

  // ── 단일 섹션 생성 함수 ──
  const generateSection = async (
    i: number,
    prevSummaries: string[]
  ): Promise<{ html: string; summary: string }> => {
    const section = outline.sections[i];
    const sectionNum = `${i + 1}/${outline.sections.length}`;
    const t0 = Date.now();

    const sectionPrompt = getPipelineSectionPrompt(
      i,
      section.title,
      section.role || '',
      section.forbidden || '',
      section.keyInfo || '',
      section.targetChars || charsPerSection,
      section.firstSentencePattern || String((i % 5) + 1),
      prevSummaries,
      medicalLawMode,
      request.persona,
      request.keywords
    );

    const sectionUserPrompt = `[주제] ${request.topic}
[키워드] ${request.keywords || '없음'}
${request.disease ? `[질환] ${request.disease}` : ''}

[이 섹션 관련 검색 결과]
${JSON.stringify(searchResults?.collected_facts?.slice(i, i + 2) || [], null, 2)}`;

    // 섹션 초안은 FLASH 직행 — PRO는 Stage C polish에서 사용
    const sectionSystemPrompt = sectionPrompt + hospitalStyleSuffix;
    const promptLength = sectionSystemPrompt.length + sectionUserPrompt.length;

    const result = await callGemini({
      prompt: sectionUserPrompt,
      systemPrompt: sectionSystemPrompt,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: STAGE_B_SECTION_TIMEOUT_MS,
      temperature: 0.75,
    });
    const html = typeof result === 'string' ? result.trim() : '';
    if (!html || html.length < 30) {
      throw new Error(`소제목 "${section.title}" 생성에 실패했습니다. 다시 시도해주세요.`);
    }
    const summary = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
    const elapsed = Date.now() - t0;
    timings[`section_${i}`] = elapsed;
    console.info(`[PIPELINE] ✅ section ${sectionNum} ${html.length}자 ${elapsed}ms model=FLASH prompt=${promptLength}`);
    return { html, summary };
  };

  // ── 도입부 + 섹션 배치 병렬 실행 ──
  const BATCH_SIZE = STAGE_B_BATCH_SIZE;
  const sectionHtmls: string[] = new Array(outline.sections.length).fill('');
  const sectionSummaries: string[] = [];

  // ── 섹션 실패 시 재시도 + invisible fallback (사용자에게 placeholder 텍스트 노출 방지) ──
  let sectionFailCount = 0;

  // 짧은 재시도: 실패한 섹션을 간결한 프롬프트로 1회 재시도
  const retrySection = async (idx: number): Promise<{ html: string; summary: string } | null> => {
    const section = outline.sections[idx];
    const title = section?.title || `섹션 ${idx + 1}`;
    try {
      const retryResult = await callGemini({
        prompt: `[주제] ${request.topic}\n[소제목] ${title}\n\n이 소제목에 대해 2~3문단으로 간결하게 작성하세요. HTML 형식(<h3>, <p>).`,
        systemPrompt: '병원 블로그 에디터. 짧고 정확한 의료 정보를 한국어로 작성한다.' + hospitalStyleSuffix,
        model: GEMINI_MODEL.FLASH,
        responseType: 'text',
        timeout: 15_000,
        temperature: 0.8,
      });
      const html = typeof retryResult === 'string' ? retryResult.trim() : '';
      if (html && html.length >= 30) {
        console.info(`[PIPELINE] ✅ 섹션 ${idx + 1} "${title}" 재시도 성공 (${html.length}자)`);
        const summary = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
        return { html, summary };
      }
    } catch (retryErr: any) {
      console.warn(`[PIPELINE] ⚠️ 섹션 ${idx + 1} "${title}" 재시도도 실패: ${retryErr?.message?.substring(0, 60)}`);
    }
    return null;
  };

  // 최종 fallback: placeholder를 최소화 — 소제목만 남기고 본문 없이 처리 (사용자에게 빈 placeholder 문구 노출 방지)
  const makeSectionFallback = (idx: number): { html: string; summary: string } => {
    const title = outline.sections[idx]?.title || `섹션 ${idx + 1}`;
    sectionFailCount++;
    console.warn(`[PIPELINE] ⚠️ 섹션 ${idx + 1} "${title}" fallback 사용 (failCount=${sectionFailCount})`);
    // 소제목만 남기고 본문은 빈 상태 — 사용자에게 "생성 실패" 같은 placeholder 문구를 노출하지 않음
    // Stage C polish에서 빈 섹션이 감지되면 제거되거나 보충됨
    return {
      html: `<h3>${title}</h3>`,
      summary: `(${title})`,
    };
  };

  // 첫 번째 배치: 도입부 + 첫 배치 섹션을 동시 실행
  const firstBatchEnd = Math.min(BATCH_SIZE, outline.sections.length);
  safeProgress(`✍️ [2/4] 도입부 + 소제목 1~${firstBatchEnd} 동시 생성 중...`);

  const firstBatchPromises: Promise<{ html: string; summary: string }>[] = [];
  for (let i = 0; i < firstBatchEnd; i++) {
    firstBatchPromises.push(generateSection(i, []));
  }

  let introHtml = '';
  // 도입부는 필수 — 실패 시 전체 중단
  try {
    introHtml = await generateIntro();
    safeProgress('✅ 도입부 완료');
  } catch (err: any) {
    console.error(`[PIPELINE] ❌ 도입부 생성 실패: ${err?.message}`);
    throw new Error(`본문 생성에 실패했습니다. (${err?.status || '네트워크 오류'}) 다시 시도해주세요.`);
  }

  // 첫 배치 섹션은 allSettled — 개별 실패 시 재시도 → fallback
  const firstSettled = await Promise.allSettled(firstBatchPromises);
  for (let idx = 0; idx < firstSettled.length; idx++) {
    const settled = firstSettled[idx];
    if (settled.status === 'fulfilled') {
      sectionHtmls[idx] = settled.value.html;
      sectionSummaries.push(settled.value.summary);
      safeProgress(`✅ 소제목 ${idx + 1}/${outline.sections.length} "${outline.sections[idx].title}" 완료`);
    } else {
      console.error(`[PIPELINE] ❌ 섹션 ${idx + 1} "${outline.sections[idx]?.title}" 실패: ${settled.reason?.message || settled.reason}`);
      safeProgress(`⚠️ 소제목 ${idx + 1} 재시도 중...`);
      const retryResult = await retrySection(idx);
      if (retryResult) {
        sectionHtmls[idx] = retryResult.html;
        sectionSummaries.push(retryResult.summary);
        safeProgress(`✅ 소제목 ${idx + 1}/${outline.sections.length} "${outline.sections[idx].title}" 재시도 성공`);
      } else {
        const fb = makeSectionFallback(idx);
        sectionHtmls[idx] = fb.html;
        sectionSummaries.push(fb.summary);
        safeProgress(`⚠️ 소제목 ${idx + 1}/${outline.sections.length} "${outline.sections[idx].title}" 대체 처리`);
      }
    }
  }

  // 나머지 배치: 2개씩 묶어 병렬 실행 (이전 배치 요약 전달)
  for (let batchStart = firstBatchEnd; batchStart < outline.sections.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, outline.sections.length);
    const batchLabel = `${batchStart + 1}~${batchEnd}`;
    safeProgress(`✍️ [2/4] 소제목 ${batchLabel} 동시 생성 중...`);

    const batchPromises: Promise<{ html: string; summary: string }>[] = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(generateSection(i, [...sectionSummaries]));
    }

    const batchSettled = await Promise.allSettled(batchPromises);
    for (let idx = 0; idx < batchSettled.length; idx++) {
      const settled = batchSettled[idx];
      const globalIdx = batchStart + idx;
      if (settled.status === 'fulfilled') {
        sectionHtmls[globalIdx] = settled.value.html;
        sectionSummaries.push(settled.value.summary);
        safeProgress(`✅ 소제목 ${globalIdx + 1}/${outline.sections.length} "${outline.sections[globalIdx].title}" 완료`);
      } else {
        console.error(`[PIPELINE] ❌ 섹션 ${globalIdx + 1} "${outline.sections[globalIdx]?.title}" 실패: ${settled.reason?.message || settled.reason}`);
        safeProgress(`⚠️ 소제목 ${globalIdx + 1} 재시도 중...`);
        const retryResult = await retrySection(globalIdx);
        if (retryResult) {
          sectionHtmls[globalIdx] = retryResult.html;
          sectionSummaries.push(retryResult.summary);
          safeProgress(`✅ 소제목 ${globalIdx + 1}/${outline.sections.length} "${outline.sections[globalIdx].title}" 재시도 성공`);
        } else {
          const fb = makeSectionFallback(globalIdx);
          sectionHtmls[globalIdx] = fb.html;
          sectionSummaries.push(fb.summary);
          safeProgress(`⚠️ 소제목 ${globalIdx + 1}/${outline.sections.length} "${outline.sections[globalIdx].title}" 대체 처리`);
        }
      }
    }
  }

  timings.stageB_sections = Date.now() - stageBStart;
  const sectionOkCount = outline.sections.length - sectionFailCount;
  console.info(`[PIPELINE] ✅ Stage B sections: ${sectionOkCount}/${outline.sections.length} OK (${sectionFailCount} fallback) ${timings.stageB_sections}ms | model=FLASH`);

  // 전체 섹션이 실패한 경우에만 중단 — 최소 1개 성공이면 결과 반환
  if (sectionOkCount === 0 && outline.sections.length > 0) {
    console.error(`[PIPELINE] ❌ 모든 섹션 생성 실패 — 결과를 반환할 수 없음`);
    throw new Error('모든 소제목 생성에 실패했습니다. 다시 시도해주세요.');
  }

  // ── B-3: 마무리 생성 ──
  const concStart = Date.now();
  safeProgress('✍️ [3/4] 마무리 작성 중...');
  const conclusionPrompt = getPipelineConclusionPrompt(
    outline.conclusion?.direction || '열린 결말',
    outline.conclusion?.targetChars || Math.round(promptTargetLength * 0.15),
    request.persona
  );

  const conclusionUserPrompt = `[주제] ${request.topic}
[글에서 다룬 내용 요약]
${sectionSummaries.join('\n')}`;

  let conclusionHtml = '';
  try {
    const conclusionResult = await callGemini({
      prompt: conclusionUserPrompt,
      systemPrompt: conclusionPrompt + hospitalStyleSuffix,
      model: GEMINI_MODEL.FLASH,
      responseType: 'text',
      timeout: STAGE_B_CONCLUSION_TIMEOUT_MS,
      temperature: 0.75,
    });
    conclusionHtml = typeof conclusionResult === 'string' ? conclusionResult.trim() : '';
  } catch (concErr: any) {
    console.error(`[PIPELINE] ❌ 마무리 실패: ${concErr?.message}`);
    throw new Error(`마무리 생성에 실패했습니다. (${concErr?.status || '네트워크 오류'}) 다시 시도해주세요.`);
  }

  if (!conclusionHtml || conclusionHtml.length < 20) {
    console.error(`[PIPELINE] ❌ 마무리 생성됐지만 너무 짧음: ${conclusionHtml.length}자`);
    throw new Error('마무리 생성에 실패했습니다. 다시 시도해주세요.');
  }

  timings.conclusion = Date.now() - concStart;
  safeProgress('✅ 본문 생성 완료');
  console.info(`[PIPELINE] ✅ conclusion ${conclusionHtml.length}자 ${timings.conclusion}ms`);

  // ── Stage C: 교정 (polish) ──
  // 정책: STAGE_C_USE_PRO=true → PRO(20s) → FLASH(12s) → rawHtml
  //        STAGE_C_USE_PRO=false → FLASH(12s) → rawHtml
  safeProgress('🔍 [4/4] 전체 통합 및 품질 보정 중...');

  // rawHtml 조립 전 완전성 검사 — 핵심 파트(intro/conclusion) 필수, 섹션은 fallback 허용
  console.info(`[PIPELINE] 🔍 완전성 검사: intro=${introHtml.length}자, sections=${sectionHtmls.map(h => h.length).join('/')}, conclusion=${conclusionHtml.length}자, sectionFails=${sectionFailCount}`);
  const emptyParts: string[] = [];
  if (!introHtml || introHtml.length < 30) emptyParts.push('도입부');
  if (!conclusionHtml || conclusionHtml.length < 20) emptyParts.push('마무리');

  if (emptyParts.length > 0) {
    const msg = `본문 생성 실패: ${emptyParts.join(', ')}이(가) 비어있습니다. 다시 시도해주세요.`;
    console.error(`[PIPELINE] ❌ 완전성 검사 실패:`, emptyParts);
    throw new Error(msg);
  }

  // fallback 섹션(title-only)이 과반수면 품질 부족 → legacy fallback 유도
  if (sectionFailCount > Math.floor(outline.sections.length / 2)) {
    console.error(`[PIPELINE] ❌ 섹션 과반수 실패 (${sectionFailCount}/${outline.sections.length}) — legacy fallback 유도`);
    throw new Error('본문 소제목 대부분 생성에 실패했습니다. 다시 시도해주세요.');
  }

  // title-only fallback 섹션 필터링 — 본문이 없는 <h3>만 남은 섹션은 rawHtml에서 제거
  // 이를 통해 사용자에게 빈 섹션이 노출되지 않음
  for (let i = 0; i < sectionHtmls.length; i++) {
    const stripped = sectionHtmls[i].replace(/<[^>]+>/g, '').trim();
    if (stripped.length < 10) {
      // 본문 없는 title-only fallback → 제거
      console.info(`[PIPELINE] 🧹 빈 섹션 ${i + 1} "${outline.sections[i]?.title}" 제거 (${stripped.length}자)`);
      sectionHtmls[i] = '';
    }
  }

  console.info('[PIPELINE] ✅ 완전성 검사 통과 — 핵심 파트 존재 확인');

  // ── 균형 검증 로그 ──
  const sectionLens = sectionHtmls.map(h => h.replace(/<[^>]+>/g, '').trim().length);
  const introLen = introHtml.replace(/<[^>]+>/g, '').trim().length;
  const concLen = conclusionHtml.replace(/<[^>]+>/g, '').trim().length;
  const maxSec = Math.max(...sectionLens);
  const minSec = Math.min(...sectionLens);
  const balanceRatio = maxSec > 0 ? Math.round((minSec / maxSec) * 100) : 0;
  const introParagraphs = (introHtml.match(/<p[\s>]/gi) || []).length;
  const concParagraphs = (conclusionHtml.match(/<p[\s>]/gi) || []).length;
  const sectionParagraphs = sectionHtmls.map(h => (h.match(/<p[\s>]/gi) || []).length);
  console.info(`[PIPELINE] 📊 균형 검증: intro=${introLen}자(${introParagraphs}문단), sections=${sectionLens.join('/')}자, paragraphs=${sectionParagraphs.join('/')}, conclusion=${concLen}자(${concParagraphs}문단), balance=${balanceRatio}%(min/max)`);
  if (balanceRatio < 60) {
    const longestIdx = sectionLens.indexOf(maxSec);
    const shortestIdx = sectionLens.indexOf(minSec);
    console.error(`[PIPELINE] ⛔ 섹션 균형 심각: 최단 섹션${shortestIdx + 1}(${minSec}자) vs 최장 섹션${longestIdx + 1}(${maxSec}자) — 비율 ${balanceRatio}% (60% 미만)`);
  } else if (balanceRatio < 75) {
    console.warn(`[PIPELINE] ⚠️ 섹션 균형 경고: 최소 ${minSec}자 vs 최대 ${maxSec}자 (비율 ${balanceRatio}%) — 75% 미만`);
  }
  // ── 서술 품질 힌트 로그 ──
  const allText = [introHtml, ...sectionHtmls, conclusionHtml].join('\n').replace(/<[^>]+>/g, '');
  const sentences = allText.split(/[.?!]\s+|다\.\s*|다\s*$/).filter(s => s.trim().length > 5);
  const endings = sentences.map(s => { const m = s.trim().match(/(습니다|있습니다|됩니다|입니다|합니다|봅니다|겠습니다|드립니다)$/); return m?.[1] || '기타'; });
  let maxRepeat = 1, cur = 1;
  for (let i = 1; i < endings.length; i++) { if (endings[i] === endings[i-1] && endings[i] !== '기타') { cur++; if (cur > maxRepeat) maxRepeat = cur; } else { cur = 1; } }
  if (maxRepeat >= 3) {
    console.warn(`[PIPELINE] ⚠️ 어미 연속 경고: 같은 어미 ${maxRepeat}회 연속 감지`);
  }

  const rawHtml = `${introHtml}\n${sectionHtmls.join('\n')}\n${conclusionHtml}`;
  const integrationPrompt = getPipelineIntegrationPrompt(targetLength);

  // Stage C를 비동기 promise로 생성 — 이미지 생성과 병렬 실행 가능
  // 정책: STAGE_C_USE_PRO에 따라 PRO→FLASH→rawHtml 또는 FLASH→rawHtml
  const polishPromise: Promise<{ content: string; polishModel: string; finalQualityPath: string; stageCMs: number }> = (async () => {
    let finalQualityPath = 'flash_draft_only';
    let integratedHtml: any;
    let polishModel = 'NONE';
    const stageCStart = Date.now();

    // Step 1: PRO polish — 조건부 활성화 (텍스트가 충분히 길 때만 PRO 시도)
    const rawTextLength = rawHtml.replace(/<[^>]+>/g, '').trim().length;
    const useProForThis = STAGE_C_USE_PRO && rawTextLength >= STAGE_C_PRO_MIN_CHARS;
    if (!useProForThis && STAGE_C_USE_PRO) {
      console.info(`[PIPELINE] Stage C PRO 스킵: rawText=${rawTextLength}자 < ${STAGE_C_PRO_MIN_CHARS}자 (FLASH만 사용)`);
    }
    if (useProForThis) {
      console.info(`[PIPELINE] Stage C attempt=PRO timeout=${STAGE_C_PRO_TIMEOUT_MS}`);
      try {
        integratedHtml = await callGemini({
          prompt: rawHtml,
          systemPrompt: integrationPrompt,
          model: GEMINI_MODEL.PRO,
          responseType: 'text',
          timeout: STAGE_C_PRO_TIMEOUT_MS,
          temperature: 0.3,
          maxRetries: 1,
          noAutoFallback: true,
        });
        polishModel = 'PRO';
        finalQualityPath = 'flash_draft+pro_polish';
      } catch (proErr: any) {
        const proMs = Date.now() - stageCStart;
        const reason = proErr?.errorType === 'timeout' ? 'timeout' : (proErr?.message || 'unknown').substring(0, 60);
        console.warn(`[PIPELINE] ⚠️ Stage C PRO polish 실패 (${reason}, ${proMs}ms), FLASH fallback 시도`);
        integratedHtml = null; // FLASH fallback으로 진행
      }
    }

    // Step 2: FLASH polish (PRO 미사용 또는 PRO 실패 시)
    if (!integratedHtml) {
      console.info(`[PIPELINE] Stage C attempt=FLASH timeout=${STAGE_C_FLASH_TIMEOUT_MS}`);
      try {
        integratedHtml = await callGemini({
          prompt: rawHtml,
          systemPrompt: integrationPrompt,
          model: GEMINI_MODEL.FLASH,
          responseType: 'text',
          timeout: STAGE_C_FLASH_TIMEOUT_MS,
          temperature: 0.3,
          maxRetries: 1,
          noAutoFallback: true,
        });
        polishModel = useProForThis ? 'FLASH(fallback)' : 'FLASH';
        finalQualityPath = 'flash_draft+flash_polish';
      } catch (flashErr: any) {
        const flashMs = Date.now() - stageCStart;
        const reason = flashErr?.errorType === 'timeout' ? 'timeout' : (flashErr?.message || 'unknown').substring(0, 60);
        console.warn(`[PIPELINE] ⚠️ Stage C FLASH polish 실패 (${reason}, ${flashMs}ms), pre-polish HTML 사용`);
        integratedHtml = rawHtml;
        polishModel = 'NONE(pre-polish)';
      }
    }
    const stageCMs = Date.now() - stageCStart;

    const finalContent = typeof integratedHtml === 'string' && integratedHtml.includes('<')
      ? integratedHtml.trim()
      : rawHtml;

    if (!finalContent || finalContent.replace(/<[^>]+>/g, '').trim().length < 100) {
      throw new Error('통합된 본문이 비어있습니다. 다시 시도해주세요.');
    }

    safeProgress('✅ [4/4] 통합 검증 완료');
    console.info(`[PIPELINE] ✅ Stage C 완료: ${finalContent.length}자 (텍스트 ${finalContent.replace(/<[^>]+>/g, '').trim().length}자) polishModel=${polishModel} stageC=${stageCMs}ms`);
    console.info(`[PIPELINE] finalQualityPath=${finalQualityPath} | PRO_ENABLED=${STAGE_C_USE_PRO}`);

    return { content: finalContent, polishModel, finalQualityPath, stageCMs };
  })();

  // 이미지 프롬프트 생성 — 사용자 선택 수량 계약 준수
  // selectedImageCount = 사용자가 선택한 정확한 수량 (0~5). 이 값이 최종 목표.
  const selectedImageCount = request.imageCount ?? DEFAULT_BLOG_IMAGE_COUNT;
  const imagePrompts: string[] = [];
  // 사용된 sceneType 기록 — 연속 중복 방지 + 분포 조정
  const usedSceneTypes: string[] = [];
  // 사용된 bucket 기록 — planner-level 분산
  const usedBuckets: string[] = [];
  // Topic hint — 주제 계열 감지
  const topicHint = detectTopicHint(request.topic);

  console.info(`[IMG-PLAN] selected=${selectedImageCount} sections=${outline.sections.length} topicHint=${topicHint}`);

  if (selectedImageCount > 0) {
    // 🛡️ 항상 selectedImageCount개 프롬프트 생성 — 섹션 수보다 많아도 절삭하지 않음
    const sectionCount = outline.sections.length;
    const imgStyle = request.imageStyle;

    for (let i = 0; i < selectedImageCount; i++) {
      if (i === 0) {
        // hero: 공통 diversification 구조 사용 (role=hero)
        const heroBucket = resolveSceneBucket({
          sceneType: 'symptom-discomfort' /* unused for hero */,
          usedBuckets, role: 'hero', imageStyle: imgStyle, topicHint,
        });
        const heroPrompt = buildHeroScenePrompt(request.topic, imgStyle, heroBucket);
        imagePrompts.push(heroPrompt);
        usedBuckets.push(heroBucket);
        usedSceneTypes.push('hero');
        console.info(`[IMG-PROMPT] hero idx=0 sceneBucket=${heroBucket} style=${imgStyle} topicHint=${topicHint}`);
      } else if (i <= sectionCount) {
        // sub: 섹션 범위 내 — 소제목 + 섹션 요약/핵심 문장 기반 sceneType
        const section = outline.sections[i - 1];
        const sectionTitle = section?.title || '건강 정보';
        // 섹션 요약이 있으면 이미지 프롬프트에 semantic context 추가
        const sectionSummary = sectionSummaries[i - 1] || '';
        const semanticCue = sectionSummary
          ? sectionSummary.replace(/\(.*?\)/g, '').trim().substring(0, 80)
          : '';
        const sceneType = classifySceneType(sectionTitle, usedSceneTypes, topicHint);
        const bucket = resolveSceneBucket({
          sceneType, usedBuckets, role: 'sub', imageStyle: imgStyle, topicHint,
        });
        // 섹션 맥락이 있으면 sectionTitle에 핵심 문장을 병합하여 이미지가 글과 더 잘 맞게 함
        const enrichedTitle = semanticCue
          ? `${sectionTitle} — ${semanticCue}`
          : sectionTitle;
        const scenePrompt = buildScenePrompt(request.topic, enrichedTitle, sceneType, imgStyle, usedSceneTypes, bucket);
        imagePrompts.push(scenePrompt);
        usedSceneTypes.push(sceneType);
        usedBuckets.push(bucket);
        console.info(`[IMG-PROMPT] sub idx=${i} sceneType=${sceneType} sceneBucket=${bucket} style=${imgStyle} topicHint=${topicHint} source=section semantic=${!!semanticCue}`);
      } else {
        // sub 확장: 섹션 범위 초과 — 사용된 요약에서 맥락 추출
        const extendedIdx = i - sectionCount - 1;
        const contextSummary = sectionSummaries[extendedIdx % Math.max(sectionSummaries.length, 1)] || '';
        const contextCue = contextSummary
          ? contextSummary.replace(/\(.*?\)/g, '').trim().substring(0, 60)
          : '';
        const contextTitle = contextCue || request.topic;
        const sceneType = classifySceneType(contextTitle, usedSceneTypes, topicHint);
        const bucket = resolveSceneBucket({
          sceneType, usedBuckets, role: 'sub', imageStyle: imgStyle, topicHint,
        });
        const scenePrompt = buildScenePrompt(request.topic, contextTitle, sceneType, imgStyle, usedSceneTypes, bucket);
        imagePrompts.push(scenePrompt);
        usedSceneTypes.push(sceneType);
        usedBuckets.push(bucket);
        console.info(`[IMG-PROMPT] sub idx=${i} sceneType=${sceneType} sceneBucket=${bucket} style=${imgStyle} topicHint=${topicHint} source=extended contextual=${!!contextCue}`);
      }
    }

    // Bucket 분산 요약 로그
    const uniqueBuckets = new Set(usedBuckets).size;
    const consultationCount = usedBuckets.filter(b => CONSULTATION_BUCKETS.has(b)).length;
    const consultationDeprioritized = topicHint === 'insurance-checkup' || consultationCount >= 2;
    const biasHints: string[] = [];
    if (topicHint === 'insurance-checkup') biasHints.push('caution-checkup+', 'prevention-care+');
    if (topicHint === 'disease-pain') biasHints.push('symptom-discomfort+', 'cause-mechanism+');
    if (topicHint === 'treatment-procedure') biasHints.push('consultation-treatment+');
    const sceneWeightBias = biasHints.length > 0 ? biasHints.join(',') : 'none';
    console.info(`[IMG-BUCKET-SUMMARY] total=${usedBuckets.length} unique=${uniqueBuckets} buckets=${usedBuckets.join(',')} consultationCount=${consultationCount} consultationDeprioritized=${consultationDeprioritized} topicHint=${topicHint} sceneWeightBias=${sceneWeightBias}`);
  }
  console.info(`[IMG-PLAN] selected=${selectedImageCount} promptsGenerated=${imagePrompts.length} sections=${outline.sections.length} topicHint=${topicHint}`);

  // ── 종합 성능 로그 (Stage A+B까지, Stage C는 비동기 진행 중) ──
  const sectionTimingsArr = Object.keys(timings)
    .filter(k => k.startsWith('section_'))
    .map(k => timings[k]);
  const avgSectionMs = sectionTimingsArr.length > 0
    ? Math.round(sectionTimingsArr.reduce((a, b) => a + b, 0) / sectionTimingsArr.length) : 0;
  const textDraftMs = Date.now() - pipelineStart;

  console.info(`[PIPELINE] ═══════════════════════════════════════`);
  console.info(`[PIPELINE] ✅ Stage A+B DONE, Stage C async — 성능 요약`);
  console.info(`[PIPELINE]   textDraft=${textDraftMs}ms (${(textDraftMs / 1000).toFixed(1)}s)`);
  console.info(`[PIPELINE]   stageA=${timings.stageA}ms | stageB=${timings.stageB_sections}ms | conclusion=${timings.conclusion}ms | stageC=async(${STAGE_C_USE_PRO ? 'PRO→FLASH' : 'FLASH'} ${STAGE_C_FLASH_TIMEOUT_MS}ms)`);
  console.info(`[PIPELINE]   avgSectionMs=${avgSectionMs} | sections=${sectionTimingsArr.map(t => `${t}ms`).join('/')}`);
  console.info(`[PIPELINE]   rawHtml=${rawHtml.replace(/<[^>]+>/g, '').trim().length}자 imgPrompts=${imagePrompts.length}`);
  console.info(`[PIPELINE] ═══════════════════════════════════════`);

  // polishPromise: Stage C는 비동기로 진행 중. caller가 이미지 생성과 병렬로 await 가능.
  return {
    title: request.topic,
    rawHtml,
    polishPromise,
    imagePrompts,
    conclusionLength: conclusionHtml.length
  };
};
