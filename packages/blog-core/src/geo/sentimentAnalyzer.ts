/**
 * GEO-10 — Sentiment 드릴다운 분석기.
 *
 * geo_citations 의 answer_text 에서 우리 병원 언급 단락을 추출 → 부정/긍정/중립 + signal
 * (약점/강점/의료법 위반) 자동 분석. EDIMESS 같은 외부 리포트가 Sentiment 점수만
 * 보여주고 원인 추적 0 인 한계를 깨는 도구.
 *
 * 순수 함수 — 네트워크 X / DB X / LLM 호출 X (rule-based MVP).
 * LLM 강화는 후속 PR (비용 통제 우선).
 */

import type { Citation, CitationRow } from './types';

// ── 타입 ──────────────────────────────────────────────────────

export type Polarity = 'positive' | 'negative' | 'neutral';

export interface SentimentSignal {
  /** 카테고리. */
  kind: 'weakness' | 'strength' | 'medical_law';
  /** 매칭된 키워드 본문. */
  keyword: string;
  /** signal 분류 label (UI chip). */
  label: string;
}

export interface MentionContext {
  /** 언급 단락 본문 (≤ 240자 cap). */
  paragraph: string;
  /** 매칭 키워드 (병원명 substring). */
  matchedTerm: string;
  /** 단락 시작 위치 (answer_text 기준 0-based). */
  start: number;
  /** answer_text 의 paragraph_index — 0-based (\n\n 분리). */
  paragraphIndex: number;
  /** 매칭된 ai_model (citation row 단위). */
  ai_model?: 'chatgpt' | 'gemini';
}

export interface MentionAnalysis extends MentionContext {
  polarity: Polarity;
  signals: SentimentSignal[];
}

export interface SentimentSummary {
  totalMentions: number;
  /** 모델별 분포. */
  byModel: {
    chatgpt: { total: number; positive: number; negative: number; neutral: number };
    gemini: { total: number; positive: number; negative: number; neutral: number };
  };
  /** 전체 polarity 카운트. */
  polarityCounts: { positive: number; negative: number; neutral: number };
  /** signal 빈도 (descending). */
  weaknesses: Array<{ label: string; keyword: string; count: number }>;
  strengths: Array<{ label: string; keyword: string; count: number }>;
  medicalLawViolations: Array<{ label: string; keyword: string; count: number }>;
  /** 모든 mention 분석 결과 (UI 원본 단락 보기). */
  mentions: MentionAnalysis[];
  /** 운영자에게 보여줄 한국어 권고 list. */
  recommendations: string[];
}

// ── signal keyword dictionary ─────────────────────────────────

interface KeywordEntry {
  keyword: string;
  /** UI label (한국어 short — chip 표시). */
  label: string;
  /** 약점/강점 → 권고 매핑용 (옵션). */
  recommendation?: string;
}

/** 부정 signal — 정보 부족 / 비교 불리 / 데이터 결핍. */
const NEGATIVE_KEYWORDS: KeywordEntry[] = [
  { keyword: '제한적', label: '정보 제한', recommendation: '의료진 / 진료 안내 페이지 보강 — 본문 텍스트 양 ↑.' },
  { keyword: '제한적인', label: '정보 제한', recommendation: '의료진 / 진료 안내 페이지 보강.' },
  { keyword: '부족', label: '정보 부족', recommendation: '본문 wordCount 500자 이상 + 시술별 상세 페이지.' },
  { keyword: '어렵', label: '비교 어려움', recommendation: '비교표형 콘텐츠 신설 (시술 차이·장단점).' },
  { keyword: '명확하지 않', label: '모호함', recommendation: 'FAQ 페이지 + 카테고리별 정리.' },
  { keyword: '불분명', label: '모호함', recommendation: '진료 항목 / 가격 명확 표기.' },
  { keyword: '확인 안 됨', label: '확인 불가', recommendation: '본문에 핵심 정보 명시 + schema.org 마크업 (GEO-6).' },
  { keyword: '확인되지 않', label: '확인 불가', recommendation: '핵심 정보 명시 + schema 마크업.' },
  { keyword: '정보가 없', label: '정보 부재', recommendation: '핵심 정보 페이지 신설 + 본문 명시.' },
  { keyword: '찾을 수 없', label: '찾기 어려움', recommendation: '사이트 navigation 정리 + sitemap.xml 갱신.' },
  { keyword: '구체적이지 않', label: '구체성 부족', recommendation: '시술 case 페이지 + 사진 + 의료진 코멘트 추가.' },
];

/** 긍정 signal — 전문성 / 다양성 / 명시성. */
const POSITIVE_KEYWORDS: KeywordEntry[] = [
  { keyword: '전문', label: '전문성 명시' },
  { keyword: '다양한', label: '다양성' },
  { keyword: '다양하', label: '다양성' },
  { keyword: '명시', label: '명시성' },
  { keyword: '명시되어', label: '명시성' },
  { keyword: '24시', label: '24시 운영' },
  { keyword: '야간', label: '야간 진료' },
  { keyword: '보유', label: '시설/장비 보유' },
  { keyword: '최신', label: '최신 장비/기법' },
  { keyword: '특화', label: '특화 시술' },
  { keyword: '전문의', label: '전문의 명시' },
  { keyword: '경력', label: '경력 명시' },
  { keyword: '학회', label: '학회 활동' },
  { keyword: '추천', label: 'AI 추천 언급' },
];

/** 의료법 위반 키워드 — 별도 분류. AI 가 우리 사이트의 의료법 문제 표현을 그대로 인용했을 때 캐치. */
const MEDICAL_LAW_KEYWORDS: KeywordEntry[] = [
  { keyword: '최고', label: '절대 표현 (최고)', recommendation: '본문에서 "최고" 표현을 "주력" / "다수" 등으로 교체 (의료법 위반).' },
  { keyword: '100%', label: '절대 표현 (100%)', recommendation: '"100%" 표현을 "대부분의 경우" 등으로 교체.' },
  { keyword: '유일', label: '절대 표현 (유일)', recommendation: '"유일한" 표현을 "보기 드문" 등으로 교체.' },
  { keyword: '보장', label: '효과 보장', recommendation: '"보장" 표현 제거 (의료법 제56조 효과 단정 금지).' },
  { keyword: '완치', label: '효과 단정 (완치)', recommendation: '"완치" 표현을 "회복" / "개선" 등으로 교체.' },
  { keyword: '부작용 없', label: '부작용 부재 단정', recommendation: '부작용 안내 페이지 신설 (Trust 신호 ↑).' },
];

// ── 헬퍼 ──────────────────────────────────────────────────────

function paragraphsOf(text: string): Array<{ start: number; end: number; text: string }> {
  if (!text) return [];
  const parts: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  const splits = text.split(/\n{2,}/);
  for (const s of splits) {
    parts.push({ start: cursor, end: cursor + s.length, text: s });
    cursor += s.length + 2; // approximate \n\n
  }
  return parts;
}

/** 우리 hostname → 사람이 쓰는 brand keyword 추출 — ourDomains 외에 hospital_name 도 활용. */
function buildMatchTerms(hospitalName: string, ourDomains: string[]): string[] {
  const terms = new Set<string>();
  if (hospitalName) terms.add(hospitalName.trim());
  for (const d of ourDomains) {
    // mysmile.co.kr → 'mysmile'
    const t = d.toLowerCase().replace(/^www\./, '').split('.')[0];
    if (t && t.length >= 3) terms.add(t);
  }
  return Array.from(terms).filter(Boolean);
}

// ── public — Mention 추출 ─────────────────────────────────────

/**
 * answer_text 에서 우리 병원 언급된 단락 추출.
 *
 * 매칭 기준:
 * - hospital_name substring (case-sensitive — 한글 우선)
 * - ourDomains 의 hostname brand 키워드 (lowercase compare)
 *
 * 같은 단락에 여러 매칭이 있어도 단락 1개만 반환 (첫 매칭 기준).
 */
export function extractMentionsAroundHospital(
  answer: string,
  hospitalName: string,
  ourDomains: string[] = [],
): MentionContext[] {
  if (!answer || !hospitalName) return [];
  const terms = buildMatchTerms(hospitalName, ourDomains);
  if (terms.length === 0) return [];

  const paragraphs = paragraphsOf(answer);
  const out: MentionContext[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    let matchedTerm: string | undefined;
    for (const t of terms) {
      const idx = p.text.toLowerCase().indexOf(t.toLowerCase());
      if (idx >= 0) {
        matchedTerm = t;
        break;
      }
    }
    if (!matchedTerm) continue;

    // 단락 캡 240자 (앞뒤 균등)
    let para = p.text.trim();
    if (para.length > 240) {
      const idx = para.toLowerCase().indexOf(matchedTerm.toLowerCase());
      const half = 120;
      const sIdx = Math.max(0, idx - half);
      const eIdx = Math.min(para.length, idx + matchedTerm.length + half);
      para = (sIdx > 0 ? '…' : '') + para.slice(sIdx, eIdx) + (eIdx < para.length ? '…' : '');
    }

    out.push({
      paragraph: para,
      matchedTerm,
      start: p.start,
      paragraphIndex: i,
    });
  }

  return out;
}

// ── public — Sentiment 분류 ────────────────────────────────────

function findMatches(text: string, dict: KeywordEntry[]): Array<{ entry: KeywordEntry; count: number }> {
  const lower = text.toLowerCase();
  const hits: Array<{ entry: KeywordEntry; count: number }> = [];
  for (const e of dict) {
    let idx = 0;
    let count = 0;
    const key = e.keyword.toLowerCase();
    while ((idx = lower.indexOf(key, idx)) >= 0) {
      count++;
      idx += key.length;
    }
    if (count > 0) hits.push({ entry: e, count });
  }
  return hits;
}

/**
 * 단일 mention 단락 → polarity + signal list.
 *
 * Rule:
 * - 부정 매칭 ≥ 1 → polarity='negative' (의료법 위반 별도 카운트, polarity 영향 X)
 * - 긍정 매칭 ≥ 1 AND 부정 = 0 → 'positive'
 * - 그 외 → 'neutral'
 */
export function analyzeSentiment(context: MentionContext | string): {
  polarity: Polarity;
  signals: SentimentSignal[];
} {
  const text = typeof context === 'string' ? context : context.paragraph;
  const negHits = findMatches(text, NEGATIVE_KEYWORDS);
  const posHits = findMatches(text, POSITIVE_KEYWORDS);
  const lawHits = findMatches(text, MEDICAL_LAW_KEYWORDS);

  const signals: SentimentSignal[] = [];
  for (const { entry } of negHits) signals.push({ kind: 'weakness', keyword: entry.keyword, label: entry.label });
  for (const { entry } of posHits) signals.push({ kind: 'strength', keyword: entry.keyword, label: entry.label });
  for (const { entry } of lawHits) signals.push({ kind: 'medical_law', keyword: entry.keyword, label: entry.label });

  let polarity: Polarity = 'neutral';
  if (negHits.length > 0) polarity = 'negative';
  else if (posHits.length > 0) polarity = 'positive';

  return { polarity, signals };
}

// ── public — citations 전체 집계 ─────────────────────────────

/** 모든 citation 의 snippet 도 분석 대상에 포함 (별도 mention 으로). */
function snippetMentions(
  citations: Citation[],
  hospitalName: string,
  ourDomains: string[],
  ai_model?: 'chatgpt' | 'gemini',
): MentionContext[] {
  const out: MentionContext[] = [];
  const terms = buildMatchTerms(hospitalName, ourDomains);
  if (terms.length === 0) return out;
  for (let i = 0; i < citations.length; i++) {
    const sn = citations[i].snippet;
    if (!sn) continue;
    const matched = terms.find(t => sn.toLowerCase().includes(t.toLowerCase()));
    if (!matched) continue;
    out.push({
      paragraph: sn.length > 240 ? sn.slice(0, 240) + '…' : sn,
      matchedTerm: matched,
      start: 0,
      paragraphIndex: -1,
      ai_model,
    });
  }
  return out;
}

/**
 * geo_citations rows 전체에서 sentiment 종합 집계.
 *
 * answer_text + citation snippet 모두 분석. byModel 통계 + signal frequency + 권고.
 */
export function aggregateSentiment(
  rows: CitationRow[],
  hospitalName: string,
  ourDomains: string[] = [],
): SentimentSummary {
  const allMentions: MentionAnalysis[] = [];

  for (const r of rows) {
    const mentions = extractMentionsAroundHospital(r.answer_text || '', hospitalName, ourDomains);
    for (const m of mentions) {
      const { polarity, signals } = analyzeSentiment(m);
      allMentions.push({ ...m, ai_model: r.ai_model, polarity, signals });
    }
    // citation snippet 도 mention 으로 (보조 신호)
    const snipMentions = snippetMentions((r.citations || []) as Citation[], hospitalName, ourDomains, r.ai_model);
    for (const m of snipMentions) {
      const { polarity, signals } = analyzeSentiment(m);
      allMentions.push({ ...m, polarity, signals });
    }
  }

  // 집계
  const polarityCounts = { positive: 0, negative: 0, neutral: 0 };
  const byModel = {
    chatgpt: { total: 0, positive: 0, negative: 0, neutral: 0 },
    gemini: { total: 0, positive: 0, negative: 0, neutral: 0 },
  };
  const weakFreq = new Map<string, { label: string; keyword: string; count: number }>();
  const strFreq = new Map<string, { label: string; keyword: string; count: number }>();
  const lawFreq = new Map<string, { label: string; keyword: string; count: number }>();

  for (const m of allMentions) {
    polarityCounts[m.polarity]++;
    if (m.ai_model === 'chatgpt' || m.ai_model === 'gemini') {
      byModel[m.ai_model].total++;
      byModel[m.ai_model][m.polarity]++;
    }
    for (const s of m.signals) {
      const key = s.keyword;
      const target = s.kind === 'weakness' ? weakFreq : s.kind === 'strength' ? strFreq : lawFreq;
      const prev = target.get(key);
      target.set(key, { label: s.label, keyword: key, count: (prev?.count ?? 0) + 1 });
    }
  }

  const sortByCount = <T extends { count: number }>(m: Map<string, T>): T[] =>
    Array.from(m.values()).sort((a, b) => b.count - a.count);

  const weaknesses = sortByCount(weakFreq);
  const strengths = sortByCount(strFreq);
  const medicalLawViolations = sortByCount(lawFreq);

  // 권고 — 약점 신호 + 의료법 위반 → recommendation 매핑 (dedup)
  const recs = new Set<string>();
  for (const w of weaknesses) {
    const entry = NEGATIVE_KEYWORDS.find(e => e.keyword === w.keyword);
    if (entry?.recommendation) recs.add(entry.recommendation);
  }
  for (const v of medicalLawViolations) {
    const entry = MEDICAL_LAW_KEYWORDS.find(e => e.keyword === v.keyword);
    if (entry?.recommendation) recs.add(entry.recommendation);
  }

  return {
    totalMentions: allMentions.length,
    byModel,
    polarityCounts,
    weaknesses,
    strengths,
    medicalLawViolations,
    mentions: allMentions,
    recommendations: Array.from(recs),
  };
}

/** SentimentSummary → 사람이 읽는 권고 string list (UI 보조). */
export function formatRecommendations(summary: SentimentSummary): string[] {
  return summary.recommendations;
}
