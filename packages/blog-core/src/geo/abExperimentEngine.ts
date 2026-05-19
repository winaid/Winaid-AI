/**
 * GEO-13 — A/B 실험 인프라 엔진.
 *
 * 동일 주제·다른 콘텐츠 형식 variant 들을 실제 운영하면서 4주간 AI 인용률·
 * 네이버 노출률 차이를 측정·비교. 결과는 GEO-3 (쿼리-콘텐츠 룰북) 의 데이터 소스.
 *
 * 핵심 함수:
 *   - createExperiment: variant 별 generation request 빌드 + DB row 생성
 *   - collectMetrics: cron 호출 — ChatGPT/Gemini queries 답변에서 variant URL 인용 카운트
 *   - analyzeResult: variant 간 citation_rate 비교 + 통계적 유의차 (단순 임계)
 *
 * 5 빌더 slot 1 invariant 보존:
 *   variant 차이는 GenerationRequest.abVariantHint 로 user prompt 끝에만 주입.
 *   slot 1 STATIC_PRELUDE (PRIORITY + COMMON_WRITING_STYLE + E_E_A_T) 무영향.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBlogPromptV3, type BlogPromptV3 } from '../blogPrompt';
import type { GenerationRequest } from '../types';
import { queryChatGptWithCitations } from './chatgptClient';
import { queryGeminiWithCitations } from './geminiClient';
import { isOursUrl } from './citationExtractor';
import { classifyNaverChannel, isNaverDomain } from './naverChannelClassifier';
import type {
  AbVariantInput,
  AbVariantFormatConfig,
  AbExperimentRow,
  AbVariantRow,
  AbMetricRow,
  AbMetricSource,
  AbVariantSummary,
  AbAnalysisResult,
} from './types';

// ── 입력 타입 ────────────────────────────────────────────────────────

export interface CreateExperimentInput {
  hospital_name: string;
  topic: string;
  hypothesis?: string;
  hypothesis_dimension?: string;
  /** 2~4개 강제. createExperiment 가 length check. */
  variants: AbVariantInput[];
  /** 4주간 collectMetrics 가 ChatGPT/Gemini 에 던질 자연어 쿼리. */
  queries: string[];
  /** is_ours 매칭 기준. variant.post_url 매칭에도 활용. */
  our_domains: string[];
  /** variant 별 buildBlogPromptV3 호출의 공통 필드. topic 은 별도로 입력. */
  baseReq: Omit<GenerationRequest, 'topic' | 'abVariantHint'>;
  /** 'draft' 로 시작할지 즉시 'running' 으로 시작할지. 기본 'draft'. */
  initialStatus?: 'draft' | 'running';
}

export interface CreateExperimentResult {
  experiment_id: string;
  variant_ids: string[];
  /** 각 variant 의 buildBlogPromptV3 결과 — 호출자가 실제 LLM 호출·발행은 별도 담당. */
  variant_prompts: Array<{
    variant_id: string;
    variant_name: string;
    format_config: AbVariantFormatConfig;
    prompt: BlogPromptV3;
  }>;
}

export interface CollectMetricsInput {
  experiment_id: string;
  /** 명시되면 본 쿼리만 사용. 미지정 시 experiment.queries 사용. */
  queries?: string[];
}

export interface CollectMetricsResult {
  metrics_inserted: number;
  per_variant: Array<{
    variant_id: string;
    chatgpt_citations: number;
    gemini_citations: number;
    naver_appearances: number;
    queries_run: number;
  }>;
}

// ── DB getter (route 가 supabaseAdmin 주입; lib 직접 import 안 함) ───

type DbClient = SupabaseClient;

// ── createExperiment ────────────────────────────────────────────────

const MIN_VARIANTS = 2;
const MAX_VARIANTS = 4;

/**
 * 실험 + variant 생성. variant 별 buildBlogPromptV3 결과를 반환 — 실제 LLM
 * 호출·발행은 호출자가 별도 (variant.post_id / post_url 은 추후 update 라우트).
 */
export async function createExperiment(
  db: DbClient,
  input: CreateExperimentInput,
): Promise<CreateExperimentResult> {
  if (!input.variants || input.variants.length < MIN_VARIANTS || input.variants.length > MAX_VARIANTS) {
    throw new Error(
      `variants.length must be ${MIN_VARIANTS}~${MAX_VARIANTS} (got ${input.variants?.length ?? 0})`,
    );
  }
  const names = new Set<string>();
  for (const v of input.variants) {
    if (!v.variant_name?.trim()) throw new Error('variant_name empty');
    if (names.has(v.variant_name)) throw new Error(`duplicate variant_name: ${v.variant_name}`);
    names.add(v.variant_name);
    if (!v.format_config || typeof v.format_config !== 'object') {
      throw new Error(`variant ${v.variant_name}: format_config required`);
    }
  }
  if (!input.hospital_name?.trim()) throw new Error('hospital_name empty');
  if (!input.topic?.trim()) throw new Error('topic empty');

  const initialStatus = input.initialStatus ?? 'draft';

  // 1) experiment row insert
  const { data: expData, error: expErr } = await db
    .from('geo_ab_experiments')
    .insert({
      hospital_name: input.hospital_name,
      topic: input.topic,
      hypothesis: input.hypothesis ?? null,
      hypothesis_dimension: input.hypothesis_dimension ?? null,
      status: initialStatus,
      queries: input.queries ?? [],
      our_domains: input.our_domains ?? [],
      started_at: initialStatus === 'running' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (expErr || !expData) throw new Error(`insert experiment failed: ${expErr?.message ?? 'no row'}`);
  const experiment_id = (expData as { id: string }).id;

  // 2) variants insert (bulk)
  const variantRows = input.variants.map((v) => ({
    experiment_id,
    variant_name: v.variant_name,
    format_config: v.format_config as unknown as Record<string, unknown>,
  }));
  const { data: vData, error: vErr } = await db
    .from('geo_ab_variants')
    .insert(variantRows)
    .select('id, variant_name, format_config');
  if (vErr || !vData) throw new Error(`insert variants failed: ${vErr?.message ?? 'no rows'}`);

  // 3) variant 별 buildBlogPromptV3 호출 (abVariantHint 주입)
  const variant_prompts: CreateExperimentResult['variant_prompts'] = [];
  for (const row of vData as Array<{ id: string; variant_name: string; format_config: AbVariantFormatConfig }>) {
    const req: GenerationRequest = {
      ...input.baseReq,
      topic: input.topic,
      abVariantHint: row.format_config,
    } as GenerationRequest;
    const prompt = buildBlogPromptV3(req);
    variant_prompts.push({
      variant_id: row.id,
      variant_name: row.variant_name,
      format_config: row.format_config,
      prompt,
    });
  }

  // variant_ids 는 vData 순서 (insert 순서와 정합 — Postgres bulk insert 보장)
  const variant_ids = (vData as Array<{ id: string }>).map((r) => r.id);

  return { experiment_id, variant_ids, variant_prompts };
}

// ── collectMetrics ──────────────────────────────────────────────────

/**
 * 실행 중인 실험 (또는 명시된 단일 실험) 의 variant 별 citation 카운트 + 네이버
 * 노출 측정. cron / 어드민 수동 호출 모두 동일 흐름.
 *
 * 각 query × 각 model (chatgpt/gemini) 으로 citations 조회 → variant.post_url 이
 * citations 의 어느 URL 과 isOursUrl 매치하는지 카운트 → geo_ab_metrics 에 row 1
 * 건씩 insert (variant × source 단위).
 */
export async function collectMetrics(
  db: DbClient,
  input: CollectMetricsInput,
): Promise<CollectMetricsResult> {
  // 1) experiment + variants 조회
  const { data: expData, error: expErr } = await db
    .from('geo_ab_experiments')
    .select('id, status, queries, our_domains')
    .eq('id', input.experiment_id)
    .single();
  if (expErr || !expData) throw new Error(`experiment not found: ${input.experiment_id}`);
  const exp = expData as { id: string; status: string; queries: string[]; our_domains: string[] };

  const { data: vData, error: vErr } = await db
    .from('geo_ab_variants')
    .select('id, variant_name, post_url')
    .eq('experiment_id', exp.id);
  if (vErr) throw new Error(`variants fetch failed: ${vErr.message}`);
  const variants = (vData ?? []) as Array<{ id: string; variant_name: string; post_url: string | null }>;
  if (variants.length === 0) {
    return { metrics_inserted: 0, per_variant: [] };
  }

  const queries = (input.queries && input.queries.length > 0 ? input.queries : exp.queries) ?? [];
  if (queries.length === 0) {
    return { metrics_inserted: 0, per_variant: variants.map((v) => ({
      variant_id: v.id,
      chatgpt_citations: 0,
      gemini_citations: 0,
      naver_appearances: 0,
      queries_run: 0,
    })) };
  }

  const ourDomains = exp.our_domains ?? [];

  // 2) ChatGPT + Gemini 병렬 호출 — 모든 query 에 대해 각 모델 답변 수집
  type CitationSet = { chatgpt: string[]; gemini: string[] };
  const queryCitations: CitationSet[] = [];

  for (const q of queries) {
    const [cg, gm] = await Promise.allSettled([
      queryChatGptWithCitations(q, { ourDomains }),
      queryGeminiWithCitations(q, { ourDomains }),
    ]);
    queryCitations.push({
      chatgpt: cg.status === 'fulfilled' ? cg.value.citations.map((c) => c.url) : [],
      gemini: gm.status === 'fulfilled' ? gm.value.citations.map((c) => c.url) : [],
    });
  }

  // 3) variant 별 카운트 + insert
  const metricRows: Array<Partial<AbMetricRow> & { variant_id: string; source: AbMetricSource }> = [];
  const perVariant: CollectMetricsResult['per_variant'] = [];

  for (const v of variants) {
    let cgCount = 0;
    let gmCount = 0;
    let naverCount = 0;
    if (v.post_url) {
      // matches v.post_url 와 citation 의 hostname 일치 (variant 의 자기 글 인용 여부)
      const variantDomains = [v.post_url];
      for (const qc of queryCitations) {
        if (qc.chatgpt.some((u) => isOursUrl(u, variantDomains))) cgCount++;
        if (qc.gemini.some((u) => isOursUrl(u, variantDomains))) gmCount++;
      }
      // 네이버 노출: citations 중 isNaverDomain 매치
      for (const qc of queryCitations) {
        const all = [...qc.chatgpt, ...qc.gemini];
        if (all.some((u) => isNaverDomain(u) && classifyNaverChannel(u))) naverCount++;
      }
    }

    const queriesRun = queries.length;
    const cgRate = queriesRun > 0 ? cgCount / queriesRun : 0;
    const gmRate = queriesRun > 0 ? gmCount / queriesRun : 0;

    metricRows.push({
      variant_id: v.id,
      source: 'chatgpt',
      queries_run: queriesRun,
      citation_count: cgCount,
      citation_rate: Number(cgRate.toFixed(4)),
      raw_payload: { post_url: v.post_url },
    });
    metricRows.push({
      variant_id: v.id,
      source: 'gemini',
      queries_run: queriesRun,
      citation_count: gmCount,
      citation_rate: Number(gmRate.toFixed(4)),
      raw_payload: { post_url: v.post_url },
    });
    if (naverCount > 0 || v.post_url) {
      metricRows.push({
        variant_id: v.id,
        source: 'naver',
        queries_run: queriesRun,
        citation_count: naverCount,
        citation_rate: queriesRun > 0 ? Number((naverCount / queriesRun).toFixed(4)) : null,
        raw_payload: null,
      });
    }

    perVariant.push({
      variant_id: v.id,
      chatgpt_citations: cgCount,
      gemini_citations: gmCount,
      naver_appearances: naverCount,
      queries_run: queriesRun,
    });
  }

  if (metricRows.length > 0) {
    const { error: mErr } = await db.from('geo_ab_metrics').insert(metricRows);
    if (mErr) throw new Error(`metrics insert failed: ${mErr.message}`);
  }

  return { metrics_inserted: metricRows.length, per_variant: perVariant };
}

// ── analyzeResult ───────────────────────────────────────────────────

const MIN_SAMPLES_FOR_WINNER = 30;
const HIGH_CONFIDENCE_GAP = 0.15; // 15% citation_rate 차이 → high confidence
const MEDIUM_CONFIDENCE_GAP = 0.07;

export async function analyzeResult(
  db: DbClient,
  experiment_id: string,
): Promise<AbAnalysisResult> {
  const { data: expData, error: expErr } = await db
    .from('geo_ab_experiments')
    .select('*')
    .eq('id', experiment_id)
    .single();
  if (expErr || !expData) throw new Error(`experiment not found: ${experiment_id}`);
  const experiment = expData as AbExperimentRow;

  const { data: vData } = await db
    .from('geo_ab_variants')
    .select('id, variant_name, format_config')
    .eq('experiment_id', experiment_id);
  const variants = (vData ?? []) as Array<{ id: string; variant_name: string; format_config: AbVariantFormatConfig }>;

  const { data: mData } = await db
    .from('geo_ab_metrics')
    .select('variant_id, source, queries_run, citation_count, citation_rate, naver_rank')
    .in('variant_id', variants.map((v) => v.id));
  const metrics = (mData ?? []) as Array<Pick<AbMetricRow, 'variant_id' | 'source' | 'queries_run' | 'citation_count' | 'citation_rate' | 'naver_rank'>>;

  // variant 별 집계
  const summaries: AbVariantSummary[] = variants.map((v) => {
    const ms = metrics.filter((m) => m.variant_id === v.id);
    const cg = ms.filter((m) => m.source === 'chatgpt');
    const gm = ms.filter((m) => m.source === 'gemini');
    const nv = ms.filter((m) => m.source === 'naver');

    const sumCgCit = cg.reduce((a, m) => a + (m.citation_count ?? 0), 0);
    const sumCgRun = cg.reduce((a, m) => a + (m.queries_run ?? 0), 0);
    const sumGmCit = gm.reduce((a, m) => a + (m.citation_count ?? 0), 0);
    const sumGmRun = gm.reduce((a, m) => a + (m.queries_run ?? 0), 0);

    const naverRanks = nv.map((m) => m.naver_rank).filter((r): r is number => typeof r === 'number');
    const avgNaverRank = naverRanks.length > 0 ? naverRanks.reduce((a, b) => a + b, 0) / naverRanks.length : null;

    return {
      variant_id: v.id,
      variant_name: v.variant_name,
      format_config: v.format_config,
      metric_summary: {
        total_samples: sumCgRun + sumGmRun,
        chatgpt_citation_rate: sumCgRun > 0 ? sumCgCit / sumCgRun : 0,
        gemini_citation_rate: sumGmRun > 0 ? sumGmCit / sumGmRun : 0,
        avg_naver_rank: avgNaverRank,
      },
    };
  });

  // winner 판정 — total_samples 충분 + variant 간 max 와 second max 의 citation_rate 차이 임계 이상
  const notes: string[] = [];
  let winner: AbAnalysisResult['winner'];

  const totalAll = summaries.reduce((a, s) => a + s.metric_summary.total_samples, 0);
  if (summaries.length < 2) {
    notes.push('variant 가 2개 미만이라 winner 판정 불가');
  } else if (totalAll < MIN_SAMPLES_FOR_WINNER) {
    notes.push(`데이터 부족: total_samples=${totalAll} < ${MIN_SAMPLES_FOR_WINNER}. 측정 누적 필요`);
  } else {
    // combined citation_rate = (cg + gm) avg
    const ranked = summaries
      .map((s) => ({
        ...s,
        combined_rate: (s.metric_summary.chatgpt_citation_rate + s.metric_summary.gemini_citation_rate) / 2,
      }))
      .sort((a, b) => b.combined_rate - a.combined_rate);
    const top = ranked[0];
    const second = ranked[1];
    const gap = top.combined_rate - second.combined_rate;
    if (gap >= HIGH_CONFIDENCE_GAP) {
      winner = { variant_id: top.variant_id, reason: `combined citation_rate +${(gap * 100).toFixed(1)}%`, confidence: 'high' };
    } else if (gap >= MEDIUM_CONFIDENCE_GAP) {
      winner = { variant_id: top.variant_id, reason: `combined citation_rate +${(gap * 100).toFixed(1)}%`, confidence: 'medium' };
    } else {
      winner = { variant_id: top.variant_id, reason: `combined citation_rate +${(gap * 100).toFixed(1)}% — 차이 작음`, confidence: 'low' };
      notes.push('variant 간 citation_rate 차이가 작아 통계적 유의성 낮음');
    }
  }

  return { experiment, variants: summaries, winner, notes };
}
