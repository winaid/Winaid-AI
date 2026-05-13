/**
 * 진단 히스토리 검색·필터·정렬·URL state 순수 함수 (GEO 15).
 *
 * 페이지 컴포넌트에서 분리해 단독 테스트 가능. 데이터·요구사항:
 *   - 검색: URL / siteName 부분 일치, 한글·영문·대소문자 무시
 *   - 점수 필터: 전체 / 우수 80+ / 보통 50-79 / 개선 <50
 *   - 기간 필터: 전체 / 7d / 30d / 90d
 *   - 정렬: 최신 / 오래된 / 점수 높은 / 점수 낮은
 *   - URL state: q / score / period / sort (빈 값은 직렬화 안 함)
 */

export interface DiagnosticHistoryRow {
  id: string;
  url: string;
  siteName: string | null;
  overallScore: number;
  analyzedAt: string; // ISO
}

export type ScoreFilter = 'all' | 'high' | 'mid' | 'low';
export type PeriodFilter = 'all' | '7d' | '30d' | '90d';
export type SortKey = 'recent' | 'oldest' | 'score_desc' | 'score_asc';

export interface HistoryFilterState {
  q: string;
  score: ScoreFilter;
  period: PeriodFilter;
  sort: SortKey;
}

export const DEFAULT_FILTER: HistoryFilterState = {
  q: '',
  score: 'all',
  period: 'all',
  sort: 'recent',
};

const SCORE_FILTERS: readonly ScoreFilter[] = ['all', 'high', 'mid', 'low'];
const PERIOD_FILTERS: readonly PeriodFilter[] = ['all', '7d', '30d', '90d'];
const SORT_KEYS: readonly SortKey[] = ['recent', 'oldest', 'score_desc', 'score_asc'];

export const SCORE_LABEL: Record<ScoreFilter, string> = {
  all: '전체',
  high: '우수 (80+)',
  mid: '보통 (50-79)',
  low: '개선 필요 (<50)',
};
export const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: '전체 기간',
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
};
export const SORT_LABEL: Record<SortKey, string> = {
  recent: '최신순',
  oldest: '오래된순',
  score_desc: '점수 높은순',
  score_asc: '점수 낮은순',
};

function inPeriod(analyzedAt: string, period: PeriodFilter, now: Date): boolean {
  if (period === 'all') return true;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const t = new Date(analyzedAt).getTime();
  return Number.isFinite(t) && t >= since;
}

function inScoreBand(score: number, band: ScoreFilter): boolean {
  if (band === 'all') return true;
  if (band === 'high') return score >= 80;
  if (band === 'mid') return score >= 50 && score < 80;
  return score < 50;
}

/**
 * 검색·필터·정렬을 한 번에 적용. 정렬은 안정 정렬 (Array.prototype.sort 의 V8 안정성 의존).
 * @param now 테스트에서 Date mock 가능
 */
export function applyHistoryFilter(
  rows: DiagnosticHistoryRow[],
  state: HistoryFilterState,
  now: Date = new Date(),
): DiagnosticHistoryRow[] {
  const q = state.q.trim().toLowerCase();

  const filtered = rows.filter((r) => {
    if (!inPeriod(r.analyzedAt, state.period, now)) return false;
    if (!inScoreBand(r.overallScore, state.score)) return false;
    if (q) {
      const hayUrl = r.url.toLowerCase();
      const hayName = (r.siteName || '').toLowerCase();
      if (!hayUrl.includes(q) && !hayName.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (state.sort) {
    case 'recent':
      sorted.sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());
      break;
    case 'oldest':
      sorted.sort((a, b) => new Date(a.analyzedAt).getTime() - new Date(b.analyzedAt).getTime());
      break;
    case 'score_desc':
      sorted.sort((a, b) => b.overallScore - a.overallScore);
      break;
    case 'score_asc':
      sorted.sort((a, b) => a.overallScore - b.overallScore);
      break;
  }
  return sorted;
}

// ── URL state 직렬화 ─────────────────────────────────────

/** state → URLSearchParams. 기본값(빈/all/recent)은 직렬화 안 함 (dangling 파라미터 회피). */
export function serializeFilter(state: HistoryFilterState): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.q.trim()) sp.set('q', state.q.trim());
  if (state.score !== 'all') sp.set('score', state.score);
  if (state.period !== 'all') sp.set('period', state.period);
  if (state.sort !== 'recent') sp.set('sort', state.sort);
  return sp;
}

/** URL search params → state. 미인식 값은 DEFAULT_FILTER 로 fallback (악성 쿼리 무시). */
export function parseFilter(params: URLSearchParams): HistoryFilterState {
  const q = (params.get('q') || '').slice(0, 200);
  const scoreRaw = params.get('score') as ScoreFilter | null;
  const periodRaw = params.get('period') as PeriodFilter | null;
  const sortRaw = params.get('sort') as SortKey | null;
  return {
    q,
    score: scoreRaw && SCORE_FILTERS.includes(scoreRaw) ? scoreRaw : 'all',
    period: periodRaw && PERIOD_FILTERS.includes(periodRaw) ? periodRaw : 'all',
    sort: sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : 'recent',
  };
}
