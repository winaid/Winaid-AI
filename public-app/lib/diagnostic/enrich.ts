/**
 * AEO/GEO 진단 — LLM 기반 맞춤 해설 생성 (단계 5-A)
 *
 * 3 함수 조합:
 *   1) extractSiteMeta(crawl)       — Gemini flash-lite: 사이트 요약/강점/약점 추출
 *   2) generateNarratives(args)     — Sonnet 4.6: 원장이 읽을 수 있는 맞춤 해설 생성
 *   3) enrichDiagnostic(base, crawl) — 위 둘을 base DiagnosticResponse 에 overlay
 *
 * 핵심 원칙: **LLM 호출은 전부 선택적**. 실패하면 base 그대로 반환해 회귀 0.
 */

import type {
  CrawlResult,
  DiagnosticResponse,
  SiteMeta,
  Narratives,
  CategoryScore,
  AIVisibility,
  ActionItem,
  AIPlatform,
} from './types';
import { callLLM } from '../llm';

const AI_PLATFORMS: AIPlatform[] = ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot'];

// ── 공통 JSON 파서 ──────────────────────────────────────────

function tryParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{')) {
    const i = text.indexOf('{');
    const j = text.lastIndexOf('}');
    if (i >= 0 && j > i) text = text.slice(i, j + 1);
  }
  try { return JSON.parse(text) as T; } catch { return null; }
}

// ── 1) Gemini: 사이트 메타 추출 ────────────────────────────

export async function extractSiteMeta(crawl: CrawlResult): Promise<SiteMeta | null> {
  const snippet = crawl.textContent.slice(0, 6000);
  const userPrompt = `다음 병원 홈페이지의 크롤링 결과를 읽고 한국어 JSON 으로만 응답하세요.

[메타]
- 제목: ${crawl.title || '(없음)'}
- 설명: ${crawl.metaDescription || '(없음)'}
- 감지된 시술: ${crawl.detectedServices.join(', ') || '(없음)'}

[본문 앞 6000자]
${snippet}

[출력 형식 — JSON 만, 다른 텍스트 금지]
{
  "siteSummary": "이 병원을 한국어 2문장으로 요약 (진료 분야·차별점·독자 인상)",
  "detectedStrengths": ["객관적 강점 3~5개 — 원문 근거 있는 것만, 과장 금지"],
  "detectedGaps": ["홈페이지에서 약한/부족한 부분 3~5개 — 의료광고법 위반 아님, 단순 누락 중심"]
}`;

  try {
    const res = await callLLM({
      task: 'diagnostic_extract',
      systemBlocks: [{
        type: 'text',
        text: '당신은 병원 홈페이지 내용을 구조화해 요약하는 분석자입니다. 추측하지 말고 원문 근거 있는 것만 채웁니다.',
        cacheable: false,
      }],
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1200,
    });
    const parsed = tryParseJson<SiteMeta>(res.text);
    if (!parsed || typeof parsed.siteSummary !== 'string') return null;
    return {
      siteSummary: parsed.siteSummary.trim(),
      detectedStrengths: Array.isArray(parsed.detectedStrengths)
        ? parsed.detectedStrengths.filter((s: unknown): s is string => typeof s === 'string').slice(0, 6)
        : [],
      detectedGaps: Array.isArray(parsed.detectedGaps)
        ? parsed.detectedGaps.filter((s: unknown): s is string => typeof s === 'string').slice(0, 6)
        : [],
    };
  } catch (e) {
    console.warn(`[diagnostic/enrich] extractSiteMeta 실패: ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

// ── 2) Sonnet: 맞춤 해설 생성 ──────────────────────────────

const NARRATIVE_SYSTEM = `당신은 한국 병원 마케팅 전문가입니다. AEO/GEO(AI 검색) 진단 결과를 보고 병원 원장이 한눈에 이해할 수 있는 친근하지만 구체적인 해설을 작성합니다.

원칙:
- "ChatGPT/Gemini가 이 병원을 추천해줄까?" 관점으로 말한다
- 구체적 이유 1~3개 포함
- 금지 표현: "재정비 필요", "전면 개선", "일반적으로", "~할 수 있습니다" 연속
- 병원명·진료과·지역을 자연스럽게 녹인다
- 원장이 읽고 "아 이거구나" 할 수 있게 쉽고 직접적으로`;

interface NarrativeArgs {
  meta: SiteMeta | null;
  categories: CategoryScore[];
  aiVisibility: AIVisibility[];
  priorityActions: ActionItem[];
  siteName: string;
  overallScore: number;
}

export async function generateNarratives(args: NarrativeArgs): Promise<Narratives | null> {
  const categoryDigest = args.categories.map(c => ({
    id: c.id,
    name: c.name,
    score: c.score,
    weight: c.weight,
    failOrWarn: c.items.filter(i => i.status === 'fail' || i.status === 'warning').map(i => i.label),
  }));
  const aiDigest = args.aiVisibility.map(v => ({
    platform: v.platform,
    likelihood: v.likelihood,
  }));
  const actionDigest = args.priorityActions.map((a, i) => ({
    idx: String(i),
    action: a.action,
    impact: a.impact,
    difficulty: a.difficulty,
    category: a.category,
  }));

  const userPrompt = `[병원] ${args.siteName}
[종합 점수] ${args.overallScore}/100

[사이트 메타]
${args.meta ? JSON.stringify(args.meta) : '(추출 실패)'}

[카테고리 점수·미흡 항목]
${JSON.stringify(categoryDigest, null, 2)}

[AI 플랫폼 노출 가능성]
${JSON.stringify(aiDigest, null, 2)}

[우선 조치 (index: action)]
${JSON.stringify(actionDigest, null, 2)}

위 정보를 바탕으로 아래 JSON 으로만 응답하세요. 다른 텍스트 금지.

{
  "heroSummary": "3~4문장 — AI 검색 노출 관점에서 이 병원의 현재 위치·강점·가장 시급한 과제",
  "aiNarratives": {
    "ChatGPT":     "2~3문장 — 왜 이 정도 노출인지 구체 이유",
    "Gemini":      "2~3문장",
    "Perplexity":  "2~3문장",
    "Copilot":     "2~3문장"
  },
  "categoryRecommendations": {
    ${args.categories.map(c => `"${c.id}": ["이 카테고리에서 이 병원이 우선 해야 할 조치 2~3개 — 추상어 금지, 행동 명세"]`).join(',\n    ')}
  },
  "actionTexts": {
    ${actionDigest.map(a => `"${a.idx}": "priorityActions[${a.idx}] 을 이 병원 상황에 맞춘 한 문장으로 재작성 (왜 중요한지 1~2어절 포함)"`).join(',\n    ')}
  }
}`;

  try {
    const res = await callLLM({
      task: 'diagnostic_narrative',
      systemBlocks: [{ type: 'text', text: NARRATIVE_SYSTEM, cacheable: true, cacheTtl: '5m' }],
      userPrompt,
      temperature: 0.5,
      maxOutputTokens: 3500,
    });
    const parsed = tryParseJson<Narratives>(res.text);
    if (!parsed || typeof parsed.heroSummary !== 'string') return null;

    // robust 가공 — 누락 필드는 빈값으로 보정
    const aiNar: Partial<Record<AIPlatform, string>> = {};
    const src = (parsed.aiNarratives ?? {}) as Record<string, unknown>;
    for (const p of AI_PLATFORMS) {
      const v = src[p];
      if (typeof v === 'string' && v.trim()) aiNar[p] = v.trim();
    }
    const catRecs: Record<string, string[]> = {};
    const srcCat = (parsed.categoryRecommendations ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(srcCat)) {
      if (Array.isArray(v)) {
        catRecs[k] = v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4);
      }
    }
    const actTxts: Record<string, string> = {};
    const srcAct = (parsed.actionTexts ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(srcAct)) {
      if (typeof v === 'string' && v.trim()) actTxts[k] = v.trim();
    }

    return {
      heroSummary: parsed.heroSummary.trim(),
      aiNarratives: aiNar,
      categoryRecommendations: catRecs,
      actionTexts: actTxts,
    };
  } catch (e) {
    console.warn(`[diagnostic/enrich] generateNarratives 실패: ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

// ── 3) 조립 — overlay 하되 실패 시 base 그대로 ──────────────

export async function enrichDiagnostic(
  base: DiagnosticResponse,
  crawl: CrawlResult,
): Promise<DiagnosticResponse> {
  try {
    const meta = await extractSiteMeta(crawl);
    const narr = await generateNarratives({
      meta,
      categories: base.categories,
      aiVisibility: base.aiVisibility,
      priorityActions: base.priorityActions,
      siteName: base.siteName,
      overallScore: base.overallScore,
    });

    if (!narr && !meta) return base;
    if (!narr && meta) return { ...base, siteSummary: meta.siteSummary };

    // narr 성공 — overlay 시작
    const n = narr!;
    const overlaidCategories = base.categories.map(c => {
      const override = n.categoryRecommendations[c.id];
      return override && override.length > 0 ? { ...c, recommendations: override } : c;
    });
    const overlaidActions = base.priorityActions.map((a, i) => {
      const override = n.actionTexts[String(i)];
      return override ? { ...a, action: override } : a;
    });
    const overlaidVisibility = base.aiVisibility.map(v => {
      const override = n.aiNarratives[v.platform];
      return override ? { ...v, reason: override } : v;
    });

    return {
      ...base,
      heroSummary: n.heroSummary,
      siteSummary: meta?.siteSummary,
      aiNarratives: n.aiNarratives,
      categories: overlaidCategories,
      priorityActions: overlaidActions,
      aiVisibility: overlaidVisibility,
    };
  } catch (e) {
    console.warn(`[diagnostic/enrich] enrichDiagnostic 치명적 실패: ${(e as Error).message.slice(0, 200)}`);
    return base;
  }
}
