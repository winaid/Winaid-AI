/**
 * 병원 라이브러리 이미지 매칭 — confusable 쌍 (임플란트 vs 사랑니, 도수치료 vs
 * 추나요법) 등 같은 태그 묶음을 공유하는 이미지를 정확하게 분리하기 위한 점수
 * 산정.
 *
 * 기존 inline 로직 (next-app / public-app 의 blog/page.tsx) 의 한계:
 *  - tag.includes(kw) || kw.includes(tag) 양방향 substring → "치과/시술" 공통
 *    태그가 너무 강해 confusable 쌍 동률.
 *  - 키워드 specificity 가중 없음 → "임플란트" 와 "치과" 가 동일 점수.
 *  - 글 제목 우선 가중 없음 → 본문 LLM alt 의 노이즈가 제목 의도 압도.
 *  - 배제 키워드 표현 불가 → 사랑니 이미지를 임플란트 글에서 영구 제외하는
 *    수단 부재.
 *
 * 개선 (3축):
 *  - (a) 배제 키워드 — `excludeKeywords` 필드. 매칭 시 즉시 후보 제거.
 *  - (b) Specificity — exact match > prefix/suffix > substring 가중치 분리.
 *  - (c) Title-first — 글 제목 등장 키워드에 3x 가중 (본문 키워드의 1x 대비).
 *
 * 양 앱 lockstep — next-app + public-app 의 blog/page.tsx 가 본 모듈만
 * 호출하도록 wiring.
 */

/**
 * 라이브러리 이미지 record. HospitalImage 와 호환되도록 핵심 필드만 정의 +
 * `excludeKeywords` 선택 필드 (DB 마이그레이션 전엔 undefined 라 fallback `[]`).
 */
export interface LibraryImageRecord {
  id: string;
  tags?: string[] | null;
  altText?: string | null;
  aiDescription?: string | null;
  /** 본 이미지가 매칭돼서는 안 되는 키워드. 예: 사랑니 이미지에 ["임플란트"]. */
  excludeKeywords?: string[] | null;
}

export interface ImageMatchContext {
  /** 글 제목 — 가중치 3x. UI form 의 topic 입력값 또는 LLM 추천 제목. */
  title?: string;
  /** 추가 본문 키워드 (질환·시술·진단명 등). 가중치 1x. */
  bodyKeywords?: string[];
}

export interface ImageScoreBreakdown {
  /** debug — 어느 키워드가 어디서 매칭됐는지 + 가중치 누적. */
  matches: Array<{
    keyword: string;
    source: 'tag' | 'desc' | 'alt';
    titleWeight: 1 | 3;
    matchType: 'exact' | 'edge' | 'substring';
    contribution: number;
  }>;
  /** lowPriorityTags downgrade 가 적용됐는지. */
  lowPriorityDowngrade: boolean;
}

export interface ImageMatchScored<T extends LibraryImageRecord> {
  image: T;
  /** 배제 키워드에 걸린 경우 true. score 는 -Infinity. */
  excluded: boolean;
  /** 최종 점수 (lowPriority downgrade 포함). 0 이하면 매칭 안 함이 안전. */
  score: number;
  breakdown: ImageScoreBreakdown;
}

/**
 * 키워드 토큰 분리 — 공백·쉼표·콤마·중점 단위. 길이 ≥ 2 만 유효.
 *
 * 한글 1음절 키워드 ('치') 는 substring 매칭에서 노이즈 비율이 너무 높아 제외.
 */
export function tokenizeKeywords(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(/[\s,・、/·]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

/**
 * 정규화 — 매칭 안정성을 위해 lowercase + NFC.
 * 한글 자모 분리 케이스도 normalize 로 통합 ('치' vs 'ᄎ + 치').
 */
function norm(s: string): string {
  return s.normalize('NFC').toLowerCase().trim();
}

/**
 * 두 토큰의 매칭 유형 — exact / edge (prefix·suffix) / substring (bidirectional)
 * / none. 가중치는 호출자가 결정.
 */
type MatchType = 'exact' | 'edge' | 'substring' | 'none';

function classifyMatch(a: string, b: string): MatchType {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 'none';
  if (na === nb) return 'exact';
  if (na.startsWith(nb) || na.endsWith(nb) || nb.startsWith(na) || nb.endsWith(na)) {
    return 'edge';
  }
  if (na.includes(nb) || nb.includes(na)) return 'substring';
  return 'none';
}

const MATCH_WEIGHT: Record<Exclude<MatchType, 'none'>, number> = {
  exact: 1.0,
  edge: 0.5,
  substring: 0.2,
};

/** 일반·범용 태그 — 매칭 시 점수 70% downgrade (의도 표현 약함). */
const DEFAULT_LOW_PRIORITY_TAGS = new Set(['일반', '로고', '외관', '대기실', '기사']);

export interface ScoreOptions {
  /** lowPriorityTags 셋 override. 미지정 시 DEFAULT_LOW_PRIORITY_TAGS. */
  lowPriorityTags?: ReadonlySet<string>;
  /** title 가중치. 기본 3 — title 의도가 본문 키워드보다 3배 강함. */
  titleWeight?: number;
  /** body 가중치. 기본 1. */
  bodyWeight?: number;
  /** 배제 키워드 매칭 강도 — 'exact' (정확 일치만) 또는 'edge' (prefix 포함). 기본 'edge'. */
  excludeMatchStrength?: 'exact' | 'edge';
}

/** 단일 이미지의 매칭 점수 산정. */
export function scoreLibraryImage<T extends LibraryImageRecord>(
  image: T,
  context: ImageMatchContext,
  options: ScoreOptions = {},
): ImageMatchScored<T> {
  const lowPriorityTags = options.lowPriorityTags || DEFAULT_LOW_PRIORITY_TAGS;
  const titleWeight = options.titleWeight ?? 3;
  const bodyWeight = options.bodyWeight ?? 1;
  const excludeStrength = options.excludeMatchStrength ?? 'edge';

  const titleTokens = tokenizeKeywords(context.title);
  const bodyTokens = (context.bodyKeywords || [])
    .flatMap((kw) => tokenizeKeywords(kw))
    .filter(Boolean);

  // 1) 배제 키워드 검사 — 매칭되면 즉시 후보 제거 (score = -Infinity).
  const excludeKeywords = (image.excludeKeywords || []).filter((kw) => kw && kw.length >= 2);
  const allContextTokens = [...titleTokens, ...bodyTokens];
  for (const exKw of excludeKeywords) {
    for (const ctxKw of allContextTokens) {
      const mt = classifyMatch(ctxKw, exKw);
      if (mt === 'exact' || (excludeStrength === 'edge' && mt === 'edge')) {
        return {
          image,
          excluded: true,
          score: Number.NEGATIVE_INFINITY,
          breakdown: { matches: [], lowPriorityDowngrade: false },
        };
      }
    }
  }

  const tags = (image.tags || []).filter(Boolean);
  const altTokens = tokenizeKeywords(image.altText || '');
  const descTokens = tokenizeKeywords(image.aiDescription || '');

  const matches: ImageScoreBreakdown['matches'] = [];

  function tally(
    keyword: string,
    haystack: string,
    source: 'tag' | 'desc' | 'alt',
    titleWeightVal: 1 | 3,
  ): void {
    const mt = classifyMatch(keyword, haystack);
    if (mt === 'none') return;
    const contribution = MATCH_WEIGHT[mt] * titleWeightVal;
    matches.push({
      keyword,
      source,
      titleWeight: titleWeightVal,
      matchType: mt,
      contribution,
    });
  }

  function scoreTokens(tokens: string[], weight: 1 | 3): void {
    for (const kw of tokens) {
      for (const tag of tags) tally(kw, tag, 'tag', weight);
      for (const aw of altTokens) tally(kw, aw, 'alt', weight);
      for (const dw of descTokens) tally(kw, dw, 'desc', weight);
    }
  }

  scoreTokens(titleTokens, titleWeight as 1 | 3);
  scoreTokens(bodyTokens, bodyWeight as 1 | 3);

  // 합계 — 같은 키워드 중복 매칭 (tag + desc 양쪽) 은 가산 — confusable 쌍에서
  // 더 풍부한 태깅이 있는 이미지가 자연스럽게 우위.
  let raw = matches.reduce((s, m) => s + m.contribution, 0);

  // lowPriorityTags 만 보유한 이미지는 70% downgrade. 단, 매칭에 기여한 태그가
  // 없으면 downgrade 안 적용 (의미 없는 감점 회피).
  const onlyLowPriority =
    tags.length > 0 && tags.every((t) => lowPriorityTags.has(t));
  if (onlyLowPriority && raw > 0) raw *= 0.3;

  return {
    image,
    excluded: false,
    score: raw,
    breakdown: { matches, lowPriorityDowngrade: onlyLowPriority },
  };
}

export interface PickOptions extends ScoreOptions {
  /** 이미 사용된 이미지 id 셋 — 재사용 회피. */
  excludeIds?: Set<string>;
  /** 매칭 임계치. score > minScore 일 때만 채택. 기본 0. */
  minScore?: number;
  /** 모든 이미지가 minScore 미만일 때 fallback 으로 재사용 허용 + 임계치 무시할지. */
  allowReuseFallback?: boolean;
}

/**
 * 후보 중 최고 점수 이미지를 선택. minScore 이하면 null 반환.
 *
 * fallback 정책:
 *  - allowReuseFallback=true 일 때, excludeIds (사용된 id) 가 모든 후보를 막으면
 *    excludeIds 무시하고 재선택. minScore 는 여전히 적용 (관련성 0 이면 매칭 안 함).
 */
export function pickBestLibraryImage<T extends LibraryImageRecord>(
  images: T[],
  context: ImageMatchContext,
  options: PickOptions = {},
): ImageMatchScored<T> | null {
  const minScore = options.minScore ?? 0;
  const excludeIds = options.excludeIds || new Set<string>();

  const scoreOne = (img: T) => scoreLibraryImage(img, context, options);

  // 1차: 사용된 id 제외 + excluded 제외 + score > minScore
  const fresh = images
    .filter((img) => !excludeIds.has(img.id))
    .map(scoreOne)
    .filter((r) => !r.excluded && r.score > minScore)
    .sort((a, b) => b.score - a.score);
  if (fresh.length > 0) return fresh[0];

  // 2차 (fallback): 재사용 허용 (excludeIds 무시) — 관련성 (excluded 아님) 만 유지
  if (options.allowReuseFallback) {
    const reuse = images
      .map(scoreOne)
      .filter((r) => !r.excluded && r.score > minScore)
      .sort((a, b) => b.score - a.score);
    if (reuse.length > 0) return reuse[0];
  }

  return null;
}
