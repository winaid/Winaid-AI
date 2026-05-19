/**
 * GEO-11 — 네이버 채널 분류기.
 *
 * 한국 의료 검색은 네이버 영향력이 절대적. AI 답변에서 네이버 채널별 인용 비율 추적 +
 * 우리 vs 경쟁사 네이버 채널 매트릭스 + 부재 채널 권고.
 *
 * 순수 함수 — 네트워크 X / DB X / LLM 호출 X.
 */

import type { Citation, CitationRow } from './types';
import { normalizeHostname, isOursUrl } from './citationExtractor';

// ── 타입 ──────────────────────────────────────────────────────

/**
 * 네이버 채널 8종.
 * - 'naver_news' 는 채널 자체가 우리 인용률 ↑ 직접 신호는 아니지만 (운영자가 등록할 수 없음) trust 보조 신호로 추적.
 */
export type NaverChannel =
  | 'naver_blog'
  | 'naver_cafe'
  | 'naver_kin'        // 지식인
  | 'naver_place'
  | 'naver_news'
  | 'naver_post'
  | 'naver_smartstore'
  | 'naver_me';        // 단축 URL

export interface NaverChannelCount {
  channel: NaverChannel;
  count: number;
  /** 같은 채널 안에서 우리 사이트 URL 개수 (ourDomains 매칭). */
  oursCount: number;
}

export interface NaverChannelSummary {
  /** 전체 citation 개수. */
  totalCitations: number;
  /** 네이버 citation 개수 (전체 중). */
  naverCitations: number;
  /** 우리 citation 개수 (전체 중, 네이버/비-네이버 무관). */
  oursCitations: number;
  /** 모델별 분포. */
  byModel: {
    chatgpt: { total: number; naver: number };
    gemini: { total: number; naver: number };
  };
  /** 8 채널 카운트 (빈도 desc 정렬). */
  channels: NaverChannelCount[];
  /** 우리가 보유한 네이버 채널 list (oursCount > 0 인 것만). */
  ourChannels: NaverChannel[];
  /** 부재 채널 (우리가 등록 안 한 — 운영자가 등록 가능한 채널만 — kin/news/smartstore/me 제외). */
  missingChannels: NaverChannel[];
}

// ── 채널 매칭 ────────────────────────────────────────────────

/**
 * 네이버 채널 분류.
 * url 의 hostname 정규화 후 substring 매칭.
 * 모바일 (m.) / desktop 둘 다 같은 채널 (예: blog.naver.com == m.blog.naver.com).
 */
export function classifyNaverChannel(url: string): NaverChannel | null {
  const host = normalizeHostname(url);
  if (!host) return null;
  // m. 제거 — 모바일도 같은 채널
  const h = host.replace(/^m\./, '');

  if (h === 'blog.naver.com') return 'naver_blog';
  if (h === 'cafe.naver.com') return 'naver_cafe';
  if (h === 'kin.naver.com') return 'naver_kin';
  if (h === 'place.naver.com') return 'naver_place';
  if (h === 'news.naver.com') return 'naver_news';
  if (h === 'post.naver.com') return 'naver_post';
  if (h === 'smartstore.naver.com') return 'naver_smartstore';
  if (h === 'naver.me') return 'naver_me';
  return null;
}

/** URL 이 네이버 도메인 (위 8 채널 또는 naver.com 그 외) 인지 — 통계 보조. */
export function isNaverDomain(url: string): boolean {
  if (classifyNaverChannel(url)) return true;
  const host = normalizeHostname(url);
  return host.endsWith('naver.com') || host === 'naver.com';
}

// ── 라벨 + 권고 ───────────────────────────────────────────────

const CHANNEL_LABEL: Record<NaverChannel, string> = {
  naver_blog: '네이버 블로그',
  naver_cafe: '네이버 카페',
  naver_kin: '네이버 지식인',
  naver_place: '네이버 플레이스',
  naver_news: '네이버 뉴스',
  naver_post: '네이버 포스트',
  naver_smartstore: '네이버 스마트스토어',
  naver_me: '네이버 단축링크',
};

/** 운영자가 직접 등록/운영 가능한 채널만 — missing 으로 안내. */
const REGISTERABLE_CHANNELS: NaverChannel[] = [
  'naver_blog',
  'naver_cafe',
  'naver_place',
  'naver_post',
];

const RECOMMENDATION_MAP: Record<NaverChannel, string> = {
  naver_blog: '네이버 블로그 개설 + 주 1회 시술/케이스 글 작성 (외부 검색허용 ON 필수).',
  naver_cafe: '병원 운영 카페 신설 또는 지역 카페 후기 활성화.',
  naver_kin: '지식인 답변 0개 — 의료진 명의로 답변 활동은 의료법 검토 필요.',
  naver_place: '네이버 플레이스 등록 + 방문자 후기 관리 (한국 환자 검색 핵심).',
  naver_news: '언론 인터뷰 / 칼럼 기고 (의료 전문지부터 시작).',
  naver_post: '네이버 포스트 (시술 설명 슬라이드형 콘텐츠 적합).',
  naver_smartstore: '의료기기 직접 판매 X → 비추천.',
  naver_me: '단축 URL 은 직접 등록 대상 아님.',
};

export function getNaverChannelLabel(channel: NaverChannel): string {
  return CHANNEL_LABEL[channel];
}

// ── 집계 ──────────────────────────────────────────────────────

/**
 * geo_citations rows → 네이버 채널 통계.
 *
 * 우리 vs 경쟁사 구분: ourDomains 가 ['mysmile.co.kr'] 이고 URL 이 blog.naver.com/mysmile-OOO
 * 같은 경우 우리 네이버 채널 X (hostname=blog.naver.com 이라 isOursUrl=false). 즉 우리 사이트 ≠
 * 네이버 블로그. 본 함수의 "우리 네이버 채널" = ourDomains 의 *별칭* 도 아니라 운영자가 등록한
 * 네이버 채널이라야 함. MVP 는 단순 isOursUrl 매칭 (대부분 false) — 운영자가 ourDomains 에 자기
 * 네이버 블로그 URL 의 hostname 추가하면 매칭됨.
 */
export function aggregateNaverChannels(
  rows: CitationRow[],
  ourDomains: string[] = [],
): NaverChannelSummary {
  const channelCounts = new Map<NaverChannel, { count: number; oursCount: number }>();
  const byModel = {
    chatgpt: { total: 0, naver: 0 },
    gemini: { total: 0, naver: 0 },
  };
  let totalCitations = 0;
  let naverCitations = 0;
  let oursCitations = 0;

  for (const r of rows) {
    const model = r.ai_model;
    for (const c of (r.citations || []) as Citation[]) {
      totalCitations++;
      const isOurs = c.is_ours === true || (c.is_ours === undefined && isOursUrl(c.url, ourDomains));
      if (isOurs) oursCitations++;

      const channel = classifyNaverChannel(c.url);
      if (channel) {
        naverCitations++;
        const prev = channelCounts.get(channel) || { count: 0, oursCount: 0 };
        channelCounts.set(channel, {
          count: prev.count + 1,
          oursCount: prev.oursCount + (isOurs ? 1 : 0),
        });
      }

      if (model === 'chatgpt' || model === 'gemini') {
        byModel[model].total++;
        if (channel || isNaverDomain(c.url)) byModel[model].naver++;
      }
    }
  }

  const channels: NaverChannelCount[] = Array.from(channelCounts.entries())
    .map(([channel, v]) => ({ channel, count: v.count, oursCount: v.oursCount }))
    .sort((a, b) => b.count - a.count);

  const ourChannels = channels.filter(c => c.oursCount > 0).map(c => c.channel);
  const ourChannelSet = new Set(ourChannels);
  const missingChannels = REGISTERABLE_CHANNELS.filter(c => !ourChannelSet.has(c));

  return {
    totalCitations,
    naverCitations,
    oursCitations,
    byModel,
    channels,
    ourChannels,
    missingChannels,
  };
}

// ── 권고 포맷 ────────────────────────────────────────────────

/** missingChannels 의 권고 list — UI 안내용. */
export function formatNaverRecommendations(summary: NaverChannelSummary): string[] {
  return summary.missingChannels.map(c => `[${CHANNEL_LABEL[c]}] ${RECOMMENDATION_MAP[c]}`);
}
