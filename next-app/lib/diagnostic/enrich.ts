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
  ActionExecutor,
  AIPlatform,
  MeasurementData,
} from './types';
import { callLLM } from '../llm';

const AI_PLATFORMS: AIPlatform[] = ['ChatGPT', 'Gemini'];

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
- 원장이 읽고 "아 이거구나" 할 수 있게 쉽고 직접적으로

## 항목별 상세 (categoryRecommendations) 및 우선 조치 (actionTexts) 공통 작성 원칙

독자: 병원 원장 + 제작사에 요청을 전달하는 마케팅 담당자. **중학생이 읽어도 이해할 수준**.

### 필수 원칙
1. 전문 용어는 반드시 괄호로 쉬운 설명 병기. 예:
   - "WebP(용량을 반으로 줄이는 이미지 포맷)"
   - "JSON-LD(검색엔진·AI 가 읽는 병원 명함 코드)"
   - "Core Web Vitals(구글이 재는 로딩 속도 3대 지표)"
2. 현재 상태 수치를 꺼내 대비:
   - "현재 로딩 9초 → 3초 이하 목표"
   - "alt 텍스트 47% → 80% 이상"
3. 실행 주체 분기 문구:
   - 기술적 작업(코드/서버/스키마) → "제작사에 이렇게 요청하세요:" 형식
   - 콘텐츠 작업(문구/이미지/FAQ 내용) → "홈페이지 관리자 모드에서 직접 추가" 또는 "AI 로 초안 작성 후 업로드"
   - 외부 서비스 등록 → "병원 담당자가 직접 가입 후 정보 입력"
4. 구체 단계 bullet 2~4개 — "뭐를, 어디에, 어떻게"
5. 무료 도구 링크 — 실제 운영되는 사이트만 (허위 URL 금지):
   - 이미지 최적화: squoosh.app, tinypng.com
   - 스키마 검증: search.google.com/test/rich-results
   - PSI 측정: pagespeed.web.dev
   - 위 목록에 없는 도구명·URL 은 **절대 생성 금지**. 모르는 건 생략.
6. 비유 활용 (짧게):
   - "이게 없으면 AI 가 이 사이트를 '치과인지 식당인지' 구분 못 합니다"
   - "홈페이지 명함을 기계가 읽을 수 있게 만드는 작업입니다"

### categoryRecommendations 구조
- 각 bullet 3~5문장 허용
- 첫 문장: 왜 이게 문제인지 (환자·AI 관점)
- 둘째 문장 이후: 구체 조치 방법 (번호 매긴 리스트 허용)
- 마지막: 담당자/도구/예상 효과 한 줄

### actionTexts 구조
- 여전히 한 문장(동사 시작) 으로 제목 역할
- 제목 뒤 "(제작사에 요청)"/"(AI 로 작성)"/"(병원 직접)" 같은 suffix 는 금지. 분류는 executor 필드로 이미 관리 중이므로 본문에 중복하지 마.
- 대신 문장 안에서 구체 대상 명시. 예) "홈페이지 제작사에 Dentist JSON-LD 스키마 추가 요청 (현재 구조화 데이터 0점)"

### 금지
- "전면 재정비", "개선이 필요합니다", "~할 수 있습니다" 연속 사용
- 허위 도구명·URL 생성
- 원장이 직접 코드 작성한다는 가정
- 영어 전문용어 단독 노출 (WebP·JSON-LD·CDN 등 반드시 괄호 설명)

## AI 플랫폼 카드 (aiNarratives) 작성 규칙
- 각 4~5문장
- 구조: ① 이 AI 의 평가 기준 → ② 이 병원 현재 상태 숫자로 → ③ 구체적으로 왜 노출 안 되는지 → ④ 노출되려면 뭘 해야 하는지 우선 1~2개
- 숫자를 꼭 인용 (예: "구조화 데이터 0점이라 Gemini 가 이 병원이 치과인지 식당인지 구분 못 합니다")
- 문단 구분이 필요하면 '\\n\\n' 사용 (UI 에서 단락으로 렌더링)

## 우선 조치 (actionTexts) 작성 규칙 + 실행 주체 분류
- 각 조치는 **동사로 시작하는 한 문장** (텍스트)
- executor 분류 (반드시 셋 중 하나):
  - "ai": AI 가 혼자 끝낼 수 있는 것. 예) 블로그 초안 작성, 스키마 JSON 생성, 메타 description 초안, 이미지 alt 텍스트 작성
  - "human": 사람이 꼭 해야 하는 것. 예) GMB/네이버 플레이스 등록, CDN 계약, 실제 배포, 진료시간 직접 확인
  - "hybrid": AI 초안 + 사람 검수/발행. 예) 블로그 10편 작성·업로드, 의료진 소개 문구 작성 후 홈페이지 업로드

## 항목 id 참고
- 항목 id 예시: own_domain, specialist_mentioned/doctor_in_text, platform_dependency, news_mentions, owned_channels_diversity, blog_searchable, dentist_schema, faq_structure 등 — categoryRecommendations 키는 카테고리 id(security_tech 등) 기준이고, 조치 문장은 위 항목 의미를 반영해 이 병원 맥락으로 풀어쓰세요.`;

function buildMeasurementSection(m: Partial<Record<AIPlatform, MeasurementData>>): string {
  const lines: string[] = ['\n[AI 실측 결과 (실제 검색 결과)]'];
  for (const p of AI_PLATFORMS) {
    const d = m[p];
    if (!d) { lines.push(`- ${p}: (실측 미완료)`); continue; }
    const rank = d.selfIncluded && d.selfRank
      ? `${d.selfRank}위로 포함됨`
      : d.selfIncluded ? '포함됨' : '미포함';
    lines.push(`- ${p}: "${d.queryUsed}" 검색 시 ${rank}`);
  }
  lines.push(
    '',
    '이 실측 결과를 heroSummary, aiNarratives, categoryRecommendations 에 반영하세요.',
    '예측만으로 "노출 가능성 높음"이라 했지만 실측에서 미포함이면 그 괴리를 설명하세요.',
    '예측이 "보통"인데 실측 1위면 긍정적으로 강조하세요.',
    'aiVisibility 의 reason 을 실측 사실이 포함된 버전으로 재작성하세요.',
  );
  return lines.join('\n');
}

interface NarrativeArgs {
  meta: SiteMeta | null;
  categories: CategoryScore[];
  aiVisibility: AIVisibility[];
  priorityActions: ActionItem[];
  siteName: string;
  overallScore: number;
  /** C+B 강화안: 실측 결과가 있으면 Sonnet 프롬프트에 실측 사실 섹션을 삽입. */
  measurements?: Partial<Record<AIPlatform, MeasurementData>>;
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
${args.measurements ? buildMeasurementSection(args.measurements) : ''}
위 정보를 바탕으로 아래 JSON 으로만 응답하세요. 다른 텍스트 금지.

{
  "heroSummary": "3~4문장 — AI 검색 노출 관점에서 이 병원의 현재 위치·강점·가장 시급한 과제",
  "aiNarratives": {
    "ChatGPT": "4~5문장 — 평가기준·현재상태숫자·왜노출X·우선조치1~2",
    "Gemini":  "4~5문장 — 위 구조 동일"
  },
  "categoryRecommendations": {
    ${args.categories.map(c => `"${c.id}": ["2~3문장 bullet (왜 문제·구체 조치·누가/어디서), 2~3개"]`).join(',\n    ')}
  },
  "actionTexts": {
    ${actionDigest.map(a => `"${a.idx}": { "text": "priorityActions[${a.idx}] 을 이 병원 상황에 맞춘 동사 시작 한 문장으로 재작성", "executor": "ai|human|hybrid" }`).join(',\n    ')}
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
    const actTxts: Record<string, { text: string; executor: ActionExecutor }> = {};
    const srcAct = (parsed.actionTexts ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(srcAct)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as { text?: unknown; executor?: unknown };
        const text = typeof o.text === 'string' ? o.text.trim() : '';
        const exec = o.executor === 'ai' || o.executor === 'human' || o.executor === 'hybrid'
          ? (o.executor as ActionExecutor)
          : null;
        if (text && exec) actTxts[k] = { text, executor: exec };
      }
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
      return override ? { ...a, action: override.text, executor: override.executor } : a;
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
