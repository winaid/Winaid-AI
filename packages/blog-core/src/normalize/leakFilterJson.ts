/**
 * 출력 누수 정규화 필터 — cardNews JSON 응답 전용.
 *
 * cardNews 는 outline / text 각 단계가 JSON 응답 (SlideOutline[] / SlideData[]).
 * 각 슬라이드의 string 필드를 순회하며 sanitizeLeakInString 적용.
 *
 * 사용처:
 *   public-app/app/api/card-news/generate-outline/route.ts
 *   public-app/app/api/card-news/generate-text/route.ts
 */

import type { SlideData } from '../cardNewsLayouts';
import { sanitizeLeakInString } from './leakFilter';

/** SlideOutline (generate-outline 응답) 의 string 필드 5개. */
export interface SlideOutlineFields {
  layout: string;
  index: number;
  role: string;
  titleHint: string;
  contentHint: string;
}

/**
 * SlideOutline 배열 정규화.
 * 각 항목의 role/titleHint/contentHint 에 sanitizeLeakInString 적용.
 * layout/index 는 enum/number 라 leak risk 0 — 그대로.
 */
export function sanitizeLeakInSlideOutline<T extends Partial<SlideOutlineFields>>(
  outline: T[],
): { outline: T[]; stripped: number } {
  let total = 0;
  const cleaned = outline.map((item) => {
    const out = { ...item };
    if (typeof out.role === 'string') {
      const r = sanitizeLeakInString(out.role);
      total += r.stripped;
      out.role = r.text as T['role'];
    }
    if (typeof out.titleHint === 'string') {
      const r = sanitizeLeakInString(out.titleHint);
      total += r.stripped;
      out.titleHint = r.text as T['titleHint'];
    }
    if (typeof out.contentHint === 'string') {
      const r = sanitizeLeakInString(out.contentHint);
      total += r.stripped;
      out.contentHint = r.text as T['contentHint'];
    }
    return out;
  });
  return { outline: cleaned, stripped: total };
}

/**
 * 단일 SlideData 의 모든 string 필드 순회 정규화.
 *
 * 대상 필드 (30+):
 *   평탄: title / subtitle / body / visualKeyword / quoteText / quoteAuthor /
 *         quoteRole / warningTitle / beforeLabel / afterLabel / prosLabel /
 *         consLabel
 *   배열: checkItems / compareLabels / beforeItems / afterItems / pros / cons /
 *         warningItems
 *   객체 배열: columns[].title/items[] / icons[].label / steps[].text /
 *              dataPoints[].label/value / questions[].q/a / timelineItems[].time/title/desc /
 *              numberedItems[].num/title/desc / priceItems[].name/price/note
 *
 * 보존: id / index / layout / imageUrl / imagePosition / 폰트/색상/사이즈 필드 등
 *       시각 속성 + 인덱스.
 */
export function sanitizeLeakInSlideData(slide: SlideData): {
  slide: SlideData;
  stripped: number;
} {
  let total = 0;
  const out: SlideData = { ...slide };

  const filter = (t: string | undefined): string | undefined => {
    if (typeof t !== 'string') return t;
    const r = sanitizeLeakInString(t);
    total += r.stripped;
    return r.text;
  };
  const filterArr = (arr: string[] | undefined): string[] | undefined => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((s) => filter(s) ?? s);
  };

  // 평탄 string 필드
  out.title = filter(out.title) ?? out.title;
  if (out.subtitle !== undefined) out.subtitle = filter(out.subtitle);
  if (out.body !== undefined) out.body = filter(out.body);
  if (out.visualKeyword !== undefined) out.visualKeyword = filter(out.visualKeyword);
  if (out.quoteText !== undefined) out.quoteText = filter(out.quoteText);
  if (out.quoteAuthor !== undefined) out.quoteAuthor = filter(out.quoteAuthor);
  if (out.quoteRole !== undefined) out.quoteRole = filter(out.quoteRole);
  if (out.warningTitle !== undefined) out.warningTitle = filter(out.warningTitle);
  if (out.beforeLabel !== undefined) out.beforeLabel = filter(out.beforeLabel);
  if (out.afterLabel !== undefined) out.afterLabel = filter(out.afterLabel);
  if (out.prosLabel !== undefined) out.prosLabel = filter(out.prosLabel);
  if (out.consLabel !== undefined) out.consLabel = filter(out.consLabel);

  // 배열 필드
  if (out.checkItems) out.checkItems = filterArr(out.checkItems);
  if (out.compareLabels) out.compareLabels = filterArr(out.compareLabels);
  if (out.beforeItems) out.beforeItems = filterArr(out.beforeItems);
  if (out.afterItems) out.afterItems = filterArr(out.afterItems);
  if (out.pros) out.pros = filterArr(out.pros);
  if (out.cons) out.cons = filterArr(out.cons);
  if (out.warningItems) out.warningItems = filterArr(out.warningItems);

  // 객체 배열 필드 — 각 interface 의 실제 string 필드만 순회
  if (Array.isArray(out.columns)) {
    // SlideComparisonColumn: header / items[]
    out.columns = out.columns.map((c) => ({
      ...c,
      header: filter(c.header) ?? c.header,
      items: Array.isArray(c.items) ? (filterArr(c.items) ?? c.items) : c.items,
    }));
  }
  if (Array.isArray(out.icons)) {
    // SlideIconItem: emoji / title / desc?
    out.icons = out.icons.map((it) => ({
      ...it,
      title: filter(it.title) ?? it.title,
      desc: it.desc !== undefined ? filter(it.desc) : it.desc,
    }));
  }
  if (Array.isArray(out.steps)) {
    // SlideStep: label / desc?
    out.steps = out.steps.map((s) => ({
      ...s,
      label: filter(s.label) ?? s.label,
      desc: s.desc !== undefined ? filter(s.desc) : s.desc,
    }));
  }
  if (Array.isArray(out.dataPoints)) {
    out.dataPoints = out.dataPoints.map((d) => ({
      ...d,
      label: filter(d.label) ?? d.label,
      value: filter(d.value) ?? d.value,
    }));
  }
  if (Array.isArray(out.questions)) {
    out.questions = out.questions.map((q) => ({
      q: filter(q.q) ?? q.q,
      a: filter(q.a) ?? q.a,
    }));
  }
  if (Array.isArray(out.timelineItems)) {
    out.timelineItems = out.timelineItems.map((t) => ({
      time: filter(t.time) ?? t.time,
      title: filter(t.title) ?? t.title,
      desc: t.desc !== undefined ? filter(t.desc) : t.desc,
    }));
  }
  if (Array.isArray(out.numberedItems)) {
    out.numberedItems = out.numberedItems.map((n) => ({
      num: n.num !== undefined ? filter(n.num) : n.num,
      title: filter(n.title) ?? n.title,
      desc: n.desc !== undefined ? filter(n.desc) : n.desc,
    }));
  }
  if (Array.isArray(out.priceItems)) {
    out.priceItems = out.priceItems.map((p) => ({
      name: filter(p.name) ?? p.name,
      price: filter(p.price) ?? p.price,
      note: p.note !== undefined ? filter(p.note) : p.note,
    }));
  }

  return { slide: out, stripped: total };
}

/** SlideData 배열 일괄 정규화. */
export function sanitizeLeakInSlides(slides: SlideData[]): {
  slides: SlideData[];
  stripped: number;
} {
  let total = 0;
  const cleaned = slides.map((s) => {
    const r = sanitizeLeakInSlideData(s);
    total += r.stripped;
    return r.slide;
  });
  return { slides: cleaned, stripped: total };
}
